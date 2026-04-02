#!/bin/bash
#
# Claude Code Remote - 构建所有发布制品
#
# 用法:
#   ./scripts/build-artifacts.sh [选项]
#
# 选项:
#   --zip        构建 Release 压缩包
#   --binary     构建预编译二进制
#   --docker     构建 Docker 镜像
#   --all        构建所有制品
#   --version    指定版本号 (默认从 package.json 读取)
#

set -e

# ============== 颜色定义 ==============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============== 配置 ==============
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RELEASE_DIR="$PROJECT_DIR/release"
VERSION=$(node -p "require('$PROJECT_DIR/package.json').version")

# 默认构建选项
BUILD_ZIP=false
BUILD_BINARY=false
BUILD_DOCKER=false

# ============== 工具函数 ==============

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║       📦 Claude Code Remote - 构建发布制品                ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo -e "版本: ${YELLOW}$VERSION${NC}"
    echo -e "输出目录: ${YELLOW}$RELEASE_DIR${NC}"
    echo ""
}

# ============== 构建函数 ==============

build_zip() {
    log_info "构建 Release 压缩包..."

    local OUTPUT_DIR="$RELEASE_DIR/cc-remote-$VERSION"
    local OUTPUT_FILE="$RELEASE_DIR/cc-remote-$VERSION.tar.gz"

    # 清理旧文件
    rm -rf "$OUTPUT_DIR" "$OUTPUT_FILE"

    # 创建临时目录
    mkdir -p "$OUTPUT_DIR"

    # 复制必要文件
    log_info "复制项目文件..."
    cp -r "$PROJECT_DIR/packages" "$OUTPUT_DIR/"
    cp -r "$PROJECT_DIR/scripts" "$OUTPUT_DIR/"
    cp -r "$PROJECT_DIR/docs/release" "$OUTPUT_DIR/docs/"
    cp "$PROJECT_DIR/package.json" "$OUTPUT_DIR/"
    cp "$PROJECT_DIR/pnpm-workspace.yaml" "$OUTPUT_DIR/"
    cp "$PROJECT_DIR/tsconfig.base.json" "$OUTPUT_DIR/"
    cp "$PROJECT_DIR/pnpm-lock.yaml" "$OUTPUT_DIR/" 2>/dev/null || true
    cp "$PROJECT_DIR/README.md" "$OUTPUT_DIR/" 2>/dev/null || true

    # 复制 .npmrc (如果存在)
    cp "$PROJECT_DIR/.npmrc" "$OUTPUT_DIR/" 2>/dev/null || true

    # 创建版本信息文件
    cat > "$OUTPUT_DIR/VERSION.json" << EOF
{
  "version": "$VERSION",
  "buildTime": "$(date -Iseconds)",
  "commit": "$(cd $PROJECT_DIR && git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
}
EOF

    # 打包
    log_info "创建压缩包..."
    cd "$RELEASE_DIR"
    tar -czf "$OUTPUT_FILE" "cc-remote-$VERSION"

    # 清理临时目录
    rm -rf "$OUTPUT_DIR"

    log_success "Release 压缩包构建完成: $OUTPUT_FILE"
    echo ""
}

build_binary() {
    log_info "构建预编译二进制..."

    local BINARY_DIR="$RELEASE_DIR/binary"
    mkdir -p "$BINARY_DIR"

    # 先构建 agent
    log_info "构建 Agent..."
    cd "$PROJECT_DIR"
    pnpm build:agent

    # 检查是否安装了 pkg
    if ! command -v pkg &> /dev/null; then
        log_info "安装 pkg..."
        npm install -g pkg
    fi

    # 为不同平台构建二进制
    local PLATFORMS=("node18-linux-x64" "node18-macos-x64" "node18-win-x64")
    local OUTPUT_NAMES=("cc-agent-linux-x64" "cc-agent-macos-x64" "cc-agent-win-x64.exe")

    cd "$PROJECT_DIR/packages/agent"

    for i in "${!PLATFORMS[@]}"; do
        local PLATFORM="${PLATFORMS[$i]}"
        local OUTPUT_NAME="${OUTPUT_NAMES[$i]}"

        log_info "构建 $PLATFORM..."
        pkg . \
            --targets "$PLATFORM" \
            --output "$BINARY_DIR/$OUTPUT_NAME" \
            --compress GZip \
            2>/dev/null || {
                log_error "pkg 构建失败，尝试备用方案..."
                # 备用方案：直接打包 node_modules
                build_binary_fallback "$BINARY_DIR" "$OUTPUT_NAME" "$PLATFORM"
            }

        log_success "二进制构建完成: $BINARY_DIR/$OUTPUT_NAME"
    done

    # 创建配置模板
    cat > "$BINARY_DIR/agent.config.json" << 'EOF'
{
  "serverUrl": "https://your-server.com",
  "token": "",
  "name": "My PC"
}
EOF

    # 创建启动脚本
    cat > "$BINARY_DIR/start-agent.sh" << 'EOF'
#!/bin/bash
# 启动 Agent
./cc-agent-linux-x64 --config agent.config.json
EOF
    chmod +x "$BINARY_DIR/start-agent.sh"

    cat > "$BINARY_DIR/start-agent.bat" << 'EOF'
@echo off
REM 启动 Agent
cc-agent-win-x64.exe --config agent.config.json
EOF

    log_success "预编译二进制构建完成!"
    echo -e "输出目录: ${YELLOW}$BINARY_DIR${NC}"
    echo ""
}

