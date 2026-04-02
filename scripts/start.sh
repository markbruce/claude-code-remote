#!/bin/bash
#
# Claude Code Remote - 启动脚本
#
# 用法:
#   ./start.sh [选项]
#
# 选项:
#   --daemon    后台运行
#   --name      指定PC名称
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 默认值
DAEMON_MODE=false
PC_NAME=""

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --daemon|-d)
            DAEMON_MODE=true
            shift
            ;;
        --name|-n)
            PC_NAME="$2"
            shift 2
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

if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}[ERROR]${NC} 项目目录不存在: $PROJECT_DIR"
    echo "请先运行 install.sh 进行安装"
    exit 1
fi

cd "$PROJECT_DIR"

echo -e "${BLUE}[INFO]${NC} 启动 Claude Code Remote Agent..."
echo -e "${BLUE}[INFO]${NC} 项目目录: $PROJECT_DIR"

# 检查是否已绑定
if [ ! -f ".agent-config" ]; then
    echo -e "${YELLOW}[WARN]${NC} 尚未绑定Token"
    echo "请先运行: pnpm agent:bind --token <你的Token>"
    exit 1
fi

# 构建启动命令
CMD="pnpm agent:start"

if [ -n "$PC_NAME" ]; then
    CMD="$CMD --name $PC_NAME"
fi

if [ "$DAEMON_MODE" = true ]; then
    echo -e "${BLUE}[INFO]${NC} 后台模式启动..."
    nohup $CMD > logs/agent.log 2>&1 &
    echo $! > .agent.pid
    echo -e "${GREEN}[SUCCESS]${NC} Agent已在后台启动 (PID: $(cat .agent.pid))"
    echo -e "查看日志: ${YELLOW}tail -f logs/agent.log${NC}"
else
    echo -e "${BLUE}[INFO]${NC} 前台模式启动..."
    $CMD
fi
