# AskUserQuestion Telegram 交互支持

## 现状

`AskUserQuestion` 通过 `chat-permission-request` 通道发送，当前 bot 只显示通用的 Approve/Deny 按钮：
- 选项内容被截断为 JSON 文本显示在 description 里
- 用户无法选择具体选项
- Approve 后 `updatedInput` 为空 `{}`，Claude 不知道用户选了什么

## 实现计划

### 1. bridge.ts — `onChatPermissionRequest` 中识别 AskUserQuestion

```typescript
if (data.toolName === 'AskUserQuestion') {
  // 解析 toolInput.questions，提取选项
  // 调用新方法 platform.sendQuestion() 显示选项按钮
} else {
  // 保持现有 Approve/Deny 流程
}
```

### 2. bridge.ts — 注册选项回调

- 每个选项的 callbackData 格式：`question:{permissionKey}:{optionIndex}`
- 复用现有 permissions.register() 机制存储 pending 请求
- handleCallback 中增加 `question` action 处理

### 3. handleCallback — 处理选项点击

```
用户点击选项 → callbackData = "question:{key}:{index}"
  → permissions.resolve(key) 获取 pending 请求
  → 从 toolInput.questions[0].options[index] 提取选项内容
  → 发送 CHAT_PERMISSION_ANSWER，附带 updatedInput: { answers: [...] }
```

### 4. platform 接口 — 新增 sendQuestion 方法

```typescript
interface BotPlatform {
  // ...existing methods...
  sendQuestion(chatId: string, question: string, options: Array<{label: string, callbackData: string}>): Promise<void>;
}
```

### 5. telegram/adapter.ts — 实现 sendQuestion

- 问题文本用 MarkdownV2 格式化显示
- 每个选项一个 InlineKeyboard 按钮
- 超过 4 个选项时分多行（Telegram 单条消息最多约 10 个按钮）

## 涉及文件

| 文件 | 改动 |
|------|------|
| `packages/bot/src/core/bridge.ts` | onChatPermissionRequest 分支 + handleCallback question action |
| `packages/bot/src/shared/platform.ts` | BotPlatform 接口新增 sendQuestion |
| `packages/bot/src/telegram/adapter.ts` | 实现 sendQuestion |

## 风险点

- `updatedInput` 的格式需要与 SDK 的 `PermissionResult` Zod schema 兼容（第 559 行：`resolver({ behavior: 'allow', updatedInput: ... })`）
- 需要确认 SDK 期望的 updatedInput 结构是什么（可能是整个 AskUserQuestion input 的修改版）
- 多 questions 场景（一次 AskUserQuestion 可以有 1-4 个问题）需要处理分步回答或多按钮
