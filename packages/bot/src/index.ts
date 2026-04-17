#!/usr/bin/env node

/**
 * cc-bot — Claude Code Remote Bot Service
 * CLI entry point that starts the bot bridge.
 */

import http from 'http';
import { Command } from 'commander';
import { loadConfig } from './config';
import { Bridge } from './core/bridge';
import { TelegramAdapter } from './telegram/adapter';
import { registerHandlers, verifyBindToken } from './telegram/handlers';

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

      // 5. Start lightweight HTTP server for bind token verification + callbacks
      const httpServer = http.createServer((req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.url?.startsWith('/api/bind/verify')) {
          const url = new URL(req.url, `http://localhost:${config.botPort}`);
          const token = url.searchParams.get('token');
          if (token && verifyBindToken(token)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: true }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: false, error: 'Invalid or expired token' }));
          }
        } else if (req.url?.startsWith('/api/bind/callback') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: string) => { body += chunk; });
          req.on('end', () => {
            try {
              const { platform_user_id, jwt, refresh_secret } = JSON.parse(body);
              if (!platform_user_id || !jwt) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing platform_user_id or jwt' }));
                return;
              }
              const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
              bridge.sessions.upsertBinding(platform_user_id, jwt, expiresAt, refresh_secret || '');
              bridge.connectUser(platform_user_id, jwt);
              console.log(`[Bot] Bind callback: user ${platform_user_id} connected`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      httpServer.listen(config.botPort, () => {
        console.log(`[Bot] HTTP server listening on port ${config.botPort}`);
      });

      // 6. Start bridge
      await bridge.start();
      console.log('[Bot] Telegram bot is running. Press Ctrl+C to stop.');

      // Graceful shutdown
      const shutdown = () => {
        console.log('\n[Bot] Shutting down...');
        bridge.sockets.disconnectAll();
        bridge.sessions.close();
        httpServer.close();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } else {
      console.error(`Error: Unsupported platform: ${config.platform}`);
      process.exit(1);
    }
  });

program.parse();
