## Context

Bot 在 Docker 部署中存在两类 URL 混用问题：

1. **Bind 链接 URL**：Bot 生成给用户点击的绑定链接（`/bind-telegram?token=...`），当前使用 `SERVER_URL`（容器内部地址如 `http://cc-remote-server:3000`），用户浏览器无法访问。
2. **Server → Bot 回调 URL**：Server 验证 bind token 时需调用 Bot 的 `/api/bind/verify`，当前使用 `BOT_SERVICE_URL`（默认 `http://localhost:3001`），Docker 网络下 Server 容器访问不到 Bot 容器的 localhost。

现有代码中 `BOT_SERVICE_URL` 在 Server 端已存在（`auth.routes.ts:262`），只需配置环境变量。Bot 端缺少独立的公网 URL 配置。

## Goals / Non-Goals

**Goals:**
- Bot 生成的 bind 链接使用用户浏览器可达的公网地址
- Server 能通过容器网络回调 Bot 进行 token 验证
- 非 Docker 部署（本地开发）零配置可用，保持向后兼容

**Non-Goals:**
- 不改变 bind 流程本身的逻辑（token 生成、验证、回调机制不变）
- 不处理 HTTPS/TLS 配置（由反向代理负责）

## Decisions

**1. 新增 `PUBLIC_URL` 环境变量（而非复用 `SERVER_URL`）**

`SERVER_URL` 是容器内部通信地址（如 `http://cc-remote-server:3000`），与公网地址（如 `https://cc_remote.wxp.zhangxiaoning.me:2455`）完全不同。混用任一值都会导致另一场景失败。

Fallback 策略：`PUBLIC_URL` 未设置时回退到 `SERVER_URL`，保证本地开发零配置。

**2. Server 端 `BOT_SERVICE_URL` 仅需配置，不改代码**

`auth.routes.ts` 已有 `process.env.BOT_SERVICE_URL || 'http://localhost:3001'`，只需在 docker-compose 中设为 `http://cc-remote-bot:3001`。

**3. 配置集中在 `config.ts`，handlers 只引用 `bridge.config.publicUrl`**

保持与现有 `serverUrl` 相同的模式，所有 URL 解析在 config 层完成。

## Risks / Trade-offs

- [用户未设 `PUBLIC_URL`] → Fallback 到 `SERVER_URL`，Docker 部署下 bind 链接仍不可用，但不会报错 → 在 Bot 启动日志中检测并警告
- [Server 未设 `BOT_SERVICE_URL`] → Fallback 到 `localhost:3001`，Docker 下 token 验证失败 → 在 DEPLOY.md 中明确标注为必填项
