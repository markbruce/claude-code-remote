# File Attachment in Chat Input — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image and text file attachment support to the Chat composer, enabling users to send files alongside text messages to Claude Code sessions.

**Architecture:** Web uploads files to Server via HTTP multipart. Server stores temporarily, returns signed download URL. CHAT_SEND event carries attachment refs. Agent pulls files via signed URL, stores in project `.claude/uploads/`, constructs Anthropic API content blocks (text + image) for the SDK.

**Tech Stack:** multer (server file upload), crypto (signed URLs), fetch (agent download), React + Tailwind (web UI)

**Known Issues (from review):**
- SDK content block arrays must be validated with a POC before full implementation
- Server sessions are in-memory Map, not DB — validation chain is sessions Map → machineId → DB
- Agent `handleChatSend` must become async for file download I/O
- Filename sanitization required on both Server and Agent to prevent path traversal

**Design Spec:** `docs/superpowers/specs/2026-04-09-file-attachment-design.md`
**Issue:** markbruce/claude-code-remote#4
**Branch:** `feat/4-file-attachment`

---

## Chunk 1: Shared Types + Server Upload Infrastructure

### Task 1: Add AttachmentRef type and extend ChatSendEvent

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add AttachmentRef interface and update ChatSendEvent**

Find `ChatSendEvent` at line 164 in `packages/shared/src/types.ts`. It currently looks like:

```typescript
export interface ChatSendEvent {
  session_id: string;
  content: string;
}
```

Add `AttachmentRef` interface before `ChatSendEvent`, then add the optional `attachments` field:

```typescript
/** Reference to an uploaded file attachment */
export interface AttachmentRef {
  fileId: string;
  signedUrl: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ChatSendEvent {
  session_id: string;
  content: string;
  attachments?: AttachmentRef[];
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/zxn/Projects/ai/claude-code-remote/packages/shared && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): add AttachmentRef type and extend ChatSendEvent with attachments"
```

---

### Task 2: Add multer dependency to server

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1: Install multer**

Run: `cd /home/zxn/Projects/ai/claude-code-remote && pnpm add multer @types/multer --filter @cc-remote/server`

Expected: multer added to server dependencies

- [ ] **Step 2: Commit**

```bash
git add packages/server/package.json pnpm-lock.yaml
git commit -m "feat(server): add multer dependency for file uploads"
```

---

### Task 3: Create upload middleware (multer config)

**Files:**
- Create: `packages/server/src/middleware/upload.ts`

- [ ] **Step 1: Create upload middleware**

```typescript
/**
 * File upload middleware — multer configuration for attachments
 */
import multer from 'multer';
import path from 'path';

const MAX_UPLOAD_SIZE_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10', 10);
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/css',
  'application/json',
  'application/xml',
  'text/xml',
  'text/x-log',
];

const ALLOWED_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift', '.kt',
  '.sh', '.bash', '.zsh', '.fish',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.sql', '.graphql', '.proto',
  '.md', '.txt', '.log', '.env', '.gitignore',
];

function fileFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  const allowed = ALLOWED_MIME_TYPES.some(t => file.mimetype.startsWith(t.replace('/*', '/')))
    || file.mimetype.startsWith('text/')
    || ALLOWED_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase());

  if (allowed) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, process.env.UPLOAD_TEMP_DIR || '/tmp/ccr-upload');
    },
    filename: (_req, file, cb) => {
      const safeName = path.basename(file.originalname).replace(/\.\./g, '');
      const fileId = crypto.randomUUID();
      cb(null, `${fileId}_${safeName}`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: 5,
  },
  fileFilter,
});
```

Note: This file uses `crypto` which is a Node.js built-in — no import needed at top if using `crypto.randomUUID()`. Actually, add `import crypto from 'crypto';` at the top.

- [ ] **Step 2: Verify compilation**

Run: `cd /home/zxn/Projects/ai/claude-code-remote/packages/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/middleware/upload.ts
git commit -m "feat(server): add multer upload middleware with size/type limits"
```

---

### Task 4: Create upload routes (POST upload + GET download + cleanup timer)

**Files:**
- Create: `packages/server/src/routes/upload.routes.ts`

