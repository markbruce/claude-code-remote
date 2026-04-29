/**
 * Feishu command handlers
 * Mirrors Telegram handlers.ts but uses adapter.registerCommand() instead of bot.command()
 */

import crypto from 'crypto';
import { FeishuAdapter } from './adapter';
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

export function registerHandlers(adapter: FeishuAdapter, bridge: Bridge): void {
  // Register commands with adapter (text-based routing)
  bridge.platform.registerCommands(BOT_COMMANDS);

  // /start — Bind account
  adapter.registerCommand('start', async (chatId) => {
    const session = bridge.sessions.getByPlatformUserId(chatId);

    if (session && session.state !== 'unbound') {
      await adapter.sendMessage(chatId, { text: '✅ You are already bound! Use /machines to see your machines.' });
      return;
    }

    // Generate cryptographically secure bind token
    const token = crypto.randomBytes(32).toString('hex');
    bindTokens.set(token, { chatId, createdAt: Date.now() });
    const bindUrl = `${bridge.config.publicUrl}/bind-feishu?token=${token}&platform_user_id=${chatId}&chat_id=${chatId}`;

    await adapter.sendMessage(chatId, {
      text: `Welcome! To bind your account, open this link in your browser:\n\n${bindUrl}\n\n(Link expires in 10 minutes)`,
    });
  });

  // /machines — List online machines
  adapter.registerCommand('machines', async (chatId) => {
    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session || session.state === 'unbound') {
      await adapter.sendMessage(chatId, { text: 'Please bind your account first with /start' });
      return;
    }

    const sent = bridge.sockets.emit(chatId, SocketEvents.MACHINES_LIST, {});
    if (!sent) {
      await adapter.sendMessage(chatId, { text: '❌ Not connected to server. Try again later.' });
    }
  });

  // /use — Select machine
  adapter.registerCommand('use', async (chatId, arg) => {
    if (!arg) {
      await adapter.sendMessage(chatId, { text: 'Usage: /use <number-or-name>' });
      return;
    }

    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session || session.state === 'unbound') {
      await adapter.sendMessage(chatId, { text: 'Please bind your account first with /start' });
      return;
    }

    const machines = bridge.cachedMachines.get(chatId);
    if (!machines) {
      await adapter.sendMessage(chatId, { text: 'Machine list not loaded. Use /machines first.' });
      return;
    }

    let machine: any;
    const idx = parseInt(arg, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < machines.length) {
      machine = machines[idx];
    } else {
      machine = machines.find((m: any) => m.name === arg || m.name.toLowerCase().includes(arg.toLowerCase()));
    }

    if (!machine) {
      await adapter.sendMessage(chatId, { text: `Machine "${arg}" not found. Use /machines to see available machines.` });
      return;
    }

    bridge.sessions.updateMachine(chatId, machine.id, machine.name);
    await adapter.sendMessage(chatId, {
      text: `🖥 Machine selected: ${machine.name} (${machine.hostname})\nUse /projects to see available projects.`,
    });
  });

  // /projects — List projects
  adapter.registerCommand('projects', async (chatId) => {
    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session?.machine_id) {
      await adapter.sendMessage(chatId, { text: 'Select a machine first with /use <name>' });
      return;
    }

    bridge.sockets.emit(chatId, SocketEvents.SCAN_PROJECTS, {
      machine_id: session.machine_id,
      request_id: `req-${Date.now()}`,
    });
  });

  // /cd — Select project
  adapter.registerCommand('cd', async (chatId, arg) => {
    if (!arg) {
      await adapter.sendMessage(chatId, { text: 'Usage: /cd <number-or-path>' });
      return;
    }

    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session?.machine_id) {
      await adapter.sendMessage(chatId, { text: 'Select a machine first with /use <name>' });
      return;
    }

    // Try number index from cached projects
    const projects = bridge.cachedProjects.get(chatId);
    if (projects && projects.length > 0) {
      const idx = parseInt(arg, 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < projects.length) {
        const project = projects[idx] as any;
        bridge.sessions.updateProject(chatId, project.path);
        await adapter.sendMessage(chatId, {
          text: `📂 Project set to: ${project.path}\nUse /history to resume a session, or just type a message to start chatting with Claude.`,
        });
        return;
      }
    }

    // Fallback: treat as path
    bridge.sessions.updateProject(chatId, arg);
    await adapter.sendMessage(chatId, {
      text: `📂 Project set to: ${arg}\nUse /history to resume a session, or just type a message to start chatting with Claude.`,
    });
  });

  // /chat — Send message to Claude
  adapter.registerCommand('chat', async (chatId, message) => {
    if (!message) {
      await adapter.sendMessage(chatId, {
        text: '💡 You can just type your message directly — no need for /chat.\nOr use /chat <message> to be explicit.',
      });
      return;
    }

    bridge.handleMessagePublic(chatId, message);
  });

  // /new — Clear session
  adapter.registerCommand('new', async (chatId) => {
    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (session?.session_id) {
      bridge.sockets.emit(chatId, SocketEvents.CHAT_ABORT, { session_id: session.session_id });
    }
    bridge.sessions.resetSession(chatId);
    await adapter.sendMessage(chatId, { text: '🔄 Session cleared. Just type a message to start a new one.' });
  });

  // /stop — Abort current Claude response
  adapter.registerCommand('stop', async (chatId) => {
    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session?.session_id) {
      await adapter.sendMessage(chatId, { text: 'No active session to stop.' });
      return;
    }
    bridge.sockets.emit(chatId, SocketEvents.CHAT_ABORT, { session_id: session.session_id });
    await adapter.sendMessage(chatId, { text: '⏹ Stopped.' });
  });

  // /status — Show current state
  adapter.registerCommand('status', async (chatId) => {
    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session || session.state === 'unbound') {
      await adapter.sendMessage(chatId, { text: '❌ Not bound. Use /start to bind your account.' });
      return;
    }

    const lines = [
      '📊 **Current State**',
      `  Account: ✅ Bound`,
      `  Machine: ${session.machine_name || '❌ Not selected'}`,
      `  Project: ${session.project_path || '❌ Not selected'}`,
      `  Session: ${session.session_id ? '✅ Active' : '❌ None'}`,
      `  State: ${session.state}`,
      `  Connected: ${bridge.sockets.emit(chatId, 'ping', {}) ? '✅' : '❌'}`,
    ];
    await adapter.sendMessage(chatId, { text: lines.join('\n') });
  });

  // /history — List sessions
  adapter.registerCommand('history', async (chatId) => {
    const session = bridge.sessions.getByPlatformUserId(chatId);
    if (!session?.machine_id || !session?.project_path) {
      await adapter.sendMessage(chatId, { text: 'Set up a machine and project first.' });
      return;
    }

    bridge.sockets.emit(chatId, SocketEvents.LIST_SESSIONS, {
      machine_id: session.machine_id,
      project_path: session.project_path,
      request_id: `req-${Date.now()}`,
    });
  });
}
