/**
 * Upload routes — file attachment upload and download
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../auth';
import { upload } from '../middleware/upload';
import { HTTP_STATUS } from 'cc-remote-shared';
import { sessions } from '../socket/store';
import { isMachineOnline } from '../socket/agent.socket';

const router: Router = Router();
const prisma = new PrismaClient();

const UPLOAD_SECRET = process.env.UPLOAD_SECRET || 'change-me-in-production';
const UPLOAD_TTL_MS = parseInt(process.env.UPLOAD_TTL_MS || '600000', 10); // 10 min default

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
      fs.unlinkSync(req.file.path);
      res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'session_id is required' });
      return;
    }

    // Validate session ownership
    const sessionInfo = sessions.get(sessionId);
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
    if (!isMachineOnline(sessionInfo.machineId)) {
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
  } catch {
    // Ignore cleanup errors
  }
}, 5 * 60 * 1000);

export default router;
