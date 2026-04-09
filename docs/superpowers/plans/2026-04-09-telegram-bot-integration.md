# Telegram Bot Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent `packages/bot` service that bridges Telegram to the existing Claude Code Remote server via Socket.IO, enabling chat sessions from Telegram.

**Architecture:** Bot service connects to Server's `/client` namespace as a Socket.IO client. Each bound Telegram user gets their own Socket.IO connection. Server gets 2 new API routes + 1 Prisma model. All bot logic is platform-independent in `core/`, with Telegram-specific code in `telegram/`.

**Tech Stack:** TypeScript, grammy, socket.io-client, better-sqlite3, commander

**Known Issues (from review):**
- ESM/CommonJS interop: bot uses CommonJS like agent package. Verify at build time that `cc-remote-shared` imports resolve correctly (agent package has the same config and works).
- `/use` command needs machine name → ID lookup (cached from MACHINES_LIST response)
- Permission registration must happen only in bridge.ts, not in adapter.ts
- `onMessage` handler must skip `/`-prefixed commands to avoid double-handling

**Design Spec:** `docs/superpowers/specs/2026-04-09-bot-integration-design.md`
**Issue:** markbruce/claude-code-remote#5
**Branch:** `feat/5-telegram-bot-integration`

---

## Chunk 1: Server-Side Foundation

Server-side changes needed before the bot service can function: Prisma model + API routes.

### Task 1: Add BotBinding Prisma model

**Files:**
- Modify: `packages/server/prisma/schema.prisma`

- [ ] **Step 1: Add BotBinding model to Prisma schema**

Append to the `model` section of `packages/server/prisma/schema.prisma` (after SessionLog model):

```prisma
model BotBinding {
  id               String   @id @default(uuid())
  user_id          String
  platform         String   // "telegram" | "feishu"
  platform_user_id String   // Telegram user ID or Feishu open_id
  chat_id          String   // Chat/dialog ID for sending messages
  refresh_secret   String   // For JWT refresh when token expires
  created_at       DateTime @default(now())

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([platform, platform_user_id])
  @@index([user_id])
}
```

Also add the relation to the User model — add `botBindings BotBinding[]` to the User model fields.

- [ ] **Step 2: Run Prisma migration**

Run: `cd packages/server && npx prisma migrate dev --name add-bot-binding`
Expected: Migration created and applied successfully

- [ ] **Step 3: Verify migration**

Run: `cd packages/server && npx prisma studio` (or `npx prisma db push --accept-data-loss` in dev)
Expected: BotBinding table visible in database

- [ ] **Step 4: Commit**

```bash
git add packages/server/prisma/
git commit -m "feat(server): add BotBinding Prisma model for bot user binding"
```

---

### Task 2: Add bot auth API routes

**Files:**
- Modify: `packages/server/src/routes/auth.routes.ts`

- [ ] **Step 1: Add bind-telegram endpoint**

Add to `packages/server/src/routes/auth.routes.ts` after the existing routes. Follow the existing pattern (Zod validation, Prisma, JWT):

```typescript
// POST /api/auth/bind-telegram — Bind Telegram user to system user
router.post('/bind-telegram', authMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      token: z.string().min(1),               // One-time bind token from bot
      platform_user_id: z.string().min(1),     // Telegram user ID
      chat_id: z.string().min(1),              // Telegram chat ID
    });

    const { token, platform_user_id, chat_id } = schema.parse(req.body);
    const userId = req.user!.id;

    // Verify bind token by calling bot service's verification endpoint
    // The bot service exposes GET /api/bind/verify?token=xxx
    try {
      const botVerifyUrl = process.env.BOT_SERVICE_URL || 'http://localhost:3001';
      const verifyResp = await fetch(`${botVerifyUrl}/api/bind/verify?token=${encodeURIComponent(token)}`);
      if (!verifyResp.ok) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid or expired bind token' });
        return;
      }
    } catch {
      // If bot service is unreachable, skip verification in dev mode
      if (process.env.NODE_ENV === 'production') {
        res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: 'Cannot verify bind token' });
        return;
      }
      console.warn('[Auth] Bot service unreachable, skipping token verification (dev mode)');
    }

    // Generate refresh secret
    const refreshSecret = crypto.randomBytes(32).toString('hex');

    // Upsert binding (one platform user per system user)
    const binding = await prisma.botBinding.upsert({
      where: {
        platform_platform_user_id: {
          platform: 'telegram',
          platform_user_id,
        },
      },
      create: {
        user_id: userId,
        platform: 'telegram',
        platform_user_id,
        chat_id,
        refresh_secret: refreshSecret,
      },
      update: {
        user_id: userId,
        chat_id,
        refresh_secret: refreshSecret,
      },
    });

    // Generate JWT for this user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'User not found' });
      return;
    }

    const token = generateToken({ userId: user.id, email: user.email });

    res.json({
      success: true,
      jwt: token,
      refresh_secret: refreshSecret,
      user: formatUserResponse(user),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ error: ERROR_MESSAGES.INVALID_INPUT, details: error.errors });
      return;
    }
    console.error('[Auth] Bind telegram error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: '绑定失败' });
  }
});
```

Add `crypto` import at top: `import crypto from 'crypto';`

- [ ] **Step 2: Add bot-token endpoint (JWT refresh)**

```typescript
// POST /api/auth/bot-token — Refresh JWT for bot-bound user
router.post('/bot-token', async (req: Request, res: Response) => {
  try {
    const { jwt: oldJwt, platform, platform_user_id, refresh_secret } = req.body;

    let userId: string | null = null;

    if (oldJwt) {
      // Try verifying the existing JWT
      const payload = verifyToken(oldJwt);
      if (payload) {
        userId = payload.userId;
      }
    }

    if (!userId && platform && platform_user_id && refresh_secret) {
      // JWT expired — use refresh secret
      const binding = await prisma.botBinding.findUnique({
        where: {
          platform_platform_user_id: {
            platform,
            platform_user_id,
          },
        },
      });

      if (!binding || binding.refresh_secret !== refresh_secret) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid refresh credentials' });
        return;
      }
      userId = binding.user_id;
    }

    if (!userId) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Authentication required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'User not found' });
      return;
    }

    const token = generateToken({ userId: user.id, email: user.email });

    res.json({ success: true, jwt: token });
  } catch (error) {
    console.error('[Auth] Bot token refresh error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: 'Token refresh failed' });
  }
});
```

