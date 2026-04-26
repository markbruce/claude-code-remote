# CC-Remote 部署与使用说明

本文档面向生产部署与交付，包含：Docker 部署（Server + Web）、Agent 命令行工具安装、以及端到端使用流程。

---

## 一、Docker 部署（Server + Web）

服务端与 Web 前端打包为单一镜像，一次运行即可对外提供 API 与 Web 界面。

### 1.1 构建镜像

在仓库根目录执行（需已安装 Docker、Docker Compose）：

```bash
# 使用 docker compose 构建（推荐）
docker compose build

# 或使用 docker build 指定 Dockerfile
docker build -f packages/server/Dockerfile -t cc-remote:latest .
```

### 1.2 运行容器

```bash
# 前台运行（便于看日志）
docker compose up

# 后台运行
docker compose up -d

# 查看日志
docker compose logs -f
```

默认将宿主机端口 **3000** 映射到容器内 3000；Web 与 API 均通过 `http://<主机>:3000` 访问。

### 1.3 环境变量（生产必改）

通过环境变量或 `.env` 文件传入（docker compose 会读取当前目录 `.env`）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `JWT_SECRET` | JWT 签名密钥，**生产必须修改** | `change-me-in-production` |
| `JWT_EXPIRES_IN` | Token 有效期 | `7d` |
| `CORS_ORIGIN` | 允许的 Web 来源，不设则允许所有 | - |
| `PORT` | 容器内监听端口 | `3000` |
| `DATABASE_URL` | 数据库路径（容器内） | `file:/app/data/cc-remote.db` |
| `BOT_SERVICE_URL` | Bot 服务地址，Server 用于验证 bind token（Docker 部署时设为 `http://cc-remote-bot:3001`） | `http://localhost:3001` |

示例：使用自定义 JWT 并限制 CORS：

```bash
export JWT_SECRET=your-production-secret-key
export CORS_ORIGIN=https://your-domain.com
docker compose up -d
```

或在项目根目录创建 `.env`：

```env
JWT_SECRET=your-production-secret-key
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://your-domain.com
```

### 1.4 数据持久化

`docker-compose.yml` 中已配置 volume `cc-remote-data`，数据库文件保存在该 volume 中，容器删除后数据仍保留。查看 volume：

```bash
docker volume inspect cc-remote_cc-remote-data
```

### 1.5 健康检查

容器内提供 HTTP 健康检查：`GET http://localhost:3000/health`。编排或负载均衡可据此判断服务是否就绪。

---

## 二、Agent 命令行工具（cc-agent）

Agent 是在每台需要被远程控制的 PC 上运行的守护进程，需单独安装并配置。

### 2.1 从源码构建并全局使用（推荐交付方式）

在仓库根目录：

```bash
# 安装依赖（若未安装）
pnpm install

# 仅构建 Agent（会先构建 shared）
pnpm run build:agent

# 方式 A：直接使用（无需全局安装）
node packages/agent/dist/index.js --help
node packages/agent/dist/index.js bind -t <JWT_TOKEN> -n "我的PC"
node packages/agent/dist/index.js start -s http://your-server:3000

# 方式 B：链接到全局，使用 cc-agent 命令
cd packages/agent && pnpm link --global
cc-agent --help
cc-agent bind -t <JWT_TOKEN> -n "我的PC"
cc-agent start -s http://your-server:3000
```

### 2.2 打包为 tarball 分发

在仓库根目录：

```bash
pnpm run pack:agent
```

会在 `packages/agent/` 下生成 `cc-remote-agent-1.2.0.tgz`。

注意：该包依赖 workspace 内的 `@cc-remote/shared`，因此 **仅适合在拥有本仓库源码的环境**（如团队内网）安装使用。在无源码的机器上安装该 tgz 后运行会因缺少 shared 而报错，此类场景请使用下面两种方式之一。

**方式 A：发布到 npm（推荐）**

1. 在 `packages/agent/package.json` 和 `packages/shared/package.json` 中把 `version` 改成目标版本（如 `1.0.2`）。
2. 已登录 npm：`npm login`。
3. 在仓库根目录执行：
   ```bash
   pnpm run release:agent
   ```
   会先发布 `@cc-remote/shared`，再发布 `@cc-remote/agent`（pnpm 会自动把 `workspace:*` 换成实际版本）。  
   试跑不发布：`bash scripts/publish-agent-npm.sh --dry-run`。

**方式 B：打自包含 tgz（不经过 npm）**

在任意机器上都能 `npm install -g` 安装的单文件包：

```bash
pnpm run pack:agent-standalone
```

会在 `release/cc-remote-agent-standalone-<version>.tgz` 生成一个自包含 tgz，拷贝到目标机器后：

```bash
npm install -g /path/to/cc-remote-agent-standalone-1.0.0.tgz
cc-agent --help
```

在已有仓库或可访问 shared 的环境中，也可直接安装 pack:agent 生成的 tgz：

```bash
npm install -g /path/to/cc-remote-agent-1.0.0.tgz
cc-agent --help
```

### 2.3 Agent 命令一览

| 命令 | 说明 |
|------|------|
| `cc-agent bind` | 绑定本机到用户账户（需 JWT Token） |
| `cc-agent start` | 启动守护进程并连接服务器 |
| `cc-agent status` | 查看当前绑定与连接状态 |
| `cc-agent projects` | 扫描并列出本机 Claude Code 工程 |
| `cc-agent unbind` | 解除本机绑定 |
| `cc-agent install-service` | 生成系统服务配置（Linux systemd / macOS launchd），便于开机自启 |

