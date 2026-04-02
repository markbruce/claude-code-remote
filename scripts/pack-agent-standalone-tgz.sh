#!/usr/bin/env bash
#
# 打一个「自包含」的 agent tgz，可在任意机器上 npm install -g xxx.tgz 使用（不依赖本仓库）
# 做法：构建后复制 shared 到 agent/node_modules，再 npm pack，得到单文件安装包。
#
# 使用：
#   ./scripts/pack-agent-standalone-tgz.sh
# 输出：
#   release/cc-remote-agent-standalone-<version>.tgz
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RELEASE_DIR="$PROJECT_DIR/release"
AGENT_DIR="$PROJECT_DIR/packages/agent"
SHARED_DIR="$PROJECT_DIR/packages/shared"
VERSION=$(node -p "require('$AGENT_DIR/package.json').version")

echo "==> 构建 shared + agent"
cd "$PROJECT_DIR"
pnpm run build:agent

echo "==> 准备临时目录（带 shared 的 agent）"
STAGING="$RELEASE_DIR/agent-publish-staging"
rm -rf "$STAGING"
mkdir -p "$STAGING"

# 先复制 agent 的 dist 和 package.json
cp -r "$AGENT_DIR/dist" "$STAGING/"
# 修改 package.json，把 workspace:* 替换为实际版本
node -e "
var p=require('$AGENT_DIR/package.json');
if (p.dependencies && p.dependencies['cc-remote-shared'] === 'workspace:*') {
  p.dependencies['cc-remote-shared'] = '1.0.0';
}
require('fs').writeFileSync('$STAGING/package.json', JSON.stringify(p,null,2));
"

# 复制 shared 到 node_modules
mkdir -p "$STAGING/node_modules"
cp -r "$SHARED_DIR" "$STAGING/node_modules/cc-remote-shared"
# 只保留必要文件
rm -rf "$STAGING/node_modules/cc-remote-shared/src"
rm -rf "$STAGING/node_modules/cc-remote-shared/tests"
rm -rf "$STAGING/node_modules/cc-remote-shared/node_modules"
rm -rf "$STAGING/node_modules/cc-remote-shared/.turbo"

# 安装其他依赖（不重新安装 shared）
cd "$STAGING"
npm install --omit=dev --ignore-scripts --no-workspaces --legacy-peer-deps

# 打成一个 tgz（包含已安装的 shared，可直接 npm install -g 使用）
mkdir -p "$RELEASE_DIR"
OUTPUT="$RELEASE_DIR/cc-remote-agent-standalone-$VERSION.tgz"
cd "$STAGING"
npm pack
mv cc-remote-agent-*.tgz "$OUTPUT"

# 清理
rm -rf "$STAGING"

echo "==> 完成: $OUTPUT"
ls -la "$OUTPUT"
