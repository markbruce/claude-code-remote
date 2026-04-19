#!/usr/bin/env node

/**
 * cc-bot — Claude Code Remote Bot Service
 * CLI entry point that starts the bot bridge.
 * Supports running Telegram and Feishu simultaneously in one process.
 */

import 'dotenv/config';
import http from 'http';
import { Command } from 'commander';
import { loadConfig, BotConfig } from './config';
import { Bridge } from './core/bridge';
import { TelegramAdapter } from './telegram/adapter';
import { registerHandlers as registerTelegramHandlers, verifyBindToken as verifyTelegramBindToken } from './telegram/handlers';
import { FeishuAdapter } from './feishu/adapter';
import { registerHandlers as registerFeishuHandlers, verifyBindToken as verifyFeishuBindToken } from './feishu/handlers';

interface PlatformSetup {
  platform: string;
  bridge: Bridge;
  cardWebhookHandler?: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  close?: () => void;
}

const program = new Command();

program
  .name('cc-bot')
  .description('Claude Code Remote Bot Service — IM bridge for Claude Code sessions')
  .version('0.1.0')
  .option('--bot-token <token>', 'Telegram bot token (or set TELEGRAM_BOT_TOKEN)')
  .option('--server <url>', 'Server URL (or set BOT_SERVER_URL)')
  .option('--port <port>', 'Bot HTTP port (or set BOT_PORT)', '3001')
  .option('--feishu-app-id <id>', 'Feishu App ID (or set FEISHU_APP_ID)')
  .option('--feishu-app-secret <secret>', 'Feishu App Secret (or set FEISHU_APP_SECRET)')
  .option('--feishu-verification-token <token>', 'Feishu verification token (or set FEISHU_VERIFICATION_TOKEN)')
  .option('--feishu-encrypt-key <key>', 'Feishu encrypt key (or set FEISHU_ENCRYPT_KEY)')
  .action(async (options) => {
    const config = loadConfig({
      serverUrl: options.server,
      botPort: parseInt(options.port, 10),
      telegramBotToken: options.botToken,
      feishuAppId: options.feishuAppId,
      feishuAppSecret: options.feishuAppSecret,
      feishuVerificationToken: options.feishuVerificationToken,
      feishuEncryptKey: options.feishuEncryptKey,
    });

    const platforms: PlatformSetup[] = [];

    console.log('');
    console.log('=================================');
    console.log('  Claude Code Remote Bot');
    console.log('=================================');
    console.log(`  Server:   ${config.serverUrl}`);
    console.log(`  Bot Port: ${config.botPort}`);
    console.log(`  Telegram: ${config.telegramBotToken ? '✅ configured' : '❌ not configured'}`);
    console.log(`  Feishu:   ${config.feishuAppId ? '✅ configured' : '❌ not configured'}`);
    console.log('=================================');
    console.log('');

    // ── Telegram ──────────────────────────────────────────────────────
    if (config.telegramBotToken) {
      const adapter = new TelegramAdapter(config.telegramBotToken);
      const bridge = new Bridge(adapter, config);
      adapter.setPermissionManager(bridge.permissions);
      registerTelegramHandlers(adapter.getBot(), bridge);
      platforms.push({ platform: 'telegram', bridge });
      console.log('[Bot] Telegram adapter initialized');
    }

    // ── Feishu ────────────────────────────────────────────────────────
    if (config.feishuAppId && config.feishuAppSecret) {
      const adapter = new FeishuAdapter(
        config.feishuAppId,
        config.feishuAppSecret,
        config.feishuVerificationToken,
        config.feishuEncryptKey,
      );
      const bridge = new Bridge(adapter, config);
      adapter.setPermissionManager(bridge.permissions);
      registerFeishuHandlers(adapter, bridge);
      platforms.push({
        platform: 'feishu',
        bridge,
        cardWebhookHandler: (req, res) => adapter.handleCardWebhook(req, res),
        close: () => adapter.close(),
      });
      console.log('[Bot] Feishu adapter initialized');
    }

    if (platforms.length === 0) {
      console.error('Error: No platform configured. Provide Telegram bot token or Feishu App ID/Secret.');
      process.exit(1);
    }

    // ── Shared HTTP server ────────────────────────────────────────────
    const httpServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Feishu card action callback
      if (req.url === '/webhook/feishu' && req.method === 'POST') {
        const feishuPlatform = platforms.find(p => p.platform === 'feishu');
        if (feishuPlatform?.cardWebhookHandler) {
          feishuPlatform.cardWebhookHandler(req, res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
        return;
      }

      // Bind token verification — try both platforms
      if (req.url?.startsWith('/api/bind/verify')) {
        const url = new URL(req.url, `http://localhost:${config.botPort}`);
        const token = url.searchParams.get('token') || '';
        if (verifyTelegramBindToken(token) || verifyFeishuBindToken(token)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ valid: true }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ valid: false, error: 'Invalid or expired token' }));
        }
        return;
      }

      // Bind callback — find the right bridge by platform_user_id format
      if (req.url?.startsWith('/api/bind/callback') && req.method === 'POST') {
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
            // Route to the right bridge: ou_ = Feishu, numeric = Telegram
            const bridge = platform_user_id.startsWith('ou_')
              ? platforms.find(p => p.platform === 'feishu')?.bridge
              : platforms.find(p => p.platform === 'telegram')?.bridge;

            if (!bridge) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'No matching platform' }));
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
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    httpServer.listen(config.botPort, () => {
      console.log(`[Bot] HTTP server listening on port ${config.botPort}`);
    });

    // ── Start all platforms ───────────────────────────────────────────
    for (const p of platforms) {
      await p.bridge.start();
      console.log(`[Bot] ${p.platform} bridge started`);
    }

    const platformNames = platforms.map(p => p.platform).join(' + ');
    console.log(`[Bot] Running: ${platformNames}. Press Ctrl+C to stop.`);

    // Graceful shutdown
    const shutdown = () => {
      console.log('\n[Bot] Shutting down...');
      for (const p of platforms) {
        p.close?.();
        p.bridge.sockets.disconnectAll();
        p.bridge.sessions.close();
      }
      httpServer.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program.parse();
