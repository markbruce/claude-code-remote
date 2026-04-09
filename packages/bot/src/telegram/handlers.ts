/**
 * Telegram command handlers
 */

import crypto from 'crypto';
import { Bot } from 'grammy';
import { Bridge } from '../core/bridge';
import { SocketEvents } from 'cc-remote-shared';
import { BOT_COMMANDS } from './commands';

// In-memory bind tokens: token → { chatId, createdAt }
const bindTokens = new Map<string, { chatId: string; createdAt: number }>();

// Clean expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of bindTokens) {
    if (now - entry.createdAt > 10 * 60 * 1000) {
      bindTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

/** Verify a bind token and return the associated chat ID, or undefined */
export function verifyBindToken(token: string): string | undefined {
  const entry = bindTokens.get(token);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > 10 * 60 * 1000) {
    bindTokens.delete(token);
    return undefined;
  }
  return entry.chatId;
}

export function registerHandlers(bot: Bot, bridge: Bridge): void {
  // Register commands with Telegram
  bridge.platform.registerCommands(BOT_COMMANDS);

  // /start — Bind account
  bot.command('start', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = bridge.sessions.getByPlatformUserId(chatId);

    if (session && session.state !== 'unbound') {
      await ctx.reply('✅ You are already bound! Use /machines to see your machines.');
      return;
    }

    // Generate cryptographically secure bind token
    const token = crypto.randomBytes(32).toString('hex');
    bindTokens.set(token, { chatId, createdAt: Date.now() });
    const bindUrl = `${bridge.config.serverUrl}/bind-telegram?token=${token}&platform_user_id=${chatId}&chat_id=${chatId}`;

    await ctx.reply(
      `Welcome! To bind your account, open this link in your browser:\n\n${bindUrl}\n\n(Link expires in 10 minutes)`,
      { parse_mode: undefined },
    );
  });

  // /machines — List online machines
  bot.command('machines', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = bridge.sessions.getByPlatformUserId(chatId);

    if (!session || session.state === 'unbound') {
      await ctx.reply('Please bind your account first with /start');
      return;
    }

    // Request machines list via Socket.IO
    const sent = bridge.sockets.emit(chatId, SocketEvents.MACHINES_LIST, {});
    if (!sent) {
      await ctx.reply('❌ Not connected to server. Try again later.');
    }
  });

  // /use — Select machine
  bot.command('use', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const name = ctx.match?.trim();

    if (!name) {
      await ctx.reply('Usage: /use <machine-name>');
      return;
    }

    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session || session.state === 'unbound') {
      await ctx.reply('Please bind your account first with /start');
      return;
    }

    // Look up machine by name from cached machines list
    // The bridge stores the last MACHINES_LIST response per chatId
    const machines = bridge.cachedMachines.get(chatId);
    if (!machines) {
      await ctx.reply('Machine list not loaded. Use /machines first.');
      return;
    }
    const machine = machines.find((m: any) => m.name === name || m.name.toLowerCase().includes(name.toLowerCase()));
    if (!machine) {
      await ctx.reply(`Machine "${name}" not found. Use /machines to see available machines.`);
      return;
    }

    const found = machine as any;
    bridge.sessions.updateMachine(chatId, found.id, found.name);
    await ctx.reply(`🖥 Machine selected: ${found.name} (${found.hostname})\nUse /projects to see available projects.`);
  });

  // /projects — List projects
  bot.command('projects', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = bridge.sessions.getByPlatformUserId(chatId);

    if (!session?.machine_id) {
      await ctx.reply('Select a machine first with /use <name>');
      return;
    }

    bridge.sockets.emit(chatId, SocketEvents.SCAN_PROJECTS, {
      machine_id: session.machine_id,
      request_id: `req-${Date.now()}`,
    });
  });

  // /cd — Select project
  bot.command('cd', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const path = ctx.match?.trim();

    if (!path) {
      await ctx.reply('Usage: /cd <project-path>');
      return;
    }

    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session?.machine_id) {
      await ctx.reply('Select a machine first with /use <name>');
      return;
    }

    bridge.sessions.updateProject(chatId, path);
    await ctx.reply(`📂 Project set to: ${path}\nUse /chat <message> to start talking to Claude.`);
  });

  // /chat — Start or continue chat session
  bot.command('chat', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const message = ctx.match?.trim();

    if (!message) {
      await ctx.reply('Usage: /chat <your message>');
      return;
    }

    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session?.machine_id || !session?.project_path) {
      await ctx.reply('Set up a machine and project first. Use /machines and /cd');
      return;
    }

    // If no active session, start one
    if (!session.session_id) {
      bridge.pendingMessages.set(chatId, message); // Store message to send after session starts
      bridge.sockets.emit(chatId, SocketEvents.START_SESSION, {
        machine_id: session.machine_id,
        project_path: session.project_path,
        mode: 'chat',
        request_id: `req-${Date.now()}`,
      });
    } else {
      // Send to existing session
      bridge.sockets.emit(chatId, SocketEvents.CHAT_SEND, {
        session_id: session.session_id,
        content: message,
      });
    }
  });

  // /new — Start new session
  bot.command('new', async (ctx) => {
    const chatId = String(ctx.chat.id);
    bridge.sessions.resetSession(chatId);
    await ctx.reply('🔄 Previous session cleared. Use /chat <message> to start a new session.');
  });

  // /history — List sessions
  bot.command('history', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = bridge.sessions.getByPlatformUserId(chatId);

    if (!session?.machine_id || !session?.project_path) {
      await ctx.reply('Set up a machine and project first.');
      return;
    }

    bridge.sockets.emit(chatId, SocketEvents.LIST_SESSIONS, {
      machine_id: session.machine_id,
      project_path: session.project_path,
      request_id: `req-${Date.now()}`,
    });
  });

  // /cancel — Cancel current operation
  bot.command('cancel', async (ctx) => {
    const chatId = String(ctx.chat.id);
    bridge.sessions.resetSession(chatId);
    await ctx.reply('✅ Cancelled.');
  });
}