- [ ] **Step 3: Verify routes compile**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/auth.routes.ts
git commit -m "feat(server): add bind-telegram and bot-token API endpoints"
```

---

## Chunk 2: Bot Package Skeleton

Scaffold `packages/bot` with package.json, tsconfig, config, CLI entry, and BotPlatform interface.

### Task 3: Create package.json and tsconfig

**Files:**
- Create: `packages/bot/package.json`
- Create: `packages/bot/tsconfig.json`

- [ ] **Step 1: Create package.json**

Follow agent package pattern:

```json
{
  "name": "cc-remote-bot",
  "version": "0.1.0",
  "private": true,
  "bin": {
    "cc-bot": "./dist/index.js"
  },
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "cc-remote-shared": "workspace:*",
    "better-sqlite3": "^11.7.0",
    "commander": "^12.1.0",
    "grammy": "^1.34.0",
    "socket.io-client": "^4.8.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^20.14.10",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "CommonJS",
    "moduleResolution": "node"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `cd /home/zxn/Projects/ai/claude-code-remote && pnpm install`
Expected: Dependencies installed, workspace linked

- [ ] **Step 4: Commit**

```bash
git add packages/bot/package.json packages/bot/tsconfig.json pnpm-lock.yaml
git commit -m "feat(bot): scaffold package.json and tsconfig"
```

---

### Task 4: Create config and BotPlatform interface

**Files:**
- Create: `packages/bot/src/config.ts`
- Create: `packages/bot/src/shared/platform.ts`

- [ ] **Step 1: Create config.ts**

```typescript
/**
 * Bot service configuration
 */

export interface BotConfig {
  serverUrl: string;         // Claude Code Remote server URL
  botPort: number;           // HTTP port for bind callbacks
  platform: 'telegram';      // Active platform
  telegramBotToken?: string; // Telegram bot token
}

export function loadConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    serverUrl: overrides.serverUrl || process.env.BOT_SERVER_URL || 'http://localhost:3000',
    botPort: overrides.botPort || parseInt(process.env.BOT_PORT || '3001', 10),
    platform: overrides.platform || 'telegram',
    telegramBotToken: overrides.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN,
  };
}
```

- [ ] **Step 2: Create shared/platform.ts — BotPlatform interface**

```typescript
/**
 * BotPlatform — Platform abstraction interface
 * Each messaging platform implements this interface.
 */

export interface MessageContent {
  text: string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  replyToMessageId?: number;
}

export interface PermissionRequest {
  sessionId: string;
  requestId: string;
  toolName: string;
  description: string;
  timeout: number; // ms
}

export interface BotCommand {
  command: string;
  description: string;
}

export interface BotPlatform {
  /** Start the platform adapter (connect, register commands, etc.) */
  start(): Promise<void>;

  /** Send a text message to a chat */
  sendMessage(chatId: string, content: MessageContent): Promise<void>;

  /** Edit an existing message (for streaming) */
  editMessage(chatId: string, messageId: number, content: MessageContent): Promise<void>;

  /** Send a permission approval prompt with buttons */
  sendPermission(chatId: string, request: PermissionRequest): Promise<void>;

  /** Register bot commands with the platform */
  registerCommands(commands: BotCommand[]): Promise<void>;

  /** Register handler for incoming text messages */
  onMessage(handler: (chatId: string, text: string) => void): void;

  /** Register handler for button callbacks */
  onCallback(handler: (chatId: string, action: string, data: string) => void): void;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/bot/src/config.ts packages/bot/src/shared/platform.ts
git commit -m "feat(bot): add config loader and BotPlatform interface"
```

---

### Task 5: Create CLI entry point

**Files:**
- Create: `packages/bot/src/index.ts`

- [ ] **Step 1: Create index.ts with Commander CLI**

```typescript
#!/usr/bin/env node

/**
 * cc-bot — Claude Code Remote Bot Service
 */

import { Command } from 'commander';
import { loadConfig } from './config';

const program = new Command();

program
  .name('cc-bot')
  .description('Claude Code Remote Bot Service — IM bridge for Claude Code sessions')
  .version('0.1.0')
  .option('--platform <platform>', 'Messaging platform (telegram)', 'telegram')
  .option('--bot-token <token>', 'Telegram bot token (or set TELEGRAM_BOT_TOKEN)')
  .option('--server <url>', 'Server URL (or set BOT_SERVER_URL)')
  .option('--port <port>', 'Bot HTTP port (or set BOT_PORT)', '3001')
  .action(async (options) => {
    const config = loadConfig({
      serverUrl: options.server,
      botPort: parseInt(options.port, 10),
      platform: options.platform,
      telegramBotToken: options.botToken,
    });

    console.log('');
    console.log('=================================');
    console.log('  Claude Code Remote Bot');
    console.log('=================================');
    console.log(`  Platform: ${config.platform}`);
    console.log(`  Server:   ${config.serverUrl}`);
    console.log(`  Bot Port: ${config.botPort}`);
    console.log('=================================');
    console.log('');

    if (config.platform === 'telegram') {
      if (!config.telegramBotToken) {
        console.error('Error: Telegram bot token required. Use --bot-token or set TELEGRAM_BOT_TOKEN');
        process.exit(1);
      }
      // Will be wired in Task 8
      console.log('[Bot] Telegram adapter not yet implemented');
    } else {
      console.error(`Error: Unsupported platform: ${config.platform}`);
      process.exit(1);
    }
  });

program.parse();
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/bot && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/bot/src/index.ts
git commit -m "feat(bot): add Commander CLI entry point"
```

---

## Chunk 3: Core Modules (Platform-Independent)

These modules are shared across all platforms. They handle Socket.IO, sessions, permissions, and message splitting.

### Task 6: Create session store (SQLite)

**Files:**
- Create: `packages/bot/src/core/session-store.ts`

- [ ] **Step 1: Write session store with SQLite**

```typescript
/**
 * Session Store — SQLite-backed session mapping persistence
 * Maps platform chat ID to active session state.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export type UserState = 'unbound' | 'bound' | 'machine_selected' | 'project_selected' | 'in_session';

export interface UserSession {
  id: number;
  platform_user_id: string;
  machine_id: string | null;
  machine_name: string | null;
  project_path: string | null;
  session_id: string | null;
  jwt: string | null;
  jwt_expires_at: string | null;
  refresh_secret: string | null;
  state: UserState;
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_user_id TEXT NOT NULL,
    machine_id TEXT,
    machine_name TEXT,
    project_path TEXT,
    session_id TEXT,
    jwt TEXT,
    jwt_expires_at DATETIME,
    refresh_secret TEXT,
    state TEXT NOT NULL DEFAULT 'unbound',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_user_sessions_platform ON user_sessions(platform_user_id);
`;

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const dir = dbPath ? path.dirname(dbPath) : path.join(process.cwd(), 'data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const resolvedPath = dbPath || path.join(dir, 'bot-sessions.db');
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TABLE_SQL);
  }

  getByPlatformUserId(platformUserId: string): UserSession | undefined {
    return this.db.prepare('SELECT * FROM user_sessions WHERE platform_user_id = ?').get(platformUserId) as UserSession | undefined;
  }

  upsertBinding(platformUserId: string, jwt: string, jwtExpiresAt: string, refreshSecret: string): void {
    const existing = this.getByPlatformUserId(platformUserId);
    if (existing) {
      this.db.prepare(
        'UPDATE user_sessions SET jwt = ?, jwt_expires_at = ?, refresh_secret = ?, state = ? WHERE platform_user_id = ?'
      ).run(jwt, jwtExpiresAt, refreshSecret, 'bound', platformUserId);
    } else {
      this.db.prepare(
        'INSERT INTO user_sessions (platform_user_id, jwt, jwt_expires_at, refresh_secret, state) VALUES (?, ?, ?, ?, ?)'
      ).run(platformUserId, jwt, jwtExpiresAt, refreshSecret, 'bound');
    }
  }

  updateMachine(platformUserId: string, machineId: string, machineName: string): void {
    this.db.prepare(
      'UPDATE user_sessions SET machine_id = ?, machine_name = ?, state = ? WHERE platform_user_id = ?'
    ).run(machineId, machineName, 'machine_selected', platformUserId);
  }

  updateProject(platformUserId: string, projectPath: string): void {
    this.db.prepare(
      'UPDATE user_sessions SET project_path = ?, state = ? WHERE platform_user_id = ?'
    ).run(projectPath, 'project_selected', platformUserId);
  }

  updateSession(platformUserId: string, sessionId: string): void {
    this.db.prepare(
      'UPDATE user_sessions SET session_id = ?, state = ? WHERE platform_user_id = ?'
    ).run(sessionId, 'in_session', platformUserId);
  }

  updateJwt(platformUserId: string, jwt: string, jwtExpiresAt: string): void {
    this.db.prepare(
      'UPDATE user_sessions SET jwt = ?, jwt_expires_at = ? WHERE platform_user_id = ?'
    ).run(jwt, jwtExpiresAt, platformUserId);
  }

  resetSession(platformUserId: string): void {
    this.db.prepare(
      'UPDATE user_sessions SET session_id = NULL, state = ? WHERE platform_user_id = ?'
    ).run('project_selected', platformUserId);
  }

  getAllBound(): UserSession[] {
    return this.db.prepare("SELECT * FROM user_sessions WHERE state != 'unbound' AND jwt IS NOT NULL").all() as UserSession[];
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/bot && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/bot/src/core/session-store.ts
git commit -m "feat(bot): add SQLite session store for user session persistence"
```

---

### Task 7: Create splitter, permission, and socket-client modules

**Files:**
- Create: `packages/bot/src/core/splitter.ts`
- Create: `packages/bot/src/core/permission.ts`
- Create: `packages/bot/src/core/socket-client.ts`

- [ ] **Step 1: Create splitter.ts**

```typescript
/**
 * Long content splitter — handles Telegram's 4096 char limit
 */

const MAX_MESSAGE_LENGTH = 4000; // Leave margin within 4096 limit
const MAX_MESSAGES = 10;

export interface SplitChunk {
  text: string;
  index: number;      // 0-based
  total: number;
  isCodeBlock: boolean;
}

/**
 * Split content into message-sized chunks.
 * Strategy (by priority):
 * 1. Code blocks — extract if they exceed limit
 * 2. Tool calls — each in its own message
 * 3. Plain text — hard split at paragraph/newline boundaries
 * 4. Ultra-long (>MAX_MESSAGES) — summarize
 */
export function splitContent(content: string): SplitChunk[] {
  if (content.length <= MAX_MESSAGE_LENGTH) {
    return [{ text: content, index: 0, total: 1, isCodeBlock: false }];
  }

  const chunks: SplitChunk[] = [];

  // Split by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith('```')) {
      // Code block
      if (part.length <= MAX_MESSAGE_LENGTH) {
        chunks.push({ text: part, index: chunks.length, total: 0, isCodeBlock: true });
      } else {
        // Truncate oversized code block
        const truncated = part.substring(0, MAX_MESSAGE_LENGTH - 50) + '\n... (truncated)';
        chunks.push({ text: truncated, index: chunks.length, total: 0, isCodeBlock: true });
      }
    } else {
      // Plain text — split at paragraph boundaries
      const textChunks = splitText(part, MAX_MESSAGE_LENGTH);
      for (const tc of textChunks) {
        chunks.push({ text: tc, index: chunks.length, total: 0, isCodeBlock: false });
      }
    }
  }

  // If too many chunks, summarize
  if (chunks.length > MAX_MESSAGES) {
    const summary = content.substring(0, MAX_MESSAGE_LENGTH - 100) +
      `\n\n... (output truncated, ${chunks.length} parts total. View full output in Web UI)`;
    return [{ text: summary, index: 0, total: 1, isCodeBlock: false }];
  }

  // Fix total count
  for (const c of chunks) {
    c.total = chunks.length;
    if (chunks.length > 1 && !c.isCodeBlock) {
      c.text = `(${c.index + 1}/${c.total})\n${c.text}`;
    }
  }

  return chunks;
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const result: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      result.push(remaining);
      break;
    }

    // Find a split point near maxLen
    let splitAt = remaining.lastIndexOf('\n\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;

    result.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  return result;
}
```

- [ ] **Step 2: Create permission.ts**

```typescript
/**
 * Permission manager — handles tool permission requests with timeout
 */

