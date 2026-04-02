# CI/CD 配置说明

本项目提供两种 CI/CD 配置方案：

## 方案一：Gitea Actions (推荐)

适用于 Gitea 1.19+ 版本，配置文件：`.gitea/workflows/build.yml`

### 功能

- master 分支推送时自动构建 Docker 镜像
- 打 tag 时构建 Agent 发布包并创建 Release

### 配置步骤

1. **启用 Gitea Actions**
   - 管理员设置 → Actions → 启用

2. **配置 Secrets**
   进入仓库 Settings → Secrets，添加：

   | Secret | 说明 |
   |--------|------|
   | `DOCKERHUB_USERNAME` | Docker Hub 用户名 |
   | `DOCKERHUB_TOKEN` | Docker Hub Access Token |

3. **打 Tag 发布**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

---

## 方案二：Drone CI

适用于旧版 Gitea 或已有 Drone 环境，配置文件：`.drone.yml`

### 配置步骤

1. **在 Drone 中启用仓库**

2. **配置 Secrets**
   在 Drone 仓库设置中添加：

   | Secret | 说明 |
   |--------|------|
   | `docker_username` | Docker Hub 用户名 |
   | `docker_password` | Docker Hub 密码/Token |
   | `gitea_token` | Gitea API Token (用于发布 Release) |

3. **修改 `.drone.yml`**
   更新 `base_url` 为你的 Gitea 服务器地址

---

## 手动触发构建

如果 CI 不可用，可手动构建：

```bash
# 构建 Docker 镜像
docker build -f packages/server/Dockerfile -t cc-remote/server:latest .

# 构建 Agent 独立包
./scripts/build-artifacts.sh --all
```

---

## 构建产物

| 产物 | 说明 |
|-----|------|
| `cc-remote/server:latest` | 服务端 Docker 镜像 |
| `cc-remote/server:v1.0.0` | 带 tag 的镜像 |
| `cc-agent-v1.0.0-standalone.tar.gz` | Agent 独立包 |
