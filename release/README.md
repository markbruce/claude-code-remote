# Claude Code Remote - 发布制品

本目录包含构建生成的发布制品。

## 制品列表

| 制品 | 说明 | 文件 |
|-----|------|------|
| Release压缩包 | 完整源码包 | `cc-remote-{version}.tar.gz` |
| 预编译二进制 | 独立可执行文件 | `binary/cc-agent-{platform}` |
| Docker镜像 | 容器镜像 | `cc-remote/server`, `cc-remote/agent` |

## 构建命令

```bash
# 构建所有制品
./scripts/build-artifacts.sh --all

# 只构建压缩包
./scripts/build-artifacts.sh --zip

# 只构建二进制
./scripts/build-artifacts.sh --binary

# 只构建Docker镜像
./scripts/build-artifacts.sh --docker

# 指定版本号
./scripts/build-artifacts.sh --all --version 1.0.1
```

## 输出目录结构

```
release/
├── cc-remote-1.0.0.tar.gz      # 完整发布包
├── binary/                      # 预编译二进制
│   ├── cc-agent-linux-x64
│   ├── cc-agent-macos-x64
│   ├── cc-agent-win-x64.exe
│   ├── agent.config.json        # 配置模板
│   ├── start-agent.sh
│   └── start-agent.bat
└── README.md
```

## 使用方式

### Release压缩包

```bash
# 解压
tar -xzf cc-remote-1.0.0.tar.gz
cd cc-remote-1.0.0

# 安装依赖
pnpm install

# 构建
pnpm build

# 启动Agent
pnpm agent:bind --token <Token>
pnpm agent:start
```

### 预编译二进制

```bash
# Linux/macOS
chmod +x cc-agent-linux-x64
./cc-agent-linux-x64 --token <Token> --server https://your-server.com

# Windows
cc-agent-win-x64.exe --token <Token> --server https://your-server.com
```

### Docker

```bash
# 拉取镜像
docker pull cc-remote/server:latest
docker pull cc-remote/agent:latest

# 运行服务端
docker run -d \
  -p 3000:3000 \
  -v cc-remote-data:/app/data \
  -e JWT_SECRET=your-secret \
  cc-remote/server:latest

# 运行Agent
docker run -d \
  -v /path/to/projects:/workspace \
  -e SERVER_URL=https://your-server.com \
  -e TOKEN=<Token> \
  cc-remote/agent:latest
```
