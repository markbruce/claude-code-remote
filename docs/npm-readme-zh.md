# cc-remote-agent

> Claude Code Remote 的 PC 守护进程 —— 让你从任意设备远程控制本地 PC 上的 Claude Code。

## 简介

`cc-remote-agent` 是 Claude Code Remote 项目的 PC 端守护进程。它运行在你需要远程控制的电脑上，通过 WebSocket 连接到云端 Server，接收来自 Web 客户端的指令并执行。

## 截图预览

<table>
  <tr>
    <td align="center"><b>登录页面</b></td>
    <td align="center"><b>机器列表</b></td>
    <td align="center"><b>机器搜索</b></td>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/login.png" width="250"/></td>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/machine_list.png" width="250"/></td>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/machine_search.png" width="250"/></td>
  </tr>
  <tr>
    <td align="center"><b>项目列表</b></td>
    <td align="center"><b>对话模式</b></td>
    <td align="center"><b>终端模式</b></td>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/project_list.png" width="250"/></td>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/main_chat.png" width="250"/></td>
    <td><img src="https://raw.githubusercontent.com/markbruce/claude-code-remote/main/docs/prev_imgs/main_terminal.png" width="250"/></td>
  </tr>
  <tr>
    <td align="center"><b>会话历史</b></td>
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
1. 修复 CI 工作流中已废弃的 `actions/upload-artifact@v3` 和 `actions/download-artifact@v3`（更新至 v4）
2. 修复 GitHub Release 创建失败 — 添加 `contents: write` 权限
3. 清理 publish-npm 任务 — 移除调试步骤和版本覆盖 hack

---

## v1.1.1 Release Notes

feature:
1. 国际化 (i18n) 支持 - 中英文双语切换
2. 简化 Agent 使用文档，首推交互式一键启动
3. Agent 支持 `--config-dir` 参数，可同时运行多个 Agent 实例

bugfix:
1. 移除 ChatStore 中所有调试日志，避免控制台污染
2. 修复 Tablet 区间布局死区，底部导航栏不可见导致无法操作
3. 修复加载历史会话时 SESSION_STARTED 触发两次的问题
4. 修复 iOS Safari 输入框聚焦时页面自动缩放的问题

---

## v1.0.13 Release Notes

feature:
1. 在工作空间侧边栏显示当前 Git 分支信息
2. 新增历史消息顺序修复相关的工单留档与脚本

bugfix:
1. 修复 `/` 斜杠命令在部分场景下无法识别的问题
2. 修复窄屏模式下页面出现横向滚动条的问题
3. 修复历史消息加载时，工具调用与文本消息顺序错乱的问题

### 核心功能

- **Chat 模式** — 通过 Claude Agent SDK 进行 AI 对话，支持工具调用、权限审批、流式输出
- **Shell 模式** — 基于 PTY 的远程终端，完整的终端交互体验
- **工程扫描** — 自动扫描本地 Git 工程，方便远程选择工作目录
- **安全认证** — JWT + machine_token 双重认证机制

## 安装

```bash
npm install -g cc-remote-agent
```

## 前置要求

- Node.js >= 18.0.0
- Claude Code CLI 已安装（Shell 模式需要）
- `ANTHROPIC_API_KEY` 环境变量已设置（Chat 模式需要）

### 安装 Claude Code CLI

```bash
# 使用 npm
npm install -g @anthropic-ai/claude-code

# 或使用 Homebrew (macOS)
brew install claude-code
```

### 配置 API Key

```bash
# Linux/macOS
export ANTHROPIC_API_KEY=your-api-key

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="your-api-key"
```

## 快速开始

只需一条命令：

```bash
cc-agent
```

首次运行会交互式引导你输入服务器地址、邮箱、密码和机器名称，自动完成绑定和连接。

## 更多用法

```bash
cc-agent                          # 交互式启动（推荐）
cc-agent --status                 # 查看连接状态
cc-agent --rebind                 # 重新绑定机器
cc-agent --unbind                 # 解除绑定
cc-agent --force                  # 强制覆盖已存在的主机名绑定
cc-agent --config-dir ~/.cc-agent-2  # 指定配置目录（多实例运行）

# 非交互式（适合自动化脚本）
cc-agent --non-interactive \
  --server http://localhost:3000 \
  --email your-email@example.com \
  --password your-password \
  --name "我的办公PC"
```

### 多实例运行

同一台机器上可以运行多个 Agent 实例，分别连接不同的 Server：

```bash
# 第一个实例（默认配置目录 ~/.claude-agent）
cc-agent

# 第二个实例（独立配置目录）
cc-agent --config-dir ~/.cc-agent-2
```

每个实例拥有独立的 machine_token 和配置，互不干扰。

## 架构说明

```
┌─────────────┐          ┌──────────────┐          ┌─────────────┐
│ 客户端      │◄────────►│   Server     │◄────────►│ PC 守护进程  │
│ (Web/PWA)   │ Socket.io│ (云端)       │ Socket.io │ (Agent)     │
└─────────────┘   +JWT   └──────────────┘   +JWT   └─────────────┘
                                                      │
                                                      ▼
                                               ┌─────────────┐
                                               │ Claude Code │
                                               │   进程      │
                                               └─────────────┘
```

Agent 运行在本地 PC 上，负责：
1. 维护与 Server 的 WebSocket 连接
2. 接收客户端指令（Chat 对话 / Shell 命令）
3. 调用 Claude Code CLI 或 Claude Agent SDK 执行任务
4. 将结果实时推送回客户端

## 使用场景

- 在咖啡厅用手机继续写代码
- 在家用平板查看办公室电脑上的进度
- 多人共享同一台高性能开发机
- 远程调试服务器上的代码

## 安全说明

- **账户认证**：使用邮箱和密码登录。您的凭证仅用于获取服务器通信的 JWT token。
- **Machine Token**：绑定后生成，用于后续连接认证。
- **本地配置**：凭证不会保存在本地，仅保存机器 token。
- **端到端加密**：建议 Server 配置 HTTPS 以确保通信安全。
- **本地执行**：所有代码在本地 PC 执行，Server 只做中继。

## 故障排查

### 连接失败

```bash
# 检查网络连通性
ping your-server.com

# 检查 Server 是否运行
curl https://your-server.com/health

# 查看 Agent 日志
cc-agent start --server https://your-server.com --verbose
```

### Claude Code 未找到

```bash
# 确认 Claude Code 已安装
which claude

# 或手动设置路径
export PATH=$PATH:/path/to/claude
```

### API Key 无效

```bash
# 检查环境变量
echo $ANTHROPIC_API_KEY

# 重新设置
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

## 技术栈

- Node.js
- Commander.js (CLI)
- Socket.io-client (通信)
- node-pty (终端模拟)
- @anthropic-ai/claude-agent-sdk (AI 对话)

## 系统要求

| 系统 | 最低版本 |
|------|----------|
| macOS | 10.15+ |
| Linux | glibc 2.17+ |
| Windows | 10+ (WSL2 推荐) |

## License

MIT

## 反馈

有任何问题可邮件反馈：markbruce@163.com