export interface PendingPermission {
  sessionId: string;
  requestId: string;
  chatId: string;
  toolName: string;
  description: string;
  timer: NodeJS.Timeout;
  createdAt: number;
}

export class PermissionManager {
  private pending = new Map<number, PendingPermission>();  // callbackKey → pending
  private lookup = new Map<string, number>();               // requestId → callbackKey
  private nextKey = 0;
  private onTimeout?: (requestId: string, sessionId: string, chatId: string) => void;

  setOnTimeout(handler: (requestId: string, sessionId: string, chatId: string) => void): void {
    this.onTimeout = handler;
  }

  /**
   * Register a pending permission request.
   * Returns a short callback key for Telegram Inline Keyboard (≤64 bytes).
   */
  register(sessionId: string, requestId: string, chatId: string, toolName: string, description: string, timeoutMs: number = 300000): number {
    const key = this.nextKey++;
    const timer = setTimeout(() => {
      this.pending.delete(key);
      this.lookup.delete(requestId);
      this.onTimeout?.(requestId, sessionId, chatId);
    }, timeoutMs);

    const entry: PendingPermission = { sessionId, requestId, chatId, toolName, description, timer, createdAt: Date.now() };
    this.pending.set(key, entry);
    this.lookup.set(requestId, key);
    return key;
  }