Read `packages/server/src/routes/auth.routes.ts` for the pattern (Router, authMiddleware, PrismaClient, etc.). Also read `packages/server/src/socket/client.socket.ts` to understand how sessions Map is accessed — it's passed as parameter to the socket init function.

The upload routes need access to the sessions Map and agent online check. These are available from the socket server init. The routes file will need to receive these as module-level state or through a setup function.

- [ ] **Step 1: Create upload.routes.ts**

```typescript
/**
 * Upload routes — file attachment upload and download
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../index';
import { upload } from '../middleware/upload';
import { HTTP_STATUS } from 'cc-remote-shared';

const router = Router();

const UPLOAD_SECRET = process.env.UPLOAD_SECRET || 'change-me-in-production';
const UPLOAD_TTL_MS = parseInt(process.env.UPLOAD_TTL_MS || '600000', 10); // 10 min default

// Module-level references set by init()
let sessionsMap: Map<string, { machineId: string; socketId: string }> | null = null;
let isAgentOnlineFn: ((machineId: string) => boolean) | null = null;

/** Initialize with references from socket server */
export function initUploadRoutes(
  sessions: Map<string, { machineId: string; socketId: string }>,
  isAgentOnline: (machineId: string) => boolean,
): void {
  sessionsMap = sessions;
  isAgentOnlineFn = isAgentOnline;
}

function generateSignedUrl(fileId: string, filename: string): string {
  const expires = Math.floor(Date.now() / 1000) + Math.floor(UPLOAD_TTL_MS / 1000);
  const token = crypto
    .createHmac('sha256', UPLOAD_SECRET)
    .update(`${fileId}:${expires}`)
    .digest('hex');
  return `/api/upload/${fileId}?token=${token}&expires=${expires}`;
}

function verifySignedUrl(fileId: string, token: string, expires: string): boolean {
  const expiresNum = parseInt(expires, 10);
  if (Date.now() / 1000 > expiresNum) return false;
  const expected = crypto
    .createHmac('sha256', UPLOAD_SECRET)
    .update(`${fileId}:${expiresNum}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

// POST /api/upload — Upload file attachment
router.post('/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'No file provided' });
      return;
    }

    const sessionId = req.body.session_id as string;
    if (!sessionId) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'session_id is required' });
      return;
    }

    // Validate session ownership
    const sessionInfo = sessionsMap?.get(sessionId);
    if (!sessionInfo) {
      fs.unlinkSync(req.file.path);
      res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Session not found' });
      return;
    }

    // Verify machine belongs to authenticated user
    const machine = await prisma.machine.findFirst({
      where: { id: sessionInfo.machineId, user_id: req.user!.id },
    });
    if (!machine) {
      fs.unlinkSync(req.file.path);
      res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Machine not found or not owned' });
      return;
    }

    // Verify agent is online
    if (!isAgentOnlineFn || !isAgentOnlineFn(sessionInfo.machineId)) {
      fs.unlinkSync(req.file.path);
      res.status(503).json({ error: 'Agent is offline, cannot accept file uploads' });
      return;
    }

    // Extract fileId from the generated filename
    const fileId = path.basename(req.file.filename).split('_')[0];
    const signedUrl = generateSignedUrl(fileId, req.file.originalname);

    res.json({
      fileId,
      filename: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      signedUrl,
    });
  } catch (error) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    console.error('[Upload] Error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: 'Upload failed' });
  }
});

// GET /api/upload/:fileId — Download file (called by Agent)
router.get('/upload/:fileId', (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const { token, expires } = req.query;

    if (!token || !expires || typeof token !== 'string' || typeof expires !== 'string') {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Missing token or expires' });
      return;
    }

    if (!verifySignedUrl(fileId, token, expires)) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid or expired download URL' });
      return;
    }

    // Find the file in temp directory
    const tempDir = process.env.UPLOAD_TEMP_DIR || '/tmp/ccr-upload';
    const files = fs.readdirSync(tempDir);
    const matchingFile = files.find(f => f.startsWith(`${fileId}_`));

    if (!matchingFile) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'File not found or expired' });
      return;
    }

    const filePath = path.join(tempDir, matchingFile);
    const originalName = matchingFile.split('_').slice(1).join('_');

    res.download(filePath, originalName, (err) => {
      if (err) {
        console.error('[Upload] Download error:', err);
      } else {
        // Delete temp file after successful download (one-time use)
        try { fs.unlinkSync(filePath); } catch {}
      }
    });
  } catch (error) {
    console.error('[Upload] Download error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: 'Download failed' });
  }
});

