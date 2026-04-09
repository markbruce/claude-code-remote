# File Attachment in Chat Input Design

**Date**: 2026-04-09
**Status**: Draft
**Scope**: Image + text file attachments in Chat mode (SDK sessions only)
**Issue**: markbruce/claude-code-remote#4

## Context

Claude Code Remote's chat input currently only supports plain text. Claude Code CLI supports attaching files and images to messages. This design adds equivalent file attachment capability to the remote web/mobile client.

The Claude Agent SDK (`SDKUserMessage.message`) uses `MessageParam` from `@anthropic-ai/sdk`, which natively supports content blocks arrays including text and image types. The current `sendMessage()` wrapper only passes strings, but the underlying SDK already supports multimodal content.

## Requirements

- Support image files (PNG, JPEG, GIF, WebP) — base64 → SDK image block
- Support text files (code, logs, config, JSON) — read content → text block
- Single file size limit: 10MB (configurable)
- Multiple files per message supported
- Files persist for the session lifetime (stored in project `.claude/uploads/`)
- Agent-pull transport: Server stores temporarily, Agent downloads via signed URL
- UI: attachment button + drag-and-drop + preview bar (方案 C)

## Architecture

```
Web (ChatComposer)                    Server                          Agent
       |                                |                              |
       |--- POST /api/upload --------->|                              |
       |   (multipart: file+sessionId) |                              |
       |                                |-- 存临时文件 + 生成签名URL   |
       |<-- {fileId, signedUrl} --------|                              |
       |                                |                              |
       |--- CHAT_SEND event ---------->|--- 转发 -------------------->|
       |   {content, attachments:       |                              |-- 遍历 attachments
       |    [{fileId, signedUrl,        |                              |-- HTTP GET signedUrl 下载
       |     filename, mimeType}]})     |                              |-- 存 {project}/.claude/uploads/
       |                                |                              |-- 构建 content blocks
       |                                |                              |-- messageQueue.push({
       |                                |                              |    message: {role:'user',
       |                                |                              |    content: [text, image...]}})
```

### Key Design Decisions

1. **Upload and send are separate**: Files upload first (get fileId), then CHAT_SEND references them by ID. This allows retry on upload failure and decouples transport from messaging.

2. **Agent pulls files**: Agent downloads from Server via signed HTTP URL. Server only stores files temporarily (10min TTL). This avoids pushing large payloads through Socket.IO.

3. **Signed download URLs**: Server generates HMAC-signed URLs (fileId + secret + expiry). Agent uses these to download without additional authentication.

4. **Files stored in project directory**: Agent saves files to `{projectPath}/.claude/uploads/{fileId}_{filename}`. Files persist for the session lifetime, enabling Claude to reference them in follow-up messages. Cleaned up on session end.

5. **Content blocks format**: Agent constructs Anthropic API `MessageParam` content array with typed blocks (text + image), replacing the current string-only approach.

## API Additions (Server Side)

### `POST /api/upload`

Upload a file attachment for a chat session.

```
Request:  multipart/form-data
          - file: File (required)
          - session_id: string (required)

Response: { fileId: string, filename: string, size: number, mimeType: string, signedUrl: string }

Errors:
  400 - No file provided, invalid session_id
  413 - File exceeds size limit
  404 - Session not found
  507 - Server disk space insufficient
```

- Requires authentication (authMiddleware)
- Validates session_id belongs to current user
- File size limit: 10MB (env var `MAX_UPLOAD_SIZE_MB`, default 10)
- Allowed MIME types: `image/*`, `text/*`, `application/json`, `application/xml`, `application/pdf`
- Stores to `os.tmpdir()/ccr-upload/{fileId}_{filename}`
- Returns signed download URL: `/api/upload/{fileId}?token={hmacToken}&expires={timestamp}`

### `GET /api/upload/:fileId`

Download an uploaded file (called by Agent).

```
Query params: token (HMAC signature), expires (unix timestamp)
Response: File binary stream (Content-Type, Content-Disposition headers)
```

- Validates HMAC signature and expiry
- No authMiddleware — signed URL is sufficient authentication
- One-time use optional (delete after download flag)

## Shared Type Changes

### `packages/shared/src/types.ts`

```typescript
/** Reference to an uploaded attachment */
export interface AttachmentRef {
  fileId: string;
  signedUrl: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** Extended ChatSendEvent with optional attachments */
export interface ChatSendEvent {
  session_id: string;
  content: string;
  attachments?: AttachmentRef[];  // NEW
}
```

## Module Changes

### Server Side

| File | Change |
|------|--------|
| `packages/server/src/routes/upload.routes.ts` | **NEW** — POST /api/upload + GET /api/upload/:fileId |
| `packages/server/src/middleware/upload.ts` | **NEW** — multer config (size limit, file filter) |
| `packages/server/src/socket/client.socket.ts` | MODIFY — forward ChatSendEvent with attachments |
| `packages/server/package.json` | ADD `multer` dependency |

### Agent Side

| File | Change |
|------|--------|
| `packages/agent/src/sdk-session.ts` | MODIFY — `sendMessage()` supports content blocks + attachments |
| `packages/agent/src/client.ts` | MODIFY — `handleChatSend()` passes attachments to session |