常用选项：

- `bind -t <token>`：用户 JWT（可从 Web 登录后 Local Storage 获取）
- `bind -n "机器名"`：本机显示名称
- `bind -s http://server:3000` / `start -s http://server:3000`：服务器地址，默认 `http://localhost:3000`

### 2.4 Chat 模式所需环境

使用 Chat 模式时，Agent 所在机器需配置 Claude 相关环境（如 `ANTHROPIC_API_KEY`、Claude Code 等），详见项目 README 的「前置要求」。

---

## 三、端到端使用流程

1. **部署服务端**  
   使用 Docker 或源码方式启动 Server + Web，确保 `http://<服务器>:3000` 可访问，且 `/health` 返回正常。

2. **注册/登录**  
   浏览器打开 `http://<服务器>:3000`，注册账号并登录。

3. **获取 JWT**  
   登录后，在浏览器开发者工具 → Application → Local Storage 中复制 `token` 值，用于绑定 PC。

4. **在每台 PC 上安装并绑定 Agent**  
   - 在该 PC 上按「二、Agent 命令行工具」完成构建或安装。
   - 执行：`cc-agent bind -t <上一步的 token> -n "该机名称" -s http://<服务器>:3000`。
   - 执行：`cc-agent start -s http://<服务器>:3000`（或配置为系统服务开机自启）。

5. **使用 Web 工作空间**  
   刷新 Web 页面，在项目列表中看到已绑定的 PC 及扫描到的工程；选择工程进入工作空间，使用 Chat 与 Shell 进行远程开发。

---

## 四、与 README 的衔接

- **开发/调试**：参见仓库根目录 [README.md](README.md) 的「快速开始」「包管理器支持」「配置说明」。
- **生产部署**：以本文档（DEPLOY.md）为准；Docker 与 Agent 交付方式按上文操作即可。

若需对外提供 HTTPS，请在 Docker 前增加反向代理（如 Nginx、Caddy）并配置 TLS，同时将 `CORS_ORIGIN` 设为实际前端域名。

---

## 五、Bot 部署（Telegram / 飞书）

Bot 包（`packages/bot`）可同时运行 Telegram 和飞书 Bot，通过 WebSocket 长连接与 Server 通信。支持在同一进程中运行两个平台。

### 5.1 构建与启动

```bash
# 在仓库根目录
pnpm install
pnpm run build          # 或 pnpm --filter cc-remote-bot build

# 启动（根据环境变量自动启用对应平台）
node packages/bot/dist/index.js
```

也可全局链接后使用 `cc-bot` 命令：

```bash
cd packages/bot && pnpm link --global
cc-bot
```

### 5.2 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `SERVER_URL` | Server 地址（如 `http://your-server:3000`） | 是 |
| `PUBLIC_URL` | 面向用户的公网地址，用于生成 bind 链接（Docker 部署时必填） | Docker 部署时 |
| `BOT_PORT` | Bot HTTP 服务端口（默认 `3001`） | 否 |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token（通过 @BotFather 获取） | 启用 Telegram 时 |
| `FEISHU_APP_ID` | 飞书自建应用 App ID | 启用飞书时 |
| `FEISHU_APP_SECRET` | 飞书自建应用 App Secret | 启用飞书时 |
| `FEISHU_VERIFICATION_TOKEN` | 飞书事件订阅验证 Token | 否 |
| `FEISHU_ENCRYPT_KEY` | 飞书事件加密 Key | 否 |

只需配置对应平台的环境变量即可启用，无需 `--platform` 参数。两个平台可同时运行。

### 5.3 Telegram Bot 配置

1. 在 Telegram 中找到 @BotFather，创建新 Bot 并获取 Token
2. 设置 Bot 命令菜单：`/setcommands`，填入 `start`、`machines`、`projects`、`history`、`stop` 等
3. 设置环境变量 `TELEGRAM_BOT_TOKEN` 后启动 Bot
4. 在 Telegram 中给 Bot 发送 `/start` 开始账号绑定流程

### 5.4 飞书 Bot 配置

1. 在[飞书开发者后台](https://open.feishu.cn/app)创建自建应用
2. 在「事件订阅」中启用 WebSocket 模式（无需公网 URL）
3. 添加事件订阅：`im.message.receive_v1`（接收消息）、`card.action.trigger`（卡片按钮回调）
4. 在「权限管理」中开通：`im:message`、`im:message:send_as_bot`、`im:resource`
5. 发布应用版本，在飞书客户端搜索并添加 Bot
6. 设置环境变量 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 后启动 Bot

### 5.5 账号绑定流程

两个平台的绑定流程一致：

1. 用户在 Bot 中发送 `/start`
2. Bot 生成绑定链接（Telegram 深度链接 / 飞书网页链接）
3. 用户在浏览器中打开链接并登录 CC-Remote 账号
4. 绑定成功后即可通过 Bot 与 Claude Code 对话

### 5.6 已知限制

- **飞书**：WebSocket 消息投递在某些环境下不稳定，可能出现收不到消息的情况
- **飞书**：互动卡片按钮可能需要多次点击才能触发
- **飞书**：流式文本编辑使用 `im.message.update` 接口，每条消息最多编辑 20 次，长回复可能触达上限
