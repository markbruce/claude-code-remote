# Agent Reconnect Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cc-agent reconnect indefinitely after network outages so it always recovers when the network returns, instead of giving up permanently after ~50 seconds.

**Architecture:** The agent's socket.io client currently sets `reconnectionAttempts: 10` — a hard cap after which socket.io fires `reconnect_failed` and never retries again. The only recovery offered is "rebind" (clearing the machine token), which is destructive and wrong for transient network issues. The fix: (1) remove the cap by setting attempts to `Infinity` (socket.io's own default), (2) extract a pure `isAuthError` helper to distinguish auth failures from network failures, and (3) gate the rebind prompt behind `isAuthError` so only genuine credential problems offer rebind.

**Tech Stack:** TypeScript, socket.io-client v4, Jest + ts-jest, Node.js.

**Issue:** markbruce/claude-code-remote#22

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/agent/src/errors.ts` | Create | Pure `isAuthError(error)` classifier — no I/O, no socket deps, fully unit-testable |
| `packages/agent/tests/unit/errors.test.ts` | Create | Jest tests for `isAuthError` covering auth keywords + network negatives |
| `packages/agent/src/client.ts` | Modify | Change `maxReconnectAttempts` to `Infinity`; track last error; route ERROR handler through `isAuthError` |
| `packages/agent/src/index.ts` | Modify | Gate `reconnect_failed` rebind prompt behind `isAuthError` |

**Why `errors.ts` is a separate file:** it is consumed by two modules (`client.ts` and `index.ts`) and must stay free of socket.io imports so the test compiles fast and stays isolated. This matches DRY without coupling error classification to the socket client.

---

## Task 1: `isAuthError` helper (TDD)

**Files:**
- Create: `packages/agent/src/errors.ts`
- Test: `packages/agent/tests/unit/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/agent/tests/unit/errors.test.ts`:

```typescript
/**
 * isAuthError 分类器测试
 */
import { isAuthError } from '../../src/errors';

