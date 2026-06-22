# Session Sharing — Phase 2 Design (Collaborative Participation)

> Issue: markbruce/claude-code-remote#7 (Phase 2)
> Branch: to be created from `main` (e.g. `feat/7-session-sharing-phase2`)
> Prerequisite: Phase 1 (read-only sharing) is merged (PR #24).

## Goal

Turn session sharing from read-only into collaborative: invited users can **join as collaborators**, **send messages**, see **per-message sender attribution**, and the owner can configure a **permission-approval strategy**. Phase 3 items (voting/quorum, typing indicators, message quoting, recording) remain out of scope.

## Decisions (confirmed in brainstorming)

1. **Approval strategy**: two owner-configurable modes — `owner` (only owner approves) or `any` (any collaborator can approve). First-approval-wins. **No voting.**
2. **Onboarding**: role-tagged, **DB-backed** invite links. A viewer link is anonymous; a collaborator link requires login. This replaces Phase 1's in-memory `shareToken` with the new `SessionInvite` table (fixes Phase 1's "tokens vanish on server restart" limitation).
3. **Sender attribution**: **display-only**. The UI tags each user message with sender name/avatar. The model (Claude) is NOT given sender context (no content-prefixing) — the agent SDK's `sendMessage` has no sender parameter, and prefixing would contaminate transcripts.
4. **State architecture**: Approach B — `SessionParticipant` persisted in the DB (durable roster), with a thin in-memory overlay (`socketId → role`) resolved once at connect. The hot path never hits the DB.

## Architecture

```
Owner ──INVITE_CREATE(role)──▶ Server ──creates──▶ SessionInvite (DB)
                                  │
                                  ▼ returns token → /shared/:token link

Viewer ──JOIN_SHARED {token}──▶ Server validates invite (role=viewer)
                                  → joins room, socket.data.role='viewer' (anonymous)

Collaborator ──JOIN_SHARED {token} + JWT──▶ Server validates invite (role=collaborator) + auth
                                  → atomic used_count++, upsert SessionParticipant(role=collaborator)
                                  → socket.data.role='collaborator', userId, displayName

Owner (session start) ─▶ upsert SessionParticipant(role='owner')
```

Role is resolved once at socket-connect time and cached on `socket.data`. All mutating events (`CHAT_SEND`, `CHAT_PERMISSION_ANSWER`, `CHAT_ABORT`) authorize against `socket.data.role`. The DB is the source of truth for *who may collaborate*; memory is the *who's connected now* cache.

## Data Model (Prisma, SQLite)

