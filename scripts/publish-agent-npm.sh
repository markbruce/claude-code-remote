#!/usr/bin/env bash
#
# 发布 cc-remote-agent 到 npm
# - 会先发布 @cc-remote/shared，再发布 @cc-remote/agent（pnpm 会把 workspace:* 替换成实际版本）
# - 发布前请确认 packages/agent/package.json 和 packages/shared/package.json 的 version 已更新
# - 需要已登录 npm：npm login
#
# 使用：
#   ./scripts/publish-agent-npm.sh           # 发布当前版本
#   ./scripts/publish-agent-npm.sh --dry-run # 仅打包不发布
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then DRY_RUN="--dry-run"; fi

cd "$PROJECT_DIR"

echo "==> 构建 shared + agent"
pnpm run build:agent

echo "==> 发布 @cc-remote/shared"
pnpm --filter @cc-remote/shared publish --access public $DRY_RUN

echo "==> 发布 @cc-remote/agent"
pnpm --filter @cc-remote/agent publish --access public $DRY_RUN

echo "==> 完成"
