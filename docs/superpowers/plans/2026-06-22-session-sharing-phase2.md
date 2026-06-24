# Session Sharing Phase 2 (Collaborative Participation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner invite authenticated collaborators into a session who can send messages (with sender attribution) and approve permissions under an owner-configurable approval mode — replacing Phase 1's in-memory share tokens with DB-backed invites.

**Architecture:** DB-backed `SessionParticipant`/`SessionInvite` tables hold the durable role roster and invite links; a thin in-memory overlay (`socketId → role`) resolved at connect keeps the chat hot path DB-free. Permission requests route by `approval_mode` (`owner` | `any`) with first-approval-wins. Attribution is display-only (the SDK already echoes `type:'user'` messages, so sender meta rides on those).

**Tech Stack:** Prisma (SQLite), socket.io, TypeScript, React/Vite (web), Jest (server/agent/shared — no web test runner).

**Prerequisite:** Phase 1 (PR #24) must be merged to `main` before executing this plan — Phase 2 generalizes Phase 1's viewer/permission code. Create the working branch from `main` (e.g. `feat/7-session-sharing-phase2`) once Phase 1 lands.

## Global Constraints

- DB is SQLite via Prisma; follow the existing `@map`/`@@map` snake_case convention.
- Role string values are fixed: `SessionParticipant.role` ∈ `"owner" | "collaborator"`; `SessionInvite.role` ∈ `"collaborator" | "viewer"`; socket overlay `role` ∈ `"owner" | "collaborator" | "viewer"`.
- `approval_mode` ∈ `"owner" | "any"`, default `"owner"`.
- Display name resolution: `username || email-local-part || "Collaborator"`.
- `SessionParticipant` writes are always **upserts** (`@@unique([session_id, user_id])`); single-use invite redemption is **atomic** (`updateMany` with `used_count < max_uses` guard, check affected rows).
- First-approval-wins: permission requests are resolved once per `request_id`; later answers ignored; on resolution broadcast `CHAT_PERMISSION_RESOLVED` to other recipients.
- No content-prefixing of messages to the model (display-only attribution).
- Phase 3 items (voting, typing indicators, quoting, recording) are out of scope.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/server/prisma/schema.prisma` | `SessionParticipant`, `SessionInvite` models; `approval_mode` on `SessionLog`; back-relations |
| `packages/shared/src/constants.ts` | New event names; `APPROVAL_MODE_OWNER`/`APPROVAL_MODE_ANY` |
| `packages/shared/src/types.ts` | `ChatMessageEvent` sender fields; invite/participant event types; `ApprovalMode`; `Role` |
| `packages/server/src/session/policy.ts` | **New** — pure decision logic: `canSend`, `canApprove`, `validateInvite`, `resolveDisplayName`, `redeemDecision` |
| `packages/server/src/session/pendingPermissions.ts` | **New** — pure first-approval-wins tracker |
| `packages/server/src/socket/store.ts` | `SessionInfo.approvalMode`; online overlay `Map<socketId, {role, userId, displayName}>` |
| `packages/server/src/socket/client.socket.ts` | Invite/participant/join handlers; role injection; permission routing; owner management |
| `packages/server/src/socket/agent.socket.ts` | `CHAT_MESSAGE` sender passthrough; permission request routing by mode |
| `packages/agent/src/sdk-session.ts` | `sendMessage(content, attachments?, sender?)` |
| `packages/agent/src/client.ts` | `handleChatSend` forwards sender meta |
| `packages/web/src/lib/socket.ts` | Collaborator connect; new event emit/listen |
| `packages/web/src/stores/sessionStore.ts` | Invite/participants/approvalMode state |
| `packages/web/src/components/chat/ChatMessage.tsx` | Sender name/avatar on `type:'user'` |
| `packages/web/src/pages/SharedSessionPage.tsx` | Collaborator variant (composer + permission banner) |
| `packages/web/src/components/chat/ParticipantsPanel.tsx` | **New** — owner UI: invites, roster, approval mode |

---

### Task 1: DB schema, migration, shared types & constants

**Files:**
- Modify: `packages/server/prisma/schema.prisma`
- Create: `packages/server/prisma/migrations/<timestamp>_session_participants_and_invites/migration.sql` (generated)
- Modify: `packages/shared/src/constants.ts`, `packages/shared/src/types.ts`
- Test: `packages/shared/tests/unit/types.test.ts` (existing pattern)

**Interfaces:**
- Produces: Prisma models `SessionParticipant`, `SessionInvite`; `SessionLog.approvalMode`; shared event constants and types consumed by all later tasks.

- [ ] **Step 1: Add the Prisma models + column + back-relations**

In `packages/server/prisma/schema.prisma`, add to `SessionLog`:
```prisma
  approval_mode String    @default("owner") @map("approval_mode") // "owner" | "any"
  participants  SessionParticipant[]
  invites       SessionInvite[]
```
Add to `User`:
```prisma
  sessionParticipants SessionParticipant[]
```
Add the two new models at the end:
```prisma
model SessionParticipant {
  id          String   @id @default(uuid())
  session_id  String   @map("session_id")
  user_id     String   @map("user_id")
  role        String                       // "owner" | "collaborator"
  invited_by  String?  @map("invited_by")  // user_id of inviter; null for owner
  joined_at   DateTime @default(now()) @map("joined_at")

  session     SessionLog @relation(fields: [session_id], references: [id], onDelete: Cascade)
  user        User       @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([session_id, user_id])
  @@index([session_id])
  @@map("session_participants")
}

model SessionInvite {
  id          String    @id @default(uuid())
  session_id  String    @map("session_id")
  token       String    @unique @default(uuid())
  role        String                              // "collaborator" | "viewer"
  created_by  String    @map("created_by")
  expires_at  DateTime? @map("expires_at")
  max_uses    Int?      @map("max_uses")
  used_count  Int       @default(0) @map("used_count")
  created_at  DateTime  @default(now()) @map("created_at")

  session     SessionLog @relation(fields: [session_id], references: [id], onDelete: Cascade)

  @@index([session_id])
  @@map("session_invites")
}
```

- [ ] **Step 2: Generate the migration**

Run: `cd packages/server && npx prisma migrate dev --name session_participants_and_invites`
Expected: a new migration SQL file is created; `prisma generate` runs; exit 0. If the dev DB has data conflicts, the command will say so — do NOT force-destruct the dev DB without checking.

- [ ] **Step 3: Add shared constants**

In `packages/shared/src/constants.ts`, inside the `SocketEvents` object, add:
```typescript
  INVITE_CREATE: 'invite:create',
  INVITE_CREATED: 'invite:created',
  INVITE_REVOKE: 'invite:revoke',
  PARTICIPANTS_LIST: 'participants:list',
  PARTICIPANTS: 'participants',
  PARTICIPANT_REMOVED: 'participant:removed',
  APPROVAL_MODE_SET: 'approval-mode:set',
  APPROVAL_MODE_CHANGED: 'approval-mode:changed',
  CHAT_PERMISSION_RESOLVED: 'chat:permission-resolved',
```
Also export the mode values (top-level, after `SocketEvents`):
```typescript
export const APPROVAL_MODE_OWNER = 'owner';
export const APPROVAL_MODE_ANY = 'any';
export type ApprovalMode = typeof APPROVAL_MODE_OWNER | typeof APPROVAL_MODE_ANY;
export type Role = 'owner' | 'collaborator' | 'viewer';
```

- [ ] **Step 4: Extend shared types**

In `packages/shared/src/types.ts`, extend `ChatMessageEvent` with optional sender fields:
```typescript
export interface ChatMessageEvent {
  session_id: string;
  type: string;
  content?: string;
  data?: unknown;
  sender_id?: string;     // NEW — set on type:'user' messages
  sender_name?: string;   // NEW — set on type:'user' messages
}
```
(Only add the two new optional fields; preserve existing fields — read the current interface first and keep them.)
Add event payload types near the other event types:
```typescript
export interface InviteCreateEvent { session_id: string; role: 'collaborator' | 'viewer'; maxUses?: number; expiresAt?: string; }
export interface InviteCreatedEvent { session_id: string; token: string; role: 'collaborator' | 'viewer'; link: string; }
export interface ParticipantsListEvent { session_id: string; }
export interface ParticipantInfo { userId: string; displayName: string; role: Role; online: boolean; }
export interface ParticipantsEvent { session_id: string; participants: ParticipantInfo[]; viewerCount: number; }
export interface ApprovalModeSetEvent { session_id: string; mode: ApprovalMode; }
```

- [ ] **Step 5: Add a constants smoke test**

In `packages/shared/tests/unit/types.test.ts`, add (follow the existing `expect(SocketEvents.X).toBe(...)` pattern):
```typescript
  it('should define Phase 2 socket events', () => {
    expect(SocketEvents.INVITE_CREATE).toBe('invite:create');
    expect(SocketEvents.INVITE_CREATED).toBe('invite:created');
    expect(SocketEvents.PARTICIPANTS).toBe('participants');
    expect(SocketEvents.CHAT_PERMISSION_RESOLVED).toBe('chat:permission-resolved');
  });
```

- [ ] **Step 6: Run the shared test**

Run: `cd packages/shared && npx jest tests/unit/types.test.ts`
Expected: PASS (including the new case).

- [ ] **Step 7: Verify Prisma client compiles and the server builds**

Run: `cd packages/server && npx tsc --noEmit`
Expected: no errors (the generated Prisma client now includes the new models).

- [ ] **Step 8: Commit**

```bash
git add packages/server/prisma/schema.prisma packages/server/prisma/migrations packages/shared/src/constants.ts packages/shared/src/types.ts packages/shared/tests/unit/types.test.ts
git commit -m "feat(shared,server): add Phase 2 schema, events, and types (#7)"
```

---

### Task 2: Pure session policy logic (TDD)

**Files:**
- Create: `packages/server/src/session/policy.ts`
- Create: `packages/server/src/session/pendingPermissions.ts`
- Create: `packages/server/tests/unit/session/policy.test.ts`
- Create: `packages/server/tests/unit/session/pendingPermissions.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3–6):
  - `canSend(role: Role): boolean`
  - `canApprove(role: Role, mode: ApprovalMode): boolean`
  - `resolveDisplayName(user: { username: string | null; email: string }): string`
  - `validateInvite(invite: { role: string; expiresAt: Date | null; maxUses: number | null; usedCount: number }, now: Date): 'ok' | 'expired' | 'exhausted'`
  - `pendingPermissions.ts`: `createPendingPermissions()` → `{ tryResolve(id): boolean; isResolved(id): boolean; clear(id): void; size(): number }`