  /**
   * Resolve a permission request by callback key.
   * Returns the pending request info, or undefined if expired/unknown.
   */
  resolve(callbackKey: number, approved: boolean): PendingPermission | undefined {
    const entry = this.pending.get(callbackKey);
    if (!entry) return undefined;

    clearTimeout(entry.timer);
    this.pending.delete(callbackKey);
    this.lookup.delete(entry.requestId);
    return entry;
  }

  /** Get pending request by callback key (without resolving) */
  get(callbackKey: number): PendingPermission | undefined {
    return this.pending.get(callbackKey);
  }
}
```

- [ ] **Step 3: Create socket-client.ts**

```typescript
/**
 * Socket.IO client — per-user connections to server /client namespace
 */

import { io, Socket } from 'socket.io-client';
import { SocketEvents, SocketNamespaces } from 'cc-remote-shared';

export interface SocketEventHandlers {
  onConnected?: (userId: string) => void;
  onMachinesList?: (data: { machines: unknown[]; onlineInfo: unknown[] }) => void;
  onProjectsList?: (data: { projects: unknown[]; request_id: string }) => void;
  onSessionsList?: (data: { sessions: unknown[]; request_id: string }) => void;
  onSessionStarted?: (data: { sessionId: string; projectPath: string; mode: string; request_id?: string }) => void;
  onChatMessage?: (data: { session_id: string; type: string; content?: string }) => void;
  onChatToolUse?: (data: { session_id: string; toolName?: string; toolInput?: string }) => void;
  onChatToolResult?: (data: { session_id: string; toolResult?: string }) => void;
  onChatPermissionRequest?: (data: { session_id: string; requestId: string; toolName: string; toolInput: Record<string, unknown> }) => void;
  onChatComplete?: (data: { session_id: string }) => void;
  onChatError?: (data: { session_id: string; content?: string }) => void;
  onSessionEnd?: (data: { session_id: string }) => void;
  onError?: (data: { message: string }) => void;
}

