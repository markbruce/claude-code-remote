# Changelog

All notable changes to this project will be documented in this file.

本文件记录项目的所有重要变更。

## Unreleased

### Added / 新增

- Fix iOS auto-zoom on chat input focus by using 16px font-size ([#2](https://github.com/markbruce/claude-code-remote/issues/2))
- 修复 iOS 聊天输入框聚焦时自动缩放问题，使用 16px 字体大小

## [v1.1.2] - 2026-04-03

### Fixed / 修复

- Fix deprecated `actions/upload-artifact@v3` and `actions/download-artifact@v3` in CI workflow (update to v4)
- Fix npm publish missing `NODE_AUTH_TOKEN` environment variable
- Fix GitHub Release creation failing due to missing `contents:write` permission
- Fix CI workflow publishing all packages instead of only `cc-remote-agent`
- 修复 CI 工作流中已废弃的 `actions/upload-artifact@v3` 和 `actions/download-artifact@v3`（升级至 v4）
- 修复 npm 发布缺少 `NODE_AUTH_TOKEN` 环境变量的问题
- 修复 GitHub Release 创建因缺少 `contents:write` 权限而失败的问题
- 修复 CI 工作流发布所有包而非仅 `cc-remote-agent` 的问题

### Changed / 变更

- Clean up and refactor publish-npm CI job
- 清理并重构 publish-npm CI 任务

## [v1.1.1] - 2026-04-02

### Added / 新增

- Initial release of Claude Code Remote
- Remote control Claude Code on any PC from phone or browser
- User authentication and authorization (JWT)
- Connection management for PC agents
- Real-time communication relay for web clients
- Multi-user and multi-machine management
- Chat mode and terminal mode
- Session history
- File tree browser with code viewer
- Claude Code Remote 首个发布版本
- 通过手机或浏览器远程控制任意 PC 上的 Claude Code
- 用户认证与授权（JWT）
- PC Agent 连接管理
- Web 客户端实时通信中继
- 多用户、多机器管理
- 聊天模式与终端模式
- 会话历史
- 文件树浏览器与代码查看器