describe('isAuthError', () => {
  const authCases: Array<[string, unknown]> = [
    ['HTTP 401', new Error('Request failed with status 401')],
    ['JWT expired', new Error('jwt expired')],
    ['invalid token', new Error('invalid token')],
    ['中文 授权', new Error('授权失败')],
    ['中文 认证失败', new Error('认证失败')],
    ['中文 无效的机器令牌', new Error('无效的机器令牌')],
    ['中文 机器不存在', new Error('机器不存在')],
    ['raw string auth', 'token is invalid'],
  ];

  const networkCases: Array<[string, unknown]> = [
    ['transport close', new Error('transport close')],
    ['ETIMEDOUT', new Error('connect ETIMEDOUT 10.0.0.1:3000')],
    ['ECONNREFUSED', new Error('connect ECONNREFUSED')],
    ['ping timeout', new Error('ping timeout')],
    ['websocket error', new Error('websocket error')],
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['plain object no message', { code: 'ECONNRESET' }],
  ];

  it.each(authCases)('returns true for auth error: %s', (_label, err) => {
    expect(isAuthError(err)).toBe(true);
  });

  it.each(networkCases)('returns false for non-auth error: %s', (_label, err) => {
    expect(isAuthError(err)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent && npx jest tests/unit/errors.test.ts`
Expected: FAIL with "Cannot find module '../../src/errors'" (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `packages/agent/src/errors.ts`:

```typescript
/**
 * 错误分类工具
 *
 * 区分认证类错误（token 失效 / 401 / 机器未注册）与网络类错误。
 * 认证类错误需要重新绑定；网络类错误只需继续重连。
 */

const AUTH_PATTERN = /401|jwt|token|授权|认证|令牌|机器不存在/i;

/**
 * 判断一个错误是否为认证类错误。
 *
 * 用于在重连失败时区分：
 * - 认证失败 → 触发重新绑定流程（清掉 machine_token）
 * - 网络失败 → 继续无限重连，绝不应让用户重新绑定
 */
export function isAuthError(error: unknown): boolean {
  if (error == null) return false;
  const message =
    (typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)) ?? '';
  return AUTH_PATTERN.test(message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent && npx jest tests/unit/errors.test.ts`
Expected: PASS, all 17 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/errors.ts packages/agent/tests/unit/errors.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): add isAuthError classifier to distinguish auth vs network errors

Pure helper used to gate the rebind prompt so network outages no longer
trigger destructive rebind. See #22.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Infinite reconnection + error tracking in `client.ts`

**Files:**
- Modify: `packages/agent/src/client.ts:47` (add import)
- Modify: `packages/agent/src/client.ts:88-100` (add `lastError` field + change default)
- Modify: `packages/agent/src/client.ts:158-340` (add `connect_error` tracking; route ERROR handler through `isAuthError`)

**Note on testing:** The reconnection count is a one-line constant (`Infinity`) consumed by the socket.io-client `io()` call. Unit-testing it would require mocking the entire socket.io-client module — out of proportion to the change (see YAGNI). We verify by code inspection here, and by the manual reconnect test in Task 4. The `isAuthError` integration in the ERROR handler is already covered by Task 1's tests on the pure helper.

- [ ] **Step 1: Add the import**

In `packages/agent/src/client.ts`, after the existing imports (around line 47, after the `path` import), add:

```typescript
import { isAuthError } from './errors';
```

- [ ] **Step 2: Change reconnection default to Infinity and add `lastError` field**

In `packages/agent/src/client.ts`, the class fields + constructor currently look like (lines 84-101):

```typescript
export class AgentClient extends EventEmitter {
  private socket: Socket | null = null;
  private state: ClientState = ClientState.DISCONNECTED;
  private config: ClientConfig;
  private reconnectAttempts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private configManager: ConfigManager;

  constructor(config: ClientConfig, configManager: ConfigManager) {
    super();
    this.config = {
      autoReconnect: true,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      ...config,
    };
    this.configManager = configManager;
  }
```

Replace with:

```typescript
export class AgentClient extends EventEmitter {
  private socket: Socket | null = null;
  private state: ClientState = ClientState.DISCONNECTED;
  private config: ClientConfig;
  private reconnectAttempts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private configManager: ConfigManager;
  // 最近一次连接/认证错误，用于 reconnect_failed 时区分认证 vs 网络
  private lastError: unknown = null;

  constructor(config: ClientConfig, configManager: ConfigManager) {
    super();
    this.config = {
      autoReconnect: true,
      reconnectDelay: 5000,
      // 无限重连：网络恢复后自动重连，避免短暂断网导致永久失联（#22）
      maxReconnectAttempts: Infinity,
      ...config,
    };
    this.configManager = configManager;
  }

  /**
   * 返回最近一次连接错误，供上层（index.ts）在 reconnect_failed 时判断
   * 是否需要重新绑定。网络类错误返回的对象 isAuthError() 为 false。
   */
  getLastError(): unknown {
    return this.lastError;
  }
```

- [ ] **Step 3: Track errors via `connect_error` in `setupEventHandlers`**

In `packages/agent/src/client.ts`, inside `setupEventHandlers()`, find the `disconnect` handler registration (around line 306). Immediately **before** the `// 断开连接` comment block (line 305-306), insert a `connect_error` tracker:

```typescript
    // 记录每次重连失败的错误，供 getLastError() 使用
    this.socket.on('connect_error', (error) => {
      this.lastError = error;
    });
```

- [ ] **Step 4: Route the ERROR handler through `isAuthError`**

In `packages/agent/src/client.ts`, the ERROR handler currently reads (lines 176-184):

```typescript
    // 认证失败/错误
    this.socket.on(SocketEvents.ERROR, (error) => {
      console.error('服务器错误:', error);
      this.emit('error', error);

      // 如果是认证错误，断开连接
      if (error.message?.includes('授权') || error.message?.includes('token')) {
        this.disconnect();
      }
    });
```

Replace with:

```typescript
    // 认证失败/错误
    this.socket.on(SocketEvents.ERROR, (error) => {
      console.error('服务器错误:', error);
      this.lastError = error;
      this.emit('error', error);

      // 仅认证类错误才主动断开（触发后续重新绑定）；网络类错误交给 socket.io 重连
      if (isAuthError(error)) {
        this.disconnect();
      }
    });
```

- [ ] **Step 5: Verify it compiles**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: no errors. (If `dist/` is stale, this confirms the type check passes.)

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/client.ts
git commit -m "$(cat <<'EOF'
fix(agent): reconnect indefinitely and only disconnect on auth errors

- maxReconnectAttempts: 10 -> Infinity so network outages of any length
  recover automatically once the network returns (#22)
- track lastError via connect_error + ERROR events, expose getLastError()
- route the ERROR handler through isAuthError so only credential problems
  trigger a disconnect; network errors are left to socket.io's reconnection

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Gate the rebind prompt behind `isAuthError` in `index.ts`

**Files:**
- Modify: `packages/agent/src/index.ts:31` (add import)
- Modify: `packages/agent/src/index.ts:477-496` (reconnect_failed handler)

**Note on testing:** The reconnect_failed handler drives an interactive `inquirer` prompt — not unit-testable without mocking the TTY. We verify by inspection + the manual test in Task 4.

- [ ] **Step 1: Add the import**

In `packages/agent/src/index.ts`, the existing client import is (line 31):

```typescript
import { createAgentClient, AgentClient } from './client';
```

Add a new line immediately after it:

```typescript
import { isAuthError } from './errors';
```

- [ ] **Step 2: Rewrite the `reconnect_failed` handler**

In `packages/agent/src/index.ts`, the current handler reads (lines 477-496):

```typescript
  client.on('reconnect_failed', async () => {
    console.log(chalk.red('❌ 重连失败'));

    const { rebind } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'rebind',
        message: '是否重新绑定？',
        default: true,
      },
    ]);

    if (rebind) {
      configManager.clearConfig();
      // 重新进入绑定流程
      await smartMode({ rebind: true });
    } else {
      process.exit(1);
    }
  });
```

Replace with:

```typescript
  client.on('reconnect_failed', async () => {
    // 无限重连下，网络类错误不应触发 reconnect_failed（见 client.ts maxReconnectAttempts: Infinity）。
    // 若仍到此分支，仅在认证类错误时提示重新绑定；否则记录后保持进程存活，等待手动重启。
    const lastErr = client.getLastError();
    if (!isAuthError(lastErr)) {
      console.log(chalk.red('❌ 重连失败（未知原因），保持进程存活，请检查网络后重启 Agent'));
      return;
    }

    console.log(chalk.red('❌ 认证失败，可能需要重新绑定'));

    const { rebind } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'rebind',
        message: '是否重新绑定？',
        default: true,
      },
    ]);

    if (rebind) {
      configManager.clearConfig();
      // 重新进入绑定流程
      await smartMode({ rebind: true });
    } else {
      process.exit(1);
    }
  });
```

- [ ] **Step 3: Verify it compiles**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "$(cat <<'EOF'
fix(agent): only offer rebind on auth failure, not network failure

With infinite reconnection, reconnect_failed should never fire for network
issues. If it ever does, only prompt to rebind when the last error is an
auth error; otherwise keep the process alive for manual restart instead of
destructively clearing the machine token. See #22.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Manual verification

**Files:** none (verification only)

This task validates the fix end-to-end. There is no meaningful automated test for a multi-minute network outage against a live server, so verification is manual.

- [ ] **Step 1: Build the agent**

Run: `pnpm run build:agent`
Expected: build succeeds, `packages/agent/dist/index.js` is regenerated.

- [ ] **Step 2: Start the server + agent locally**

In one terminal: `pnpm --filter cc-remote-server dev` (or whichever script starts the server on port 3000).
In another terminal: `cd packages/agent && pnpm start` (or `node dist/index.js`) — bind if not already bound.

Expected: agent prints `✅ 已连接到服务器` and `认证成功`.

- [ ] **Step 3: Simulate a long network outage (> 50s)**

Stop the server (Ctrl+C the server process). Wait **90 seconds** — longer than the old 10-attempt cap.

Expected agent behavior during the outage:
- Logs repeated `重连尝试 N` lines (socket.io retries with backoff)
- **No** `❌ 重连失败` / `是否重新绑定？` prompt (this is the regression we fixed)
- The process stays alive

- [ ] **Step 4: Restore the network**

Restart the server.

Expected: within ~5-10 seconds the agent logs `重连成功` and `认证成功`, and is fully operational again. Confirm via the web UI that the machine shows online.

- [ ] **Step 5: Verify auth errors still offer rebind**

Manually corrupt the machine token in `~/.claude-agent/config.json` (change one character of `machine_token`), then restart the agent.

Expected: the agent connects, auth fails, and the `是否重新绑定？` prompt appears (auth path still works). Restore the token afterward.

- [ ] **Step 6: Run the unit tests one final time**

Run: `cd packages/agent && npx jest tests/unit/errors.test.ts`
Expected: PASS, all cases green.

---

## Self-Review

**1. Spec coverage (issue #22 root causes):**
- Root cause #1 (`reconnectionAttempts: 10` hard cap) → Task 2 Step 2 sets `Infinity`. ✓
- Root cause #2 (`reconnect_failed` only offers rebind) → Task 3 gates it behind `isAuthError`. ✓
- Root cause #3 (no manual reconnect probe) → moot: with `Infinity`, socket.io itself retries forever, so no separate probe is needed. ✓
- Fix direction #3 (rebind only on auth) → Task 1 helper + Task 2/3 integration. ✓

**2. Placeholder scan:** No TBD/TODO/"add error handling"/"similar to". Every code step shows exact code. Exact commands with expected output. ✓

**3. Type/name consistency:** `isAuthError` (Task 1) is imported and used identically in Task 2 (`client.ts`) and Task 3 (`index.ts`). `getLastError()` (Task 2) is called as `client.getLastError()` (Task 3). Field name `lastError` is consistent across constructor, `connect_error`, ERROR handler, and getter. ✓

**Scope notes (deliberately NOT included):**
- The `onlineMachines.delete` race on the server (`packages/server/src/socket/agent.socket.ts:419`) is a real but separate bug; it does not cause "cannot reconnect" and is out of scope for #22.
- The cosmetic "将尝试重连..." log on manual disconnect (`client.ts:306-319`) is misleading but harmless since socket.io does not actually reconnect after `io client disconnect`. Out of scope.
- The pre-existing compile errors in `scanner.test.ts` / `session.test.ts` / `config.test.ts` are unrelated to this change and left untouched.
