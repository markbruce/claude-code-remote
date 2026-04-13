# Changelog

All notable changes to this project will be documented in this file.

本文件记录项目的所有重要变更。

## Unreleased

### Fixed / 修复

- Fix ZodError on permission approval by passing `updatedInput` as empty object when absent ([#1](https://github.com/markbruce/claude-code-remote/issues/1))
- 修复权限审批时因缺少 `updatedInput` 字段导致 Zod 校验报错的问题
- Fix iOS auto-zoom on chat input focus by using 16px font-size ([#2](https://github.com/markbruce/claude-code-remote/issues/2))
- 修复 iOS 聊天输入框聚焦时自动缩放问题，使用 16px 字体大小

### Added / 新增

- Add abort/interrupt session support using SDK `interrupt()` method ([#3](https://github.com/markbruce/claude-code-remote/issues/3))
- 新增会话中断功能，使用 SDK `interrupt()` 方法温和中断当前查询，保持会话存活
- Add file attachment support for chat mode: upload images and text files via button or drag-and-drop ([#4](https://github.com/markbruce/claude-code-remote/issues/4))
- 新增聊天模式文件附件功能：支持通过按钮或拖拽上传图片和文本文件
- Server upload endpoint with multer, signed URL for secure file download by agent
- 服务端文件上传接口，使用 multer 中间件和签名 URL 实现安全文件下载
- Agent-side attachment processing: images sent as base64, text files inlined
- Agent 端附件处理：图片以 base64 格式发送，文本文件内联展示
- Attachment preview component with image thumbnails and file icons
- 附件预览组件，支持图片缩略图和文件图标展示

### Fixed / 修复

- Fix upload API missing Authorization header causing 401 errors
- 修复文件上传接口缺少 Authorization 请求头导致 401 错误的问题
- Fix agent failing to download attachments due to relative signed URLs not resolved against server URL
- 修复 Agent 下载附件失败的问题：相对路径的签名 URL 未拼接服务器地址
- Fix web UI stuck in "generating" state when SDK doesn't emit result message
- 修复 SDK 未发送 result 消息时 Web UI 卡在"生成中"状态的问题

### Changed / 变更

- File tree now lazy-loads directories on expand instead of scanning entire project at once ([#6](https://github.com/markbruce/claude-code-remote/issues/6))
- 文件树改为按需懒加载：展开目录时才加载子内容，而非一次性扫描整个项目

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