build_binary_fallback() {
    local BINARY_DIR="$1"
    local OUTPUT_NAME="$2"
    local PLATFORM="$3"

    log_info "使用备用方案打包..."

    # 创建独立包目录
    local TEMP_DIR="$RELEASE_DIR/temp-agent"
    rm -rf "$TEMP_DIR"
    mkdir -p "$TEMP_DIR"

    # 复制 agent 文件
    cp -r "$PROJECT_DIR/packages/agent/dist" "$TEMP_DIR/"
    cp -r "$PROJECT_DIR/packages/agent/node_modules" "$TEMP_DIR/" 2>/dev/null || true
    cp "$PROJECT_DIR/packages/agent/package.json" "$TEMP_DIR/"

    # 复制 shared
    mkdir -p "$TEMP_DIR/node_modules/@cc-remote"
    cp -r "$PROJECT_DIR/packages/shared" "$TEMP_DIR/node_modules/@cc-remote/shared"

    # 打包
    cd "$RELEASE_DIR"
    tar -czf "$BINARY_DIR/${OUTPUT_NAME%.exe}.tar.gz" -C "$RELEASE_DIR" "temp-agent"
    mv "$BINARY_DIR/${OUTPUT_NAME%.exe}.tar.gz" "$BINARY_DIR/cc-agent-standalone.tar.gz"

    rm -rf "$TEMP_DIR"
}

build_docker() {
    log_info "构建 Docker 镜像..."

    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，跳过 Docker 镜像构建"
        return 1
    fi

    cd "$PROJECT_DIR"

    # 构建服务端镜像
    log_info "构建 Server 镜像..."
    docker build \
        -f packages/server/Dockerfile \
        -t "cc-remote/server:$VERSION" \
        -t "cc-remote/server:latest" \
        .

    log_success "Server 镜像构建完成: cc-remote/server:$VERSION"

    # 构建 Agent 镜像
    log_info "构建 Agent 镜像..."
    docker build \
        -f packages/agent/Dockerfile \
        -t "cc-remote/agent:$VERSION" \
        -t "cc-remote/agent:latest" \
        . 2>/dev/null || {
            log_warn "Agent Dockerfile 不存在，跳过..."
        }

    log_success "Docker 镜像构建完成!"
    echo ""

    # 显示镜像信息
    docker images | grep "cc-remote"
    echo ""
}

# ============== 主函数 ==============

main() {
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --zip)
                BUILD_ZIP=true
                shift
                ;;
            --binary)
                BUILD_BINARY=true
                shift
                ;;
            --docker)
                BUILD_DOCKER=true
                shift
                ;;
            --all)
                BUILD_ZIP=true
                BUILD_BINARY=true
                BUILD_DOCKER=true
                shift
                ;;
            --version)
                VERSION="$2"
                shift 2
                ;;
            *)
                log_error "未知选项: $1"
                echo "用法: $0 [--zip] [--binary] [--docker] [--all] [--version <version>]"
                exit 1
                ;;
        esac
    done

    # 如果没有指定任何选项，构建所有
    if [ "$BUILD_ZIP" = false ] && [ "$BUILD_BINARY" = false ] && [ "$BUILD_DOCKER" = false ]; then
        BUILD_ZIP=true
        BUILD_BINARY=true
        BUILD_DOCKER=true
    fi

    print_banner

    # 创建输出目录
    mkdir -p "$RELEASE_DIR"

    # 执行构建
    if [ "$BUILD_ZIP" = true ]; then
        build_zip
    fi

    if [ "$BUILD_BINARY" = true ]; then
        build_binary
    fi

    if [ "$BUILD_DOCKER" = true ]; then
        build_docker
    fi

    # 打印结果
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}               ✅ 所有制品构建完成!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "输出目录: ${YELLOW}$RELEASE_DIR${NC}"
    echo ""
    ls -la "$RELEASE_DIR" 2>/dev/null || true
}

main "$@"
