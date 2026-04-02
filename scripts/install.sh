#!/bin/bash
#
# Claude Code Remote - 一键安装脚本
#
# 用法:
#   curl -fsSL https://your-server/cc-remote/scripts/install.sh | bash
#   或
#   ./install.sh
#

set -e

# ============== 颜色定义 ==============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============== 配置 ==============
REPO_URL="https://github.com/your-org/cc-remote.git"
INSTALL_DIR="$HOME/cc-remote"
NODE_MIN_VERSION=18
PNPM_MIN_VERSION=8

# ============== 工具函数 ==============

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║       🚀 Claude Code Remote - 安装向导                    ║"
    echo "║                                                           ║"
    echo "║       从任意设备远程控制PC上的Claude Code                  ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

detect_os() {
    case "$OSTYPE" in
        darwin*)  echo "macos" ;;
        linux*)   echo "linux" ;;
        msys*|cygwin*) echo "windows" ;;
        *)        echo "unknown" ;;
    esac
}

get_node_version() {
    if command -v node &> /dev/null; then
        node -v | cut -d'v' -f2 | cut -d'.' -f1
    else
        echo "0"
    fi
}

get_pnpm_version() {
    if command -v pnpm &> /dev/null; then
        pnpm -v | cut -d'.' -f1
    else
        echo "0"
    fi
}

# ============== 检查函数 ==============

check_node() {
    log_info "检查 Node.js..."

    local version=$(get_node_version)

    if [ "$version" -ge "$NODE_MIN_VERSION" ]; then
        log_success "Node.js $(node -v) 已安装"
        return 0
    fi

    log_warn "Node.js 版本过低或未安装"
    log_info "正在安装 Node.js..."

    # 根据系统选择安装方式
    case $(detect_os) in
        macos)
            if command -v brew &> /dev/null; then
                brew install node@18
            else
                log_error "请先安装 Homebrew: https://brew.sh"
                exit 1
            fi
            ;;
        linux)
            # 使用 nvm 安装
            if ! command -v nvm &> /dev/null; then
                curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
                export NVM_DIR="$HOME/.nvm"
                [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            fi
            nvm install 18
            nvm use 18
            ;;
        *)
            log_error "不支持的系统，请手动安装 Node.js 18+"
            exit 1
            ;;
    esac

    log_success "Node.js 安装完成"
}

check_pnpm() {
    log_info "检查 pnpm..."

    local version=$(get_pnpm_version)

    if [ "$version" -ge "$PNPM_MIN_VERSION" ]; then
        log_success "pnpm $(pnpm -v) 已安装"
        return 0
    fi

    log_info "正在安装 pnpm..."
    npm install -g pnpm

    log_success "pnpm 安装完成"
}

check_git() {
    log_info "检查 Git..."

    if command -v git &> /dev/null; then
        log_success "Git $(git --version | cut -d' ' -f3) 已安装"
        return 0
    fi

    log_error "Git 未安装，请先安装 Git"
    exit 1
}

# ============== 安装函数 ==============

download_project() {
    log_info "下载 Claude Code Remote..."

    if [ -d "$INSTALL_DIR" ]; then
        log_warn "安装目录已存在: $INSTALL_DIR"
        read -p "是否删除并重新安装? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
        else
            log_info "使用现有目录"
            cd "$INSTALL_DIR"
            return 0
        fi
    fi

    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    log_success "项目下载完成"
}

install_dependencies() {
    log_info "安装依赖..."

    cd "$INSTALL_DIR"
    pnpm install

    log_success "依赖安装完成"
}

build_project() {
    log_info "构建项目..."

    cd "$INSTALL_DIR"
    pnpm build

    log_success "项目构建完成"
}

print_next_steps() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║               ✅ 安装完成！                               ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "安装目录: ${YELLOW}$INSTALL_DIR${NC}"
    echo ""
    echo -e "下一步操作:"
    echo ""
    echo -e "  ${BLUE}1.${NC} 进入项目目录:"
    echo -e "     ${YELLOW}cd $INSTALL_DIR${NC}"
    echo ""
    echo -e "  ${BLUE}2.${NC} 绑定你的PC (需要JWT Token):"
    echo -e "     ${YELLOW}pnpm agent:bind --token <你的Token>${NC}"
    echo ""
    echo -e "  ${BLUE}3.${NC} 启动Agent:"
    echo -e "     ${YELLOW}pnpm agent:start${NC}"
    echo ""
    echo -e "  ${BLUE}4.${NC} 打开浏览器访问Web界面"
    echo ""
    echo -e "遇到问题? 查看: ${BLUE}docs/release/02-FAQ.md${NC}"
    echo ""
}

# ============== 主函数 ==============

main() {
    print_banner

    log_info "检测到系统: $(detect_os)"
    echo ""

    # 环境检查
    check_git
    check_node
    check_pnpm
    echo ""

    # 安装项目
    download_project
    install_dependencies
    build_project
    echo ""

    # 显示后续步骤
    print_next_steps
}

# 执行安装
main "$@"