// Temp file cleanup timer — runs every 5 minutes
setInterval(() => {
  const tempDir = process.env.UPLOAD_TEMP_DIR || '/tmp/ccr-upload';
  try {
    if (!fs.existsSync(tempDir)) return;
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > UPLOAD_TTL_MS) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}, 5 * 60 * 1000);

export default router;
```

- [ ] **Step 2: Register upload routes**

In `packages/server/src/routes/index.ts`, add the import and route registration:

```typescript
import uploadRoutes from './upload.routes';

// Add after existing routes:
router.use('/', uploadRoutes);
```

- [ ] **Step 3: Wire initUploadRoutes in socket server init**

Find where `initSocketServer` is called (likely in `packages/server/src/socket/index.ts`). The sessions Map and `isAgentOnline` function need to be passed to `initUploadRoutes()`.

Read `packages/server/src/socket/agent.socket.ts` to find the `isMachineOnline` function or equivalent. Then call `initUploadRoutes(sessions, isMachineOnline)` after socket server initialization.

The exact location depends on how the sessions Map is exported. Read the socket init code and add the call there.

- [ ] **Step 4: Ensure temp directory exists on startup**

In `packages/server/src/index.ts`, after the Express app is created, add:

```typescript
// Ensure upload temp directory exists
const uploadTempDir = process.env.UPLOAD_TEMP_DIR || '/tmp/ccr-upload';
if (!fs.existsSync(uploadTempDir)) {
  fs.mkdirSync(uploadTempDir, { recursive: true });
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd /home/zxn/Projects/ai/claude-code-remote/packages/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/upload.routes.ts packages/server/src/routes/index.ts packages/server/src/index.ts
git commit -m "feat(server): add upload routes with signed URLs and temp file cleanup"
```

---

### Task 5: Update server CHAT_SEND forwarding (no changes needed)

**Files:**
- Verify: `packages/server/src/socket/client.socket.ts`

- [ ] **Step 1: Verify forwarding works without changes**

Read `packages/server/src/socket/client.socket.ts` lines 464-471. The current code forwards the entire `data` object:

```typescript
socket.on(SocketEvents.CHAT_SEND, (data: ChatSendEvent) => {
  const sessionInfo = sessions.get(data.session_id);
  if (!sessionInfo) {
    socket.emit(SocketEvents.ERROR, { message: ERROR_MESSAGES.SESSION_NOT_FOUND });
    return;
  }
  emitToAgent(sessionInfo.machineId, SocketEvents.CHAT_SEND, data);
});
```

Since it forwards the whole `data` object (which now includes `attachments`), no code change is needed. The `ChatSendEvent` type already has `attachments?: AttachmentRef[]`.

- [ ] **Step 2: Commit (skip if no changes)**

No commit needed if no changes were made.

---

## Chunk 2: Agent-Side Changes

### Task 6: Update sendMessage to support content blocks

**Files:**
- Modify: `packages/agent/src/sdk-session.ts`

- [ ] **Step 1: Add DownloadedAttachment interface**

At the top of `packages/agent/src/sdk-session.ts` (after existing imports, around line 15), add:

```typescript
/** Pre-loaded attachment data for sendMessage */
export interface DownloadedAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  localPath: string;
  data: Buffer;
}
```

- [ ] **Step 2: Update sendMessage method**

Find the `sendMessage` method at line 473. Replace it:

```typescript
  /**
   * 外部调用：用户发送消息
   */
  sendMessage(content: string, attachments?: DownloadedAttachment[]): void {
    if (this.state !== SdkSessionState.RUNNING) {
      console.warn(`[SDK:${this.config.sessionId}] 会话未运行，忽略消息`);
      return;
    }

    // Build content — use content blocks if attachments present, otherwise plain string
    if (attachments && attachments.length > 0) {
      const blocks: Array<{ type: string; text?: string; source?: object }> = [
        { type: 'text', text: content },
      ];

      for (const att of attachments) {
        if (att.mimeType.startsWith('image/')) {
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: att.mimeType, data: att.data.toString('base64') },
          });
        } else {
          const textContent = att.data.toString('utf-8');
          blocks.push({ type: 'text', text: `[File: ${att.filename}]\n${textContent}` });
        }
      }

      this.messageQueue.push({
        type: 'user',
        message: { role: 'user', content: blocks },
        parent_tool_use_id: null,
        session_id: this.sdkSessionId ?? '',
      } as SDKUserMessage);
    } else {
      // Plain text — original behavior
      this.messageQueue.push({
        type: 'user',
        message: { role: 'user', content },
        parent_tool_use_id: null,
        session_id: this.sdkSessionId ?? '',
      } as SDKUserMessage);
    }
  }
