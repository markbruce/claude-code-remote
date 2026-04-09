/**
 * Bridge — Routes messages between platform adapters and Socket.IO events.
 * This is the orchestrator that ties core modules together.
 */

import { SocketClientManager, SocketEventHandlers } from './socket-client';
import { SessionStore, UserSession } from './session-store';
import { PermissionManager } from './permission';
import { splitContent } from './splitter';
import { BotPlatform, MessageContent } from '../shared/platform';
import { SocketEvents } from 'cc-remote-shared';
import { loadConfig, BotConfig } from '../config';

export class Bridge {
  readonly sockets: SocketClientManager;
  readonly sessions: SessionStore;
  readonly permissions: PermissionManager;
  readonly platform: BotPlatform;
  readonly config: BotConfig;
  readonly cachedMachines = new Map<string, unknown[]>();  // chatId → last machines list

  constructor(platform: BotPlatform, config?: BotConfig) {
    this.config = config || loadConfig();
    this.platform = platform;
    this.sockets = new SocketClientManager(this.config.serverUrl);
    this.sessions = new SessionStore();
    this.permissions = new PermissionManager();

    // Auto-deny on permission timeout
    this.permissions.setOnTimeout((requestId, sessionId, chatId) => {
      this.platform.sendMessage(chatId, { text: '⏰ Permission request timed out — auto-denied.' });
      // Send deny to agent
      const session = this.sessions.getByPlatformUserId(chatId);
      if (session) {
        this.sockets.emit(chatId, SocketEvents.CHAT_PERMISSION_ANSWER, {
          session_id: sessionId,
          requestId,
          approved: false,
        });
      }
    });

    // Wire platform events
    this.platform.onMessage(this.handleMessage.bind(this));
    this.platform.onCallback(this.handleCallback.bind(this));
  }

  /**
   * Start the bridge: connect platform and recover sessions.
   */
  async start(): Promise<void> {
    await this.platform.start();
    this.recoverSessions();
    console.log('[Bridge] Started');
  }

  /**
   * Handle incoming text message from platform.
   */
  private async handleMessage(chatId: string, text: string): Promise<void> {
    const session = this.sessions.getByPlatformUserId(chatId);

    // Commands are handled by telegram/handlers.ts — this is for chat messages only
    if (!session || session.state !== 'in_session' || !session.session_id) {
      this.platform.sendMessage(chatId, { text: 'No active session. Use /chat <message> to start one.' });
      return;
    }

    // Send message to Claude via Socket.IO
    this.sockets.emit(chatId, SocketEvents.CHAT_SEND, {
      session_id: session.session_id,
      content: text,
    });
  }

  /**
   * Handle callback (button press) from platform.
   */
  private async handleCallback(chatId: string, action: string, data: string): Promise<void> {
    const callbackKey = parseInt(data, 10);
    if (isNaN(callbackKey)) return;

    const approved = action === 'approve';
    const pending = this.permissions.resolve(callbackKey, approved);

    if (!pending) {
      this.platform.sendMessage(chatId, { text: 'Permission request expired or unknown.' });
      return;
    }

    this.sockets.emit(chatId, SocketEvents.CHAT_PERMISSION_ANSWER, {
      session_id: pending.sessionId,
      requestId: pending.requestId,
      approved,
    });

    this.platform.sendMessage(chatId, {
      text: approved ? `✅ Approved: ${pending.toolName}` : `❌ Denied: ${pending.toolName}`,
    });
  }

  /**
   * Connect a newly bound user and set up Socket.IO event handlers.
   */
  connectUser(platformUserId: string, jwt: string): void {
    const handlers: SocketEventHandlers = {
      onMachinesList: (data) => {
        // Cache machines for /use command lookup
        this.cachedMachines.set(platformUserId, data.machines);
        const text = `🖥 Machines:\n${data.machines.map((m: any, i: number) => `${i + 1}. ${m.name} (${m.hostname})`).join('\n')}`;
        this.platform.sendMessage(platformUserId, { text });
      },
      onSessionStarted: (data) => {
        this.sessions.updateSession(platformUserId, data.sessionId);
        this.platform.sendMessage(platformUserId, { text: `🚀 Session started: ${data.projectPath}` });
      },
      onChatMessage: (data) => {
        if (data.type === 'text' && data.content) {
          const chunks = splitContent(data.content);
          for (const chunk of chunks) {
            this.platform.sendMessage(platformUserId, { text: chunk.text });
          }
        }
      },
      onChatToolUse: (data) => {
        if (data.toolName) {
          const text = `🔧 **${data.toolName}**\n\`\`\`\n${data.toolInput || ''}\n\`\`\``;
          this.platform.sendMessage(platformUserId, { text, parseMode: 'Markdown' });
        }
      },
      onChatToolResult: (data) => {
        if (data.toolResult) {
          const chunks = splitContent(data.toolResult);
          for (const chunk of chunks) {
            this.platform.sendMessage(platformUserId, {
              text: chunk.isCodeBlock ? chunk.text : `\`\`\`\n${chunk.text}\n\`\`\``,
              parseMode: 'Markdown',
            });
          }
        }
      },
      onChatPermissionRequest: (data) => {
        const key = this.permissions.register(
          data.session_id,
          data.requestId,
          platformUserId,
          data.toolName,
          JSON.stringify(data.toolInput),
        );
        this.platform.sendPermission(platformUserId, {
          sessionId: data.session_id,
          requestId: data.requestId,
          toolName: data.toolName,
          description: JSON.stringify(data.toolInput).substring(0, 200),
          timeout: 300000,
          callbackKey: key,  // Pass the key so adapter uses it for inline keyboard
        } as any);
      },
      onChatComplete: () => {
        this.sessions.resetSession(platformUserId);
        this.platform.sendMessage(platformUserId, { text: '📋 Session ended.' });
      },
      onChatError: (data) => {
        this.platform.sendMessage(platformUserId, { text: `⚠️ Error: ${data.content || 'Unknown error'}` });
      },
      onSessionEnd: () => {
        this.sessions.resetSession(platformUserId);
        this.platform.sendMessage(platformUserId, { text: '📋 Session ended by agent.' });
      },
      onError: (data) => {
        this.platform.sendMessage(platformUserId, { text: `❌ ${data.message}` });
      },
    };

    this.sockets.connect(platformUserId, jwt, handlers);
  }

  /**
   * Recover sessions after bot restart.
   */
  private recoverSessions(): void {
    const bound = this.sessions.getAllBound();
    console.log(`[Bridge] Recovering ${bound.length} bound sessions...`);

    for (const session of bound) {
      // TODO: Check JWT expiry and refresh if needed (requires HTTP call to server)
      if (session.jwt) {
        this.connectUser(session.platform_user_id, session.jwt);
      }
    }
  }
}
