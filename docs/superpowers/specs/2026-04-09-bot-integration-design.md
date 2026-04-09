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
Telegram ──► Bot Adapter ──► Server ──► Agent ──► Claude Code
   ▲                        │
   └────────────────────────┘

(未来)  飞书 ──► Feishu Adapter ──► (同上)
(未来)  企业微信 ──► WeChat Adapter ──► (同上)
```

Bot 作为 `packages/bot` 加入 monorepo，通过 Socket.IO 连接 Server 的 `/client` 命名空间，与 Web Client 平行。所有平台共享 `core/` 层（会话管理、消息桥接、权限处理），各平台仅实现 `BotPlatform` 接口。

### Core Interfaces

#### BotPlatform（平台抽象层）

```typescript
interface BotPlatform {
  sendMessage(chatId: string, content: MessageContent): Promise<void>
  sendPermission(chatId: string, request: PermissionRequest): Promise<boolean>
  registerCommands(commands: BotCommand[]): Promise<void>
  onMessage(handler: (chatId: string, text: string) => void): void
  onCallback(handler: (chatId: string, action: string, data: string) => void): void
}

interface MessageContent {
  text: string
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
  replyToMessageId?: number
}

interface PermissionRequest {
  toolName: string
  description: string
  timeout: number  // ms，默认 300000 (5 min)
}

interface BotCommand {
  command: string
  description: string
}
```

#### Platform Differences

| 能力 | Telegram | 飞书（未来） | 企业微信（未来） |
|------|----------|-------------|---------------|
| 权限按钮 | Inline Keyboard | 互动卡片 | XML 按钮消息 |
| 长代码 | 多条消息拆分 | 文件消息 | 多条消息拆分 |
| 命令菜单 | Bot Commands (/) | 应用指令 | 菜单栏 |
| Markdown | 部分支持（MDv2） | 富文本 | 不支持，纯文本 |
| 格式化库 | 内置 formatter | 飞书 card builder | 纯文本处理 |

### Module Breakdown

| Module | File | Responsibility |
|--------|------|---------------|
| CLI Entry | `index.ts` | Commander CLI，解析参数启动 bot |
| Socket.IO Client | `core/socket-client.ts` | 每用户独立 Socket.IO 连接到 `/client`，处理所有事件 |
| Bridge | `core/bridge.ts` | 消息桥接：平台消息 ↔ Claude Code Socket.IO 事件 |
| Permission | `core/permission.ts` | 权限请求/超时/回调管理，含定时器 |
| Splitter | `core/splitter.ts` | 长内容智能拆分，处理各平台字符限制 |
| Session Store | `core/session-store.ts` | `chat_id → {session_id, machine_id}` 映射，SQLite 持久化 |
| User Binding | `core/user-binding.ts` | 平台用户 ID → 系统 User 绑定 + JWT 管理 |
| Telegram Adapter | `telegram/index.ts` + `telegram/adapter.ts` | grammy bot 初始化，实现 `BotPlatform` |
| Telegram Handlers | `telegram/handlers.ts` | 消息/回调处理，命令注册 |
| Telegram Formatter | `telegram/formatter.ts` | TG MarkdownV2 格式化 |
| Platform Interface | `shared/platform.ts` | `BotPlatform` 接口定义 |
| Config | `config.ts` | 环境变量解析 |

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

## Message Formatting & Splitting

### Socket Events → Telegram

| Socket Event | Format |
|-------------|--------|
| `chat:message` (text) | MarkdownV2-formatted text message |
| `chat:message` (text_delta) | Edit same message in-place, throttled to max 20 edits/min to respect Telegram rate limits |
| `chat:tool-use` | Labeled code block with tool name |
| `chat:tool-result` | Code block; truncate if > 3000 chars with summary |
| `chat:error` | Warning-prefixed error message |
| `chat:complete` | Session-ended notice |

### Long Content Splitting Strategy (`core/splitter.ts`)

Telegram 单条消息限制 4096 字符。拆分规则（按优先级）：

1. **代码块** — 单个代码块超限时，独立拆为一条消息，保留语言标记
2. **工具调用** — 每个工具调用独立一条消息，附带工具名标签
3. **纯文本** — 按 4000 字符硬拆，在段落/换行边界切割，添加 `(1/3)` 编号
4. **超长输出**（>10 条消息）— 精简为摘要 + 提示用户在 Web 端查看完整日志

### Streaming Behavior

- `text_delta` 事件流式编辑同一条消息
- 消息达到 4000 字符后，停止编辑，后续内容发为新消息
- 每条消息编辑频率限制在 20 edits/min（Telegram API rate limit）

## Error Handling

| Scenario | Handling |
|----------|---------|
| Agent goes offline mid-session | Bot notifies user, offers to switch machines or wait |
| Socket.IO disconnect | Auto-reconnect with exponential backoff; notify user after 3 failures |
| Server unreachable | Poll health endpoint; cache last known state |
| Permission timeout (no user response) | Auto-deny after configurable timeout (default 5 min) |
| Bot restart | Read `user_sessions` from SQLite → refresh JWTs if needed → reconnect Socket.IO → verify session liveness via `LIST_SESSIONS` → notify user of reconnection or reset state |

## CLI Entry Point

```bash
# 单平台启动
cc-bot --platform telegram --bot-token <token>

