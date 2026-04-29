# CC-Remote Bot Dockerfile
# 多阶段构建，支持 Telegram + 飞书 Bot

# 阶段1: 构建
FROM node:20-alpine AS builder

WORKDIR /app

ARG PNPM_VERSION=9.15.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN apk add --no-cache python3 make g++ libc-dev

# 复制 workspace 配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/bot/package.json ./packages/bot/

# 安装依赖
RUN pnpm install --frozen-lockfile || pnpm install

# 复制源代码
COPY packages/shared ./packages/shared
COPY packages/bot ./packages/bot
COPY tsconfig.base.json ./

# 构建 shared
WORKDIR /app/packages/shared
RUN pnpm build

# 构建 bot
WORKDIR /app/packages/bot
RUN pnpm build

# 阶段2: 生产镜像 (Alpine，与 builder 阶段一致，兼容 musl 原生模块)
FROM node:20-alpine AS production

WORKDIR /app

ARG PNPM_VERSION=9.15.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# 复制 workspace 配置
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./

# 复制 shared 包
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# 复制 bot 包
COPY --from=builder /app/packages/bot/package.json ./packages/bot/
COPY --from=builder /app/packages/bot/dist ./packages/bot/dist

# 复制 node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/bot/node_modules ./packages/bot/node_modules

WORKDIR /app/packages/bot

# 创建数据目录
RUN mkdir -p /app/data

# 环境变量 (运行时通过 docker-compose / env file 覆盖)
ENV NODE_ENV=production
ENV SERVER_URL=http://cc-remote:3000
ENV BOT_PORT=3001

EXPOSE 3001

# 代理支持: 设置 GLOBAL_AGENT_HTTP_PROXY 或 HTTPS_PROXY 即可
ENV GLOBAL_AGENT_HTTP_PROXY=""

CMD ["node", "dist/index.js"]