export class SocketClientManager {
  private connections = new Map<string, Socket>();  // platformUserId → Socket
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * Connect a user to the server's /client namespace.
   */
  connect(platformUserId: string, jwt: string, handlers: SocketEventHandlers): Socket {
    // Disconnect existing connection
    this.disconnect(platformUserId);

    const socket = io(`${this.serverUrl}${SocketNamespaces.CLIENT}`, {
      auth: { token: jwt },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    socket.on('connect', () => {
      console.log(`[Socket] Connected for user ${platformUserId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected for user ${platformUserId}: ${reason}`);
    });

    // Register event handlers
    socket.on(SocketEvents.CLIENT_CONNECTED, () => handlers.onConnected?.(platformUserId));
    socket.on(SocketEvents.MACHINES_LIST, (data) => handlers.onMachinesList?.(data));
    socket.on(SocketEvents.PROJECTS_LIST, (data) => handlers.onProjectsList?.(data));
    socket.on(SocketEvents.SESSIONS_LIST, (data) => handlers.onSessionsList?.(data));
    socket.on(SocketEvents.SESSION_STARTED, (data) => handlers.onSessionStarted?.(data));
    socket.on(SocketEvents.CHAT_MESSAGE, (data) => handlers.onChatMessage?.(data));
    socket.on(SocketEvents.CHAT_TOOL_USE, (data) => handlers.onChatToolUse?.(data));
    socket.on(SocketEvents.CHAT_TOOL_RESULT, (data) => handlers.onChatToolResult?.(data));
    socket.on(SocketEvents.CHAT_PERMISSION_REQUEST, (data) => handlers.onChatPermissionRequest?.(data));
    socket.on(SocketEvents.CHAT_COMPLETE, (data) => handlers.onChatComplete?.(data));
    socket.on(SocketEvents.CHAT_ERROR, (data) => handlers.onChatError?.(data));
    socket.on(SocketEvents.SESSION_END, (data) => handlers.onSessionEnd?.(data));
    socket.on(SocketEvents.ERROR, (data) => handlers.onError?.(data));

    this.connections.set(platformUserId, socket);
    return socket;
  }

  /** Get socket for a user */
  getSocket(platformUserId: string): Socket | undefined {
    return this.connections.get(platformUserId);
  }

  /** Disconnect a user */
  disconnect(platformUserId: string): void {
    const socket = this.connections.get(platformUserId);
    if (socket) {
      socket.disconnect();
      this.connections.delete(platformUserId);
    }
  }

  /** Disconnect all users */
  disconnectAll(): void {
    for (const [userId] of this.connections) {
      this.disconnect(userId);
    }
  }

  /**
   * Emit an event for a user's connection.
   * Returns false if user is not connected.
   */
  emit(platformUserId: string, event: string, data: unknown): boolean {
    const socket = this.connections.get(platformUserId);
    if (!socket || !socket.connected) return false;
    socket.emit(event, data);
    return true;
  }
}
```

- [ ] **Step 4: Verify all compile**

Run: `cd packages/bot && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/core/
git commit -m "feat(bot): add core modules — splitter, permission manager, socket client"
```

---

### Task 8: Create bridge module

**Files:**
- Create: `packages/bot/src/core/bridge.ts`

- [ ] **Step 1: Create bridge.ts — message routing between platform and Socket.IO**

```typescript
/**
 * Bridge — Routes messages between platform adapters and Socket.IO events.
 * This is the orchestrator that ties core modules together.
 */

import { SocketClientManager, SocketEventHandlers } from './socket-client';
import { SessionStore, UserSession } from './session-store';
import { PermissionManager } from './permission';
import { splitContent } from './splitter';
import { BotPlatform, MessageContent } from '../shared/platform';
import { SocketEvents } from 'cc-remote-shared';
import { loadConfig, BotConfig } from '../config';

export class Bridge {
  readonly sockets: SocketClientManager;
  readonly sessions: SessionStore;
  readonly permissions: PermissionManager;
  readonly platform: BotPlatform;
  readonly config: BotConfig;
  readonly cachedMachines = new Map<string, unknown[]>();  // chatId → last machines list

  constructor(platform: BotPlatform, config?: BotConfig) {
    this.config = config || loadConfig();
    this.platform = platform;
    this.sockets = new SocketClientManager(this.config.serverUrl);
    this.sessions = new SessionStore();
    this.permissions = new PermissionManager();

    // Auto-deny on permission timeout
    this.permissions.setOnTimeout((requestId, sessionId, chatId) => {
      this.platform.sendMessage(chatId, { text: '⏰ Permission request timed out — auto-denied.' });
      // Send deny to agent
      const session = this.sessions.getByPlatformUserId(chatId);
      if (session) {
        this.sockets.emit(chatId, SocketEvents.CHAT_PERMISSION_ANSWER, {
          session_id: sessionId,
          requestId,
          approved: false,
        });
      }
    });

    // Wire platform events
    this.platform.onMessage(this.handleMessage.bind(this));
    this.platform.onCallback(this.handleCallback.bind(this));
  }

  /**
   * Start the bridge: connect platform and recover sessions.
   */
  async start(): Promise<void> {
    await this.platform.start();
    this.recoverSessions();
    console.log('[Bridge] Started');
  }

  /**
   * Handle incoming text message from platform.
   */
  private async handleMessage(chatId: string, text: string): Promise<void> {
    const session = this.sessions.getByPlatformUserId(chatId);

    // Commands are handled by telegram/handlers.ts — this is for chat messages only
    if (!session || session.state !== 'in_session' || !session.session_id) {
      this.platform.sendMessage(chatId, { text: 'No active session. Use /chat <message> to start one.' });
      return;
    }

    // Send message to Claude via Socket.IO
    this.sockets.emit(chatId, SocketEvents.CHAT_SEND, {
      session_id: session.session_id,
      content: text,
    });
  }

  /**
   * Handle callback (button press) from platform.
   */
  private async handleCallback(chatId: string, action: string, data: string): Promise<void> {
    const callbackKey = parseInt(data, 10);
    if (isNaN(callbackKey)) return;

    const approved = action === 'approve';
    const pending = this.permissions.resolve(callbackKey, approved);

    if (!pending) {
      this.platform.sendMessage(chatId, { text: 'Permission request expired or unknown.' });
      return;
    }

    this.sockets.emit(chatId, SocketEvents.CHAT_PERMISSION_ANSWER, {
      session_id: pending.sessionId,
      requestId: pending.requestId,
      approved,
    });

    this.platform.sendMessage(chatId, {
      text: approved ? `✅ Approved: ${pending.toolName}` : `❌ Denied: ${pending.toolName}`,
    });
  }

  /**
   * Connect a newly bound user and set up Socket.IO event handlers.
   */
  connectUser(platformUserId: string, jwt: string): void {
    const handlers: SocketEventHandlers = {
      onMachinesList: (data) => {
        // Cache machines for /use command lookup
        this.cachedMachines.set(platformUserId, data.machines);
        const text = `🖥 Machines:\n${data.machines.map((m: any, i: number) => `${i + 1}. ${m.name} (${m.hostname})`).join('\n')}`;
        this.platform.sendMessage(platformUserId, { text });
      },
      onSessionStarted: (data) => {
        this.sessions.updateSession(platformUserId, data.sessionId);
        this.platform.sendMessage(platformUserId, { text: `🚀 Session started: ${data.projectPath}` });
      },
      onChatMessage: (data) => {
        if (data.type === 'text' && data.content) {
          const chunks = splitContent(data.content);
          for (const chunk of chunks) {
            this.platform.sendMessage(platformUserId, { text: chunk.text });
          }
        }
      },
      onChatToolUse: (data) => {
        if (data.toolName) {
          const text = `🔧 **${data.toolName}**\n\`\`\`\n${data.toolInput || ''}\n\`\`\``;
          this.platform.sendMessage(platformUserId, { text, parseMode: 'Markdown' });
        }
      },
      onChatToolResult: (data) => {
        if (data.toolResult) {
          const chunks = splitContent(data.toolResult);
          for (const chunk of chunks) {
            this.platform.sendMessage(platformUserId, {
              text: chunk.isCodeBlock ? chunk.text : `\`\`\`\n${chunk.text}\n\`\`\``,
              parseMode: 'Markdown',
            });
          }
        }
      },
      onChatPermissionRequest: (data) => {
        const key = this.permissions.register(
          data.session_id,
          data.requestId,
          platformUserId,
          data.toolName,
          JSON.stringify(data.toolInput),
        );
        this.platform.sendPermission(platformUserId, {
          sessionId: data.session_id,
          requestId: data.requestId,
          toolName: data.toolName,
          description: JSON.stringify(data.toolInput).substring(0, 200),
          timeout: 300000,
          callbackKey: key,  // Pass the key so adapter uses it for inline keyboard
        } as any);
      },
      onChatComplete: () => {
        this.sessions.resetSession(platformUserId);
        this.platform.sendMessage(platformUserId, { text: '📋 Session ended.' });
      },
      onChatError: (data) => {
        this.platform.sendMessage(platformUserId, { text: `⚠️ Error: ${data.content || 'Unknown error'}` });
      },
      onSessionEnd: () => {
        this.sessions.resetSession(platformUserId);
        this.platform.sendMessage(platformUserId, { text: '📋 Session ended by agent.' });
      },
      onError: (data) => {
        this.platform.sendMessage(platformUserId, { text: `❌ ${data.message}` });
      },
    };

    this.sockets.connect(platformUserId, jwt, handlers);
  }

  /**
   * Recover sessions after bot restart.
   */
  private recoverSessions(): void {
    const bound = this.sessions.getAllBound();
    console.log(`[Bridge] Recovering ${bound.length} bound sessions...`);

    for (const session of bound) {
      // TODO: Check JWT expiry and refresh if needed (requires HTTP call to server)
      if (session.jwt) {
        this.connectUser(session.platform_user_id, session.jwt);
      }
    }
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd packages/bot && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/bot/src/core/bridge.ts
git commit -m "feat(bot): add bridge module — orchestrates core components"
```

---

## Chunk 4: Telegram Adapter

Telegram-specific implementation: grammy bot, formatter, command handlers.

### Task 9: Create Telegram formatter

**Files:**
- Create: `packages/bot/src/telegram/formatter.ts`

- [ ] **Step 1: Create formatter.ts — TG MarkdownV2 helpers**

```typescript
/**
 * Telegram MarkdownV2 formatter
 * Telegram's MDv2 requires escaping special characters.
 */

const MD_V2_SPECIAL = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

/** Escape text for Telegram MarkdownV2 */
export function escapeMd(text: string): string {
  return text.replace(MD_V2_SPECIAL, '\\$1');
}

/** Format a permission prompt message */
export function formatPermissionPrompt(toolName: string, description: string): string {
  return [
    '🔧 *Claude requests tool execution:*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `*Tool:* ${escapeMd(toolName)}`,
    `*Details:* ${escapeMd(description.substring(0, 200))}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

/** Format machine list */
export function formatMachinesList(machines: Array<{ name: string; hostname: string }>, onlineInfo: Array<{ machineId: string }>): string {
  if (machines.length === 0) return 'No machines registered\\.';
  return machines.map((m, i) => `${i + 1}\\. *${escapeMd(m.name)}* \\(${escapeMd(m.hostname)}\\)`).join('\n');
}

/** Format project list */
export function formatProjectsList(projects: Array<{ name: string; path: string }>): string {
  if (projects.length === 0) return 'No projects found\\.';
  return projects.map((p, i) => `${i + 1}\\. *${escapeMd(p.name)}*\n\`${escapeMd(p.path)}\``).join('\n\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/bot/src/telegram/formatter.ts
git commit -m "feat(bot): add Telegram MarkdownV2 formatter"
```

---

### Task 10: Create Telegram adapter and handlers

**Files:**
- Create: `packages/bot/src/telegram/adapter.ts`
- Create: `packages/bot/src/telegram/handlers.ts`
- Create: `packages/bot/src/telegram/commands.ts`
- Create: `packages/bot/src/telegram/index.ts`

- [ ] **Step 1: Create adapter.ts — BotPlatform implementation**

```typescript
/**
 * Telegram adapter — implements BotPlatform using grammy
 */

import { Bot, InlineKeyboard } from 'grammy';
import { BotPlatform, MessageContent, PermissionRequest, BotCommand } from '../shared/platform';
import { PermissionManager } from '../core/permission';
import { formatPermissionPrompt } from './formatter';

type MessageHandler = (chatId: string, text: string) => void;
type CallbackHandler = (chatId: string, action: string, data: string) => void;

export class TelegramAdapter implements BotPlatform {
  private bot: Bot;
  private messageHandlers: MessageHandler[] = [];
  private callbackHandlers: CallbackHandler[] = [];
  private permissionManager!: PermissionManager; // Set via setPermissionManager

  constructor(token: string) {
    this.bot = new Bot(token);
  }

  /** Inject permission manager (set after construction) */
  setPermissionManager(pm: PermissionManager): void {
    this.permissionManager = pm;
  }

  /** Get the grammy bot instance (for handlers.ts to register commands) */
  getBot(): Bot {
    return this.bot;
  }

  async start(): Promise<void> {
    // Register callback query handler
    this.bot.on('callback_query', async (ctx) => {
      const chatId = String(ctx.chat?.id);
      const data = ctx.callbackQuery.data || '';
      const action = data.startsWith('approve') ? 'approve' : 'deny';

      for (const handler of this.callbackHandlers) {
        handler(chatId, action, data.split(':')[1] || '');
      }
      await ctx.answerCallbackQuery();
    });

    // Start polling
    await this.bot.start({
      onStart: (info) => console.log(`[Telegram] Bot @${info.username} started`),
    });
  }

  async sendMessage(chatId: string, content: MessageContent): Promise<void> {
    try {
      await this.bot.api.sendMessage(chatId, content.text, {
        parse_mode: content.parseMode === 'Markdown' ? 'MarkdownV2' : undefined,
      });
    } catch (error) {
      console.error(`[Telegram] Send error to ${chatId}:`, error);
      // Retry without parse_mode on formatting error
      if (content.parseMode) {
        try {
          await this.bot.api.sendMessage(chatId, content.text);
        } catch { /* give up */ }
      }
    }
  }

  async editMessage(chatId: string, messageId: number, content: MessageContent): Promise<void> {
    try {
      await this.bot.api.editMessageText(chatId, messageId, content.text, {
        parse_mode: content.parseMode === 'Markdown' ? 'MarkdownV2' : undefined,
      });
    } catch { /* ignore edit errors (message unchanged, etc.) */ }
  }

  async sendPermission(chatId: string, request: PermissionRequest): Promise<void> {
    // NOTE: Permission is already registered in bridge.ts onChatPermissionRequest handler.
    // The request.callbackKey field contains the short key from PermissionManager.register().
    // We only render the UI here — no double registration.
    const text = formatPermissionPrompt(request.toolName, request.description);
    const callbackKey = (request as any).callbackKey;

    const keyboard = new InlineKeyboard()
      .text('✅ Approve', `approve:${callbackKey}`)
      .text('❌ Deny', `deny:${callbackKey}`);

    await this.bot.api.sendMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard,
    });
  }

  async registerCommands(commands: BotCommand[]): Promise<void> {
    await this.bot.api.setMyCommands(
      commands.map((c) => ({ command: c.command, description: c.description }))
    );
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
    this.bot.on('message:text', (ctx) => {
      // Skip commands — they are handled by bot.command() handlers
      if (ctx.message.text.startsWith('/')) return;
      const chatId = String(ctx.chat.id);
      for (const h of this.messageHandlers) {
        h(chatId, ctx.message.text);
      }
    });
  }

  onCallback(handler: CallbackHandler): void {
    this.callbackHandlers.push(handler);
  }
}
```

- [ ] **Step 2: Create commands.ts — Command definitions**

```typescript
/**
 * Telegram bot command definitions
 */

import { BotCommand } from '../shared/platform';

export const BOT_COMMANDS: BotCommand[] = [
  { command: 'start', description: 'Bind your account' },
  { command: 'machines', description: 'List online machines' },
  { command: 'use', description: 'Select target machine: /use <name>' },
  { command: 'projects', description: 'List projects on selected machine' },
  { command: 'cd', description: 'Select project: /cd <path>' },
  { command: 'chat', description: 'Send message to Claude: /chat <text>' },
  { command: 'new', description: 'Start a new session' },
  { command: 'history', description: 'List historical sessions' },
  { command: 'cancel', description: 'Cancel current operation' },
];
```

- [ ] **Step 3: Create handlers.ts — Command and message handlers**

```typescript
/**
 * Telegram command handlers
 */

import { Bot, Context } from 'grammy';
import { Bridge } from '../core/bridge';
import { SocketEvents } from 'cc-remote-shared';
import { BOT_COMMANDS } from './commands';
import { formatMachinesList, formatProjectsList } from './formatter';

export function registerHandlers(bot: Bot, bridge: Bridge): void {
  // Register commands with Telegram
  bridge.platform.registerCommands(BOT_COMMANDS);

  // /start — Bind account
  bot.command('start', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = bridge.sessions.getByPlatformUserId(chatId);

    if (session && session.state !== 'unbound') {
      await ctx.reply('✅ You are already bound! Use /machines to see your machines.');
      return;
    }

    // Generate bind token (in-memory, 10 min TTL — simple random)
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const bindUrl = `${bridge.config.serverUrl}/bind-telegram?token=${token}&platform_user_id=${chatId}&chat_id=${chatId}`;

    await ctx.reply(
      `Welcome! To bind your account, open this link in your browser:\n\n${bindUrl}\n\n(Link expires in 10 minutes)`,
      { parse_mode: undefined },
    );
  });

  // /machines — List online machines
  bot.command('machines', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = bridge.sessions.getByPlatformUserId(chatId);

    if (!session || session.state === 'unbound') {
      await ctx.reply('Please bind your account first with /start');
      return;
    }

    // Request machines list via Socket.IO
    const sent = bridge.sockets.emit(chatId, SocketEvents.MACHINES_LIST, {});
    if (!sent) {
      await ctx.reply('❌ Not connected to server. Try again later.');
    }
  });

  // /use — Select machine
  bot.command('use', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const name = ctx.match?.trim();

    if (!name) {
      await ctx.reply('Usage: /use <machine-name>');
      return;
    }

    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session || session.state === 'unbound') {
      await ctx.reply('Please bind your account first with /start');
      return;
    }

    // Look up machine by name from cached machines list
    // The bridge stores the last MACHINES_LIST response per chatId
    const machines = bridge.cachedMachines.get(chatId);
    if (!machines) {
      await ctx.reply('Machine list not loaded. Use /machines first.');
      return;
    }
    const machine = machines.find((m: any) => m.name === name || m.name.toLowerCase().includes(name.toLowerCase()));
    if (!machine) {
      await ctx.reply(`Machine "${name}" not found. Use /machines to see available machines.`);
      return;
    }

    bridge.sessions.updateMachine(chatId, machine.id, machine.name);
    await ctx.reply(`🖥 Machine selected: ${machine.name} (${machine.hostname})\nUse /projects to see available projects.`);
  });

