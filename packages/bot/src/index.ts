#!/usr/bin/env node

/**
 * cc-bot — Claude Code Remote Bot Service
 */

import { Command } from 'commander';
import { loadConfig } from './config';

const program = new Command();

program
  .name('cc-bot')
  .description('Claude Code Remote Bot Service — IM bridge for Claude Code sessions')
  .version('0.1.0')
  .option('--platform <platform>', 'Messaging platform (telegram)', 'telegram')
  .option('--bot-token <token>', 'Telegram bot token (or set TELEGRAM_BOT_TOKEN)')
  .option('--server <url>', 'Server URL (or set BOT_SERVER_URL)')
  .option('--port <port>', 'Bot HTTP port (or set BOT_PORT)', '3001')
  .action(async (options) => {
    const config = loadConfig({
      serverUrl: options.server,
      botPort: parseInt(options.port, 10),
      platform: options.platform,
      telegramBotToken: options.botToken,
    });

    console.log('');
    console.log('=================================');
    console.log('  Claude Code Remote Bot');
    console.log('=================================');
    console.log(`  Platform: ${config.platform}`);
    console.log(`  Server:   ${config.serverUrl}`);
    console.log(`  Bot Port: ${config.botPort}`);
    console.log('=================================');
    console.log('');

    if (config.platform === 'telegram') {
      if (!config.telegramBotToken) {
        console.error('Error: Telegram bot token required. Use --bot-token or set TELEGRAM_BOT_TOKEN');
        process.exit(1);
      }
      // Will be wired in Task 8
      console.log('[Bot] Telegram adapter not yet implemented');
    } else {
      console.error(`Error: Unsupported platform: ${config.platform}`);
      process.exit(1);
    }
  });

program.parse();
