/**
 * Telegram bot command definitions
 */

import { BotCommand } from '../shared/platform';

export const BOT_COMMANDS: BotCommand[] = [
  { command: 'start', description: 'Bind your account' },
  { command: 'machines', description: 'List online machines' },
  { command: 'use', description: 'Select target machine: /use <name>' },
  { command: 'projects', description: 'List projects on selected machine' },
  { command: 'cd', description: 'Select project: /cd <path>' },
  { command: 'chat', description: 'Send message to Claude: /chat <text>' },
  { command: 'new', description: 'Start a new session' },
  { command: 'history', description: 'List historical sessions' },
  { command: 'cancel', description: 'Cancel current operation' },
];