  // /projects — List projects
  bot.command('projects', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = bridge.sessions.getByPlatformUserId(chatId);

    if (!session?.machine_id) {
      await ctx.reply('Select a machine first with /use <name>');
      return;
    }

    bridge.sockets.emit(chatId, SocketEvents.SCAN_PROJECTS, {
      machine_id: session.machine_id,
      request_id: `req-${Date.now()}`,
    });
  });

  // /cd — Select project
  bot.command('cd', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const path = ctx.match?.trim();

    if (!path) {
      await ctx.reply('Usage: /cd <project-path>');
      return;
    }

    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session?.machine_id) {
      await ctx.reply('Select a machine first with /use <name>');
      return;
    }

    bridge.sessions.updateProject(chatId, path);
    await ctx.reply(`📂 Project set to: ${path}\nUse /chat <message> to start talking to Claude.`);
  });

  // /chat — Start or continue chat session
  bot.command('chat', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const message = ctx.match?.trim();

    if (!message) {
      await ctx.reply('Usage: /chat <your message>');
      return;
    }

    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session?.machine_id || !session?.project_path) {
      await ctx.reply('Set up a machine and project first. Use /machines and /cd');
      return;
    }

    // If no active session, start one
    if (!session.session_id) {
      bridge.sockets.emit(chatId, SocketEvents.START_SESSION, {
        machine_id: session.machine_id,
        project_path: session.project_path,
        mode: 'chat',
        request_id: `req-${Date.now()}`,
      });
      // Session will be stored when SESSION_STARTED event fires
      // The message will be sent after session starts via the bridge
    } else {
      // Send to existing session
      bridge.sockets.emit(chatId, SocketEvents.CHAT_SEND, {
        session_id: session.session_id,
        content: message,
      });
    }
  });

  // /new — Start new session
  bot.command('new', async (ctx) => {
    const chatId = String(ctx.chat.id);
    bridge.sessions.resetSession(chatId);
    await ctx.reply('🔄 Previous session cleared. Use /chat <message> to start a new session.');
  });

  // /history — List sessions
  bot.command('history', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = bridge.sessions.getByPlatformUserId(chatId);

    if (!session?.machine_id || !session?.project_path) {
      await ctx.reply('Set up a machine and project first.');
      return;
    }

    bridge.sockets.emit(chatId, SocketEvents.LIST_SESSIONS, {
      machine_id: session.machine_id,
      project_path: session.project_path,
      request_id: `req-${Date.now()}`,
    });
  });

  // /cancel — Cancel current operation
  bot.command('cancel', async (ctx) => {
    const chatId = String(ctx.chat.id);
    bridge.sessions.resetSession(chatId);
    await ctx.reply('✅ Cancelled.');
  });
}
```

- [ ] **Step 4: Create telegram/index.ts — Telegram module entry (barrel export)**

```typescript
/**
 * Telegram module entry — re-exports for convenient importing
 */

