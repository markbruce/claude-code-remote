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
- Zero changes to existing server code

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

## User Binding & Authentication

### Binding Flow

1. User sends `/start` to Bot on Telegram
2. Bot generates a one-time bind token and returns a deep link to the web app: `https://<server>/bind-telegram?token=<token>`
3. User logs into the web app (if not already), then visits the bind URL
4. Web app calls `POST /api/auth/bind-telegram` with the token
5. Server creates a `BotBinding` record linking the Telegram user to the system user
6. Bot receives confirmation via polling/callback and notifies the user

### Authentication Model

Each bound user gets their own Socket.IO connection to the server's `/client` namespace:

- On bind, the bot service obtains a JWT for that user (via server API)
- Bot maintains a `Map<telegramUserId, Socket>` of active connections
- When a Telegram user sends a message, the bot uses that user's personal Socket.IO connection
- Server-side auth and permission checks work identically to web client connections

### Data Model (Prisma addition to server)

```prisma
model BotBinding {
  id               String   @id @default(cuid())
  user_id          String
  platform         String   // "telegram" | "feishu"
  platform_user_id String   // Telegram user ID or Feishu open_id
  chat_id          String   // Chat/dialog ID for sending messages
  created_at       DateTime @default(now())

  user User @relation(fields: [user_id], references: [id])

  @@unique([platform, platform_user_id])
}
```

**Note**: This schema change goes in `packages/server/prisma/schema.prisma`. The bot service itself uses its own SQLite for session mapping.

## Session Management

### User State Machine

```
unbound → bound → machine_selected → in_session
                     ↑                    │
                     └── session_end ─────┘
```

### Commands

| Command | State Required | Description |
|---------|---------------|-------------|
| `/start` | any | Welcome message + bind guide if unbound |
| `/machines` | bound | List online machines for the bound user |
| `/use <name>` | bound | Select target machine by name |
| `/projects` | machine_selected | List projects on selected machine |
| `/chat <message>` | machine_selected | Start or continue a chat session in current project |
| `/new` | in_session | Start a new session (don't resume previous) |
| `/history` | machine_selected | List historical sessions |
| `/cancel` | any | Cancel current operation |

### Session Persistence

The bot service maintains its own SQLite database:

```sql
CREATE TABLE user_sessions (
  telegram_user_id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  machine_name TEXT NOT NULL,
  project_path TEXT NOT NULL,
  session_id TEXT,
  socket_id TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

On bot restart, the service reads this table and attempts to re-establish Socket.IO connections for active sessions.

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

- Uses Telegram Inline Keyboard with callback data encoding `sessionId + requestId`
- User taps a button → Bot sends `CHAT_PERMISSION_ANSWER` event to agent
- Optional: auto-approve whitelist configurable per user

### Feishu (future)

Uses Feishu message card interactive components (buttons with callback action).

## Message Formatting

### ChatMessageEvent → Telegram

| Event Type | Format |
|-----------|--------|
| `text` | Markdown-formatted text message |
| `text_delta` | Edit the same message in-place (streaming) |
| `tool_use` | Labeled code block with tool name |
| `tool_result` | Collapsible code block; truncate if > 3000 chars with summary |
| `error` | Warning-prefixed error message |
| `complete` | Session-ended notice |

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
| Bot restart | Reconnect all bound users, restore sessions from SQLite |

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

The bot service needs two new server endpoints:

### `POST /api/auth/bind-telegram`

Binds a Telegram user to a system user.

```typescript
// Request
{
  token: string;  // one-time bind token
  telegram_user_id: string;
  chat_id: string;
}

// Response
{
  success: true;
  jwt: string;  // JWT for Socket.IO connection
  user: User;
}
```

### `POST /api/auth/feishu-bind` (future)

Same pattern for Feishu.

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
