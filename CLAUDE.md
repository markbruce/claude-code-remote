# Project Rules

## Version Bump Checklist

每次 bump 版本时，必须完成以下所有步骤，缺一不可：

1. **CHANGELOG.md** — 在文件顶部新增版本条目（日期、变更内容）
2. **README.md** — 更新顶部 Release Notes 区域，新增对应版本说明
3. **README.zh-CN.md** — 同步更新中文版 Release Notes（如有）
4. **packages/*/package.json** — 所有包的 `version` 字段保持一致（agent, bot, server, shared, web）
5. **DEPLOY.md** — 如变更涉及部署配置（环境变量、Docker 配置等），同步更新部署文档
6. **agent README** (`packages/agent/README.md`) — 如变更影响 agent 安装、命令或架构，同步更新
7. **Git tag** — 创建 annotated tag `v<version>` 并推送

### 需要同步检查的文件

| 文件 | 检查内容 |
|------|----------|
| `CHANGELOG.md` | 新版本条目 |
| `README.md` | Release Notes + 功能描述更新 |
| `README.zh-CN.md` | 中文 Release Notes + 功能描述同步 |
| `DEPLOY.md` | 环境变量、Docker 配置是否需要更新 |
| `packages/agent/README.md` | npm 包说明是否需要更新 |
| `packages/*/package.json` | version 字段 |