# 指定 Server 地址
cc-bot --platform telegram --bot-token <token> --server http://your-server:3000

# 多平台（未来）
cc-bot --platform telegram --platform feishu --bot-token <tg-token> --feishu-app-id <id> --feishu-app-secret <secret>

# 使用环境变量代替参数
TELEGRAM_BOT_TOKEN=xxx BOT_SERVER_URL=http://server:3000 cc-bot --platform telegram
```

CLI 使用 Commander.js，与 Agent CLI 风格一致。环境变量和命令行参数均可配置，命令行参数优先。

## Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Telegram SDK | `grammy` | 最活跃的 TS TG 框架，类型安全，插件丰富 |
| Socket.IO Client | `socket.io-client` | 与 Web Client 相同协议，Server 零改动 |
| Bot DB | `better-sqlite3` | 零配置，文件级存储，单写入者场景最优 |
| CLI | `commander` | 与 Agent CLI 风格一致 |
| Runtime | Node.js + TypeScript | 与 monorepo 统一 |
| Build | `tsup` | 快速简洁，monorepo 已使用 |

## Package Structure

```
packages/bot/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # CLI 入口（Commander）
│   ├── config.ts                 # 环境变量解析
│   │
│   ├── core/                     # 平台无关层
│   │   ├── socket-client.ts      # 每用户 Socket.IO 连接管理
│   │   ├── bridge.ts             # 消息桥接：平台 ↔ Claude Code
│   │   ├── permission.ts         # 权限请求/超时/回调
│   │   ├── splitter.ts           # 长内容智能拆分
│   │   ├── session-store.ts      # SQLite 会话映射持久化
│   │   └── user-binding.ts       # 用户绑定 + JWT 管理
│   │
│   ├── telegram/                 # Telegram 适配
│   │   ├── index.ts              # grammy bot 初始化
│   │   ├── adapter.ts            # 实现 BotPlatform 接口
│   │   ├── formatter.ts          # TG MarkdownV2 格式化
│   │   ├── commands.ts           # Bot Commands 注册
│   │   └── handlers.ts           # 消息/回调处理
│   │
│   ├── feishu/                   # 飞书适配（未来）
│   │   ├── index.ts              # 飞书 SDK 初始化
│   │   ├── adapter.ts            # 实现 BotPlatform 接口
│   │   └── formatter.ts          # 飞书富文本/卡片格式化
│   │
│   └── shared/
│       └── platform.ts           # BotPlatform 接口定义
│
└── data/                         # SQLite 数据库文件（gitignored）
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
BOT_PORT=3001                            # Bot service HTTP port（bind callback / webhook）

# Telegram
TELEGRAM_BOT_TOKEN=xxx

# Feishu (future)
FEISHU_APP_ID=xxx
FEISHU_APP_SECRET=xxx

# 企业微信 (future)
WEWORK_CORP_ID=xxx
WEWORK_AGENT_ID=xxx
WEWORK_SECRET=xxx
```

## Out of Scope

- Shell/terminal mode (Chat only)
- File editing via bot (read-only access to session output)
- Multi-user group chats (1:1 only)
- Feishu implementation (architecture only)
- Voice/video messages
- Bot command localization (English first)
