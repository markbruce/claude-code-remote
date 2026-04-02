# CC-Remote Agent Dockerfile
# 用于在容器中运行 Agent

# 阶段1: 构建
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖
RUN apk add --no-cache python3 make g++ git

# 安装 pnpm
ARG PNPM_VERSION=9.15.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# 复制 workspace 配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent/package.json ./packages/agent/
COPY packages/agent/scripts ./packages/agent/scripts

# 安装依赖
RUN pnpm install --frozen-lockfile || pnpm install

# 复制源代码
COPY packages/shared ./packages/shared
COPY packages/agent ./packages/agent
COPY tsconfig.base.json ./

# 构建
WORKDIR /app/packages/shared
RUN pnpm build

WORKDIR /app/packages/agent
RUN pnpm build

# 阶段2: 生产镜像
FROM node:20-bookworm-slim AS production

WORKDIR /app

# 安装必要工具
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# 安装 pnpm
ARG PNPM_VERSION=9.15.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# 复制构建产物
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/agent/package.json ./packages/agent/
COPY --from=builder /app/packages/agent/dist ./packages/agent/dist
COPY --from=builder /app/packages/agent/node_modules ./packages/agent/node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules

# 创建工作目录（用于存放项目）
RUN mkdir -p /workspace

WORKDIR /app/packages/agent

# 环境变量
ENV NODE_ENV=production
ENV SERVER_URL=http://localhost:3000

# 默认命令
CMD ["node", "dist/index.js", "--help"]
