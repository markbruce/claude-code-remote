# Telegram & Feishu Bot Integration Design

**Date**: 2026-04-09
**Status**: Draft
**Scope**: Telegram-first, architecture extensible to Feishu

## Context

Claude Code Remote is a web-based remote access tool for Claude Code sessions. Users currently access it only through a browser. This design adds a bot adapter layer so users can start and continue Claude Code Chat sessions directly from Telegram (and later Feishu), without opening a browser.

The server uses Socket.IO with two namespaces (`/agent` for remote machines, `/client` for web users). All client-server communication is event-driven with pure JSON payloads. This architecture makes it straightforward to add new client types without modifying the server.

## Requirements

- Multi-user: each Telegram user binds to a separate system user account
- Telegram first; Feishu follows later via the same adapter interface
- Chat mode only (no Shell/terminal emulation)
- Interactive permission approval for tool calls
- Session persistence across bot restarts
- Minimal server-side changes (Prisma migration + 2 new API routes)

## Architecture

```
┌─────────────────┐         ┌──────────────────────────────┐
│  Telegram API    │  HTTP   │  packages/bot                │
│  (Webhook/Poll)  │◄───────►│                              │
└─────────────────┘         │  adapters/telegram.ts         │
                            │    ↕                          │
┌─────────────────┐         │  core/                        │
│  Feishu API     │  HTTP   │    socket-client.ts           │
│  (Event Sub)    │◄───────►│    session-store.ts           │
└─────────────────┘         │    user-binding.ts            │
                            │  adapters/feishu.ts           │
                            └──────────┬───────────────────┘
                                       │ Socket.IO Client
                                       ▼
                              Server /client namespace
                                       │
                                       ▼
                              Server /agent namespace
                                       │
                                       ▼
                                 Agent (Claude API)
```

### Module Breakdown

| Module | File | Responsibility |
|--------|------|---------------|
| Socket.IO Client | `core/socket-client.ts` | Connects to server `/client` namespace per bound user, handles all Socket.IO events |
| Telegram Adapter | `adapters/telegram.ts` | Telegram Bot API interaction: receive messages, send formatted responses, Inline Keyboards |
| Feishu Adapter | `adapters/feishu.ts` | Feishu Bot API interaction (future) |
| Session Store | `core/session-store.ts` | `chat_id → {session_id, machine_id}` mapping, persisted to SQLite |
| User Binding | `core/user-binding.ts` | Telegram user ID → system User binding management |
| Message Formatter | `core/formatter.ts` | Converts `ChatMessageEvent` types to platform-specific message formats |

## Server-Side Changes

This feature requires minimal additions to the existing server:

1. **Prisma migration**: Add `BotBinding` model to `packages/server/prisma/schema.prisma`
2. **New route**: Add `POST /api/auth/bind-telegram` to `packages/server/src/routes/auth.routes.ts`
3. **New route**: Add `POST /api/auth/bot-token` for JWT refresh

No changes to Socket.IO handlers, session logic, or existing routes.

## User Binding & Authentication

### Binding Flow