```

- [ ] **Step 3: Add cleanup method for session uploads**

Add a method to clean up uploaded files for this session:

```typescript
  /**
   * 清理本会话的上传文件
   */
  cleanupUploads(): void {
    const uploadDir = path.join(this.config.projectPath, '.claude', 'uploads');
    try {
      if (!fs.existsSync(uploadDir)) return;
      const files = fs.readdirSync(uploadDir);
      for (const file of files) {
        try { fs.unlinkSync(path.join(uploadDir, file)); } catch {}
      }
    } catch {
      // Ignore cleanup errors
    }
  }
```

Add `import fs from 'fs';` and `import path from 'path';` at top if not already imported.

- [ ] **Step 4: Call cleanupUploads in end() method**

In the `end()` method (around line 523), add `this.cleanupUploads();` before the closing brace.

- [ ] **Step 5: Verify compilation**

Run: `cd /home/zxn/Projects/ai/claude-code-remote/packages/agent && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/sdk-session.ts
git commit -m "feat(agent): update sendMessage to support content blocks with attachments"
```

---

### Task 7: Update handleChatSend to download attachments

**Files:**
- Modify: `packages/agent/src/client.ts`

- [ ] **Step 1: Add downloadAttachment helper method**

In `packages/agent/src/client.ts`, add imports at the top:

```typescript
import fs from 'fs';
import path from 'path';
import { DownloadedAttachment } from './sdk-session';
```

Add a `downloadAttachment` method to the `AgentClient` class:

```typescript
  private async downloadAttachment(att: AttachmentRef, projectPath: string): Promise<string> {
    const safeFilename = path.basename(att.filename).replace(/\.\./g, '');
    const uploadDir = path.join(projectPath, '.claude', 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });

    // Place .gitignore in uploads dir
    const gitignorePath = path.join(uploadDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      await fs.promises.writeFile(gitignorePath, '*\n!.gitignore\n');
    }

    const localPath = path.join(uploadDir, `${att.fileId}_${safeFilename}`);

    // Deduplicate: skip download if file already exists
    try {
      await fs.promises.access(localPath);
      return localPath;
    } catch {}

    const response = await fetch(att.signedUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(localPath, buffer);
    return localPath;
  }
```

Note: `AttachmentRef` is imported from `cc-remote-shared` — verify it's in the existing imports. If not, add it.

- [ ] **Step 2: Update handleChatSend to async**

Find `handleChatSend` at line 622. Replace it:

```typescript
  private async handleChatSend(data: ChatSendEvent): Promise<void> {
    try {
      const session = sdkSessionManager.getSession(data.session_id);
      if (!session || !session.isRunning()) {
        console.warn(`Chat 会话不存在或未运行: ${data.session_id}`);
        return;
      }

      // Download attachments if present
      const downloadedAttachments: DownloadedAttachment[] = [];
      if (data.attachments?.length) {
        const projectPath = session.getInfo().projectPath;
        for (const att of data.attachments) {
          try {
            const localPath = await this.downloadAttachment(att, projectPath);
            const fileBuffer = await fs.promises.readFile(localPath);
            downloadedAttachments.push({
              fileId: att.fileId,
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.size,
              localPath,
              data: fileBuffer,
            });
          } catch (err) {
            console.error(`[Agent] Failed to download attachment ${att.fileId}:`, err);
            // Emit error but continue with other attachments
            this.socket?.emit(SocketEvents.CHAT_ERROR, {
              session_id: data.session_id,
              content: `Failed to load attachment: ${att.filename}`,
            });
          }
        }
      }

      session.sendMessage(data.content, downloadedAttachments);
    } catch (error) {
      console.error('处理 Chat 消息失败:', error);
    }
  }
