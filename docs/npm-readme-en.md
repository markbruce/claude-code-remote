# cc-remote-agent

> PC daemon for Claude Code Remote — Control Claude Code on your PC from any device.

## Overview

`cc-remote-agent` is the PC daemon for the Claude Code Remote project. It runs on the computer you want to control remotely, connects to the cloud server via WebSocket, and executes commands received from web clients.

## Screenshots

<table>
  <tr>
    <td align="center"><b>Login</b></td>
    <td align="center"><b>Machine List</b></td>
    <td align="center"><b>Machine Search</b></td>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/login.png" width="250"/></td>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/machine_list.png" width="250"/></td>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/machine_search.png" width="250"/></td>
  </tr>
  <tr>
    <td align="center"><b>Project List</b></td>
    <td align="center"><b>Chat Mode</b></td>
    <td align="center"><b>Terminal Mode</b></td>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/project_list.png" width="250"/></td>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/main_chat.png" width="250"/></td>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/main_terminal.png" width="250"/></td>
  </tr>
  <tr>
    <td align="center"><b>Session History</b></td>
    <td></td>
    <td></td>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/main_history.png" width="250"/></td>
    <td></td>
    <td></td>
  </tr>
</table>

---

## v1.1.2 Release Notes

bugfix:
1. Fixed deprecated `actions/upload-artifact@v3` and `actions/download-artifact@v3` in CI workflow (updated to v4)
2. Fixed GitHub Release creation failure — added `contents: write` permission to workflow
3. Cleaned up publish-npm job — removed debug steps and version override hack

---

## v1.1.1 Release Notes

feature:
1. Internationalization (i18n) support — Chinese/English bilingual UI
2. Simplified Agent documentation, promoting interactive one-command startup
3. Agent supports `--config-dir` parameter for running multiple instances

bugfix:
1. Removed all debug logs from ChatStore to avoid console pollution
2. Fixed tablet layout deadzone where bottom navigation bar was invisible and inaccessible
3. Fixed duplicate SESSION_STARTED events when loading historical sessions
4. Fixed iOS Safari auto-zoom issue when focusing on input fields

---

## v1.0.13 Release Notes

feature:
1. Added current Git branch display in the workspace sidebar
2. Added issue records and helper script for the history ordering fix

bugfix:
1. Fixed an issue where `/` slash commands were not recognized in some scenarios
2. Fixed horizontal scrollbar issues on narrow screens
3. Fixed message ordering issues between tool calls and text when loading history

### Key Features

- **Chat Mode** — AI conversations via Claude Agent SDK with tool calls, permission approval, and streaming output
- **Shell Mode** — PTY-based remote terminal with full interactive experience
- **Project Scanning** — Automatically scan local Git projects for easy remote selection
- **Secure Authentication** — JWT + machine_token dual authentication

## Installation

```bash
npm install -g cc-remote-agent
```

## Prerequisites

- Node.js >= 18.0.0
- Claude Code CLI installed (required for Shell mode)
- `ANTHROPIC_API_KEY` environment variable set (required for Chat mode)

### Install Claude Code CLI

```bash
# Using npm
npm install -g @anthropic-ai/claude-code

# Or using Homebrew (macOS)
brew install claude-code
```

### Configure API Key

```bash
# Linux/macOS
export ANTHROPIC_API_KEY=your-api-key

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="your-api-key"
```

## Quick Start

Just one command:

```bash
cc-agent
```

On first run, you'll be guided interactively to enter server address, email, password, and machine name. Binding and connection are handled automatically.

## More Options

```bash
cc-agent                          # Interactive mode (recommended)
cc-agent --status                 # Check connection status
cc-agent --rebind                 # Rebind machine
cc-agent --unbind                 # Unbind machine
cc-agent --force                  # Force override existing hostname binding
cc-agent --config-dir ~/.cc-agent-2  # Specify config directory (multi-instance)

# Non-interactive (for automation scripts)
cc-agent --non-interactive \
  --server http://localhost:3000 \
  --email your-email@example.com \
  --password your-password \
  --name "My Office PC"
```

### Running Multiple Instances

You can run multiple Agent instances on the same machine, each connecting to a different server:

```bash
# First instance (default config dir ~/.claude-agent)
cc-agent

# Second instance (separate config directory)
cc-agent --config-dir ~/.cc-agent-2
```

Each instance has its own machine_token and configuration, fully isolated.

## Architecture

```
┌─────────────┐          ┌──────────────┐          ┌─────────────┐
│ Client      │◄────────►│   Server     │◄────────►│ PC Agent    │
│ (Web/PWA)   │ Socket.io│ (Cloud)      │ Socket.io │ (This pkg)  │
└─────────────┘   +JWT   └──────────────┘   +JWT   └─────────────┘
                                                      │
                                                      ▼
                                               ┌─────────────┐
                                               │ Claude Code │
                                               │  Process    │
                                               └─────────────┘
```

Agent runs on your local PC and is responsible for:
1. Maintaining WebSocket connection to Server
2. Receiving client commands (Chat / Shell)
3. Executing tasks via Claude Code CLI or Claude Agent SDK
4. Pushing results back to client in real-time

## Use Cases

- Continue coding from your phone at a coffee shop
- Check office PC progress from your tablet at home
- Share a high-performance dev machine among team members
- Debug code on remote servers

## Security

- **Account Authentication**: Uses email and password for login. Your credentials are only used to obtain a JWT token for server communication.
- **Machine Token**: Generated after binding, used for subsequent connection authentication.
- **Local Configuration**: Credentials are not stored locally; only the machine token is saved.
- **End-to-End Encryption**: Server should be configured with HTTPS for secure communication.
- **Local Execution**: All code runs on local PC; Server only relays messages.

## Troubleshooting

### Connection Failed

```bash
# Check network connectivity
ping your-server.com

# Check if server is running
curl https://your-server.com/health

# View agent logs
cc-agent start --server https://your-server.com --verbose
```

### Claude Code Not Found

```bash
# Verify Claude Code is installed
which claude

# Or manually add to path
export PATH=$PATH:/path/to/claude
```

### Invalid API Key

```bash
# Check environment variable
echo $ANTHROPIC_API_KEY

# Reset it
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

## Tech Stack

- Node.js
- Commander.js (CLI)
- Socket.io-client (Communication)
- node-pty (Terminal emulation)
- @anthropic-ai/claude-agent-sdk (AI conversation)

## System Requirements

| OS | Minimum Version |
|----|-----------------|
| macOS | 10.15+ |
| Linux | glibc 2.17+ |
| Windows | 10+ (WSL2 recommended) |

## License

MIT

## Feedback

For questions or feedback, email: markbruce@163.com
