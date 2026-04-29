/**
 * Feishu bot command definitions
 */

import { BotCommand } from '../shared/platform';

export const BOT_COMMANDS: BotCommand[] = [
  { command: 'start', description: 'Bind your account' },
  { command: 'machines', description: 'List online machines' },
  { command: 'use', description: 'Select machine by name or number' },
  { command: 'projects', description: 'List projects on machine' },
  { command: 'cd', description: 'Select project by path or number' },
  { command: 'chat', description: 'Send message to Claude (or just type)' },
  { command: 'new', description: 'Clear session, start fresh' },
  { command: 'stop', description: 'Abort current Claude response' },
  { command: 'history', description: 'List and resume past sessions' },
  { command: 'status', description: 'Show current state' },
];
