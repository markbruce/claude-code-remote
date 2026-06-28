# Project Rules

## Version Bump Checklist

每次 bump 版本时，必须完成以下所有步骤，缺一不可：

1. **CHANGELOG.md** — 在文件顶部新增版本条目（日期、变更内容）。这是发布说明的**唯一来源**。
2. **packages/*/package.json** — 所有包的 `version` 字段保持一致（agent, bot, server, shared, web）
3. **README.md / README.zh-CN.md** — **仅在引入重大新功能时**更新「功能特性」描述。Release Notes 不再写入 README（README 顶部只有一个指向 CHANGELOG.md 的固定链接）。
4. **DEPLOY.md** — 如变更涉及部署配置（环境变量、Docker 配置等），同步更新部署文档
5. **agent README** (`packages/agent/README.md`) — 如变更影响 agent 安装、命令或架构，同步更新
6. **Git tag** — 创建 annotated tag `v<version>` 并推送

### 需要同步检查的文件

| 文件 | 检查内容 |
|------|----------|
| `CHANGELOG.md` | 新版本条目（发布说明唯一来源） |
| `README.md` / `README.zh-CN.md` | 仅重大新功能时更新「功能特性」；Release Notes 走 CHANGELOG |
| `DEPLOY.md` | 环境变量、Docker 配置是否需要更新 |
| `packages/agent/README.md` | npm 包说明是否需要更新 |
| `packages/*/package.json` | version 字段 |
