# 常见问题 FAQ

---

## 安装问题

### Q: 安装脚本报错 "Permission denied"

**A:** 添加执行权限：

```bash
chmod +x install.sh
./install.sh
```

或者直接使用管道方式执行：

```bash
curl -fsSL https://your-server/cc-remote/scripts/install.sh | bash
```

---

### Q: Node.js 版本过低怎么办？

**A:** 推荐使用 nvm 安装 Node.js 18+：

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载终端配置
source ~/.bashrc  # 或 ~/.zshrc

# 安装 Node.js 18
nvm install 18
nvm use 18
```

---

### Q: pnpm 安装失败？

**A:** 尝试手动安装：

```bash
npm install -g pnpm

# 或使用 corepack
corepack enable
corepack prepare pnpm@latest --activate
```

---

## 连接问题

### Q: Agent显示已连接，但Web端看不到PC

**A:** 按以下步骤排查：

1. **确认Token绑定正确**
   ```bash
   pnpm agent:status
   ```

2. **检查网络连通性**
   ```bash
   ping your-server.com
   curl https://your-server.com/health
   ```

3. **查看Agent日志**
   ```bash
   pnpm agent:logs
   ```

4. **尝试重启Agent**
   ```bash
   pnpm agent:restart
   ```

---

### Q: 手机端访问很慢/卡顿

**A:** 可能原因及解决方案：

| 原因 | 解决方案 |
|-----|---------|
| 网络延迟高 | 切换WiFi/4G网络 |
| 服务器带宽不足 | 联系管理员 |
| 长消息渲染慢 | 正常现象，等待加载 |

---

### Q: 连接经常断开

**A:** 检查以下几点：

1. PC端网络是否稳定
2. 是否设置了休眠/省电模式
3. 防火墙是否拦截了WebSocket连接

建议：在Agent启动时添加保活参数

```bash
pnpm agent:start --keepalive
```

---

## 使用问题

### Q: 支持同时管理多台PC吗？

**A:** 支持。操作步骤：

1. 在每台PC上安装Agent
2. 使用相同的Token绑定
3. 在Agent启动时指定不同的名称：

```bash
pnpm agent:bind --token <Token> --name "我的办公电脑"
pnpm agent:start
```

---

### Q: 会话历史会保存吗？

**A:** 会。系统会保存最近 **30天** 的会话记录，可以在Web端查看历史对话。

---

### Q: 支持哪些Claude Code功能？

**A:** 目前支持：

| 功能 | 状态 |
|-----|------|
| 文本对话 | :white_check_mark: 支持 |
| 文件操作 | :white_check_mark: 支持 |
| Git操作 | :white_check_mark: 支持 |
| Token统计 | :white_check_mark: 支持 |
| 图片上传 | :construction: 开发中 |

---

## 安全问题

### Q: Token泄露了怎么办？

**A:** 立即联系管理员重置Token，旧Token会立即失效。

---

### Q: 数据传输安全吗？

**A:** 是的。系统使用：
- JWT身份认证
- Socket.io加密传输
- 服务端数据加密存储

---

## 反馈渠道

| 渠道 | 适用场景 | 响应时间 |
|-----|---------|---------|
| :speech_balloon: IM群 | 快速问题、即时沟通 | 实时 |
| :e-mail: 邮件 | 详细Bug反馈、功能建议 | 1-2工作日 |

---

## 没找到答案？

在群里反馈，我们会尽快回复！
