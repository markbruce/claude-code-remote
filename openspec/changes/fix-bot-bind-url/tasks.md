## 1. Bot Config

- [x] 1.1 在 `packages/bot/src/config.ts` 的 `BotConfig` 接口中新增 `publicUrl: string` 字段
- [x] 1.2 在 `loadConfig` 函数中读取 `PUBLIC_URL` 环境变量，fallback 到 `serverUrl`

## 2. Bind Link 生成

- [x] 2.1 修改 `packages/bot/src/telegram/handlers.ts`，bind 链接从 `bridge.config.serverUrl` 改为 `bridge.config.publicUrl`
- [x] 2.2 修改 `packages/bot/src/feishu/handlers.ts`，bind 链接从 `bridge.config.serverUrl` 改为 `bridge.config.publicUrl`

## 3. Docker Compose 配置

- [x] 3.1 更新 `docker-compose.yml`，Server 服务新增 `BOT_SERVICE_URL: http://cc-remote-bot:3001`
- [x] 3.2 更新 `docker-compose.yml`，Bot 服务新增 `PUBLIC_URL` 环境变量（占位值）
- [x] 3.3 更新 `docker-compose-nas.yml`，Server 服务新增 `BOT_SERVICE_URL: http://cc-remote-bot:3001`
- [x] 3.4 更新 `docker-compose-nas.yml`，Bot 服务新增 `PUBLIC_URL` 为实际公网地址

## 4. 文档

- [x] 4.1 更新 `DEPLOY.md` Bot 部署章节，说明 `PUBLIC_URL` 和 `BOT_SERVICE_URL` 环境变量的用途和配置方式
