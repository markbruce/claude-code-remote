# 🚀 Claude Code Remote

<div align="center">

**Remotely control Claude Code on any PC from your phone, browser, or Telegram**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![npm version](https://img.shields.io/npm/v/cc-remote-agent?logo=npm&label=npm)](https://www.npmjs.com/package/cc-remote-agent)
[![Docker Pulls](https://img.shields.io/docker/pulls/zhangthexiaoning/cc-remote-server?logo=docker&label=docker%20pulls)](https://hub.docker.com/r/zhangthexiaoning/cc-remote-server)

[Features](#-features) • [Quick Start](#-quick-start) • [Deployment](DEPLOY.md) • [Architecture](#-architecture) • [Acknowledgements](#-acknowledgements) • [中文文档](README.zh-CN.md)

</div>

---

## 📖 Overview

Claude Code Remote is a lightweight remote development tool that lets you access and manage Claude Code sessions on your local PC from your phone, tablet, or any browser. Designed for small teams without official Claude subscriptions, using your own compute and API key for remote vibe coding.

## 📸 Screenshots

<table>
  <tr>
    <td align="center"><b>Login</b></td>
    <td align="center"><b>Machine List</b></td>
    <td align="center"><b>Machine Search</b></td>
  </tr>
  <tr>
    <td><img src="docs/prev_imgs/login.png" width="250"/></td>
    <td><img src="docs/prev_imgs/machine_list.png" width="250"/></td>
    <td><img src="docs/prev_imgs/machine_search.png" width="250"/></td>
  </tr>
  <tr>
    <td align="center"><b>Project List</b></td>
    <td align="center"><b>Chat Mode</b></td>
    <td align="center"><b>Terminal Mode</b></td>
  </tr>
  <tr>
    <td><img src="docs/prev_imgs/project_list.png" width="250"/></td>
    <td><img src="docs/prev_imgs/main_chat.png" width="250"/></td>
    <td><img src="docs/prev_imgs/main_terminal.png" width="250"/></td>
  </tr>
  <tr>
    <td align="center"><b>Git History</b></td>
    <td></td>
    <td></td>
  </tr>
  <tr>
    <td><img src="docs/prev_imgs/main_history.png" width="250"/></td>
    <td></td>
    <td></td>
  </tr>
</table>

---

## 🆕 v1.1.2 Release Notes

bugfix:
1. Fixed deprecated `actions/upload-artifact@v3` and `actions/download-artifact@v3` in CI workflow (updated to v4)
2. Fixed GitHub Release creation failure — added `contents: write` permission to workflow
3. Cleaned up publish-npm job — removed debug steps and version override hack

---

## v1.1.1 Release Notes

bugfix:
1. Fixed large repository git status response overflow causing socket disconnection
2. `cc-agent --version` now reads version dynamically from package.json

---

## v1.1.0 Release Notes

feature:
1. Internationalization (i18n) support — Chinese/English bilingual UI
2. Simplified Agent documentation with interactive one-command startup
3. Agent supports `--config-dir` parameter for running multiple instances

bugfix:
1. Removed all debug logs from ChatStore to avoid console pollution
2. Fixed tablet layout deadzone where bottom navigation bar was invisible and inaccessible
3. Fixed iOS Safari auto-zoom issue when focusing on input fields

---

## v1.0.14 Release Notes

feature:
1. Multi-tab editor: open multiple files simultaneously with scrollable tabs
2. Draggable panel resizing in desktop mode (sidebar and editor panels)
3. Global project search on machine/project list pages with direct session access
4. Project list sorted by most recent session time
5. Session selection list on narrow screens after project selection
6. Custom path input for starting new sessions
7. Workspace back button returns to project list (instead of machine list)
8. Git history distinguishes pushed/unpushed commits with different colors
9. Real-time context token/message count display
10. Custom slash commands are inserted into input box instead of being sent directly

bugfix:
1. Properly clear file editor state when switching sessions
2. Fixed context display always showing 0
3. Fixed compilation error from leaveSession using old editor properties

---

## v1.0.13 Release Notes (2025-03)

feature:
1. Added current Git branch display in the workspace sidebar
2. Added issue records and helper script for the history ordering fix

bugfix:
1. Fixed `/` slash commands not recognized in some scenarios
2. Fixed horizontal scrollbar issues on narrow screens
3. Fixed message ordering between tool calls and text when loading history

### 🎯 Use Cases

- ✅ Team members without Claude subscriptions who can't use official remote features
- ✅ Need to do Claude vibe coding from anywhere
- ✅ Manage multiple projects across multiple PCs
- ✅ Mobile access via PWA

---

## 📦 Package Manager Support

This project supports both **npm** and **pnpm**:

| Operation | npm | pnpm |
|-----------|-----|------|
| Install dependencies | `npm install` | `pnpm install` |
| Start Server | `npm run dev:server` | `pnpm --filter @cc-remote/server dev` |
| Start Web | `npm run dev:web` | `pnpm --filter @cc-remote/web dev` |
| Start Agent (dev) | `npm run dev:agent` | `pnpm --filter @cc-remote/agent dev` |
| Start Telegram bot (dev) | — | `pnpm --filter cc-remote-bot dev` (set `TELEGRAM_BOT_TOKEN`) |
| Build shared | `npm run build:shared` | `pnpm --filter @cc-remote/shared build` |
| Build server | `npm run build:server` | `pnpm --filter @cc-remote/server build` |
| Build agent | `npm run build:agent` | `pnpm --filter @cc-remote/agent build` |
| Generate DB | `npm run db:generate` | `pnpm --filter @cc-remote/server db:generate` |
| Push DB | `npm run db:push` | `pnpm --filter @cc-remote/server db:push` |
| Run tests | `npm test` | `pnpm test` |

> 💡 **Tip**: npm >= 9.0.0 is required for workspace support

---

## ✨ Features

### Dual-Mode Sessions

- 🤖 **Chat Mode** — AI conversations via Claude Agent SDK with tool calls, permission approval, and streaming output
- 🖥️ **Shell Mode** — xterm.js-based remote terminal with PTY interaction and window resize support

### Chat Experience

- 💬 **Rich Messages** — Markdown rendering, code highlighting, copy button, table styling
- 📂 **Session History** — Browse and resume past conversations with full message loading
- ⚡ **Slash Commands** — Type `/` to open command panel with built-in commands, model switching, Skills, and Plugins
- 🔧 **Tool Calls** — Collapsible display of tool name, input parameters, and results with status indicators
- 🛡️ **Permission Management** — Pre-execution permission approval UI (allow/deny)

### Workspace

- 🗂️ **File Explorer** — Sidebar file tree with collapse/expand and file type icons
- 📜 **Session List** — Sidebar history sessions, one-click to view or resume
- 🔀 **Multi-Tab** — Shell and Chat tabs coexist with flexible switching

### Infrastructure

- 🔐 **Dual Authentication** — JWT + machine_token security mechanism
- 🖥️ **Multi-PC Management** — Each user can manage multiple PCs with real-time online status
- 📱 **Mobile Support** — Responsive design with PWA support
- 🔄 **Real-time Communication** — Socket.io bidirectional communication with separated Agent/Client namespaces
- 🛡️ **Security** — Rate limiting, password hashing, input validation

### Telegram Bot

- 🤖 **Telegram Integration** — Full-featured Telegram bot for remote Claude Code access (deploy your own via [@BotFather](https://t.me/BotFather))
- 🔗 **Account Binding** — One-click bind via deep link, web-based OAuth flow
- 📋 **InlineKeyboard** — Tap-to-select machines, projects, and sessions
- 💬 **Chat & Streaming** — Send messages to Claude with real-time streaming output
- 📜 **Session Management** — Browse history, resume past sessions, view conversation records
- 🛑 **Abort Control** — `/stop` to interrupt running Claude responses

### Technical Highlights

- **Monorepo Architecture** — Turborepo + pnpm workspace, shared types, independent builds
- **Full-stack TypeScript** — End-to-end type safety from shared types to frontend and backend
- **Claude Agent SDK** — Integrated `@anthropic-ai/claude-agent-sdk` with `query`, `listSessions`, `getSessionMessages`
- **Prisma ORM** — Type-safe database operations
- **Zustand State Management** — Lightweight, zero boilerplate
- **Graceful Restart** — Automatic port recycling in dev mode, avoiding EADDRINUSE

---

## 🏗️ Architecture

```
┌─────────────┐          ┌──────────────┐          ┌─────────────┐
│ Client      │◄────────►│   Server     │◄────────►│ PC Agent    │
│ (Web/PWA)   │ Socket.io│ (Express)    │ Socket.io │             │
└─────────────┘   +JWT   └──────────────┘   +JWT   └─────────────┘
                               ▲                        │
                               │                        ▼
┌─────────────┐               │                 ┌─────────────┐
│ Telegram    │◄──────────────┘                 │ Claude Code │
│ Bot         │ Socket.io                       │  Process    │
└─────────────┘                                 └─────────────┘
       │
       ▼
┌──────────────┐
│   SQLite     │
│ (Session)    │
└──────────────┘
```

### Tech Stack

| Component | Technology |
|-----------|------------|
| **Server** | Node.js + Express + Socket.io + Prisma + tsx watch |
| **Agent** | Node.js + Commander + Socket.io-client + Claude Agent SDK |
| **Web** | React + Vite + Tailwind + xterm.js + Zustand |
| **Bot** | Node.js + grammy + Socket.io-client + better-sqlite3 |
| **Database** | SQLite + Prisma ORM |
| **Auth** | JWT + bcrypt |
| **Chat Rendering** | react-markdown + remark-gfm + react-syntax-highlighter |

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0 or pnpm >= 9.0.0
- Claude Code CLI installed (for Shell mode)
- `ANTHROPIC_API_KEY` environment variable set (for Chat mode, configured on the Agent machine)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/markbruce/claude-code-remote.git
cd claude-code-remote
```

2. **Install dependencies**

```bash
npm install
# or
pnpm install
```

3. **Initialize database**

```bash
npm run db:generate
npm run db:push
# or
pnpm --filter @cc-remote/server db:generate
pnpm --filter @cc-remote/server db:push
```

4. **Configure environment variables**
```bash
cp packages/server/.env.example packages/server/.env
# Edit .env file, set JWT_SECRET etc.
```

5. **Start services**

```bash
# Terminal 1: Start server
npm run dev:server

# Terminal 2: Start Web UI
npm run dev:web

# Terminal 3: Build and start Agent
npm run build:agent
cd packages/agent
node dist/index.js

# Terminal 4 (optional): Telegram bot — see "Telegram Bot (optional)" below for env vars and binding
cd packages/bot
npm run build
TELEGRAM_BOT_TOKEN=<your_botfather_token> node dist/index.js
```

#### Telegram Bot (optional)

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the **HTTP API token**.
2. **Environment variables** (CLI flags override env where noted):
   - `TELEGRAM_BOT_TOKEN` — required unless you pass `--bot-token <token>` to `node dist/index.js`
   - `BOT_SERVER_URL` — Claude Code Remote server URL (default `http://localhost:3000`); use `--server <url>` to override
   - `BOT_PORT` — local HTTP port for bind-token verification and callbacks (default `3001`); use `--port <port>` to override
3. **Align URLs** so binding works: the Server and Web must reach this bot HTTP service. Defaults assume everything runs on one machine:
   - In `packages/server/.env`, `BOT_SERVICE_URL` defaults to `http://localhost:3001` if unset (must match where the bot listens).
   - For the Web UI in dev, `VITE_BOT_SERVICE_URL` defaults to `http://localhost:3001` in `BindBotPage` (set in `packages/web/.env` if your bot runs elsewhere).
4. **Start the bot** (Server should already be running):

```bash
# After build (production-style)
pnpm --filter cc-remote-bot build
cd packages/bot
TELEGRAM_BOT_TOKEN=<token> node dist/index.js
# or explicitly:
# node dist/index.js --bot-token <token> --server http://localhost:3000 --port 3001

# Development (TypeScript watch + nodemon)
pnpm --filter cc-remote-bot dev
# Set TELEGRAM_BOT_TOKEN in your shell or a .env file loaded by your environment
```

5. In Telegram, send `/start` to your bot, open the bind link in the browser, and log in to complete account binding.

6. **Access the app**
- Web UI: http://localhost:5173
- Server API: http://localhost:3000
- Health check: http://localhost:3000/health
- Telegram Bot: after binding, use `/start` and chat as documented in the bot help

---

## 🧪 Testing

### Quick Test (5 minutes)

#### 1️⃣ Register an account

Visit http://localhost:5173, click "Register", enter email and password.

#### 2️⃣ Start Agent

```bash
npm run build:agent
cd packages/agent
node dist/index.js
```

Follow the interactive prompts to enter server address, email, password, and machine name.

#### 3️⃣ Test sessions
```
Refresh page → See online PC (green)
→ Click "Scan Projects"
→ Select project → Enter workspace
→ Chat tab: Talk to Claude, test slash commands (type /)
→ Shell tab: Remote terminal, type commands to test
→ Sidebar: Switch between "Sessions" and "Files" tabs
```

### Automated Tests

```bash
npm test                        # Run all tests
npm test -- --coverage          # Generate coverage report
npm test tests/unit/auth.test.ts # Run specific test
```

### Test Checklist

- [ ] Server starts normally (http://localhost:3000/health)
- [ ] Web UI is accessible (http://localhost:5173)
- [ ] User registration/login succeeds
- [ ] Agent binds successfully and shows online
- [ ] Project scan succeeds
- [ ] Chat mode: send message, receive AI reply, tool call display
- [ ] Chat mode: `/` opens command panel, shows Skills list
- [ ] Chat mode: select history session, load history messages
- [ ] Shell mode: terminal commands work properly
- [ ] Sidebar: file explorer shows project file tree
- [ ] Multi-tab sync works properly

---

## 📦 Project Structure

```
claude-code-remote/
├── packages/
│   ├── shared/              # Shared types and constants
│   │   └── src/
│   │       ├── types.ts           # Global types (ChatMessage, FileTreeItem, SlashCommand, etc.)
│   │       └── constants.ts       # Socket event names, config constants
│   │
│   ├── server/              # Express + Socket.io relay server
│   │   └── src/
│   │       ├── index.ts           # Entry, graceful restart, port recycling
│   │       ├── auth.ts            # JWT auth middleware
│   │       ├── routes/            # REST API (auth, machines, projects)
│   │       └── socket/            # Socket.io namespaces
│   │           ├── agent.socket.ts    # Agent → Server → Client forwarding
│   │           ├── client.socket.ts   # Client → Server → Agent forwarding
│   │           └── store.ts           # Online Agent state management
│   │
│   ├── agent/               # PC daemon CLI
│   │   └── src/
│   │       ├── index.ts           # Commander CLI (bind/start/status)
│   │       ├── client.ts          # Socket client + event dispatch
│   │       ├── session.ts         # PTY Shell session management
│   │       ├── sdk-session.ts     # Claude Agent SDK session management (Chat mode)
│   │       └── scanner.ts         # Project directory scanning
│   │
│   └── bot/                 # Telegram / IM bot
│       └── src/
│           ├── index.ts           # HTTP server + entry point
│           ├── core/
│           │   ├── bridge.ts      # Orchestrator (commands → Socket.IO)
│           │   ├── socket-client.ts # Socket.IO client to server
│           │   └── session-store.ts # SQLite session persistence
│           ├── telegram/
│           │   ├── adapter.ts     # grammy bot adapter
│           │   ├── handlers.ts    # Command handlers
│           │   └── commands.ts    # Bot command definitions
│           └── shared/
│               └── platform.ts    # Platform interface (BotPlatform)
│   └── web/                 # React Web UI
│       └── src/
│           ├── components/
│           │   ├── chat/              # Chat mode components
│           │   ├── shell/             # Shell mode components
│           │   └── workspace/         # Workspace layout
│           ├── pages/
│           ├── stores/
│           └── lib/
│
├── docs/                    # Documentation
├── turbo.json               # Turborepo config
├── pnpm-workspace.yaml      # pnpm workspace
└── package.json             # Root config
```

---

## 🔧 Configuration

### Server Environment Variables

```env
# Database
DATABASE_URL="file:./dev.db"

# Server
PORT=3000
NODE_ENV=development

# Security (must set in production)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:5173
```

### Agent CLI Commands

```bash
cc-agent                          # Interactive mode (recommended)
cc-agent --status                 # Check connection status
cc-agent --rebind                 # Rebind machine
cc-agent --unbind                 # Unbind machine
cc-agent --config-dir ~/.cc-agent-2  # Specify config directory (multi-instance)
```

---

## 📊 Roadmap

### Completed

- [x] Monorepo project structure (Turborepo + pnpm workspace)
- [x] Prisma Schema design + SQLite
- [x] Server core features (auth + Socket namespace relay)
- [x] Agent CLI core features (bind / start / status / scan)
- [x] Web UI basics (login, register, project list)
- [x] **Phase 1** — Agent SDK integration (Chat mode backend)
- [x] **Phase 2** — Web workspace layout (Sidebar + Tabs)
- [x] **Phase 3** — Chat UI (message rendering, streaming, tool calls, permissions)
- [x] **Phase 4** — Shell terminal enhancement + connection status
- [x] **Session Restore** — History browsing + resume (SDK listSessions / getSessionMessages)
- [x] **Slash Commands** — `/` command panel with built-in commands + model switching + Skills + Plugins
- [x] **File Explorer** — Sidebar file tree with recursive directory display
- [x] **Dev Experience** — tsx watch hot reload, automatic port recycling, graceful restart
- [x] **Telegram Bot** — Full-featured Telegram bot with InlineKeyboard, streaming, session management

### Planned

- [ ] Full unit test coverage (target 70%+)
- [ ] API documentation (Swagger / OpenAPI)
- [ ] Mobile App (React Native / PWA enhancement)
- [ ] Multi-user collaboration (shared sessions)
- [ ] Session search and tag management

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Create a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

This project was inspired by and references the following open-source projects:

1. **[Happy Coder](https://github.com/slopus/happy)** by slopus — Architecture and CLI design reference (MIT)
2. **[Claude Code WebUI](https://github.com/sugyan/claude-code-webui)** by sugyan — Web UI and frontend architecture reference (MIT)
3. **[CloudCLI/Claude Code UI](https://github.com/siteboon/claudecodeui)** by siteboon — Feature and UI design reference (GPL-3.0)
4. **[Claude Code](https://github.com/anthropics/claude-code)** by Anthropic — Chat UI interaction and Agent SDK integration reference (Apache-2.0)

### Tech Stack

- **[Express](https://expressjs.com/)** — Web framework
- **[Socket.io](https://socket.io/)** — Real-time communication
- **[Prisma](https://www.prisma.io/)** — Database ORM
- **[React](https://reactjs.org/)** — Frontend framework
- **[Vite](https://vitejs.dev/)** — Build tool
- **[xterm.js](https://xtermjs.org/)** — Terminal emulator
- **[Zustand](https://github.com/pmndrs/zustand)** — State management
- **[grammy](https://grammy.dev/)** — Telegram Bot framework
- **[@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)** — Claude Agent SDK

---

## 📞 Contact

- **Bug Reports**: [GitHub Issues](https://github.com/markbruce/claude-code-remote/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/markbruce/claude-code-remote/discussions)

---

<div align="center">

**If this project helps you, please give it a ⭐️ Star!**

Made with ❤️

</div>