Two new models, one new column, plus back-relations.

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
  token       String    @unique @default(uuid())   // crypto UUID in the URL
  role        String                              // "collaborator" | "viewer"
  created_by  String    @map("created_by")         // user_id (audit; no FK to keep it lean)
  expires_at  DateTime? @map("expires_at")         // null = no expiry
  max_uses    Int?      @map("max_uses")           // null = unlimited; 1 = single-use
  used_count  Int       @default(0) @map("used_count")
  created_at  DateTime  @default(now()) @map("created_at")

  session     SessionLog @relation(fields: [session_id], references: [id], onDelete: Cascade)

  @@index([session_id])
  @@map("session_invites")
}
```

Back-relations:
- `SessionLog`: add `participants SessionParticipant[]`, `invites SessionInvite[]`, and `approval_mode String @default("owner") @map("approval_mode")` (`"owner" | "any"`).
- `User`: add `sessionParticipants SessionParticipant[]`.

### Modeling notes

- **Owner is a `SessionParticipant` row** (`role="owner"`, `invited_by=null`), upserted at session start — uniform roster query. `machine.user_id` remains the immutable ownership source of truth.
- **Viewers are anonymous** — no `SessionParticipant` row (no `user_id`). Validated by invite token only.
- **`approval_mode` on `SessionLog`** is persisted; cached in the in-memory `sessions` map at start; owner can switch it live (updates both).
- **`@@unique([session_id, user_id])`** ⇒ always **upsert**, never blind-create (resume + rejoin would otherwise hit P2002).
- **Atomic single-use redemption** ⇒ `updateMany({ where: { id, used_count: { lt: max_uses } }, data: { used_count: { increment: 1 } } })` and check `count === 1`; if 0, the invite was exhausted concurrently.

## Components & Files

| Layer | File | Change |
|-------|------|--------|
| shared | `src/constants.ts` | New events (below); `APPROVAL_MODE` values |
| shared | `src/types.ts` | `ChatMessageEvent` += `sender_id?`, `sender_name?`; invite/participant event types; `ApprovalMode` |
| server | `prisma/schema.prisma` | Two models + `approval_mode` + back-relations; new migration |
| server | `src/socket/store.ts` | `SessionInfo` += `approvalMode`; online overlay `Map<socketId, {role, userId, displayName}>` |
| server | `src/socket/client.socket.ts` | Invite/participant handlers; join flow (viewer vs collaborator); role injection on `CHAT_SEND`; permission routing by mode; first-approval-wins; participants list/remove; approval-mode set |
| server | `src/socket/agent.socket.ts` | `CHAT_MESSAGE` already broadcasts; ensure sender fields pass through; `CHAT_PERMISSION_REQUEST` routed by mode (extends the Phase-1 visitor-exclusion fix) |
| agent | `src/sdk-session.ts` | `sendMessage(content, attachments?, sender?)` carries sender meta; attach to echoed `type:'user'` chat-message |
| agent | `src/client.ts` | `handleChatSend` passes sender meta from the `CHAT_SEND` payload to `sendMessage` |
| web | `src/lib/socket.ts` | Collaborator connect (JWT + token); emit/listen for new events |
| web | `src/stores/sessionStore.ts` | Invite state, participants list, approval mode |
| web | `src/pages/SharedSessionPage.tsx` | Collaborator variant: show composer + (read-only) permission banner when role allows; render sender attribution |
| web | `src/components/chat/ChatMessage.tsx` | Sender name/avatar on `type:'user'` messages |
| web | `src/components/chat/ChatHeader.tsx` / new `ParticipantsPanel.tsx` | Owner UI: generate viewer/collaborator invite links, list/remove collaborators, switch approval mode, stop share |

## Socket Events

**New:**
- `INVITE_CREATE` (owner→server, `{ role, maxUses?, expiresAt? }`) → `INVITE_CREATED` (server→owner, `{ token, role, link }`)
- `INVITE_REVOKE` (owner→server, `{ token }`)
- `PARTICIPANTS_LIST` (owner→server) → `PARTICIPANTS` (server→owner, roster incl. owner + collaborators + online viewer count)
- `PARTICIPANT_REMOVE` (owner→server, `{ userId }`) → kicks that collaborator's socket(s), deletes their `SessionParticipant` row
- `APPROVAL_MODE_SET` (owner→server, `{ mode }`) → `APPROVAL_MODE_CHANGED` (server→room)
- `CHAT_PERMISSION_RESOLVED` (server→recipients of the request, `{ request_id, approved }`) — clears the permission banner on the clients that received the request but didn't answer first (needed so the owner's banner clears when a collaborator approves in `"any"` mode, and vice-versa)

**Modified:**
- `CHAT_SEND`: server injects `sender_id` + `sender_name` (from `socket.data`) before forwarding to the agent. Role guard: `owner`/`collaborator` only.
- `CHAT_MESSAGE`: may carry `sender_id` / `sender_name` on `type:'user'` messages.
- `CHAT_PERMISSION_REQUEST`: routed by `approval_mode` — `owner` sockets only, or `owner`+`collaborator` sockets. (Viewers already excluded by the Phase-1 fix.)
- `CHAT_PERMISSION_ANSWER`: role-gated (owner always; collaborator only in `any` mode); first-answer-wins per `request_id`.
- `JOIN_SHARED_SESSION`: validates against `SessionInvite` (DB); for `role=collaborator`, requires JWT and upserts `SessionParticipant`.

## Data Flow — Permission Approval (first-approval-wins)

```
Agent ─CHAT_PERMISSION_REQUEST {request_id}─▶ Server
Server looks up session.approvalMode:
  "owner" → emit to owner sockets
  "any"   → emit to owner + collaborator sockets
Server tracks pendingRequests[request_id] = { resolved: false }

Owner/Collaborator ─CHAT_PERMISSION_ANSWER {request_id, approved}─▶ Server
  if pendingRequests[request_id].resolved → ignore
  else if answerer role permitted → forward to agent, mark resolved=true,
       and broadcast CHAT_PERMISSION_RESOLVED {request_id, approved} to all
       other recipients so their banner clears
