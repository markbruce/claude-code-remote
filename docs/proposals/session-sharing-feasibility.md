# CC Remote 会话分享功能 — 可行性分析 & 实现方案

> 分析日期：2026-04-07
> 项目：claude-code-remote v1.1.2

---

## 一、功能概述

允许用户将当前会话分享给其他用户，使其能够：
- **只读分享**：旁观者可实时查看会话内容（对话、工具调用、输出结果）
- **协作参与**：被邀请者可以在同一会话中发送消息、参与权限审批

---

## 二、现有架构分析

### 2.1 有利条件

| 现有能力 | 实现位置 | 说明 |
|---------|---------|------|
| 多客户端查看 | `client.socket.ts` Socket.io room | `session:{id}` 房间模型已支持多 socket 加入 |
| 客户端计数 | `store.ts` SessionInfo.clientsCount | 已在跟踪在线人数 |
| 消息广播 | `agent.socket.ts` | Agent → 所有 room 内客户端广播 |
| 会话历史 | SDK JSONL + chatBuffers | 历史消息可回放 |
| 权限审批 UI | `PermissionBanner.tsx` + `AskUserQuestionPanel.tsx` | 可扩展为多人审批 |

### 2.2 核心障碍

#### 障碍 1：所有权校验（硬门槛）

```typescript
// client.socket.ts:347-359
const machine = await prisma.machine.findFirst({
  where: { id: data.machine_id, user_id: userId }
});
```

**问题**：会话绑定在 machine 上，machine 绑定在 user 上。其他用户无法通过此校验加入会话。

#### 障碍 2：输入通道是单路的

```typescript
// client.socket.ts:464-471
socket.on(SocketEvents.CHAT_SEND, (data: ChatSendEvent) => {
  const sessionInfo = sessions.get(data.session_id);
  // ... 只校验 session 存在，不区分谁发的
  emitToAgent(sessionInfo.machineId, SocketEvents.CHAT_SEND, data);
});
```

所有消息只走 `emitToAgent(machineId, ...)` — 不区分发送者身份。

#### 障碍 3：权限审批无多人机制

当前一个用户批准即通过，缺少多人审批策略。

---

## 三、分层实现方案

### Phase 1：只读分享（推荐优先，1-2 天）

#### 功能描述

| 功能 | 说明 |
|------|------|
| 生成分享链接 | Owner 点击「分享」按钮，生成带 token 的链接 |
| 访客实时观看 | 通过链接进入，可实时看到对话、工具调用、输出 |
| 在线人数 | 显示当前观看者数量 |
| 停止分享 | Owner 可随时关闭分享 |

#### 技术方案

**1. 数据结构变更**

```typescript
// store.ts - SessionInfo 扩展
interface SessionInfo {
  // ... 现有字段
  shareToken?: string;        // 分享令牌（uuid）
  viewers: Map<string, {      // 只读观看者
    socketId: string;
    joinedAt: Date;
    displayName?: string;
  }>;
}
```

**2. 新增 Socket 事件**

```typescript
// shared/constants.ts 新增
SHARE_SESSION: 'share-session',           // Owner 开启分享
STOP_SHARE: 'stop-share',                 // Owner 关闭分享
JOIN_SHARED_SESSION: 'join-shared',       // 访客通过 token 加入
SHARED_SESSION_VIEWERS: 'shared:viewers', // 广播在线观看者
```

**3. 访客加入流程**

```
用户点击分享链接
  → 前端提取 shareToken
  → 发送 JOIN_SHARED_SESSION { shareToken }
  → Server 校验 token，找到对应 session
  → 将访客 socket 加入 session room（只监听，不能发送）
  → 返回会话历史 + SESSION_STARTED
```

**4. 权限隔离**

访客 socket 不响应 `CHAT_SEND` 和 `CHAT_PERMISSION_ANSWER` 事件，只能接收广播。

#### 涉及文件

