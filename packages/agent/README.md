# cc-remote-agent

[中文](#中文) | [English](#english)

---

## English

> PC daemon for Claude Code Remote — Control Claude Code on your PC from any device.

### Overview

`cc-remote-agent` is the PC daemon for the Claude Code Remote project. It runs on the computer you want to control remotely, connects to the cloud server via WebSocket, and executes commands received from web clients.

**Server**: https://hub.docker.com/r/zhangthexiaoning/cc-remote-server

### Key Features

- **Chat Mode** — AI conversations via Claude Agent SDK with tool calls, permission approval, and streaming output
- **Shell Mode** — PTY-based remote terminal with full interactive experience
- **Project Scanning** — Automatically scan local Git projects for easy remote selection
- **Secure Authentication** — JWT + machine_token dual authentication

### Installation

```bash
npm install -g cc-remote-agent
```

### Prerequisites

- Node.js >= 18.0.0
- Claude Code CLI installed (required for Shell mode)
- `ANTHROPIC_API_KEY` environment variable set (required for Chat mode)

#### Install Claude Code CLI

```bash
# Using npm
npm install -g @anthropic-ai/claude-code

# Or using Homebrew (macOS)
brew install claude-code
```

#### Configure API Key

```bash
# Linux/macOS
export ANTHROPIC_API_KEY=your-api-key

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="your-api-key"
```

### Quick Start

#### 1. Deploy Server

First, deploy the server using Docker:

```bash
docker run -d \
  --name cc-remote-server \
  -p 3000:3000 \
  -v cc-remote-data:/app/data \
  -e JWT_SECRET=your-super-secret-jwt-key \
  zhangthexiaoning/cc-remote-server:latest
```

#### 2. Bind Machine

Get your JWT Token from the Web UI, then run:

```bash
cc-agent bind --token <your-jwt-token> --name "My Office PC"
```

#### 3. Start Daemon

```bash
cc-agent start --server https://your-server.com
```

#### 4. Check Status

```bash
cc-agent status
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `cc-agent bind --token <token> --name <name>` | Bind machine to account |
| `cc-agent start --server <url>` | Start daemon and connect to server |
| `cc-agent status` | View connection status and machine info |
| `cc-agent projects` | Scan local Git project directories |
| `cc-agent install-service` | Install as system service (auto-start) |

### Architecture

```
┌─────────────┐          ┌──────────────┐          ┌─────────────┐
│ Client      │◄────────►│   Server     │◄────────►│ PC Agent    │
│ (Web/PWA)   │ Socket.io│ (Docker)     │ Socket.io │ (This pkg)  │
└─────────────┘   +JWT   └──────────────┘   +JWT   └─────────────┘
                               │                        │
                               ▼                        ▼
                        ┌──────────────┐         ┌─────────────┐
                        │   SQLite     │         │ Claude Code │
                        └──────────────┘         └─────────────┘
```

Agent runs on your local PC and is responsible for:
1. Maintaining WebSocket connection to Server
2. Receiving client commands (Chat / Shell)
3. Executing tasks via Claude Code CLI or Claude Agent SDK
4. Pushing results back to client in real-time

### Configuration File

Configuration is stored at `~/.cc-remote-agent/config.json`:

```json
{
  "machineId": "xxx-xxx-xxx",
  "machineToken": "yyy-yyy-yyy",
  "machineName": "My Office PC",
  "serverUrl": "https://your-server.com"
}
```

### Troubleshooting

#### Connection Failed

```bash
# Check network connectivity
ping your-server.com

# Check if server is running
curl https://your-server.com/health
```

#### Claude Code Not Found

```bash
which claude
# Or: export PATH=$PATH:/path/to/claude
```

#### Invalid API Key

```bash
echo $ANTHROPIC_API_KEY
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### System Requirements

| OS | Minimum Version |
|----|-----------------|
| macOS | 10.15+ |
| Linux | glibc 2.17+ |
| Windows | 10+ (WSL2 recommended) |

### License

MIT

---

## 中文

> Claude Code Remote 的 PC 守护进程 —— 让你从任意设备远程控制本地 PC 上的 Claude Code。

### 简介

`cc-remote-agent` 是 Claude Code Remote 项目的 PC 端守护进程。它运行在你需要远程控制的电脑上，通过 WebSocket 连接到云端 Server，接收来自 Web 客户端的指令并执行。

**服务端镜像**: https://hub.docker.com/r/zhangthexiaoning/cc-remote-server

### 核心功能

- **Chat 模式** — 通过 Claude Agent SDK 进行 AI 对话，支持工具调用、权限审批、流式输出
- **Shell 模式** — 基于 PTY 的远程终端，完整的终端交互体验
- **工程扫描** — 自动扫描本地 Git 工程，方便远程选择工作目录
- **安全认证** — JWT + machine_token 双重认证机制

### 安装

```bash
npm install -g cc-remote-agent
```

### 前置要求

- Node.js >= 18.0.0
- Claude Code CLI 已安装（Shell 模式需要）
- `ANTHROPIC_API_KEY` 环境变量已设置（Chat 模式需要）

#### 安装 Claude Code CLI

```bash
# 使用 npm
npm install -g @anthropic-ai/claude-code

# 或使用 Homebrew (macOS)
brew install claude-code
```

#### 配置 API Key

```bash
# Linux/macOS
export ANTHROPIC_API_KEY=your-api-key

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="your-api-key"
```

### 快速开始

#### 1. 部署服务端

首先使用 Docker 部署服务端：

```bash
docker run -d \
  --name cc-remote-server \
  -p 3000:3000 \
  -v cc-remote-data:/app/data \
  -e JWT_SECRET=your-super-secret-jwt-key \
  zhangthexiaoning/cc-remote-server:latest
```

#### 2. 绑定机器

从 Web UI 登录获取 JWT Token，然后执行：

```bash
cc-agent bind --token <your-jwt-token> --name "我的办公PC"
```

#### 3. 启动守护进程

```bash
cc-agent start --server https://your-server.com
```

#### 4. 查看状态

```bash
cc-agent status
```

### CLI 命令

| 命令 | 说明 |
|------|------|
| `cc-agent bind --token <token> --name <name>` | 绑定机器到账户 |
| `cc-agent start --server <url>` | 启动守护进程并连接服务端 |
| `cc-agent status` | 查看连接状态和机器信息 |
| `cc-agent projects` | 扫描本地 Git 工程目录 |
| `cc-agent install-service` | 安装为系统服务（开机自启） |

### 架构说明

```
┌─────────────┐          ┌──────────────┐          ┌─────────────┐
│ 客户端      │◄────────►│   Server     │◄────────►│ PC 守护进程  │
│ (Web/PWA)   │ Socket.io│ (Docker)     │ Socket.io │ (Agent)     │
└─────────────┘   +JWT   └──────────────┘   +JWT   └─────────────┘
                               │                        │
                               ▼                        ▼
                        ┌──────────────┐         ┌─────────────┐
                        │   SQLite     │         │ Claude Code │
                        └──────────────┘         └─────────────┘
```

Agent 运行在本地 PC 上，负责：
1. 维护与 Server 的 WebSocket 连接
2. 接收客户端指令（Chat 对话 / Shell 命令）
3. 调用 Claude Code CLI 或 Claude Agent SDK 执行任务
4. 将结果实时推送回客户端

### 配置文件

配置文件位于 `~/.cc-remote-agent/config.json`：

```json
{
  "machineId": "xxx-xxx-xxx",
  "machineToken": "yyy-yyy-yyy",
  "machineName": "我的办公PC",
  "serverUrl": "https://your-server.com"
}
```

### 故障排查

#### 连接失败

```bash
# 检查网络连通性
ping your-server.com

# 检查服务端是否运行
curl https://your-server.com/health
```

#### Claude Code 未找到

```bash
which claude
# 或: export PATH=$PATH:/path/to/claude
```

#### API Key 无效

```bash
echo $ANTHROPIC_API_KEY
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### 系统要求

| 系统 | 最低版本 |
|------|----------|
| macOS | 10.15+ |
| Linux | glibc 2.17+ |
| Windows | 10+ (推荐 WSL2) |

### 许可证

MIT