1. User sends `/start` to Bot on Telegram
2. Bot generates a one-time bind token (cryptographically random, 32 bytes hex), stores it in memory with a 10-minute TTL
3. Bot returns a deep link to the web app: `https://<server>/bind-telegram?token=<token>&platform_user_id=<tg_uid>&chat_id=<chat_id>`
4. User logs into the web app (if not already), then visits the bind URL
5. Web app calls `POST /api/auth/bind-telegram` with the token, platform_user_id, and chat_id
6. Server validates the token (by calling back to bot service's `GET /api/bind/verify?token=xxx` endpoint) and creates a `BotBinding` record
7. Server returns a JWT to the web app, which forwards it to the bot via `POST /api/bind/confirm` (the bot exposes a lightweight HTTP endpoint)
8. Bot stores the JWT, connects Socket.IO for this user, and notifies the user on Telegram

Rate limit: `/start` is limited to 5 requests per Telegram user per hour.

### Authentication Model

Each bound user gets their own Socket.IO connection to the server's `/client` namespace:

- On bind, the bot receives a JWT and stores it in its SQLite database
- Bot maintains a `Map<telegramUserId, Socket>` of active connections
- When a Telegram user sends a message, the bot uses that user's personal Socket.IO connection
- Server-side auth and permission checks work identically to web client connections

### JWT Refresh

JWTs expire (default 7 days). The bot handles expiry:

- Bot tracks JWT expiry time for each bound user
- 1 hour before expiry, bot calls `POST /api/auth/bot-token` with the current JWT to get a fresh one
- If the JWT has already expired, the bot calls `POST /api/auth/bot-token` with a stored refresh secret (issued at bind time) to obtain a new JWT
- If refresh fails (user deleted, etc.), bot notifies the user and asks them to re-bind

### Data Model (Prisma addition to server)

```prisma
model BotBinding {
  id               String   @id @default(uuid())
  user_id          String
  platform         String   // "telegram" | "feishu"
  platform_user_id String   // Telegram user ID or Feishu open_id
  chat_id          String   // Chat/dialog ID for sending messages
  refresh_secret   String   // For JWT refresh when token expires
  created_at       DateTime @default(now())

  user User @relation(fields: [user_id], references: [id])

  @@unique([platform, platform_user_id])
  @@index([user_id])
}
```

## Session Management

### User State Machine

```
unbound → bound → machine_selected → project_selected → in_session
                     ↑                                      │
                     └──────────── session_end ─────────────┘
```

### Commands

| Command | State Required | Description |
|---------|---------------|-------------|
| `/start` | any | Welcome message + bind guide if unbound |
| `/machines` | bound | List online machines for the bound user |
| `/use <name>` | bound | Select target machine by name |
| `/projects` | machine_selected | List projects on selected machine |
| `/cd <path>` | machine_selected | Select project path (e.g., `/cd /home/user/myproject`) |
| `/chat <message>` | project_selected | Start or continue a chat session in current project |
| `/new` | in_session | Start a new session (don't resume previous) |
| `/history` | project_selected | List historical sessions |
| `/cancel` | any | Cancel current operation |

### Session Persistence

The bot service maintains its own SQLite database:

```sql
CREATE TABLE user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  project_path TEXT NOT NULL,
  session_id TEXT,
  jwt TEXT NOT NULL,
  jwt_expires_at DATETIME NOT NULL,
  refresh_secret TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'project_selected',  -- state machine state
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_sessions_telegram ON user_sessions(telegram_user_id);
```

**Known limitation**: One active session per Telegram user at a time. If a user switches machines or projects, the previous session mapping is updated. Users are notified when overwriting an active session.

### Bot Restart Recovery

1. Read all rows from `user_sessions` table
2. For each row, check if JWT is expired:
   - If valid: connect Socket.IO, emit `JOIN_SESSION` for the stored `session_id`
   - If expired: call `POST /api/auth/bot-token` with `refresh_secret` to obtain fresh JWT, then connect
3. After Socket.IO connects, emit `LIST_SESSIONS` to verify session still exists on agent
4. If session is gone, notify user and reset state to `project_selected`

## Permission Approval

When Claude requests tool execution permission, the bot sends an interactive message:

### Telegram

```
🔧 Claude requests tool execution:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tool: Bash
Command: npm install express
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[✅ Approve]  [❌ Deny]
```

- Uses Telegram Inline Keyboard with short lookup key as callback data (Telegram limits callback data to 64 bytes, so we store `requestId` in bot's memory map and use an incrementing counter as the callback key)
- User taps a button → Bot looks up the full `requestId` from its memory map → sends `CHAT_PERMISSION_ANSWER` event to agent
- Optional: auto-approve whitelist configurable per user

### Feishu (future)

Uses Feishu message card interactive components (buttons with callback action).

## Socket.IO Event Mapping

The bot listens for these specific events on each user's Socket.IO connection:

| Socket Event (from `SocketEvents`) | Direction | Bot Action |
|-------------------------------------|-----------|-----------|
| `client:connected` | Server → Bot | Mark user as connected |
| `machines:list` | Server → Bot | Format machine list for Telegram |
| `session-started` | Server → Bot | Store session_id, switch to `in_session` state |
| `chat:message` | Server → Bot | Send as Markdown text message to Telegram |
| `chat:tool-use` | Server → Bot | Format as labeled code block |
| `chat:tool-result` | Server → Bot | Format as code block (truncate if long) |
| `chat:permission-request` | Server → Bot | Send inline keyboard with approve/deny buttons |
| `chat:complete` | Server → Bot | Send session-ended notice |
| `chat:error` | Server → Bot | Send warning message |
| `session-end` | Server → Bot | Reset state to `project_selected`, notify user |
| `projects:list` | Server → Bot | Format project list for Telegram |
| `sessions:list` | Server → Bot | Format history sessions list |
| `error` | Server → Bot | Send error message to Telegram |

## Message Formatting

### Socket Events → Telegram

| Socket Event | Format |
|-------------|--------|
| `chat:message` (text) | Markdown-formatted text message |
| `chat:message` (text_delta) | Edit same message in-place, throttled to max 20 edits/min to respect Telegram rate limits |
| `chat:tool-use` | Labeled code block with tool name |
| `chat:tool-result` | Code block; truncate if > 3000 chars with summary |
| `chat:error` | Warning-prefixed error message |
| `chat:complete` | Session-ended notice |

### Long Text Handling

- Telegram limit: 4096 characters per message
- Split at paragraph or newline boundaries
- Streaming: edit the message in-place up to the limit, then send continuation as new message

## Error Handling

| Scenario | Handling |
|----------|---------|
| Agent goes offline mid-session | Bot notifies user, offers to switch machines or wait |
| Socket.IO disconnect | Auto-reconnect with exponential backoff; notify user after 3 failures |
| Server unreachable | Poll health endpoint; cache last known state |
| Permission timeout (no user response) | Auto-deny after configurable timeout (default 5 min) |
| Bot restart | Read `user_sessions` from SQLite → refresh JWTs if needed → reconnect Socket.IO → verify session liveness via `LIST_SESSIONS` → notify user of reconnection or reset state |

## Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Telegram SDK | `grammy` | Modern, TypeScript-first, well-maintained |
| Socket.IO Client | `socket.io-client` | Matches server version, proven compatibility |
| Bot DB | `better-sqlite3` | Zero-config, file-based, fast for single-writer |
| Runtime | Node.js + TypeScript | Consistent with existing monorepo |
| Build | tsup | Fast, simple, already used in monorepo |

## Package Structure

```
packages/bot/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point, starts bot service
│   ├── adapters/
│   │   ├── telegram.ts       # Telegram Bot adapter
│   │   └── feishu.ts         # Feishu Bot adapter (stub)
│   ├── core/
│   │   ├── socket-client.ts  # Per-user Socket.IO connections
│   │   ├── session-store.ts  # SQLite session mapping
│   │   ├── user-binding.ts   # User binding management
│   │   └── formatter.ts      # Message formatting
│   └── config.ts             # Environment config
└── data/                     # SQLite database files (gitignored)
```

## API Additions (Server Side)

The bot service requires three new server endpoints:

### `POST /api/auth/bind-telegram`

Binds a Telegram user to a system user. Called by the web frontend after the user clicks the bind link.

```typescript
// Request
{
  token: string;              // one-time bind token from bot
  platform_user_id: string;   // Telegram user ID
  chat_id: string;            // Telegram chat ID
}

// Response
{
  success: true;
  jwt: string;              // JWT for Socket.IO connection
  refresh_secret: string;   // Long-lived secret for JWT refresh
  user: User;
}
```

### `POST /api/auth/bot-token`

Refreshes a JWT for a bot-bound user. Called by the bot service when JWT is about to expire or has expired.

```typescript
// Request (JWT still valid, just refreshing)
{
  jwt: string;  // current JWT
}

// Request (JWT expired, using refresh secret)
{
  platform: string;           // "telegram" | "feishu"
  platform_user_id: string;
  refresh_secret: string;
}

// Response
{
  success: true;
  jwt: string;  // fresh JWT
}
```

### `POST /api/auth/feishu-bind` (future)

Same pattern as `bind-telegram` for Feishu.

## Configuration (Environment Variables)

```env
# Bot Service
BOT_SERVER_URL=http://localhost:3000     # Claude Code Remote server URL
BOT_PORT=3001                            # Bot service port (for webhooks)

# Telegram
TELEGRAM_BOT_TOKEN=xxx

# Feishu (future)
FEISHU_APP_ID=xxx
FEISHU_APP_SECRET=xxx
```

## Out of Scope

- Shell/terminal mode (Chat only)
- File editing via bot (read-only access to session output)
- Multi-user group chats (1:1 only)
- Feishu implementation (architecture only)
- Voice/video messages
- Bot command localization (English first)
