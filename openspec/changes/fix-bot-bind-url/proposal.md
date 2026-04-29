## Why

Bot 在 Docker 部署中生成 bind 链接时使用了容器内部地址（`http://cc-remote-server:3000`），用户浏览器无法访问。同时 Server 容器回调 Bot 容器时使用 `localhost:3001`，导致 token 验证失败（"bot 不可达"）。这两个问题导致 Telegram/飞书账号绑定流程在 Docker 部署下完全不可用。

## What Changes

- Bot 端新增 `PUBLIC_URL` 环境变量，用于生成面向用户的 bind 链接（区别于内部通信的 `SERVER_URL`）
- `telegram/handlers.ts` 和 `feishu/handlers.ts` 的 bind 链接改用 `publicUrl`
- `docker-compose.yml` 和 `docker-compose-nas.yml` 中 Server 服务新增 `BOT_SERVICE_URL` 环境变量
- `docker-compose.yml` 和 `docker-compose-nas.yml` 中 Bot 服务新增 `PUBLIC_URL` 环境变量
- `packages/bot/src/config.ts` 新增 `publicUrl` 配置项

## Capabilities

### New Capabilities
- `bot-public-url`: Bot 配置独立的公网 URL，用于生成用户可访问的 bind 链接

### Modified Capabilities

## Impact

- `packages/bot/src/config.ts` — 新增 `publicUrl` 字段
- `packages/bot/src/telegram/handlers.ts` — bind URL 使用 `publicUrl`
- `packages/bot/src/feishu/handlers.ts` — bind URL 使用 `publicUrl`
- `docker-compose.yml` — Server 加 `BOT_SERVICE_URL`，Bot 加 `PUBLIC_URL`
- `docker-compose-nas.yml` — 同上
- `DEPLOY.md` — 更新部署文档说明新增环境变量
