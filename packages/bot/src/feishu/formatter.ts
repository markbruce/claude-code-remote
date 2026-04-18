/**
 * Feishu message formatting utilities.
 * Feishu uses lark_md in cards — a subset of Markdown.
 * For plain text messages, no formatting needed.
 */

/** Escape text for lark_md card content */
export function escapeCardText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
