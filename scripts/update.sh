#!/bin/bash
#
# Claude Code Remote - 更新脚本
#
# 用法:
#   ./update.sh [--restart]
#
# 选项:
#   --restart    更新后自动重启
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 默认值
AUTO_RESTART=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --restart|-r)
            AUTO_RESTART=true
            shift
            ;;
        *)
            echo "未知选项: $1"
            exit 1
            ;;
    esac
done

# 查找项目目录
find_project_dir() {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_dir="$(dirname "$script_dir")"

    if [ -f "$project_dir/package.json" ]; then
        echo "$project_dir"
    else
        echo "$HOME/cc-remote"
    fi
}

PROJECT_DIR=$(find_project_dir)
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}[ERROR]${NC} 项目目录不存在: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

echo -e "${BLUE}[INFO]${NC} 更新 Claude Code Remote..."
echo -e "${BLUE}[INFO]${NC} 项目目录: $PROJECT_DIR"

# 检查是否有未提交的更改
if ! git diff --quiet 2>/dev/null; then
    echo -e "${YELLOW}[WARN]${NC} 检测到本地修改:"
    git status --short
    echo ""
    read -p "是否继续更新? (本地修改将被丢弃) (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}[INFO]${NC} 更新已取消"
        exit 0
    fi
fi

# 停止Agent（如果正在运行）
if [ -f ".agent.pid" ]; then
    echo -e "${BLUE}[INFO]${NC} 停止正在运行的Agent..."
    "$SCRIPTS_DIR/stop.sh"
fi

# 获取当前版本
CURRENT_VERSION=$(git describe --tags 2>/dev/null || echo "unknown")
echo -e "${BLUE}[INFO]${NC} 当前版本: $CURRENT_VERSION"

# 拉取最新代码
echo -e "${BLUE}[INFO]${NC} 拉取最新代码..."
git fetch origin
git reset --hard origin/$(git rev-parse --abbrev-ref HEAD)

# 更新依赖
echo -e "${BLUE}[INFO]${NC} 更新依赖..."
pnpm install

# 重新构建
echo -e "${BLUE}[INFO]${NC} 重新构建..."
pnpm build

# 获取新版本
NEW_VERSION=$(git describe --tags 2>/dev/null || echo "unknown")
echo -e "${GREEN}[SUCCESS]${NC} 更新完成!"
echo -e "${GREEN}[SUCCESS]${NC} 新版本: $NEW_VERSION"

# 自动重启
if [ "$AUTO_RESTART" = true ]; then
    echo -e "${BLUE}[INFO]${NC} 自动重启Agent..."
    "$SCRIPTS_DIR/start.sh" --daemon
fi

echo ""
echo -e "手动启动: ${YELLOW}$SCRIPTS_DIR/start.sh${NC}"