```

Pending requests live in memory; cleared on resolution or session end.

## Attribution — how sender info travels

```
Collaborator socket ─CHAT_SEND {content}─▶ Server
Server injects sender_id/sender_name (socket.data) ─▶ Agent
Agent.handleChatSend ─sendMessage(content, attachments, {sender_id, sender_name})─▶ SDK
SDK echoes type:'user' message ─▶ sdk-session attaches sender meta ─▶ chat-message event
Server broadcasts CHAT_MESSAGE {type:'user', sender_id, sender_name, content} ─▶ room
UI renders sender name/avatar on type:'user' messages
```

`sendMessage` signature change: `sendMessage(content: string, attachments?: DownloadedAttachment[], sender?: { id: string; name: string }): void`. Assistant messages carry no sender.

Display name resolution: `username || email-local-part || 'Collaborator'`.

## Phase 1 Migration

- `SHARE_SESSION` is reimplemented to create a `SessionInvite(role='viewer')` and return its token (replaces the in-memory `shareToken`). Anonymous viewer UX is unchanged from the user's perspective; tokens now survive server restart.
- `STOP_SHARE` deletes (or expires) the `SessionInvite`.
- The Phase-1 in-memory `shareToken`/`viewers` fields on `SessionInfo` are retired in favor of the DB invite + the online overlay. (`viewers` count derives from overlay sockets with `role='viewer'`.)
- The Phase-1 `CHAT_PERMISSION_REQUEST` visitor-exclusion fix is generalized into the mode-based routing above.

## Edge Cases & Error Handling

- **Server restart**: `SessionParticipant` / `SessionInvite` / `approval_mode` survive in DB. In-memory online overlay rebuilds as sockets reconnect; each reconnect re-resolves role from DB (owner/collaborator) or re-validates invite token (viewer).
- **Owner offline in `"owner"` mode**: a pending permission request cannot be approved and stays pending (the agent waits). **Documented limitation** — no auto-fallback to `"any"` in Phase 2.
- **Expired / exhausted invite**: join returns a clear error (`invite expired` / `invite no longer available`).
- **Concurrent single-use redemption**: race-safe via the conditional `updateMany` above; losers get `invite no longer available`.
- **Collaborator removed while online**: their socket(s) are disconnected (`s.disconnect(true)`) and the client shows a "removed from session" state.
- **Owner row on resume**: upsert (not create) so resuming a history session doesn't hit the unique constraint.

## Testing Strategy

- **Prisma layer**: `SessionParticipant` / `SessionInvite` CRUD, unique constraint, cascade on `SessionLog`/`User` delete, atomic `used_count` increment under concurrency.
- **Server handlers (unit)**: viewer `CHAT_SEND` rejected; collaborator accepted; `CHAT_PERMISSION_ANSWER` role-gating per mode; first-approval-wins (second answer ignored); `approval_mode` switch is live; invite validation (expired / exhausted / wrong role).
- **Join flow**: anonymous viewer (no JWT) succeeds; collaborator without JWT rejected; collaborator with JWT upserts participant; single-use race.
- **Attribution**: `CHAT_MESSAGE` of `type:'user'` carries the sender; assistant messages carry none.
- **Web**: collaborator `SharedSessionPage` variant renders composer + permission banner; sender attribution rendered; participants panel (owner) generates links, lists/removes collaborators, switches approval mode.
- **Manual E2E**: two browsers (owner + collaborator) + one incognito (viewer): collaborator sends, owner approves in both modes, viewer watches read-only, attribution correct, revoke/remove works, restart recovers.

## Out of Scope (Phase 3)

Voting/quorum approval, typing indicators, message quoting/reply, collaboration audit log, session recording/replay, anonymous→collaborator promotion (requires login flow anyway).

## Open Implementation Notes

- The exact `sendMessage` signature change must be coordinated across `sdk-session.ts` and `client.ts` `handleChatSend`; confirm the SDK's echoed `type:'user'` event is the right attachment point during planning (verified feasible here: lines 528/536 emit it).
- `PARTICIPANT_REMOVE` and `INVITE_REVOKE` should both disconnect affected sockets and broadcast an updated `PARTICIPANTS` / `SHARED_SESSION_VIEWERS` so all clients refresh.
