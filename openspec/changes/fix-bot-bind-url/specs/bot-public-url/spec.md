## ADDED Requirements

### Requirement: Bot config supports independent public URL
Bot 的 `BotConfig` 接口 SHALL 包含 `publicUrl` 字段，用于生成面向用户的 bind 链接。`publicUrl` 优先读取 `PUBLIC_URL` 环境变量，未设置时回退到 `serverUrl`。

#### Scenario: PUBLIC_URL 环境变量已设置
- **WHEN** 环境变量 `PUBLIC_URL` 为 `https://example.com:2455`
- **THEN** `bridge.config.publicUrl` 为 `https://example.com:2455`

#### Scenario: PUBLIC_URL 环境变量未设置
- **WHEN** 环境变量 `PUBLIC_URL` 未设置，`SERVER_URL` 为 `http://cc-remote-server:3000`
- **THEN** `bridge.config.publicUrl` 为 `http://cc-remote-server:3000`

### Requirement: Telegram bind link uses publicUrl
Telegram `/start` 命令生成的 bind 链接 SHALL 使用 `bridge.config.publicUrl` 作为 base URL。

#### Scenario: Telegram bind link generation
- **WHEN** 用户发送 `/start` 给 Telegram Bot
- **THEN** Bot 生成的链接格式为 `${publicUrl}/bind-telegram?token=...&platform_user_id=...&chat_id=...`

### Requirement: Feishu bind link uses publicUrl
飞书 bind 链接 SHALL 使用 `bridge.config.publicUrl` 作为 base URL。

#### Scenario: Feishu bind link generation
- **WHEN** 飞书用户触发 bind 流程
- **THEN** Bot 生成的链接格式为 `${publicUrl}/bind-feishu?token=...&platform_user_id=...&chat_id=...`

### Requirement: Server reads BOT_SERVICE_URL for bind verification
Server 的 bind-telegram 和 bind-feishu 路由 SHALL 从 `BOT_SERVICE_URL` 环境变量读取 Bot 服务地址，用于 token 验证和回调。

#### Scenario: BOT_SERVICE_URL configured for Docker
- **WHEN** `BOT_SERVICE_URL` 为 `http://cc-remote-bot:3001`
- **THEN** Server 调用 `http://cc-remote-bot:3001/api/bind/verify?token=...` 进行验证

### Requirement: docker-compose includes PUBLIC_URL and BOT_SERVICE_URL
`docker-compose.yml` 和部署文档中的示例 SHALL 包含 `PUBLIC_URL`（Bot 服务）和 `BOT_SERVICE_URL`（Server 服务）环境变量配置。

#### Scenario: docker-compose configuration
- **WHEN** 使用 docker-compose 部署
- **THEN** Bot 服务的环境变量包含 `PUBLIC_URL`，Server 服务的环境变量包含 `BOT_SERVICE_URL`