#### `sendMessage()` Enhancement

```typescript
sendMessage(content: string, attachments?: AttachmentRef[]): void {
  if (this.state !== SdkSessionState.RUNNING) return;

  // Build content blocks
  const blocks: ContentBlockParam[] = [{ type: 'text', text: content }];

  for (const att of attachments ?? []) {
    const localPath = path.join(this.config.projectPath, '.claude', 'uploads', `${att.fileId}_${att.filename}`);
    const fileBuffer = fs.readFileSync(localPath);

    if (att.mimeType.startsWith('image/')) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: att.mimeType,
          data: fileBuffer.toString('base64'),
        },
      });
    } else {
      // Text files: include content as text block
      const textContent = fileBuffer.toString('utf-8');
      blocks.push({ type: 'text', text: `[File: ${att.filename}]\n${textContent}` });
    }
  }

  this.messageQueue.push({
    type: 'user',
    message: { role: 'user', content: blocks },
    parent_tool_use_id: null,
    session_id: this.sdkSessionId ?? '',
  } as SDKUserMessage);
}
```

#### `handleChatSend()` Enhancement

Before calling `session.sendMessage()`, Agent downloads all attachments:

```typescript
async handleChatSend(data: ChatSendEvent): Promise<void> {
  const session = this.sdkSessionManager.getSession(data.session_id);
  if (!session) return;

  // Download attachments if present
  if (data.attachments?.length) {
    for (const att of data.attachments) {
      await this.downloadAttachment(att, session.getProjectPath());
    }
  }

  session.sendMessage(data.content, data.attachments);
}
```

#### File Cleanup

Files stored in `{projectPath}/.claude/uploads/` are cleaned up when:
- Session ends (`SdkSession.end()` calls cleanup)
- Bot/Agent service restarts (stale files in `.claude/uploads/` with no active session)

### Web Side

| File | Change |
|------|--------|
| `packages/web/src/components/chat/ChatComposer.tsx` | MODIFY — 📎 button + drag-and-drop + preview bar |
| `packages/web/src/components/chat/AttachmentPreview.tsx` | **NEW** — attachment preview with delete button |
| `packages/web/src/hooks/useFileUpload.ts` | **NEW** — file upload hook (validation, upload, state) |
| `packages/web/src/lib/socket.ts` | MODIFY — sendChatMessage accepts attachments |
| `packages/web/src/stores/chatStore.ts` | MODIFY — sendMessage with attachments, pendingAttachments state |

#### UI Behavior (方案 C)

**Attachment button (📎)**:
- Always visible in input row, left of textarea
- Opens file picker on click
- Accepts: image/*, text/*, .json, .xml, .pdf, .log, .md, .ts, .js, .py, etc.

**Drag-and-drop**:
- Dragging files over the chat input area highlights the input with dashed border
- Drop triggers upload
- Visual feedback during drag

**Preview bar**:
- Appears above input row when attachments are present
- Shows thumbnail for images, icon+filename for text files
- Each attachment has a ✕ delete button
- Hidden when no attachments

**Upload flow**:
1. User selects/drops files
2. Frontend validates (type, size)
3. Files upload via POST /api/upload (one request per file)
4. Loading indicator during upload
5. On success, file appears in preview bar
6. On failure, show error toast, remove from preview
7. When user sends message, ChatSendEvent includes all attachment refs

## Supported File Types

| Category | MIME Patterns | Processing |
|----------|---------------|------------|
| Images | `image/png`, `image/jpeg`, `image/gif`, `image/webp` | base64 → SDK `image` block |
| Code/Text | `text/*`, `application/json`, `application/xml` | Read as UTF-8 → `text` block |
| Markdown | `text/markdown` | Read as UTF-8 → `text` block |
| PDF | `application/pdf` | base64 → SDK `document` block (if supported) or text extraction |
| Other | — | Rejected with error message |

## Error Handling

| Scenario | Handling |
|----------|---------|
| File too large (>10MB) | Reject at multer middleware, return 413 |
| Unsupported file type | Reject at file filter, return 400 |
| Upload fails (network) | Show error toast in UI, remove from preview |
| Agent download fails | Agent emits CHAT_ERROR, user notified in chat |
| Server temp file expired | Agent gets 404 on download, emits CHAT_ERROR |
| Session ends during upload | Upload rejected (session_id invalid) |

## Configuration

```env
# Server
MAX_UPLOAD_SIZE_MB=10              # Max file size in MB
UPLOAD_TEMP_DIR=/tmp/ccr-upload    # Temp storage directory
UPLOAD_TTL_MS=600000               # Temp file TTL (10 min)
UPLOAD_SECRET=<random-secret>      # HMAC key for signed URLs

# Agent
AGENT_DOWNLOAD_DIR=.claude/uploads # Relative to project path
```

## Out of Scope

- Video/audio file attachments
- File editing via chat (read-only access)
- Resumable/chunked uploads
- File compression before upload
- Clipboard paste image support (future enhancement)
- Camera/photo library access (mobile WebView handles this via file picker)