export { TelegramAdapter } from './adapter';
export { registerHandlers } from './handlers';
export { BOT_COMMANDS } from './commands';
```

- [ ] **Step 5: Verify compilation**

Run: `cd packages/bot && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/bot/src/telegram/
git commit -m "feat(bot): add Telegram adapter, handlers, and formatter"
```

---

## Chunk 5: Wire Everything Together

Connect CLI entry → Bridge → Telegram adapter. Final integration and testing.

### Task 11: Wire CLI entry point to Bridge + Telegram

**Files:**
- Modify: `packages/bot/src/index.ts`

- [ ] **Step 1: Replace index.ts with the final wired version**

```typescript
#!/usr/bin/env node

/**
 * cc-bot — Claude Code Remote Bot Service
 * CLI entry point that starts the bot bridge.
 */

import { Command } from 'commander';
import { loadConfig } from './config';
import { Bridge } from './core/bridge';
import { TelegramAdapter } from './telegram/adapter';
import { registerHandlers } from './telegram/handlers';

const program = new Command();

program
  .name('cc-bot')
  .description('Claude Code Remote Bot Service — IM bridge for Claude Code sessions')
  .version('0.1.0')
  .option('--platform <platform>', 'Messaging platform (telegram)', 'telegram')
  .option('--bot-token <token>', 'Telegram bot token (or set TELEGRAM_BOT_TOKEN)')
  .option('--server <url>', 'Server URL (or set BOT_SERVER_URL)')
  .option('--port <port>', 'Bot HTTP port (or set BOT_PORT)', '3001')
  .action(async (options) => {
    const config = loadConfig({
      serverUrl: options.server,
      botPort: parseInt(options.port, 10),
      platform: options.platform,
      telegramBotToken: options.botToken,
    });

    console.log('');
    console.log('=================================');
    console.log('  Claude Code Remote Bot');
    console.log('=================================');
    console.log(`  Platform: ${config.platform}`);
    console.log(`  Server:   ${config.serverUrl}`);
    console.log(`  Bot Port: ${config.botPort}`);
    console.log('=================================');
    console.log('');

    if (config.platform === 'telegram') {
      if (!config.telegramBotToken) {
        console.error('Error: Telegram bot token required. Use --bot-token or set TELEGRAM_BOT_TOKEN');
        process.exit(1);
      }

      // 1. Create adapter (no bridge dependency yet)
      const adapter = new TelegramAdapter(config.telegramBotToken);

      // 2. Create bridge with adapter
      const bridge = new Bridge(adapter, config);

      // 3. Inject permission manager into adapter (resolves circular dep)
      adapter.setPermissionManager(bridge.permissions);

      // 4. Register command handlers (needs bridge for Socket.IO access)
      registerHandlers(adapter.getBot(), bridge);

      // 5. Start
      await bridge.start();
      console.log('[Bot] Telegram bot is running. Press Ctrl+C to stop.');
    } else {
      console.error(`Error: Unsupported platform: ${config.platform}`);
      process.exit(1);
    }
  });

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Bot] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Bot] Shutting down...');
  process.exit(0);
});