```

- [ ] **Step 3: Update the event listener registration**

Since `handleChatSend` is now async, the Socket.IO listener wrapping it doesn't need changes — it already calls `this.handleChatSend(data)` which returns a Promise that's fire-and-forget (no await needed at the listener level).

- [ ] **Step 4: Verify compilation**

Run: `cd /home/zxn/Projects/ai/claude-code-remote/packages/agent && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/client.ts
git commit -m "feat(agent): add attachment download in handleChatSend with error recovery"
```

---

## Chunk 3: Web Frontend — Upload Hook + Socket + Store

### Task 8: Create useFileUpload hook

**Files:**
- Create: `packages/web/src/hooks/useFileUpload.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useCallback } from 'react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS = 5;

const ALLOWED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift', '.kt',
  '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env',
  '.md', '.txt', '.log', '.csv', '.sql', '.sh', '.bash',
  '.css', '.html', '.scss', '.less',
];

export interface PendingAttachment {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  fileId?: string;
  signedUrl?: string;
  preview?: string; // data URL for image preview
}

export interface useFileUploadReturn {
  attachments: PendingAttachment[];
  addFiles: (files: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  uploadAll: (sessionId: string) => Promise<boolean>;
}

export function useFileUpload(): useFileUploadReturn {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setAttachments(prev => {
      const remaining = MAX_ATTACHMENTS - prev.length;
      const toAdd = fileArray.slice(0, remaining).filter(file => {
        // Size check
        if (file.size > MAX_FILE_SIZE) return false;
        // Type check — allow images and common text extensions
        if (file.type.startsWith('image/') || file.type.startsWith('text/')) return true;
        if (file.type === 'application/json' || file.type === 'application/xml') return true;
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        return ALLOWED_EXTENSIONS.includes(ext);
      }).map(file => ({
        id: crypto.randomUUID(),
        file,
        status: 'pending' as const,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      }));
      return [...prev, ...toAdd];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    attachments.forEach(att => {
      if (att.preview) URL.revokeObjectURL(att.preview);
    });
    setAttachments([]);
  }, [attachments]);

  const uploadAll = useCallback(async (sessionId: string): Promise<boolean> => {
    const pending = attachments.filter(a => a.status === 'pending' || a.status === 'error');
    let allSuccess = true;

    for (const att of pending) {
      setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'uploading' as const } : a));

      try {
        const formData = new FormData();
        formData.append('file', att.file);
        formData.append('session_id', sessionId);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Upload failed' }));
          setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'error' as const, error: err.error } : a));
          allSuccess = false;
          continue;
        }

        const result = await response.json();
        setAttachments(prev => prev.map(a => a.id === att.id ? {
          ...a,
          status: 'done' as const,
          fileId: result.fileId,
          signedUrl: result.signedUrl,
        } : a));
      } catch {
        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'error' as const, error: 'Network error' } : a));
        allSuccess = false;
      }
    }

    return allSuccess;
  }, [attachments]);

  return { attachments, addFiles, removeAttachment, clearAttachments, uploadAll };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/hooks/useFileUpload.ts
git commit -m "feat(web): add useFileUpload hook with validation and upload"
```

---

### Task 9: Update socket.ts and chatStore.ts for attachments

**Files:**
- Modify: `packages/web/src/lib/socket.ts`
- Modify: `packages/web/src/stores/chatStore.ts`

- [ ] **Step 1: Update sendChatMessage in socket.ts**

Find `sendChatMessage` at line 457. Replace:

```typescript
  sendChatMessage(sessionId: string, content: string, attachments?: AttachmentRef[]): void {
    if (!this.socket?.connected) return;
    const evt: ChatSendEvent = { session_id: sessionId, content, attachments };
    this.socket.emit(SocketEvents.CHAT_SEND, evt);
  }
```

Add `AttachmentRef` to the imports from `cc-remote-shared` at the top of the file. Also ensure `ChatSendEvent` is already imported (it is).

- [ ] **Step 2: Update sendMessage in chatStore.ts**

Find `sendMessage` action at line 80. It needs to accept attachments and pass them through:

```typescript
  sendMessage: (sessionId: string, content: string, attachments?: AttachmentRef[]) => {
    const userMsg: ChatMessage = {
      id: genId(),
      type: 'user',
      content,
      timestamp: new Date(),
    };
    set((s) => ({ messages: [...s.messages, userMsg], isGenerating: true }));
    socketManager.sendChatMessage(sessionId, content, attachments);
  },
