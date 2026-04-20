# CC-Remote Bot Dockerfile
# Multi-stage build for Telegram + Feishu bot service

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

ARG PNPM_VERSION=9.15.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN apk add --no-cache python3 make g++ libc-dev

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/bot/package.json ./packages/bot/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/bot ./packages/bot
COPY tsconfig.base.json ./

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build bot
WORKDIR /app/packages/bot
RUN pnpm build

# Stage 2: Production
FROM node:20-bookworm-slim AS production

WORKDIR /app

ARG PNPM_VERSION=9.15.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy workspace config
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./

# Copy shared package
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy bot package
COPY --from=builder /app/packages/bot/package.json ./packages/bot/
COPY --from=builder /app/packages/bot/dist ./packages/bot/dist

# Copy node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/bot/node_modules ./packages/bot/node_modules

WORKDIR /app/packages/bot

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
