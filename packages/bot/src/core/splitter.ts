/**
 * Long content splitter — handles Telegram's 4096 char limit
 */

const MAX_MESSAGE_LENGTH = 4000; // Leave margin within 4096 limit
const MAX_MESSAGES = 10;

export interface SplitChunk {
  text: string;
  index: number;      // 0-based
  total: number;
  isCodeBlock: boolean;
}

/**
 * Split content into message-sized chunks.
 * Strategy (by priority):
 * 1. Code blocks — extract if they exceed limit
 * 2. Tool calls — each in its own message
 * 3. Plain text — hard split at paragraph/newline boundaries
 * 4. Ultra-long (>MAX_MESSAGES) — summarize
 */
export function splitContent(content: string): SplitChunk[] {
  if (content.length <= MAX_MESSAGE_LENGTH) {
    return [{ text: content, index: 0, total: 1, isCodeBlock: false }];
  }

  const chunks: SplitChunk[] = [];

  // Split by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith('```')) {
      // Code block
      if (part.length <= MAX_MESSAGE_LENGTH) {
        chunks.push({ text: part, index: chunks.length, total: 0, isCodeBlock: true });
      } else {
        // Truncate oversized code block
        const truncated = part.substring(0, MAX_MESSAGE_LENGTH - 50) + '\n... (truncated)';
        chunks.push({ text: truncated, index: chunks.length, total: 0, isCodeBlock: true });
      }
    } else {
      // Plain text — split at paragraph boundaries
      const textChunks = splitText(part, MAX_MESSAGE_LENGTH);
      for (const tc of textChunks) {
        chunks.push({ text: tc, index: chunks.length, total: 0, isCodeBlock: false });
      }
    }
  }

  // If too many chunks, summarize
  if (chunks.length > MAX_MESSAGES) {
    const summary = content.substring(0, MAX_MESSAGE_LENGTH - 100) +
      `\n\n... (output truncated, ${chunks.length} parts total. View full output in Web UI)`;
    return [{ text: summary, index: 0, total: 1, isCodeBlock: false }];
  }

  // Fix total count
  for (const c of chunks) {
    c.total = chunks.length;
    if (chunks.length > 1 && !c.isCodeBlock) {
      c.text = `(${c.index + 1}/${c.total})\n${c.text}`;
    }
  }

  return chunks;
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const result: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      result.push(remaining);
      break;
    }

    // Find a split point near maxLen
    let splitAt = remaining.lastIndexOf('\n\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;

    result.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  return result;
}
