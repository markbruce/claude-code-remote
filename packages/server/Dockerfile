# CC-Remote Server + Web Dockerfile
# 多阶段构建，包含服务端和前端静态文件

# 阶段1: 构建依赖和代码
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm 和构建工具
# 与根目录 package.json 的 packageManager 保持一致
ARG PNPM_VERSION=9.15.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN apk add --no-cache python3 make g++ libc-dev

# 复制 workspace 配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
COPY packages/agent/package.json ./packages/agent/
COPY packages/agent/scripts ./packages/agent/scripts

# 安装依赖
RUN pnpm install --frozen-lockfile || pnpm install

# 复制源代码（仅 server+web+shared，agent 仅保留 package.json 以满足 workspace）
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/web ./packages/web
COPY tsconfig.base.json ./

# 生成 Prisma Client (包含多个 binary targets)
WORKDIR /app/packages/server
RUN pnpm db:generate

# 构建共享包
WORKDIR /app/packages/shared
RUN pnpm build

# 构建服务端
WORKDIR /app/packages/server
RUN pnpm build

# 构建 Web 前端
WORKDIR /app/packages/web
RUN pnpm build

# 阶段2: 生产镜像 (使用 Debian + OpenSSL)
FROM node:20-bookworm-slim AS production

WORKDIR /app

# 安装 pnpm 和 OpenSSL
ARG PNPM_VERSION=9.15.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN apt-get update && apt-get install -y openssl libssl3 && rm -rf /var/lib/apt/lists/*

# 复制 workspace 配置
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./

# 复制 shared 包
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# 复制 server 包
COPY --from=builder /app/packages/server/package.json ./packages/server/
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/prisma ./packages/server/prisma
COPY --from=builder /app/packages/server/node_modules ./packages/server/node_modules

# 复制 web 静态文件
COPY --from=builder /app/packages/web/dist ./packages/server/web

# 复制 node_modules (workspace 依赖需要)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules

# 设置工作目录
WORKDIR /app/packages/server

# 创建数据目录
RUN mkdir -p /app/data

# 环境变量
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/cc-remote.db
ENV PORT=3000
ENV JWT_SECRET=change-me-in-production

# 暴露端口
EXPOSE 3000

# 启动命令 (先同步数据库schema，再启动服务)
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
