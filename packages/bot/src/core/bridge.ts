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

/** Tracks streaming state per chat for text_delta editing */
interface StreamingState {
  messageId: number | undefined;    // Telegram message ID being edited
  accumulated: string;              // Full accumulated text so far
  lastEditAt: number;               // Timestamp of last edit (ms)
  lastEditText: string;             // Text sent in last edit (to skip redundant edits)
  editCount: number;                // Edits in current throttle window
  windowStart: number;              // Start of current 1-min throttle window (ms)
}

const STREAM_EDIT_THROTTLE_MS = 3000;   // Min interval between edits (20/min = 3s)
const STREAM_CHUNK_LIMIT = 3900;         // Max chars before splitting to new message
const STREAM_INITIAL_DEBOUNCE_MS = 500;  // Wait before first edit to batch early deltas

export class Bridge {
  readonly sockets: SocketClientManager;
  readonly sessions: SessionStore;
  readonly permissions: PermissionManager;
  readonly platform: BotPlatform;
  readonly config: BotConfig;
  readonly cachedMachines = new Map<string, unknown[]>();  // chatId → last machines list
  readonly pendingMessages = new Map<string, string>();      // chatId → message to send after session starts
  private streamingStates = new Map<string, StreamingState>(); // chatId → streaming state

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
        // Send any pending message that triggered the session
        const pending = this.pendingMessages.get(platformUserId);
        if (pending) {
          this.pendingMessages.delete(platformUserId);
          this.sockets.emit(platformUserId, SocketEvents.CHAT_SEND, {
            session_id: data.sessionId,
            content: pending,
          });
        }
      },
      onProjectsList: (data) => {
        const projects = (data as any).projects || [];
        const text = projects.length === 0
          ? '📂 No projects found.'
          : `📂 Projects:\n${projects.map((p: any, i: number) => `${i + 1}. ${p.name || p.path}`).join('\n')}`;
        this.platform.sendMessage(platformUserId, { text });
      },
      onSessionsList: (data) => {
        const sessions = (data as any).sessions || [];
        const text = sessions.length === 0
          ? '📋 No historical sessions.'
          : `📋 Sessions:\n${sessions.map((s: any, i: number) => `${i + 1}. ${s.id} (${s.mode || 'chat'})`).join('\n')}`;
        this.platform.sendMessage(platformUserId, { text });
      },
      onChatMessage: (data) => {
        if (data.type === 'text') {
          // Initial text event — send new message, start streaming state
          const content = data.content ?? '';
          this.platform.sendMessage(platformUserId, { text: content || '...' }).then((msgId) => {
            this.streamingStates.set(platformUserId, {
              messageId: msgId,
              accumulated: content,
              lastEditAt: 0,
              lastEditText: content,
              editCount: 0,
              windowStart: Date.now(),
            });
          });
        } else if (data.type === 'text_delta') {
          // Streaming delta — edit existing message
          const delta = data.content ?? '';
          this.handleTextDelta(platformUserId, delta);
        }
      },
      onChatToolUse: (data) => {
        // Finalize any active streaming message before showing tool use
        this.finalizeStreaming(platformUserId);
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
        this.finalizeStreaming(platformUserId);
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
   * Handle text_delta: edit existing message in-place with throttling.
   * When accumulated text exceeds STREAM_CHUNK_LIMIT, start a new message.
   */
  private handleTextDelta(chatId: string, delta: string): void {
    let state = this.streamingStates.get(chatId);
    if (!state) {
      // No initial 'text' event received yet — create state and send initial message
      state = {
        messageId: undefined,
        accumulated: '',
        lastEditAt: 0,
        lastEditText: '',
        editCount: 0,
        windowStart: Date.now(),
      };
      this.streamingStates.set(chatId, state);
    }

    state.accumulated += delta;

    // If message ID not yet available (initial sendMessage still pending), skip
    if (state.messageId === undefined) return;

    // Throttle: skip edit if too soon
    const now = Date.now();
    if (now - state.lastEditAt < STREAM_EDIT_THROTTLE_MS) return;

    // Throttle window tracking (max 20 edits per 60s)
    if (now - state.windowStart > 60000) {
      state.editCount = 0;
      state.windowStart = now;
    }
    if (state.editCount >= 20) return;

    // Check if content changed since last edit
    if (state.accumulated === state.lastEditText) return;

    // Check if we need to split to a new message (exceeded chunk limit)
    if (state.accumulated.length > STREAM_CHUNK_LIMIT) {
      // Send accumulated content as new message, reset state
      const chunks = splitContent(state.accumulated);
      for (const chunk of chunks) {
        this.platform.sendMessage(chatId, { text: chunk.text });
      }
      state.accumulated = '';
      state.lastEditText = '';
      state.messageId = undefined; // Will be set by next sendMessage
      state.editCount = 0;
      this.streamingStates.delete(chatId);
      return;
    }

    // Edit existing message
    const editContent = state.accumulated || '...';
    state.editCount++;
    state.lastEditAt = now;
    state.lastEditText = state.accumulated;
    this.platform.editMessage(chatId, state.messageId, { text: editContent });
  }

  /**
   * Finalize streaming: send any remaining accumulated content as a final message.
   */
  private finalizeStreaming(chatId: string): void {
    const state = this.streamingStates.get(chatId);
    if (!state) return;

    // If there's accumulated content that differs from what was last edited, send it
    if (state.accumulated && state.accumulated !== state.lastEditText) {
      if (state.messageId !== undefined) {
        // Try to edit the existing message with final content
        this.platform.editMessage(chatId, state.messageId, { text: state.accumulated });
      } else {
        // No message ID — send as new message
        this.platform.sendMessage(chatId, { text: state.accumulated });
      }
    }

    this.streamingStates.delete(chatId);
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