```

Add `AttachmentRef` to imports from `cc-remote-shared`.

- [ ] **Step 3: Verify compilation**

Run: `cd /home/zxn/Projects/ai/claude-code-remote/packages/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/socket.ts packages/web/src/stores/chatStore.ts
git commit -m "feat(web): pass attachments through socket and chat store"
```

---

## Chunk 4: Web Frontend — UI Components

### Task 10: Create AttachmentPreview component

**Files:**
- Create: `packages/web/src/components/chat/AttachmentPreview.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React from 'react';
import { PendingAttachment } from '../../hooks/useFileUpload';

interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({ attachments, onRemove }) => {
  if (attachments.length === 0) return null;

  return (
    <div className="flex gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-x-auto">
      {attachments.map(att => (
        <div
          key={att.id}
          className="relative flex-shrink-0 group"
        >
          {att.preview ? (
            // Image preview
            <div className="w-16 h-16 rounded-md overflow-hidden border border-gray-200 dark:border-gray-600">
              <img src={att.preview} alt={att.file.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            // File icon + name
            <div className="w-16 h-16 rounded-md bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex flex-col items-center justify-center px-1">
              <span className="text-lg">📄</span>
              <span className="text-[9px] text-gray-500 dark:text-gray-400 truncate w-full text-center">
                {att.file.name}
              </span>
              <span className="text-[8px] text-gray-400">
                {(att.file.size / 1024).toFixed(att.file.size > 1024 ? 1 : 0)}KB
              </span>
            </div>
          )}
          {/* Status overlay */}
          {att.status === 'uploading' && (
            <div className="absolute inset-0 bg-black/40 rounded-md flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {att.status === 'error' && (
            <div className="absolute inset-0 bg-red-500/40 rounded-md flex items-center justify-center">
              <span className="text-white text-xs">!</span>
            </div>
          )}
          {/* Delete button */}
          <button
            onClick={() => onRemove(att.id)}
            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/chat/AttachmentPreview.tsx
git commit -m "feat(web): add AttachmentPreview component with image/file thumbnails"
```

---

### Task 11: Update ChatComposer with attachment button, drag-and-drop, and preview

**Files:**
- Modify: `packages/web/src/components/chat/ChatComposer.tsx`

Read the full file first. The key changes:
1. Add a hidden file input and 📎 button
2. Add drag-and-drop event handlers on the input area
3. Show AttachmentPreview above the textarea when attachments exist
4. Update the send handler to upload files before sending

- [ ] **Step 1: Add imports and hook usage**

At the top of ChatComposer.tsx, add imports:

```typescript
import { AttachmentPreview } from './AttachmentPreview';
import { useFileUpload } from '../../hooks/useFileUpload';
```

Inside the component function, add the hook:

```typescript
const { attachments, addFiles, removeAttachment, clearAttachments, uploadAll } = useFileUpload();
const fileInputRef = useRef<HTMLInputElement>(null);
const [isDragOver, setIsDragOver] = useState(false);
```

- [ ] **Step 2: Add file input handler**

```typescript
const handleFileSelect = useCallback(() => {
  fileInputRef.current?.click();
}, []);

const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files) {
    addFiles(e.target.files);
    e.target.value = ''; // Reset so same file can be selected again
  }
}, [addFiles]);
```

- [ ] **Step 3: Add drag-and-drop handlers**

```typescript
const handleDragOver = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  setIsDragOver(true);
}, []);

const handleDragLeave = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  setIsDragOver(false);
}, []);

const handleDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  setIsDragOver(false);
  if (e.dataTransfer.files) {
    addFiles(e.dataTransfer.files);
  }
}, [addFiles]);
```

- [ ] **Step 4: Update handleSubmit to upload files first**

Find the existing `handleSubmit` function. Wrap it to upload files before sending:

```typescript
const handleSubmit = useCallback(async () => {
  if (!value.trim() && attachments.length === 0) return;
  
  // Upload any pending attachments first
  if (attachments.some(a => a.status === 'pending' || a.status === 'error')) {
    const sessionId = /* get current session ID from sessionStore */;
    if (!sessionId) return;
    await uploadAll(sessionId);
  }

  // Get successfully uploaded attachment refs
  const attachmentRefs = attachments
    .filter(a => a.status === 'done' && a.fileId && a.signedUrl)
    .map(a => ({
      fileId: a.fileId!,
      signedUrl: a.signedUrl!,
      filename: a.file.name,
      mimeType: a.file.type,
      size: a.file.size,
    }));

  onSend(value, attachmentRefs.length > 0 ? attachmentRefs : undefined);
  setValue('');
  clearAttachments();
}, [value, attachments, onSend, uploadAll, clearAttachments]);
```

Note: The `onSend` callback signature needs updating. Find where `onSend` is called in the parent component (`ChatInterface.tsx`) and update the `sendMessage` call to pass attachments through.

- [ ] **Step 5: Update the JSX — add file input, attachment button, preview, drag handlers**

Add hidden file input (after existing refs):

```tsx
<input
  ref={fileInputRef}
  type="file"
  multiple
  accept="image/*,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.json,.xml,.yaml,.yml,.md,.txt,.log,.csv,.sql,.sh,.css,.html"
  onChange={handleFileChange}
  className="hidden"
/>
```

Add drag handlers and visual state to the input area wrapper div:

```tsx
<div
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
  className={`... existing classes ... ${isDragOver ? 'border-blue-500 border-dashed' : ''}`}
>
```

Add AttachmentPreview before the textarea/input row:

```tsx
<AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
```

Add 📎 button before the textarea in the input row:

```tsx
<button
  onClick={handleFileSelect}
  className="flex-shrink-0 p-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500"
  title="Attach file"
>
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
  </svg>
</button>
```

- [ ] **Step 6: Update ChatInterface.tsx to pass attachments through**

Find `ChatInterface.tsx` where `onSend` is wired to `sendMessage`. Update to pass attachments:

```typescript
onSend={(content: string, attachments?: AttachmentRef[]) => {
  sendMessage(sessionId, content, attachments);
}}
```

- [ ] **Step 7: Verify compilation**

Run: `cd /home/zxn/Projects/ai/claude-code-remote/packages/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/chat/ChatComposer.tsx packages/web/src/components/chat/ChatInterface.tsx
git commit -m "feat(web): add attachment button, drag-and-drop, and preview to ChatComposer"
```

---

## Chunk 5: Integration Testing

### Task 12: Build and manual test

- [ ] **Step 1: Build all packages**

Run: `cd /home/zxn/Projects/ai/claude-code-remote && pnpm run build`
Expected: All packages build without errors

- [ ] **Step 2: Start server in dev mode**

Terminal 1: `cd packages/server && pnpm run dev`

- [ ] **Step 3: Start web dev server**

Terminal 2: `cd packages/web && pnpm run dev`

- [ ] **Step 4: Test upload flow**

1. Open web client in browser
2. Start a chat session
3. Click 📎 button → select an image → verify preview appears
4. Click 📎 again → select a text file → verify both previews shown
5. Type a message → click send → verify files upload and message sends
6. Verify Claude receives the attachments (check agent logs)

- [ ] **Step 5: Test drag-and-drop**

1. Drag a file from desktop onto chat input
2. Verify drag overlay appears
3. Drop → verify upload starts

- [ ] **Step 6: Test error cases**

1. Try uploading a file > 10MB → verify rejection
2. Try uploading 6 files → verify only 5 accepted
3. Remove attachment before sending → verify removed
4. Send with attachment that fails to upload → verify error state

- [ ] **Step 7: Commit any fixes**

If any issues found during testing, fix and commit with message like:
`fix(web): resolve <issue description>`

---

### Task 13: Final commit and push

- [ ] **Step 1: Ensure all changes committed**

Run: `git status`
Expected: Clean working tree

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/4-file-attachment
```

---

## Summary

| Chunk | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-5 | Shared types + Server upload infrastructure (multer, signed URLs, cleanup) |
| 2 | 6-7 | Agent: content blocks in sendMessage + async download in handleChatSend |
| 3 | 8-9 | Web: useFileUpload hook + socket/store attachment passthrough |
| 4 | 10-11 | Web: AttachmentPreview component + ChatComposer UI integration |
| 5 | 12-13 | Integration testing + push |

**Total: 13 tasks, ~55 steps**
