#!/bin/bash
#
# Claude Code Remote - 状态查看脚本
#
# 用法:
#   ./status.sh
#

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

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}           Claude Code Remote - 状态信息${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# 项目信息
echo -e "${YELLOW}📁 项目信息${NC}"
echo "   目录: $PROJECT_DIR"

if [ -d "$PROJECT_DIR/.git" ]; then
    VERSION=$(cd "$PROJECT_DIR" && git describe --tags 2>/dev/null || git rev-parse --short HEAD)
    BRANCH=$(cd "$PROJECT_DIR" && git rev-parse --abbrev-ref HEAD)
    echo "   版本: $VERSION"
    echo "   分支: $BRANCH"
fi
echo ""

# Agent状态
echo -e "${YELLOW}🔄 Agent状态${NC}"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        echo -e "   状态: ${GREEN}运行中${NC}"
        echo "   PID: $PID"

        # 显示运行时间
        UPTIME=$(ps -o etime= -p $PID 2>/dev/null | tr -d ' ')
        echo "   运行时间: $UPTIME"
    else
        echo -e "   状态: ${RED}已停止${NC} (PID文件存在但进程不存在)"
    fi
else
    # 尝试查找进程
    AGENT_PID=$(pgrep -f "cc-remote.*agent" | head -1)
    if [ -n "$AGENT_PID" ]; then
        echo -e "   状态: ${YELLOW}运行中${NC} (无PID文件，可能是前台模式)"
        echo "   PID: $AGENT_PID"
    else
        echo -e "   状态: ${RED}未运行${NC}"
    fi
fi
echo ""

# 配置信息
echo -e "${YELLOW}⚙️  配置信息${NC}"
CONFIG_FILE="$PROJECT_DIR/.agent-config"

if [ -f "$CONFIG_FILE" ]; then
    echo -e "   绑定状态: ${GREEN}已绑定${NC}"
    # 不显示敏感信息
    if grep -q "serverUrl" "$CONFIG_FILE" 2>/dev/null; then
        SERVER_URL=$(grep "serverUrl" "$CONFIG_FILE" | cut -d'=' -f2)
        echo "   服务器: $SERVER_URL"
    fi
else
    echo -e "   绑定状态: ${YELLOW}未绑定${NC}"
    echo "   请运行: pnpm agent:bind --token <Token>"
fi
echo ""

# 日志
echo -e "${YELLOW}📋 最近日志${NC}"
LOG_FILE="$PROJECT_DIR/logs/agent.log"

if [ -f "$LOG_FILE" ]; then
    echo "   $(tail -5 "$LOG_FILE" | sed 's/^/   /')"
else
    echo "   暂无日志"
fi
echo ""

# 系统信息
echo -e "${YELLOW}💻 系统信息${NC}"
echo "   OS: $(uname -s) $(uname -m)"

if command -v node &> /dev/null; then
    echo "   Node.js: $(node -v)"
fi

if command -v pnpm &> /dev/null; then
    echo "   pnpm: $(pnpm -v)"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
