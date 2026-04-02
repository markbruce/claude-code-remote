#!/bin/bash
#
# Claude Code Remote - 快速打包脚本
# 生成可直接分发的独立包（无需Node.js环境）
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RELEASE_DIR="$PROJECT_DIR/release"
VERSION=$(node -p "require('$PROJECT_DIR/package.json').version")

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

package_agent_standalone() {
    local OUTPUT_DIR="$RELEASE_DIR/cc-agent-$VERSION"
    local OUTPUT_FILE="$RELEASE_DIR/cc-agent-$VERSION-standalone.tar.gz"

    log_info "打包 Agent 独立包..."

    rm -rf "$OUTPUT_DIR" "$OUTPUT_FILE"
    mkdir -p "$OUTPUT_DIR"

    # 先构建
    cd "$PROJECT_DIR"
    log_info "构建项目..."
    pnpm build:agent

    # 复制 agent 文件
    mkdir -p "$OUTPUT_DIR/agent"
    cp -r "$PROJECT_DIR/packages/agent/dist" "$OUTPUT_DIR/agent/"
    cp "$PROJECT_DIR/packages/agent/package.json" "$OUTPUT_DIR/agent/"

    # 复制 shared 包到正确位置
    mkdir -p "$OUTPUT_DIR/agent/node_modules/@cc-remote"
    cp -r "$PROJECT_DIR/packages/shared" "$OUTPUT_DIR/agent/node_modules/@cc-remote/shared"

    # 安装生产依赖
    cd "$OUTPUT_DIR/agent"
    log_info "安装生产依赖..."
    pnpm install --prod --ignore-scripts 2>/dev/null || npm install --production --ignore-scripts 2>/dev/null || true

    # 创建启动脚本
    cat > "$OUTPUT_DIR/start.sh" << 'EOF'
#!/bin/bash
# Claude Code Remote Agent 启动脚本

cd "$(dirname "$0")/agent"

if [ -z "$1" ]; then
    echo "用法: ./start.sh <Token> [服务器地址]"
    echo ""
    echo "示例:"
    echo "  ./start.sh eyJhbGciOiJIUzI1NiIs..."
    echo "  ./start.sh eyJhbGciOiJIUzI1NiIs... https://server.example.com"
    exit 1
fi

TOKEN="$1"
SERVER="${2:-https://your-server.com}"

echo "🚀 启动 Claude Code Remote Agent..."
echo "   服务器: $SERVER"

node dist/index.js --token "$TOKEN" --server "$SERVER"
EOF
    chmod +x "$OUTPUT_DIR/start.sh"

    # Windows 启动脚本
    cat > "$OUTPUT_DIR/start.bat" << 'EOF'
@echo off
REM Claude Code Remote Agent 启动脚本

cd /d "%~dp0agent"

if "%~1"=="" (
    echo 用法: start.bat ^<Token^> [服务器地址]
    echo.
    echo 示例:
    echo   start.bat eyJhbGciOiJIUzI1NiIs...
    echo   start.bat eyJhbGciOiJIUzI1NiIs... https://server.example.com
    exit /b 1
)

set TOKEN=%~1
set SERVER=%~2
if "%SERVER%"=="" set SERVER=https://your-server.com

echo 🚀 启动 Claude Code Remote Agent...
echo    服务器: %SERVER%

node dist/index.js --token "%TOKEN%" --server "%SERVER%"
EOF

    # 创建使用说明
    cat > "$OUTPUT_DIR/README.md" << 'EOF'
# Claude Code Remote Agent - 独立包

## 前置要求

- Node.js 18+ (仅首次运行需要安装，之后可以打包成二进制)

## 快速开始

### Linux/macOS

```bash
# 解压
tar -xzf cc-agent-*-standalone.tar.gz
cd cc-agent-*

# 启动
./start.sh <你的Token> <服务器地址>
```

### Windows

```cmd
# 解压
# 双击 start.bat 或在命令行中运行:
start.bat <你的Token> <服务器地址>
```

## 配置

环境变量:
- `SERVER_URL` - 服务器地址
- `TOKEN` - JWT Token

## 获取Token

联系管理员获取你的 JWT Token。

## 问题反馈

遇到问题请联系管理员或在群里反馈。
EOF

    # 打包
    log_info "创建压缩包..."
    cd "$RELEASE_DIR"
    tar -czf "$OUTPUT_FILE" "cc-agent-$VERSION"

    # 清理
    rm -rf "$OUTPUT_DIR"

    log_success "Agent 独立包创建完成: $OUTPUT_FILE"
    ls -lh "$OUTPUT_FILE"
}

# 主流程
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}       📦 打包 Agent 独立包${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

mkdir -p "$RELEASE_DIR"
package_agent_standalone
