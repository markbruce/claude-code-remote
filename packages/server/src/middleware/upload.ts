/**
 * File upload middleware — multer configuration for attachments
 */
import crypto from 'crypto';
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
