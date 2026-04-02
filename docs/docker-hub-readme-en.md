# Claude Code Remote Server

Remotely control Claude Code on any PC from your phone or browser.

## Overview

Claude Code Remote Server is the core server component of the Claude Code Remote project, providing:

- User authentication and authorization (JWT)
- Connection management for PC agents
- Real-time communication relay for web clients
- Multi-user and multi-machine management

## v1.1.1 Release Notes

bugfix:
1. Fixed large repository git status response overflow causing socket disconnection
2. `cc-agent --version` now reads version dynamically from package.json

---

## v1.1.0 Release Notes

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

## v1.0.14 Release Notes

feature:
1. Multi-tab editor: Support opening multiple files simultaneously with scrollable tabs and close-all option
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
1. Fixed an issue where `/` slash commands were not recognized in some scenarios
2. Fixed horizontal scrollbar issues on narrow screens
3. Fixed message ordering issues between tool calls and text when loading history

## Quick Start

```bash
docker run -d \
  --name cc-remote-server \
  -p 3000:3000 \
  -v cc-remote-data:/app/data \
  -e JWT_SECRET=your-super-secret-jwt-key \
  -e CORS_ORIGIN=https://your-web-domain.com \
  zhangthexiaoning/cc-remote-server:latest
```

After starting, visit `http://localhost:3000/health` to verify the service is running.

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server listening port | `3000` | No |
| `JWT_SECRET` | JWT signing secret | - | **Yes** (production) |
| `JWT_EXPIRES_IN` | Token validity period | `7d` | No |
| `CORS_ORIGIN` | Allowed frontend origin (CORS) | `*` | No |
| `DATABASE_URL` | SQLite database path | `file:./data/prod.db` | No |
| `NODE_ENV` | Runtime environment | `production` | No |

### Environment Details

- **JWT_SECRET**: Must be set to a strong random string in production for JWT signing and verification
- **CORS_ORIGIN**: Set to your frontend's full URL if deploying separately (e.g., `https://cc-remote.example.com`)
- **DATABASE_URL**: Uses SQLite inside container by default; mount data directory for persistence

## Data Persistence

The image includes SQLite database. Mount the data directory for persistence:

```bash
docker run -d \
  --name cc-remote-server \
  -p 3000:3000 \
  -v /path/to/data:/app/data \
  -e JWT_SECRET=your-super-secret-jwt-key \
  zhangthexiaoning/cc-remote-server:latest
```

Or use Docker Volume:

```bash
docker volume create cc-remote-data

docker run -d \
  --name cc-remote-server \
  -p 3000:3000 \
  -v cc-remote-data:/app/data \
  -e JWT_SECRET=your-super-secret-jwt-key \
  zhangthexiaoning/cc-remote-server:latest
```

## Docker Compose Example

```yaml
services:
  cc-remote-server:
    image: zhangthexiaoning/cc-remote-server:latest
    container_name: cc-remote-server
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - cc-remote-data:/app/data
    environment:
      - PORT=3000
      - JWT_SECRET=your-super-secret-jwt-key-change-me
      - JWT_EXPIRES_IN=7d
      - CORS_ORIGIN=*
      - NODE_ENV=production

volumes:
  cc-remote-data:
```

## Using with Agent

Install and start the Agent on the PC you want to control remotely:

```bash
npm install -g cc-remote-agent
cc-agent
```

On first run, you'll be guided interactively to enter server address, email, password, and machine name. Binding and connection are handled automatically.

```bash
cc-agent --status       # Check status
cc-agent --rebind       # Rebind machine
cc-agent --unbind       # Unbind machine
```

## Architecture

```
┌─────────────┐          ┌──────────────┐          ┌─────────────┐
│ Client      │◄────────►│   Server     │◄────────►│ PC Agent    │
│ (Web/PWA)   │ Socket.io│ (This Image) │ Socket.io │             │
└─────────────┘   +JWT   └──────────────┘   +JWT   └─────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │   SQLite     │
                        │ (Users/Hosts)│
                        └──────────────┘
```

**Server (this image)** relays all communication between clients and agents. It does not execute code or access the file system directly.

## Health Check

```bash
# HTTP health check
curl http://localhost:3000/health

# Docker health check
docker inspect --format='{{.State.Health.Status}}' cc-remote-server
```

## Supported Platforms

- `linux/amd64`
- `linux/arm64`

## Image Tags

| Tag | Description |
|-----|-------------|
| `latest` | Latest stable release |
| `1.1.1` | Specific version |
| `1.1` | Major version |

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs cc-remote-server

# Check port usage
netstat -tlnp | grep 3000
```

### Agent Connection Issues

1. Ensure server is accessible from the internet
2. Check if firewall allows the port
3. Verify CORS_ORIGIN is configured correctly

### Data Loss

Make sure the data directory `/app/data` is mounted.

## Tech Stack

- Node.js 20
- Express
- Socket.io
- Prisma + SQLite
- JWT + bcrypt

## License

MIT

## Feedback

For questions or feedback, email: markbruce@163.com