- [ ] **Step 1: Write the failing policy tests**

Create `packages/server/tests/unit/session/policy.test.ts`:
```typescript
import { canSend, canApprove, resolveDisplayName, validateInvite } from '../../../src/session/policy';

describe('session policy', () => {
  describe('canSend', () => {
    it('allows owner and collaborator', () => {
      expect(canSend('owner')).toBe(true);
      expect(canSend('collaborator')).toBe(true);
    });
    it('denies viewer', () => {
      expect(canSend('viewer')).toBe(false);
    });
  });

  describe('canApprove', () => {
    it('owner can always approve', () => {
      expect(canApprove('owner', 'owner')).toBe(true);
      expect(canApprove('owner', 'any')).toBe(true);
    });
    it('collaborator can approve only in any mode', () => {
      expect(canApprove('collaborator', 'any')).toBe(true);
      expect(canApprove('collaborator', 'owner')).toBe(false);
    });
    it('viewer can never approve', () => {
      expect(canApprove('viewer', 'any')).toBe(false);
      expect(canApprove('viewer', 'owner')).toBe(false);
    });
  });

  describe('resolveDisplayName', () => {
    it('prefers username', () => {
      expect(resolveDisplayName({ username: 'alice', email: 'a@b.com' })).toBe('alice');
    });
    it('falls back to email local-part', () => {
      expect(resolveDisplayName({ username: null, email: 'bob.stark@example.com' })).toBe('bob.stark');
    });
    it('falls back to Collaborator when email empty', () => {
      expect(resolveDisplayName({ username: null, email: '' })).toBe('Collaborator');
    });
  });

  describe('validateInvite', () => {
    const base = { role: 'collaborator', expiresAt: null, maxUses: null, usedCount: 0 };
    it('ok when valid and unexpired', () => {
      expect(validateInvite(base, new Date('2026-01-01T00:00:01Z'))).toBe('ok');
    });
    it('expired when past expiresAt', () => {
      expect(validateInvite({ ...base, expiresAt: new Date('2026-01-01T00:00:00Z') }, new Date('2026-01-02T00:00:00Z'))).toBe('expired');
    });
    it('exhausted when usedCount >= maxUses', () => {
      expect(validateInvite({ ...base, maxUses: 1, usedCount: 1 }, new Date())).toBe('exhausted');
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/server && npx jest tests/unit/session/policy.test.ts`
Expected: FAIL — `Cannot find module '../../../src/session/policy'`.

