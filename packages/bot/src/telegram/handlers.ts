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

  // /use — Select machine (by name or number index)
  bot.command('use', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const arg = ctx.match?.trim();

    if (!arg) {
      await ctx.reply('Usage: /use <number-or-name>');
      return;
    }

    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session || session.state === 'unbound') {
      await ctx.reply('Please bind your account first with /start');
      return;
    }

    const machines = bridge.cachedMachines.get(chatId);
    if (!machines) {
      await ctx.reply('Machine list not loaded. Use /machines first.');
      return;
    }

    let machine: any;
    const idx = parseInt(arg, 10) - 1; // 1-based to 0-based
    if (!isNaN(idx) && idx >= 0 && idx < machines.length) {
      machine = machines[idx];
    } else {
      machine = machines.find((m: any) => m.name === arg || m.name.toLowerCase().includes(arg.toLowerCase()));
    }

    if (!machine) {
      await ctx.reply(`Machine "${arg}" not found. Use /machines to see available machines.`);
      return;
    }

    bridge.sessions.updateMachine(chatId, machine.id, machine.name);
    await ctx.reply(`🖥 Machine selected: ${machine.name} (${machine.hostname})\nUse /projects to see available projects.`);
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

  // /cd — Select project (by path or number index)
  bot.command('cd', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const arg = ctx.match?.trim();

    if (!arg) {
      await ctx.reply('Usage: /cd <number-or-path>');
      return;
    }

    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session?.machine_id) {
      await ctx.reply('Select a machine first with /use <name>');
      return;
    }

    // Try number index from cached projects
    const projects = bridge.cachedProjects.get(chatId);
    if (projects && projects.length > 0) {
      const idx = parseInt(arg, 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < projects.length) {
        const project = projects[idx] as any;
        bridge.sessions.updateProject(chatId, project.path);
        await ctx.reply(`📂 Project set to: ${project.path}\nUse /history to resume a session, or just type a message to start chatting with Claude.`);
        return;
      }
    }

    // Fallback: treat as path
    bridge.sessions.updateProject(chatId, arg);
    await ctx.reply(`📂 Project set to: ${arg}\nUse /history to resume a session, or just type a message to start chatting with Claude.`);
  });

  // /chat — Send message to Claude (also works by just typing text directly)
  bot.command('chat', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const message = ctx.match?.trim();

    if (!message) {
      await ctx.reply('💡 You can just type your message directly — no need for /chat.\nOr use /chat <message> to be explicit.');
      return;
    }

    // Delegate to bridge.handleMessage (same as direct text)
    bridge.handleMessagePublic(chatId, message);
  });

  // /new — Clear session, start fresh
  bot.command('new', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (session?.session_id) {
      // Abort any running session
      bridge.sockets.emit(chatId, SocketEvents.CHAT_ABORT, { session_id: session.session_id });
    }
    bridge.sessions.resetSession(chatId);
    await ctx.reply('🔄 Session cleared. Just type a message to start a new one.');
  });

  // /stop — Abort current Claude response (keep session alive)
  bot.command('stop', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session?.session_id) {
      await ctx.reply('No active session to stop.');
      return;
    }
    bridge.sockets.emit(chatId, SocketEvents.CHAT_ABORT, { session_id: session.session_id });
    await ctx.reply('⏹ Stopped.');
  });

  // /status — Show current state
  bot.command('status', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const session = bridge.sessions.getByPlatformUserId(chatId);

    if (!session || session.state === 'unbound') {
      await ctx.reply('❌ Not bound. Use /start to bind your account.');
      return;
    }

    const lines = [
      `📊 **Current State**`,
      `  Account: ✅ Bound`,
      `  Machine: ${session.machine_name || '❌ Not selected'}`,
      `  Project: ${session.project_path || '❌ Not selected'}`,
      `  Session: ${session.session_id ? '✅ Active' : '❌ None'}`,
      `  State: ${session.state}`,
      `  Connected: ${bridge.sockets.emit(chatId, 'ping', {}) ? '✅' : '❌'}`,
    ];
    await ctx.reply(lines.join('\n'));
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
}
