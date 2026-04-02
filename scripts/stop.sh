#!/bin/bash
#
# Claude Code Remote - 停止脚本
#
# 用法:
#   ./stop.sh
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
PID_FILE="$PROJECT_DIR/.agent.pid"

echo -e "${BLUE}[INFO]${NC} 停止 Claude Code Remote Agent..."

# 检查PID文件
if [ ! -f "$PID_FILE" ]; then
    echo -e "${YELLOW}[WARN]${NC} 未找到运行中的Agent (无PID文件)"

    # 尝试通过进程名查找
    AGENT_PID=$(pgrep -f "cc-remote.*agent" | head -1)

    if [ -n "$AGENT_PID" ]; then
        echo -e "${BLUE}[INFO]${NC} 发现Agent进程 (PID: $AGENT_PID)"
        kill $AGENT_PID 2>/dev/null || true
        echo -e "${GREEN}[SUCCESS]${NC} Agent已停止"
    else
        echo -e "${YELLOW}[WARN]${NC} 没有发现运行中的Agent"
    fi
    exit 0
fi

PID=$(cat "$PID_FILE")

# 检查进程是否存在
if ! ps -p $PID > /dev/null 2>&1; then
    echo -e "${YELLOW}[WARN]${NC} Agent进程不存在 (PID: $PID)"
    rm -f "$PID_FILE"
    exit 0
fi

# 停止进程
kill $PID 2>/dev/null || true

# 等待进程结束
for i in {1..10}; do
    if ! ps -p $PID > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# 强制杀死
if ps -p $PID > /dev/null 2>&1; then
    echo -e "${YELLOW}[WARN]${NC} 强制停止Agent..."
    kill -9 $PID 2>/dev/null || true
fi

rm -f "$PID_FILE"

echo -e "${GREEN}[SUCCESS]${NC} Agent已停止 (PID: $PID)"