- [ ] **Step 3: Implement policy.ts**

Create `packages/server/src/session/policy.ts`:
```typescript
import { ApprovalMode, Role } from 'cc-remote-shared';

export function canSend(role: Role): boolean {
  return role === 'owner' || role === 'collaborator';
}

export function canApprove(role: Role, mode: ApprovalMode): boolean {
  if (role === 'owner') return true;
  if (role === 'collaborator') return mode === 'any';
  return false; // viewer
}

export function resolveDisplayName(user: { username: string | null; email: string }): string {
  if (user.username) return user.username;
  const at = user.email.indexOf('@');
  const local = at > 0 ? user.email.slice(0, at) : '';
  return local || 'Collaborator';
}

export type InviteValidation = 'ok' | 'expired' | 'exhausted';

export function validateInvite(
  invite: { role: string; expiresAt: Date | null; maxUses: number | null; usedCount: number },
  now: Date,
): InviteValidation {
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) return 'exhausted';
  return 'ok';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/server && npx jest tests/unit/session/policy.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Write the failing pendingPermissions tests**

Create `packages/server/tests/unit/session/pendingPermissions.test.ts`:
```typescript
import { createPendingPermissions } from '../../../src/session/pendingPermissions';

describe('pendingPermissions (first-approval-wins)', () => {
  it('first resolve wins, subsequent return false', () => {
    const p = createPendingPermissions();
    expect(p.tryResolve('r1')).toBe(true);
    expect(p.tryResolve('r1')).toBe(false);
  });
  it('isResolved reflects state', () => {
    const p = createPendingPermissions();
    expect(p.isResolved('r1')).toBe(false);
    p.tryResolve('r1');
    expect(p.isResolved('r1')).toBe(true);
  });
  it('clear removes the entry', () => {
    const p = createPendingPermissions();
    p.tryResolve('r1');
    p.clear('r1');
    expect(p.isResolved('r1')).toBe(false);
    expect(p.tryResolve('r1')).toBe(true);
  });
  it('size counts entries', () => {
    const p = createPendingPermissions();
    p.tryResolve('r1');
    p.tryResolve('r2');
    expect(p.size()).toBe(2);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd packages/server && npx jest tests/unit/session/pendingPermissions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement pendingPermissions.ts**

Create `packages/server/src/session/pendingPermissions.ts`:
```typescript
/**
 * Tracks pending permission requests for first-approval-wins.
 * A request id resolves exactly once; later attempts return false.
 */
export function createPendingPermissions() {
  const resolved = new Set<string>();

  return {
    /** Returns true if this call is the first resolution (winner). */
    tryResolve(id: string): boolean {
      if (resolved.has(id)) return false;
      resolved.add(id);
      return true;
    },
    isResolved(id: string): boolean {
      return resolved.has(id);
    },
    clear(id: string): void {
      resolved.delete(id);
    },
    size(): number {
      return resolved.size;
    },
  };
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `cd packages/server && npx jest tests/unit/session/pendingPermissions.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/session packages/server/tests/unit/session
git commit -m "feat(server): add session policy + first-approval-wins helpers (#7)"
```

---

### Task 3: Server store overlay + join flow (viewer + collaborator)

**Files:**
- Modify: `packages/server/src/socket/store.ts`
- Modify: `packages/server/src/socket/client.socket.ts`
- Test: `packages/server/tests/unit/session/join.test.ts` (pure join-decision logic)

**Interfaces:**
- Consumes: Task 1 (`SessionInvite`, `SessionParticipant` Prisma models; events), Task 2 (`validateInvite`, `resolveDisplayName`).
- Produces: socket-side `socket.data.role` / `userId` / `displayName` set at connect; `SessionInfo.approvalMode` + online overlay in `store.ts`.

**Note:** The socket wiring itself is verified by inspection + manual test (socket.io handlers aren't unit-tested in this repo). The pure join decision is extracted and TDD'd.

- [ ] **Step 1: Extend SessionInfo in store.ts**

In `packages/server/src/socket/store.ts`, read the current `SessionInfo` interface and add:
```typescript
  approvalMode: ApprovalMode;
```
(import `ApprovalMode` from `cc-remote-shared`). Update every place that constructs a `SessionInfo` (search `sessions.set(`) to include `approvalMode: 'owner'` so the type checks. Leave the existing Phase 1 `shareToken`/`viewers` fields in place for now (retired in Task 6).

- [ ] **Step 2: Add the online overlay + helpers**

In `store.ts`, add (and export):
```typescript
// socketId → resolved identity/role, populated at connect
export interface OnlineParticipant {
  role: Role;
  userId?: string;        // absent for anonymous viewers
  displayName?: string;
}
export const onlineParticipants = new Map<string, OnlineParticipant>();
```
Add a reset to `clearAllStores()` (already exists in this file): `onlineParticipants.clear();`

- [ ] **Step 3: Write the join-decision test (pure)**

Create `packages/server/tests/unit/session/join.test.ts`:
```typescript
import { decideJoin } from '../../../src/session/join';

describe('decideJoin', () => {
  it('viewer invite + no JWT → viewer role, anonymous', () => {
    expect(decideJoin({ inviteRole: 'viewer', hasJwt: false })).toEqual({ role: 'viewer', requiresParticipantRow: false });
  });
  it('collaborator invite + JWT → collaborator role', () => {
    expect(decideJoin({ inviteRole: 'collaborator', hasJwt: true })).toEqual({ role: 'collaborator', requiresParticipantRow: true });
  });
  it('collaborator invite without JWT → rejected', () => {
    expect(decideJoin({ inviteRole: 'collaborator', hasJwt: false })).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd packages/server && npx jest tests/unit/session/join.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement join.ts**

Create `packages/server/src/session/join.ts`:
```typescript
import { Role } from 'cc-remote-shared';

export interface JoinDecision {
  role: Role;
  requiresParticipantRow: boolean; // collaborator → true (upsert SessionParticipant)
}

/**
 * Pure decision: given the invite's role and whether the socket is JWT-authenticated,
 * decide the granted role (or null = reject).
 * Viewers are anonymous; collaborators must be authenticated.
 */
export function decideJoin(input: { inviteRole: 'viewer' | 'collaborator'; hasJwt: boolean }): JoinDecision | null {
  if (input.inviteRole === 'viewer') return { role: 'viewer', requiresParticipantRow: false };
  if (input.inviteRole === 'collaborator' && input.hasJwt) return { role: 'collaborator', requiresParticipantRow: true };
  return null;
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd packages/server && npx jest tests/unit/session/join.test.ts`
Expected: PASS.

- [ ] **Step 7: Wire the join flow into client.socket.ts**

In `packages/server/src/socket/client.socket.ts`, rework the existing Phase 1 `JOIN_SHARED_SESSION` handler to use the DB-backed `SessionInvite`. Read the current handler first. Replace its body to:
1. `prisma.sessionInvite.findUnique({ where: { token: data.shareToken } })`.
2. If not found → emit `ERROR { message: '邀请链接无效' }`.
3. `const status = validateInvite(invite, new Date())` → if not `'ok'`, emit `ERROR { message: status === 'expired' ? '邀请链接已过期' : '邀请名额已满' }`.
4. `const decision = decideJoin({ inviteRole: invite.role, hasJwt: !!socket.data.userId })`.
5. If `decision === null` → emit `ERROR { message: '该协作邀请需要先登录' }`.
6. For `collaborator`: atomic redeem — `const r = await prisma.sessionInvite.updateMany({ where: { id: invite.id, used_count: { lt: invite.maxUses ?? Number.MAX_SAFE_INTEGER } }, data: { used_count: { increment: 1 } } })`; if `r.count === 0` → emit exhausted error. (Viewer invites with `maxUses = null` skip the redeem.)
7. Upsert participant when `decision.requiresParticipantRow`: `prisma.sessionParticipant.upsert({ where: { session_id_user_id: { session_id: invite.session_id, user_id: socket.data.userId }, ... })}` — actually use `upsert` with the composite unique `session_id_user_id`.
8. Set `socket.data.role = decision.role`, join `session:{id}` room, set `socket.data.sessionId`. For collaborator also set `socket.data.displayName`.
9. Populate `onlineParticipants.set(socket.id, { role, userId, displayName })`.
10. Emit `SESSION_STARTED` / buffer replay as Phase 1 does.

This is wiring (verified by inspection + manual). Run `cd packages/server && npx tsc --noEmit` → must be clean.

- [ ] **Step 8: Owner row on session start**

In `packages/server/src/socket/agent.socket.ts`, where `SESSION_STARTED` creates the `SessionLog` (non-history branch), add an **upsert** of the owner participant using the client user who started it. Read the surrounding code; the owner's `userId` comes from the client socket that initiated (available via `getSocketIdByRequestId` → socket.data.userId, or pass through the request). If the owner userId isn't reachable here cleanly, create the owner row in the `START_SESSION` handler in `client.socket.ts` instead (where `socket.data.userId` is directly available) — pick whichever location has the userId and note the choice in the commit.

```typescript
await prisma.sessionParticipant.upsert({
  where: { session_id_user_id: { session_id: sessionId, user_id: ownerUserId } },
  create: { session_id: sessionId, user_id: ownerUserId, role: 'owner', invited_by: null },
  update: { role: 'owner' },
}).catch(console.error);
```

- [ ] **Step 9: tsc + commit**

Run: `cd packages/server && npx tsc --noEmit` → clean.
```bash
git add packages/server/src/socket/store.ts packages/server/src/socket/client.socket.ts packages/server/src/socket/agent.socket.ts packages/server/src/session/join.ts packages/server/tests/unit/session/join.test.ts
git commit -m "feat(server): DB-backed invite join flow + online overlay (#7)"
```

---

### Task 4: CHAT_SEND role guard + sender injection

**Files:**
- Modify: `packages/server/src/socket/client.socket.ts`
- Modify: `packages/server/src/socket/agent.socket.ts`

**Interfaces:**
- Consumes: Task 2 `canSend`; Task 3 `onlineParticipants` overlay; `resolveDisplayName`.
- Produces: `CHAT_SEND` forwarded to agent now carries `sender_id` + `sender_name`; only `owner`/`collaborator` may send.

- [ ] **Step 1: Add the role guard + sender injection in client.socket.ts**

In `packages/server/src/socket/client.socket.ts`, find the existing `CHAT_SEND` handler (Phase 1 added an `isViewer` guard). Replace/augment it:
```typescript
  socket.on(SocketEvents.CHAT_SEND, (data: ChatSendEvent) => {
    const online = onlineParticipants.get(socket.id);
    const role: Role = online?.role ?? 'viewer';
    if (!canSend(role)) return; // viewers (and unknowns) cannot send

    const sessionInfo = sessions.get(data.session_id);
    if (!sessionInfo) return;

    const enriched = {
      ...data,
      sender_id: online?.userId,
      sender_name: online?.displayName ?? resolveDisplayNameFromSocket(socket),
    };
    emitToAgent(sessionInfo.machineId, SocketEvents.CHAT_SEND, enriched);
  });
```
Where `resolveDisplayNameFromSocket` resolves from the JWT-loaded user on `socket.data` (username/email) via `resolveDisplayName` from `policy.ts`. Add the import: `import { canSend, resolveDisplayName } from '../session/policy';` and `import { onlineParticipants } from './store';`.

- [ ] **Step 2: Verify the permission-answer guard uses the same overlay**

In the same file, update the `CHAT_PERMISSION_ANSWER` handler's role check to use `onlineParticipants.get(socket.id)?.role` and `canApprove` (Task 5 refines the routing; here just ensure it reads from the overlay, not the Phase-1 `isViewer` flag). Keep it minimal — full routing is Task 5.

- [ ] **Step 3: tsc**

Run: `cd packages/server && npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/socket/client.socket.ts
git commit -m "feat(server): role-guard CHAT_SEND and inject sender meta (#7)"
```

---

### Task 5: Permission routing + first-approval-wins + resolved broadcast

**Files:**
- Modify: `packages/server/src/socket/agent.socket.ts` (request routing by mode)
- Modify: `packages/server/src/socket/client.socket.ts` (answer gating + resolved broadcast)
- Modify: `packages/server/src/socket/store.ts` (pendingPermissions instance per session)

**Interfaces:**
- Consumes: Task 2 `createPendingPermissions`, `canApprove`; `SessionInfo.approvalMode`.
- Produces: requests routed by mode; first answer forwarded; `CHAT_PERMISSION_RESOLVED` broadcast to other recipients.

- [ ] **Step 1: Add a pendingPermissions per session in store.ts**

In `store.ts` `SessionInfo`, add `pendingPermissions: ReturnType<typeof createPendingPermissions>`. Initialize it wherever `SessionInfo` is constructed: `pendingPermissions: createPendingPermissions()`. Import from `../session/pendingPermissions`.

- [ ] **Step 2: Route CHAT_PERMISSION_REQUEST by mode in agent.socket.ts**

The Phase-1 fix already iterates the room and excludes viewers. Extend it to also respect `approvalMode`: emit to a socket only if `canApprove(online.role, mode)`. In `packages/server/src/socket/agent.socket.ts`, the handler (post-Phase-1-fix) iterates `clientNs.adapter.rooms.get(...)`. Replace the per-socket condition:
```typescript
  socket.on(SocketEvents.CHAT_PERMISSION_REQUEST, (data: ChatPermissionRequestEvent) => {
    const io = getIoInstance();
    if (!io) return;
    const clientNs = io.of(SocketNamespaces.CLIENT);
    const room = clientNs.adapter.rooms.get(`session:${data.session_id}`);
    if (!room) return;
    const sessionInfo = sessions.get(data.session_id);
    const mode: ApprovalMode = sessionInfo?.approvalMode ?? 'owner';
    for (const sid of room) {
      const s = clientNs.sockets.get(sid);
      const online = onlineParticipants.get(sid);
      const role: Role = online?.role ?? 'viewer';
      if (canApprove(role, mode)) {
        s?.emit(SocketEvents.CHAT_PERMISSION_REQUEST, data);
      }
    }
  });
```
Imports: `canApprove` from `../session/policy`, `ApprovalMode, Role` from `cc-remote-shared`, `onlineParticipants` from `./store`.

- [ ] **Step 3: First-approval-wins + resolved broadcast in client.socket.ts**

In the `CHAT_PERMISSION_ANSWER` handler:
```typescript
  socket.on(SocketEvents.CHAT_PERMISSION_ANSWER, (data: ChatPermissionAnswerEvent) => {
    const online = onlineParticipants.get(socket.id);
    const role: Role = online?.role ?? 'viewer';
    const sessionInfo = sessions.get(data.session_id);
    const mode: ApprovalMode = sessionInfo?.approvalMode ?? 'owner';
    if (!canApprove(role, mode)) return;

    if (!sessionInfo?.pendingPermissions.tryResolve(data.requestId)) return; // someone else won

    // forward the winning answer to the agent
    emitToAgent(sessionInfo.machineId, SocketEvents.CHAT_PERMISSION_ANSWER, data);

    // tell everyone else who received the request to clear their banner
    const io = getIoInstance();
    if (io) {
      io.of(SocketNamespaces.CLIENT)
        .to(`session:${data.session_id}`)
        .except(socket.id)
        .emit(SocketEvents.CHAT_PERMISSION_RESOLVED, { request_id: data.requestId, approved: data.approved });
    }
  });
```

- [ ] **Step 4: Clear pending on session end**

In `agent.socket.ts` `SESSION_END` handler, after `sessions.delete(...)`, the pendingPermissions map is GC'd with the sessionInfo — no extra cleanup needed. Confirm by inspection.

- [ ] **Step 5: tsc**

Run: `cd packages/server && npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/socket/store.ts packages/server/src/socket/agent.socket.ts packages/server/src/socket/client.socket.ts
git commit -m "feat(server): mode-based permission routing with first-approval-wins (#7)"
```

---

### Task 6: Owner management handlers (invites, participants, approval mode)

**Files:**
- Modify: `packages/server/src/socket/client.socket.ts`

**Interfaces:**
- Consumes: Task 1 models/events; `onlineParticipants` overlay.
- Produces: `INVITE_CREATE`/`INVITE_CREATED`, `INVITE_REVOKE`, `PARTICIPANTS_LIST`/`PARTICIPANTS`, `PARTICIPANT_REMOVED`, `APPROVAL_MODE_SET`/`APPROVAL_MODE_CHANGED`; Phase 1 in-memory `shareToken` retired in favor of DB invites.

- [ ] **Step 1: Reimplement SHARE_SESSION / STOP_SHARE on the DB invite**

In `client.socket.ts`, replace the Phase 1 `SHARE_SESSION` handler body: instead of generating an in-memory token, `prisma.sessionInvite.create({ data: { session_id, token: crypto.randomUUID(), role: 'viewer', created_by: socket.data.userId } })` and return its token. `STOP_SHARE`: `prisma.sessionInvite.deleteMany({ where: { session_id, role: 'viewer' } })` and kick online viewer sockets (iterate `onlineParticipants`, disconnect those with `role==='viewer'`). Remove the now-unused in-memory `shareToken`/`viewers` fields from `SessionInfo` (and their reads). Confirm nothing else references them via grep.

- [ ] **Step 2: Add INVITE_CREATE / INVITE_REVOKE**

```typescript
  socket.on(SocketEvents.INVITE_CREATE, async (data: InviteCreateEvent) => {
    if (onlineParticipants.get(socket.id)?.role !== 'owner') return;
    const token = crypto.randomUUID();
    const invite = await prisma.sessionInvite.create({
      data: { session_id: data.session_id, token, role: data.role, created_by: socket.data.userId,
              expires_at: data.expiresAt ? new Date(data.expiresAt) : null,
              max_uses: data.maxUses ?? null },
    });
    socket.emit(SocketEvents.INVITE_CREATED, {
      session_id: data.session_id, token: invite.token, role: invite.role,
      link: `${process.env.PUBLIC_URL ?? ''}/shared/${invite.token}`,
    });
  });

  socket.on(SocketEvents.INVITE_REVOKE, async (data: { session_id: string; token: string }) => {
    if (onlineParticipants.get(socket.id)?.role !== 'owner') return;
    await prisma.sessionInvite.delete({ where: { token: data.token } }).catch(() => {});
  });
```

- [ ] **Step 3: Add PARTICIPANTS_LIST / PARTICIPANT_REMOVED**

```typescript
  socket.on(SocketEvents.PARTICIPANTS_LIST, async (data: ParticipantsListEvent) => {
    if (onlineParticipants.get(socket.id)?.role !== 'owner') return;
    const rows = await prisma.sessionParticipant.findMany({ where: { session_id: data.session_id }, include: { user: true } });
    const participants: ParticipantInfo[] = rows.map((r) => ({
      userId: r.user_id, displayName: resolveDisplayName({ username: r.user.username, email: r.user.email }),
      role: r.role as Role, online: [...onlineParticipants.values()].some((o) => o.userId === r.user_id && o.role === r.role),
    }));
    const viewerCount = [...onlineParticipants.values()].filter((o) => o.role === 'viewer').length;
    socket.emit(SocketEvents.PARTICIPANTS, { session_id: data.session_id, participants, viewerCount });
  });

  socket.on(SocketEvents.PARTICIPANT_REMOVED, async (data: { session_id: string; userId: string }) => {
    if (onlineParticipants.get(socket.id)?.role !== 'owner') return;
    await prisma.sessionParticipant.deleteMany({ where: { session_id: data.session_id, user_id: data.userId } });
    // kick the removed collaborator's socket(s)
    const io = getIoInstance();
    if (io) for (const [sid, o] of onlineParticipants) {
      if (o.userId === data.userId) io.of(SocketNamespaces.CLIENT).sockets.get(sid)?.disconnect(true);
    }
    io?.of(SocketNamespaces.CLIENT).to(`session:${data.session_id}`).emit(SocketEvents.PARTICIPANT_REMOVED, { userId: data.userId });
  });
```

- [ ] **Step 4: Add APPROVAL_MODE_SET**

```typescript
  socket.on(SocketEvents.APPROVAL_MODE_SET, async (data: ApprovalModeSetEvent) => {
    if (onlineParticipants.get(socket.id)?.role !== 'owner') return;
    await prisma.sessionLog.update({ where: { id: data.session_id }, data: { approval_mode: data.mode } }).catch(() => {});
    const sessionInfo = sessions.get(data.session_id);
    if (sessionInfo) sessionInfo.approvalMode = data.mode;
    getIoInstance()?.of(SocketNamespaces.CLIENT).to(`session:${data.session_id}`).emit(SocketEvents.APPROVAL_MODE_CHANGED, data);
  });
```

- [ ] **Step 5: tsc**

Run: `cd packages/server && npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/socket/client.socket.ts packages/server/src/socket/store.ts
git commit -m "feat(server): owner invite/participant/approval-mode management (#7)"
```

---

### Task 7: Agent sendMessage sender meta

**Files:**
- Modify: `packages/agent/src/sdk-session.ts`
- Modify: `packages/agent/src/client.ts`

**Interfaces:**
- Consumes: `CHAT_SEND` payload now carries `sender_id`/`sender_name` (Task 4).
- Produces: `sendMessage(content, attachments?, sender?)`; echoed `type:'user'` chat-message carries `sender_id`/`sender_name`.

**Note:** Verified by inspection + a unit test on the sender-attachment seam. The agent package has jest.

- [ ] **Step 1: Extend sendMessage signature in sdk-session.ts**

At `packages/agent/src/sdk-session.ts:503`, change:
```typescript
  sendMessage(content: string, attachments?: DownloadedAttachment[]): void {
```
to:
```typescript
  sendMessage(content: string, attachments?: DownloadedAttachment[], sender?: { id: string; name: string }): void {
```
Store `this.pendingSender = sender ?? null;` at the top of the method body (add a `private pendingSender: { id: string; name: string } | null = null;` field). Where the method constructs the `type: 'user'` SDK message to push into the queue (lines ~528, ~536), attach the sender to the emitted chat-message event. Concretely, after the existing `this.emit('chat-message', ...)` for the user echo, ensure the event object includes `sender_id: this.pendingSender?.id, sender_name: this.pendingSender?.name`, then `this.pendingSender = null;`.

Read the two emit sites (~528, ~536) and add the sender fields to the emitted event object. (The exact shape depends on the current code — preserve existing fields, add the two sender fields conditionally.)

- [ ] **Step 2: Forward sender from CHAT_SEND in client.ts**

In `packages/agent/src/client.ts` `handleChatSend`, pass the sender meta:
```typescript
    session.sendMessage(
      data.content,
      downloadedAttachments,
      data.sender_id && data.sender_name ? { id: data.sender_id, name: data.sender_name } : undefined,
    );
```

- [ ] **Step 3: Extend ChatMessageEvent usage on the agent**

Where the agent emits `CHAT_MESSAGE` (`client.ts` chat-message handler), the sender fields already ride on the event object from Step 1, so they pass through to the server unchanged. Confirm by inspection — no code change needed if the event is spread/passed wholesale.

- [ ] **Step 4: tsc + test**

Run: `cd packages/agent && npx tsc --noEmit` → clean.
Run: `cd packages/agent && npx jest tests/unit/errors.test.ts` → 17/17 (regression sanity).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/sdk-session.ts packages/agent/src/client.ts
git commit -m "feat(agent): carry sender meta through sendMessage to user-message echo (#7)"
```

---

### Task 8: Web — socket wiring, store, ChatMessage attribution

**Files:**
- Modify: `packages/web/src/lib/socket.ts`
- Modify: `packages/web/src/stores/sessionStore.ts`
- Modify: `packages/web/src/components/chat/ChatMessage.tsx`

**Interfaces:**
- Consumes: Tasks 1, 6 events; Task 7 attribution on messages.
- Verification: `cd packages/web && npx tsc --noEmit` (no web test runner) + manual.

- [ ] **Step 1: Collaborator connect + new event listeners in socket.ts**

In `packages/web/src/lib/socket.ts`, add a `connectAsCollaborator(token)` mirroring `connectAsViewer` but it requires the normal JWT auth path (the existing `connect()` carries the JWT) plus the invite token in the auth payload. Emit `JOIN_SHARED_SESSION { shareToken: token }` after connect. Add listener registrations for `INVITE_CREATED`, `PARTICIPANTS`, `PARTICIPANT_REMOVED`, `APPROVAL_MODE_CHANGED`, `CHAT_PERMISSION_RESOLVED` that `notifyListeners` to the store.

- [ ] **Step 2: Store state in sessionStore.ts**

Add to the store: `collaboratorInviteToken`, `participants: ParticipantInfo[]`, `viewerCount`, `approvalMode`, and actions `setApprovalMode`, `removeParticipant`, `resolvePermission(requestId)`. Wire the socket listeners from Step 1 to update these.

- [ ] **Step 3: Render sender attribution in ChatMessage.tsx**

In `packages/web/src/components/chat/ChatMessage.tsx`, when `message.type === 'user'` and `message.sender_name` is set, render a small avatar/label (e.g. first letter + name) above or beside the bubble. Distinguish the owner vs collaborator visually only if `sender_id` is available — otherwise keep it minimal. Keep assistant bubbles unchanged.

- [ ] **Step 4: tsc**

Run: `cd packages/web && npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/socket.ts packages/web/src/stores/sessionStore.ts packages/web/src/components/chat/ChatMessage.tsx
git commit -m "feat(web): collaborator connect, participants/approval state, sender attribution (#7)"
```

---

### Task 9: Web — collaborator SharedSessionPage variant + owner ParticipantsPanel

**Files:**
- Modify: `packages/web/src/pages/SharedSessionPage.tsx`
- Create: `packages/web/src/components/chat/ParticipantsPanel.tsx`
- Modify: `packages/web/src/components/chat/ChatHeader.tsx` (open the panel)
- Modify: `packages/web/src/i18n/en.ts`, `packages/web/src/i18n/zh-CN.ts`

**Interfaces:**
- Consumes: Task 8 store + socket wiring.
- Verification: `cd packages/web && npx tsc --noEmit` + manual E2E.

- [ ] **Step 1: Collaborator composer + permission banner in SharedSessionPage**

In `packages/web/src/pages/SharedSessionPage.tsx`, when the joined role is `collaborator`, render the `ChatComposer` (send box) and a `PermissionBanner`/`AskUserQuestionPanel` that listens for `CHAT_PERMISSION_REQUEST` and emits `CHAT_PERMISSION_ANSWER`. When role is `viewer`, keep the read-only Phase 1 view (no composer). The role comes from the join handshake — extend the join response to include `role`.

- [ ] **Step 2: ParticipantsPanel for the owner**

Create `packages/web/src/components/chat/ParticipantsPanel.tsx`: shows the roster (owner + collaborators, online state, viewer count), buttons to generate viewer/collaborator invite links (copy to clipboard), remove a collaborator, switch approval mode (owner/any toggle), stop share. Emits `INVITE_CREATE`, `PARTICIPANT_REMOVED`, `APPROVAL_MODE_SET`, `INVITE_REVOKE`. In `ChatHeader.tsx`, add a "Participants" button that opens this panel (owner-only).

- [ ] **Step 3: i18n strings**

Add the new UI strings (invite labels, role names, approval-mode toggle, "removed from session", etc.) to both `en.ts` and `zh-CN.ts`.

- [ ] **Step 4: tsc + manual E2E**

Run: `cd packages/web && npx tsc --noEmit` → clean.
Manual: two browsers (owner + collaborator login via collaborator link) + one incognito (viewer). Verify: collaborator sends (attribution shows), owner-only mode → only owner sees permission banner; switch to `any` → collaborator can approve and owner's banner clears (`CHAT_PERMISSION_RESOLVED`); owner removes collaborator → kicked; stop share → viewer disconnected; restart server → roles/invites survive.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/SharedSessionPage.tsx packages/web/src/components/chat/ParticipantsPanel.tsx packages/web/src/components/chat/ChatHeader.tsx packages/web/src/i18n/en.ts packages/web/src/i18n/zh-CN.ts
git commit -m "feat(web): collaborator session page + owner participants panel (#7)"
```

---

## Self-Review

**1. Spec coverage:**
- Roles (owner/collaborator/viewer) → Tasks 1 (types), 2 (`canSend`/`canApprove`), 3 (join grants role), 8-9 (UI). ✓
- DB-backed role-tagged invites + Phase 1 token retirement → Tasks 1 (models), 3 (join), 6 (invite CRUD + retire `shareToken`). ✓
- Collaborator send → Task 4 (guard + injection), 7 (agent), 9 (composer). ✓
- Sender attribution (display-only) → Tasks 4 (server injects), 7 (agent carries), 8 (ChatMessage renders). ✓
- Two-mode approval + first-approval-wins + resolved broadcast → Tasks 2 (helpers), 5 (routing + resolved). ✓
- Owner management (invites, roster, remove, mode) → Task 6, 9 (UI). ✓
- Edge cases (restart recovery, expired/exhausted invite, single-use race, removed-while-online, owner-row upsert) → Tasks 2 (`validateInvite`), 3 (atomic redeem, upsert owner), 6 (kick on remove). ✓
- `CHAT_PERMISSION_RESOLVED` → Task 5. ✓

**2. Placeholder scan:** No TBD/TODO/"add error handling". Every code step shows the code. The two "read the current code first" instructions (Task 3 Step 7, Task 7 Step 1) point at specific known locations with the new code shown — acceptable since the surrounding code is established Phase 1. ✓

**3. Type consistency:**
- `Role` (`'owner'|'collaborator'|'viewer'`) defined Task 1, used Tasks 2/3/5/8. ✓
- `ApprovalMode` (`'owner'|'any'`) defined Task 1, used Tasks 2/5/6. ✓
- `canSend`/`canApprove`/`resolveDisplayName`/`validateInvite` (Task 2) signatures match usage in Tasks 4/5/6. ✓
- `decideJoin` (Task 3) returns `{ role, requiresParticipantRow } | null`, used in Task 3 Step 7. ✓
- `createPendingPermissions().tryResolve` (Task 2) used in Task 5. ✓
- Event names (`INVITE_CREATE` etc.) defined Task 1, emitted/listened Tasks 6/8/9. ✓

**Scope note:** This is a large plan (9 tasks across 4 layers). It is one feature, not independent sub-systems, so a single plan is appropriate. If execution reveals a task is too large for one subagent pass, split at reviewer discretion — the natural seams are Task 6 (split invite-CRUD from participant/mode) and Task 9 (split collaborator page from owner panel).
