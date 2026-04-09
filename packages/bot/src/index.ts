#!/usr/bin/env node

/**
 * cc-bot — Claude Code Remote Bot Service
 * CLI entry point that starts the bot bridge.
 */

import { Command } from 'commander';
import { loadConfig } from './config';
import { Bridge } from './core/bridge';
import { TelegramAdapter } from './telegram/adapter';
import { registerHandlers } from './telegram/handlers';

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

      // 1. Create adapter (no bridge dependency yet)
      const adapter = new TelegramAdapter(config.telegramBotToken);

      // 2. Create bridge with adapter
      const bridge = new Bridge(adapter, config);

      // 3. Inject permission manager into adapter (resolves circular dep)
      adapter.setPermissionManager(bridge.permissions);

      // 4. Register command handlers (needs bridge for Socket.IO access)
      registerHandlers(adapter.getBot(), bridge);

      // 5. Start
      await bridge.start();
      console.log('[Bot] Telegram bot is running. Press Ctrl+C to stop.');
    } else {
      console.error(`Error: Unsupported platform: ${config.platform}`);
      process.exit(1);
    }
  });

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Bot] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Bot] Shutting down...');
  process.exit(0);
});

program.parse();