program.parse();
```

- [ ] **Step 2: Verify full compilation**

Run: `cd packages/bot && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Build**

Run: `cd packages/bot && npx tsc`
Expected: `dist/` directory created with compiled JS files

- [ ] **Step 5: Test run (will fail without valid bot token, but should show help)**

Run: `cd packages/bot && node dist/index.js --help`
Expected: Help text showing all options

- [ ] **Step 6: Commit**

```bash
git add packages/bot/src/index.ts
git commit -m "feat(bot): wire CLI → Bridge → Telegram adapter pipeline"
```

---

### Task 12: Add feishu stub and data/.gitkeep

**Files:**
- Create: `packages/bot/src/feishu/index.ts`
- Create: `packages/bot/data/.gitkeep`

- [ ] **Step 1: Create feishu stub**

```typescript
/**
 * Feishu adapter stub — future implementation
 */

export class FeishuAdapter {
  // TODO: Implement BotPlatform for Feishu
  // - Use Feishu Open Platform SDK
  // - Interactive message cards for permission approval
  // - Rich text formatting
}
```

- [ ] **Step 2: Create data/.gitkeep**

```bash
mkdir -p packages/bot/data && touch packages/bot/data/.gitkeep
echo "data/*.db" > packages/bot/data/.gitignore
```

- [ ] **Step 3: Commit**

```bash
git add packages/bot/src/feishu/ packages/bot/data/
git commit -m "feat(bot): add feishu stub and data directory"
```

---

## Chunk 6: Integration Testing & Final Touches

### Task 13: Manual integration test

- [ ] **Step 1: Build everything**

Run: `cd /home/zxn/Projects/ai/claude-code-remote && pnpm run build`
Expected: All packages build without errors

- [ ] **Step 2: Start server in dev mode**

Terminal 1: `cd packages/server && pnpm run dev`

- [ ] **Step 3: Start bot with a test Telegram bot token**

Terminal 2: `cd packages/bot && pnpm run dev -- --platform telegram --bot-token <YOUR_TEST_TOKEN> --server http://localhost:3000`

Expected: Bot starts, shows connection info, begins polling Telegram

- [ ] **Step 4: Test /start command**

Send `/start` to your test bot on Telegram.
Expected: Bot replies with bind URL

- [ ] **Step 5: Commit any fixes**

If any issues found during testing, fix and commit with message like:
`fix(bot): resolve <issue description>`

---

### Task 14: Final commit and PR preparation

- [ ] **Step 1: Ensure all changes committed**

Run: `git status`
Expected: Clean working tree

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/5-telegram-bot-integration
```

- [ ] **Step 3: Create PR (optional, when ready)**

```bash
gh pr create --title "feat: add Telegram bot integration" --body "Implements #5"
```

---

## Summary

| Chunk | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-2 | Server-side: Prisma model + API routes |
| 2 | 3-5 | Bot package skeleton: package.json, config, interface, CLI |
| 3 | 6-8 | Core modules: session-store, splitter, permission, socket-client, bridge |
| 4 | 9-10 | Telegram: formatter, adapter, handlers, commands |
| 5 | 11-12 | Wire everything together + feishu stub |
| 6 | 13-14 | Integration testing + PR |

**Total: 14 tasks, ~40 steps**