| 文件 | 改动 |
|------|------|
| `packages/shared/src/constants.ts` | 新增分享相关事件常量 |
| `packages/shared/src/types.ts` | 新增分享相关类型定义 |
| `packages/server/src/socket/store.ts` | SessionInfo 扩展 shareToken / viewers |
| `packages/server/src/socket/client.socket.ts` | 新增分享事件处理 |
| `packages/web/src/stores/sessionStore.ts` | 分享状态管理 |
| `packages/web/src/components/chat/ChatHeader.tsx` | 分享按钮 UI |
| `packages/web/src/pages/SharedSessionPage.tsx` | **新增** 访客只读页面 |

---

### Phase 2：协作参与（3-5 天）

#### 功能描述

| 功能 | 说明 |
|------|------|
| 角色模型 | Owner / Collaborator / Viewer 三级角色 |
| 消息归属 | 每条消息标记发送者 |
| 协作发送 | Collaborator 可发送消息 |
| 审批策略 | Owner 可配置：任一人批准 / 需 Owner 批准 |

#### 数据库变更

```sql
-- 会话参与者表
CREATE TABLE SessionParticipant (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',  -- owner | collaborator | viewer
  invited_by TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, user_id)
);

-- 分享邀请表
CREATE TABLE SessionInvite (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL,
  expires_at DATETIME,
  max_uses INTEGER,
  used_count INTEGER DEFAULT 0
);
```

#### 消息格式扩展

```typescript
// 现有
interface ChatMessageEvent {
  session_id: string;
  type: string;
  data: unknown;
}

// 扩展
interface ChatMessageEvent {
  session_id: string;
  type: string;
  data: unknown;
  sender_id?: string;      // 发送者 user ID
  sender_name?: string;    // 发送者显示名
}
```

#### 涉及文件

| 文件 | 改动 |
|------|------|
| `packages/server/prisma/schema.prisma` | 新增 SessionParticipant / SessionInvite 表 |
| `packages/agent/src/sdk-session.ts` | sendMessage 传递 user context |
| `packages/server/src/socket/client.socket.ts` | 加入角色校验中间件 |
| `packages/web/src/components/chat/ChatMessage.tsx` | 消息气泡显示发送者头像/名称 |

---

### Phase 3：高级协作（2-3 周）

| 功能 | 说明 |
|------|------|
| 权限审批投票 | 多人审批策略：一票通过 / 全票通过 / Owner 决定 |
| 实时光标/输入提示 | 显示"某人正在输入..." |
| 消息引用/回复 | 类似即时通讯的消息引用能力 |
| 协作记录 | 谁在什么时候做了什么操作 |
| 会话录制回放 | 分享结束后可回放完整会话过程 |

---

## 四、风险评估

| 风险 | 等级 | 应对 |
|------|------|------|
| 只读分享泄露敏感信息 | 中 | 分享前提示，支持 Owner 关闭分享 |
| 多人并发发送消息冲突 | 低 | messageQueue 已是队列模型，天然有序 |
| 协作审批逻辑复杂度 | 中 | Phase 2 先实现简单策略（Owner 独占审批） |
| Agent SDK 不支持多用户 context | 高 | SDK sendMessage 传递 user 标识，Claude 理解多角色对话 |

---

## 五、建议实施路径

```
Phase 1（只读分享）  →  验证用户需求  →  Phase 2（协作参与）  →  Phase 3（高级功能）
      1-2 天                1 周               3-5 天                2-3 周
```

**Phase 1 产出即可验证**：用户是否真的需要分享？只读够不够？还是需要协作？

---

## 附录：关键文件索引

| 文件路径 | 职责 |
|---------|------|
| `packages/shared/src/constants.ts` | Socket 事件常量 |
| `packages/shared/src/types.ts` | 事件类型定义 |
| `packages/server/src/socket/store.ts` | 内存状态管理 |
| `packages/server/src/socket/client.socket.ts` | Client Socket 处理 |
| `packages/server/src/socket/agent.socket.ts` | Agent Socket 处理 |
| `packages/agent/src/sdk-session.ts` | SDK 会话管理 |
| `packages/agent/src/client.ts` | Agent 客户端连接 |
| `packages/web/src/components/chat/ChatComposer.tsx` | 聊天输入组件 |
| `packages/web/src/components/chat/PermissionBanner.tsx` | 权限审批组件 |
| `packages/web/src/stores/chatStore.ts` | 聊天状态管理 |
