/**
 * Telegram MarkdownV2 formatter
 * Telegram's MDv2 requires escaping special characters.
 */

const MD_V2_SPECIAL = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

/** Escape text for Telegram MarkdownV2 */
export function escapeMd(text: string): string {
  return text.replace(MD_V2_SPECIAL, '\\$1');
}

/** Format a permission prompt message */
export function formatPermissionPrompt(toolName: string, description: string): string {
  return [
    '🔧 *Claude requests tool execution:*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `*Tool:* ${escapeMd(toolName)}`,
    `*Details:* ${escapeMd(description.substring(0, 200))}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

/** Format machine list */
export function formatMachinesList(machines: Array<{ name: string; hostname: string }>, onlineInfo: Array<{ machineId: string }>): string {
  if (machines.length === 0) return 'No machines registered\\.';
  return machines.map((m, i) => `${i + 1}\\. *${escapeMd(m.name)}* \\(${escapeMd(m.hostname)}\\)`).join('\n');
}

/** Format project list */
export function formatProjectsList(projects: Array<{ name: string; path: string }>): string {
  if (projects.length === 0) return 'No projects found\\.';
  return projects.map((p, i) => `${i + 1}\\. *${escapeMd(p.name)}*\n\`${escapeMd(p.path)}\``).join('\n\n');
}
