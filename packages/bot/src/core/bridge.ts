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
  /** onChatComplete fired; waiting debounced finalize — a new `text` is the next assistant reply */
  completeScheduled?: boolean;
}

const STREAM_EDIT_THROTTLE_MS = 3000;   // Min interval between edits (20/min = 3s)
const STREAM_CHUNK_LIMIT = 3900;         // Max chars before splitting to new message
const STREAM_INITIAL_DEBOUNCE_MS = 500;  // Wait before first edit to batch early deltas
const STREAM_FINALIZE_DEBOUNCE_MS = 1500; // Delay finalize to absorb late text_delta
const FINALIZE_PENDING_FIRST_MSG_RETRIES = 40; // 40 * 50ms — wait for first sendMessage to resolve
const FINALIZE_PENDING_FIRST_MSG_MS = 50;

export class Bridge {
  readonly sockets: SocketClientManager;
  readonly sessions: SessionStore;
  readonly permissions: PermissionManager;
  readonly platform: BotPlatform;
  readonly config: BotConfig;
  readonly cachedMachines = new Map<string, unknown[]>();  // chatId → last machines list
  readonly cachedProjects = new Map<string, unknown[]>();  // chatId → last projects list
  readonly cachedSessions = new Map<string, unknown[]>();  // chatId → last sessions list
  readonly pendingMessages = new Map<string, string>();      // chatId → message to send after session starts
  private streamingStates = new Map<string, StreamingState>(); // chatId → streaming state
  private finalizeTimers = new Map<string, NodeJS.Timeout>();  // chatId → pending finalize timer
  private pendingFreeText = new Map<string, { callbackKey: number; question: string }>(); // chatId → pending free-text answer

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
  /** Public wrapper for /chat command to reuse handleMessage */
  handleMessagePublic(chatId: string, text: string): void {
    this.handleMessage(chatId, text);
  }

  private async handleMessage(chatId: string, text: string): Promise<void> {
    const session = this.sessions.getByPlatformUserId(chatId);

    // Not bound yet
    if (!session || session.state === 'unbound') {
      this.platform.sendMessage(chatId, { text: 'Please bind your account first with /start' });
      return;
    }

    // No machine/project selected
    if (!session.machine_id || !session.project_path) {
      this.platform.sendMessage(chatId, { text: 'Set up a machine and project first. Use /machines and /cd' });
      return;
    }

    // Intercept free-text answer for AskUserQuestion "Other..."
    const freeText = this.pendingFreeText.get(chatId);
    if (freeText) {
      this.pendingFreeText.delete(chatId);
      const pending = this.permissions.resolve(freeText.callbackKey, true);
      if (pending) {
        this.sockets.emit(chatId, SocketEvents.CHAT_PERMISSION_ANSWER, {
          session_id: pending.sessionId,
          requestId: pending.requestId,
          approved: true,
          updatedInput: { answers: [text] },
        });
        this.platform.sendMessage(chatId, { text: `✅ 已输入: ${text}` });
      } else {
        this.platform.sendMessage(chatId, { text: '⚠️ Question expired.' });
      }
      return;
    }

    // If no active session, auto-start one with the user's message
    if (!session.session_id) {
      this.pendingMessages.set(chatId, text);
      this.sockets.emit(chatId, SocketEvents.START_SESSION, {
        machine_id: session.machine_id,
        project_path: session.project_path,
        mode: 'chat',
        request_id: `req-${Date.now()}`,
      });
      return;
    }

    // End any prior stream for this chat so the next assistant reply never edits the old Telegram bubble
    this.clearFinalizeTimer(chatId);
    this.finalizeStreaming(chatId);

    // Send message to active Claude session via Socket.IO
    this.sockets.emit(chatId, SocketEvents.CHAT_SEND, {
      session_id: session.session_id,
      content: text,
    });
  }

  /**
   * Handle callback (button press) from platform.
   */
  private async handleCallback(chatId: string, action: string, data: string): Promise<void> {
    // AskUserQuestion option selection
    if (action === 'question') {
      const colonIdx = data.indexOf(':');
      if (colonIdx < 0) return;
      const callbackKey = parseInt(data.substring(0, colonIdx), 10);
      const optionData = data.substring(colonIdx + 1);

      // "Other..." — switch to free-text input mode
      if (optionData === 'text') {
        const entry = this.permissions.get(callbackKey);
        if (!entry) {
          this.platform.sendMessage(chatId, { text: '⚠️ Already answered from another client or expired.' });
          return;
        }
        this.pendingFreeText.set(chatId, { callbackKey, question: entry.toolName });
        this.platform.sendMessage(chatId, { text: '💬 请直接输入你的答案：' });
        return;
      }

      // Predefined option
      const optionIndex = parseInt(optionData, 10);
      if (isNaN(callbackKey) || isNaN(optionIndex)) return;

      const pending = this.permissions.resolve(callbackKey, true);
      if (!pending || !pending.toolInput) {
        this.platform.sendMessage(chatId, { text: '⚠️ Already answered from another client or expired.' });
        return;
      }

      try {
        const toolInput = JSON.parse(pending.toolInput);
        const questions = toolInput.questions || [];
        const question = questions[0];
        if (!question || !question.options || optionIndex >= question.options.length) return;

        const selectedLabel = question.options[optionIndex].label;

        this.sockets.emit(chatId, SocketEvents.CHAT_PERMISSION_ANSWER, {
          session_id: pending.sessionId,
          requestId: pending.requestId,
          approved: true,
          updatedInput: { answers: [selectedLabel] },
        });

        this.platform.sendMessage(chatId, { text: `✅ 已选择: ${selectedLabel}` });
      } catch {
        this.platform.sendMessage(chatId, { text: 'Failed to parse question data.' });
      }
      return;
    }

    // Permission approve/deny
    if (action === 'approve' || action === 'deny') {
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
      return;
    }

    // Machine selection
    if (action === 'machine') {
      const machines = this.cachedMachines.get(chatId);
      const idx = parseInt(data, 10);
      if (!machines || isNaN(idx) || idx < 0 || idx >= machines.length) {
        this.platform.sendMessage(chatId, { text: 'Machine not found. Use /machines first.' });
        return;
      }
      const machine = machines[idx] as any;
      this.sessions.updateMachine(chatId, machine.id, machine.name);
      this.platform.sendMessage(chatId, { text: `🖥 Machine selected: ${machine.name} (${machine.hostname})\nUse /projects to see available projects.` });
      return;
    }

    // Project selection
    if (action === 'project') {
      const projects = this.cachedProjects.get(chatId);
      const idx = parseInt(data, 10);
      if (!projects || isNaN(idx) || idx < 0 || idx >= projects.length) {
        this.platform.sendMessage(chatId, { text: 'Project not found. Use /projects first.' });
        return;
      }
      const project = projects[idx] as any;
      this.sessions.updateProject(chatId, project.path);
      this.platform.sendMessage(chatId, { text: `📂 Project set to: ${project.path}\nUse /history to resume a session, or just type a message to start chatting with Claude.` });
      return;
    }

    // Session resume
    if (action === 'session') {
      const sessions = this.cachedSessions.get(chatId);
      const idx = parseInt(data, 10);
      if (!sessions || isNaN(idx) || idx < 0 || idx >= sessions.length) {
        this.platform.sendMessage(chatId, { text: 'Session not found. Use /history first.' });
        return;
      }
      const session = sessions[idx] as any;
      const userSession = this.sessions.getByPlatformUserId(chatId);
      if (!userSession?.machine_id || !userSession?.project_path) {
        this.platform.sendMessage(chatId, { text: 'Set up a machine and project first.' });
        return;
      }
      // Resume the session
      this.sessions.updateSession(chatId, session.sdkSessionId);
      this.sockets.emit(chatId, SocketEvents.START_SESSION, {
        machine_id: userSession.machine_id,
        project_path: userSession.project_path,
        mode: 'chat',
        options: { resume: session.sdkSessionId },
        request_id: `req-${Date.now()}`,
      });
      // Fetch last 10 messages as context
      this.sockets.emit(chatId, SocketEvents.GET_SESSION_MESSAGES, {
        machine_id: userSession.machine_id,
        project_path: userSession.project_path,
        sdk_session_id: session.sdkSessionId,
        limit: 10,
        request_id: `req-${Date.now()}`,
      });
      return;
    }
  }

  /**
   * Connect a newly bound user and set up Socket.IO event handlers.
   */
  connectUser(platformUserId: string, jwt: string): void {
    const handlers: SocketEventHandlers = {
      onMachinesList: (data) => {
        this.cachedMachines.set(platformUserId, data.machines);
        if (data.machines.length === 0) {
          this.platform.sendMessage(platformUserId, { text: '🖥 No machines online.' });
          return;
        }
        const listText = data.machines
          .map((m: any, i: number) => `${i + 1}. ${m.name} (${m.hostname})`)
          .join('\n');
        const buttons = data.machines.map((m: any, i: number) => ({
          text: `${i + 1}. ${m.name}`,
          callbackData: `machine:${i}`,
        }));
        this.platform.sendInlineButtons(platformUserId, `🖥 Machines:\n${listText}`, buttons);
      },
      onSessionStarted: (data) => {
        this.sessions.updateSession(platformUserId, data.sessionId);
        this.platform.sendMessage(platformUserId, { text: `🚀 Session started: ${data.projectPath}` });
        // Send any pending message that triggered the session
        const pending = this.pendingMessages.get(platformUserId);
        if (pending) {
          this.pendingMessages.delete(platformUserId);
          this.clearFinalizeTimer(platformUserId);
          this.finalizeStreaming(platformUserId);
          this.sockets.emit(platformUserId, SocketEvents.CHAT_SEND, {
            session_id: data.sessionId,
            content: pending,
          });
        }
      },
      onProjectsList: (data) => {
        const projects = (data as any).projects || [];
        this.cachedProjects.set(platformUserId, projects);
        if (projects.length === 0) {
          this.platform.sendMessage(platformUserId, { text: '📂 No projects found.' });
          return;
        }
        // Numbered text list for reference
        const listText = projects
          .map((p: any, i: number) => `${i + 1}. ${p.name || p.path}`)
          .join('\n');
        const buttons = projects.map((p: any, i: number) => {
          const label = (p.name || p.path || `Project ${i + 1}`);
          const truncated = label.length > 25 ? label.substring(0, 22) + '...' : label;
          return {
            text: `${i + 1}. ${truncated}`,
            callbackData: `project:${i}`,
          };
        });
        this.platform.sendInlineButtons(platformUserId, `📂 Projects:\n${listText}`, buttons);
      },
      onSessionsList: (data) => {
        const sessions = (data as any).sessions || [];
        this.cachedSessions.set(platformUserId, sessions);
        if (sessions.length === 0) {
          this.platform.sendMessage(platformUserId, { text: '📋 No historical sessions.' });
          return;
        }
        const listText = sessions
          .map((s: any, i: number) => {
            const summary = s.summary || s.firstPrompt || s.sdkSessionId || `Session ${i + 1}`;
            const truncated = summary.length > 40 ? summary.substring(0, 37) + '...' : summary;
            return `${i + 1}. ${truncated}`;
          })
          .join('\n');
        const buttons = sessions.map((s: any, i: number) => {
          const label = (s.summary || s.firstPrompt || `Session ${i + 1}`);
          const truncated = label.length > 25 ? label.substring(0, 22) + '...' : label;
          return {
            text: `${i + 1}. ${truncated}`,
            callbackData: `session:${i}`,
          };
        });
        this.platform.sendInlineButtons(platformUserId, `📋 Sessions:\n${listText}`, buttons);
      },
      onChatMessage: (data) => {
        if (data.type === 'text') {
          this.clearFinalizeTimer(platformUserId);
          let existing = this.streamingStates.get(platformUserId);
          // Previous turn finished (complete) but debounced finalize not run yet — this `text` is a new reply
          if (existing?.completeScheduled) {
            console.log(
              `[Bridge] text event: new assistant message while finalize pending — flushing previous (acc=${existing.accumulated.length})`,
            );
            void this.finalizeStreaming(platformUserId).then(() => {
              this.platform.sendMessage(platformUserId, { text: '✅ done' });
            });
            existing = this.streamingStates.get(platformUserId);
          }
          // Agent may emit multiple empty `text` markers per turn — do not wipe an active stream.
          if (
            existing &&
            !existing.completeScheduled &&
            (existing.accumulated.length > 0 ||
              existing.messageId !== undefined)
          ) {
            console.log(
              `[Bridge] text event: duplicate start marker — keeping stream (acc=${existing.accumulated.length}, msgId=${existing.messageId})`,
            );
            return;
          }
          // Agent sends 'text' event with empty content as streaming start marker
          // Real content arrives via 'text_delta' events
          console.log(`[Bridge] text event: ${(data.content ?? '').length} chars — initializing streaming state`);
          this.streamingStates.set(platformUserId, {
            messageId: undefined,  // No message yet — will be created on first delta
            accumulated: '',
            lastEditAt: 0,
            lastEditText: '',
            editCount: 0,
            windowStart: Date.now(),
            completeScheduled: false,
          });
        } else if (data.type === 'text_delta') {
          // Do NOT clear finalize timer here: late deltas after onChatComplete would cancel
          // the scheduled finalize and never reschedule, leaving the reply stuck.
          const delta = data.content ?? '';
          this.handleTextDelta(platformUserId, delta);
        } else if (data.type === 'complete') {
          // Server sends all events via chat:message channel, not separate channels.
          this.scheduleFinalize(platformUserId);
        } else if (data.type === 'tool_use') {
          // Flush accumulated text before showing tool notification so user sees
          // up-to-date content during the tool execution.
          this.flushStreaming(platformUserId);
          const td = data as any;
          if (td.toolName) {
            const formatted = formatToolNotification(td.toolName, td.toolInput);
            this.platform.sendMessage(platformUserId, { text: formatted, parseMode: 'Markdown' });
          }
        } else if (data.type === 'tool_result') {
          const td = data as any;
          if (td.isError) {
            // Show full error details for debugging
            const result = typeof td.toolResult === 'string'
              ? td.toolResult
              : JSON.stringify(td.toolResult);
            const truncated = result.length > 3500 ? result.substring(0, 3497) + '...' : result;
            this.platform.sendMessage(platformUserId, { text: `❌ Error:\n${truncated}` });
          }
          // Success — silent (the tool_use notification already shows what was called)
        } else if (data.type === 'error') {
          this.platform.sendMessage(platformUserId, { text: `⚠️ Error: ${data.content || 'Unknown error'}` });
        }
      },
      onChatToolUse: (data) => {
        // Flush accumulated text before showing tool notification.
        // Don't finalize (delete state) — Claude continues producing text after tool use.
        // But we MUST push the throttled text to Telegram now, otherwise the user sees
        // stale content during the entire tool execution.
        this.flushStreaming(platformUserId);
        if (data.toolName) {
          const input = typeof data.toolInput === 'string'
            ? data.toolInput
            : JSON.stringify(data.toolInput || {});
          // Truncate long input
          const preview = input.length > 300 ? input.substring(0, 297) + '...' : input;
          this.platform.sendMessage(platformUserId, { text: `🔧 ${data.toolName}\n${preview}` });
        }
      },
      onChatToolResult: (data) => {
        // Only show tool results on error — success is silent.
        if ((data as any).isError && data.toolResult) {
          const result = typeof data.toolResult === 'string'
            ? data.toolResult
            : JSON.stringify(data.toolResult);
          const text = result.length > 3500 ? result.substring(0, 3497) + '...' : result;
          this.platform.sendMessage(platformUserId, { text: `❌ Error:\n${text}` });
        }
      },
      onChatPermissionRequest: (data) => {
        const inputStr = JSON.stringify(data.toolInput);
        const key = this.permissions.register(
          data.session_id,
          data.requestId,
          platformUserId,
          data.toolName,
          inputStr.substring(0, 200),
          300000,
          inputStr,
        );

        // AskUserQuestion — render question options as inline buttons
        if (data.toolName === 'AskUserQuestion') {
          try {
            const input = typeof data.toolInput === 'string'
              ? JSON.parse(data.toolInput)
              : data.toolInput;
            const questions = input?.questions || [];
            const question = questions[0];
            if (question && question.options?.length > 0) {
              const questionText = question.question || 'Please select:';
              const buttons = question.options.slice(0, 5).map((opt: any, i: number) => ({
                text: opt.label.length > 20 ? opt.label.substring(0, 17) + '…' : opt.label,
                callbackData: `question:${key}:${i}`,
              }));
              // Add "Other..." button for free-text input
              buttons.push({
                text: '✏️ Other...',
                callbackData: `question:${key}:text`,
              });
              this.platform.sendInlineButtons(platformUserId, `❓ ${questionText}`, buttons);
              return;
            }
          } catch {
            // Fall through to default permission handling
          }
        }

        // Default tool permission — approve/deny
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
        // Claude finished one response.
        // Delay finalization slightly to absorb late-arriving text_delta frames.
        this.scheduleFinalize(platformUserId);
      },
      onChatError: (data) => {
        this.platform.sendMessage(platformUserId, { text: `⚠️ Error: ${data.content || 'Unknown error'}` });
      },
      onSessionEnd: () => {
        this.sessions.resetSession(platformUserId);
        this.platform.sendMessage(platformUserId, { text: '📋 Session ended by agent.' });
      },
      onSessionMessages: (data) => {
        const messages = (data.messages || []) as any[];
        if (messages.length === 0) {
          this.platform.sendMessage(platformUserId, { text: '📭 No messages in this session.' });
          return;
        }
        // Send a condensed history summary
        let history = `📜 Session History (${messages.length} messages):\n━━━━━━━━━━━━━\n`;
        for (const msg of messages) {
          const role = msg.role === 'user' ? '👤' : '🤖';
          const content = (msg.content || '');
          // Truncate long messages
          const text = typeof content === 'string'
            ? (content.length > 200 ? content.substring(0, 197) + '...' : content)
            : JSON.stringify(content).substring(0, 200);
          history += `${role} ${text}\n\n`;
          // Telegram message limit is 4096 chars — split if needed
          if (history.length > 3800) {
            this.platform.sendMessage(platformUserId, { text: history });
            history = '';
          }
        }
        if (history) {
          this.platform.sendMessage(platformUserId, { text: history });
        }
        this.platform.sendMessage(platformUserId, { text: '💡 Just type a message to continue this session.' });
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
      state = {
        messageId: undefined,
        accumulated: '',
        lastEditAt: 0,
        lastEditText: '',
        editCount: 0,
        windowStart: Date.now(),
        completeScheduled: false,
      };
      this.streamingStates.set(chatId, state);
    }

    state.accumulated += delta;

    // No message created yet — send initial message with accumulated content
    if (state.messageId === undefined) {
      if (!state.accumulated.length) return;

      const displayText = state.accumulated.length > STREAM_CHUNK_LIMIT
        ? state.accumulated.substring(0, STREAM_CHUNK_LIMIT)
        : state.accumulated;

      // Mark as pending immediately to prevent duplicate sends from concurrent deltas
      state.messageId = -1;
      this.platform.sendMessage(chatId, { text: displayText || '...' }).then((msgId) => {
        const s = this.streamingStates.get(chatId);
        if (!s) return;
        s.messageId = msgId ?? undefined;
        const full = s.accumulated;
        if (s.messageId !== undefined && full !== displayText) {
          this.platform.editMessage(chatId, s.messageId, { text: full || '...' });
        }
        s.lastEditText = full;
        s.lastEditAt = Date.now();
        s.editCount = 1;
      });
      return;
    }

    // Still waiting for initial message to be sent — buffer deltas silently
    if (state.messageId === -1) return;

    // Check if we need to split to a new message (exceeded chunk limit)
    if (state.accumulated.length > STREAM_CHUNK_LIMIT) {
      console.log(`[Bridge] text_delta exceeded limit: ${state.accumulated.length} chars, finalizing and starting new`);
      const currentChunk = state.accumulated.substring(0, STREAM_CHUNK_LIMIT);
      this.platform.editMessage(chatId, state.messageId, { text: currentChunk });
      // Keep overflow for next message
      state.accumulated = state.accumulated.substring(STREAM_CHUNK_LIMIT);
      state.messageId = undefined;  // Will create new message on next delta
      state.lastEditText = '';
      state.lastEditAt = 0;
      state.editCount = 0;
      return;
    }

    // Throttle: skip edit if too soon
    const now = Date.now();
    if (now - state.lastEditAt < STREAM_EDIT_THROTTLE_MS) return;

    // Throttle window tracking (max 20 edits per 60s)
    if (now - state.windowStart > 60000) {
      state.editCount = 0;
      state.windowStart = now;
    }
    if (state.editCount >= 20) return;

    // Edit existing message with full accumulated text
    state.editCount++;
    state.lastEditAt = now;
    state.lastEditText = state.accumulated;
    this.platform.editMessage(chatId, state.messageId, { text: state.accumulated || '...' });
  }

  /**
   * Finalize streaming: send any remaining accumulated content as a final message.
   */
  private async finalizeStreaming(chatId: string, pendingFirstMsgRetry = 0): Promise<void> {
    const state = this.streamingStates.get(chatId);
    if (!state) return;

    if (state.messageId === -1 && pendingFirstMsgRetry < FINALIZE_PENDING_FIRST_MSG_RETRIES) {
      setTimeout(
        () => this.finalizeStreaming(chatId, pendingFirstMsgRetry + 1),
        FINALIZE_PENDING_FIRST_MSG_MS,
      );
      return;
    }

    console.log(`[Bridge] finalizeStreaming: accumulated=${state.accumulated.length} chars, lastEdit=${state.lastEditText.length} chars, msgId=${state.messageId}`);

    if (state.accumulated) {
      if (state.accumulated.length > STREAM_CHUNK_LIMIT) {
        // Too long for a single message — split
        console.log(`[Bridge] final content exceeded limit, splitting into chunks`);
        const chunks = splitContent(state.accumulated);
        // Edit last message to first chunk if possible, send rest as new
        if (state.messageId !== undefined && state.messageId !== -1) {
          await this.platform.editMessage(chatId, state.messageId, { text: chunks[0].text });
          for (let i = 1; i < chunks.length; i++) {
            await this.platform.sendMessage(chatId, { text: chunks[i].text });
          }
        } else {
          for (const chunk of chunks) {
            await this.platform.sendMessage(chatId, { text: chunk.text });
          }
        }
      } else if (state.messageId !== undefined && state.messageId !== -1) {
        // Always edit — the last handleTextDelta edit may have failed silently
        // (editMessage is fire-and-forget). A redundant "message is not modified"
        // error is handled gracefully by the adapter.
        await this.platform.editMessage(chatId, state.messageId, { text: state.accumulated });
      } else {
        // No message created yet (or pending) — send as new
        await this.platform.sendMessage(chatId, { text: state.accumulated });
      }
    }

    this.streamingStates.delete(chatId);
  }

  /**
   * Flush accumulated text to Telegram, then reset state for a new message.
   * Called before tool_use notifications so:
   * 1. User sees up-to-date text before the tool executes
   * 2. Post-tool text starts in a fresh message bubble (cleaner reading flow)
   */
  private flushStreaming(chatId: string): void {
    const state = this.streamingStates.get(chatId);
    if (!state || !state.accumulated) return;
    if (state.messageId !== undefined && state.messageId !== -1) {
      this.platform.editMessage(chatId, state.messageId, { text: state.accumulated });
    }
    // Reset for new message — next text_delta creates a fresh Telegram bubble
    state.messageId = undefined;
    state.accumulated = '';
    state.lastEditText = '';
    state.lastEditAt = 0;
    state.editCount = 0;
  }

  private clearFinalizeTimer(chatId: string): void {
    const timer = this.finalizeTimers.get(chatId);
    if (!timer) return;
    clearTimeout(timer);
    this.finalizeTimers.delete(chatId);
  }

  private scheduleFinalize(chatId: string): void {
    this.clearFinalizeTimer(chatId);
    const st = this.streamingStates.get(chatId);
    if (st) st.completeScheduled = true;
    const timer = setTimeout(async () => {
      this.finalizeTimers.delete(chatId);
      await this.finalizeStreaming(chatId);
      this.platform.sendMessage(chatId, { text: '✅ done' });
    }, STREAM_FINALIZE_DEBOUNCE_MS);
    this.finalizeTimers.set(chatId, timer);
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

/**
 * Format tool_use notification for Telegram with MarkdownV2.
 * Extracts key parameters (command, file path, pattern) instead of raw JSON.
 */
function formatToolNotification(toolName: string, toolInput: unknown): string {
  const input = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput || {});

  // Extract the most relevant parameter per tool
  let display: string;
  try {
    const parsed = JSON.parse(input);
    switch (toolName) {
      case 'Bash':
      case 'BashOutput':
        display = parsed.command || input;
        break;
      case 'Read':
        display = parsed.file_path || parsed.filePath || input;
        break;
      case 'Write':
        display = parsed.file_path || parsed.filePath || input;
        break;
      case 'Edit':
        display = parsed.file_path || parsed.filePath || input;
        break;
      case 'Grep':
        display = `${parsed.pattern || ''}${parsed.path ? ` in ${parsed.path}` : ''}`;
        break;
      case 'Glob':
        display = parsed.pattern || input;
        break;
      default:
        display = input;
        break;
    }
  } catch {
    display = input;
  }

  // Truncate long inputs
  if (display.length > 400) display = display.substring(0, 397) + '...';

  // Escape tool name for MarkdownV2
  const escapedName = escapeMd(toolName);
  // Content inside code block doesn't need escaping, but strip ``` to avoid breaking
  const safeDisplay = display.replace(/```/g, '``');

  return `*🔧 ${escapedName}*\n\`\`\`\n${safeDisplay}\n\`\`\``;
}

/** Escape MarkdownV2 special characters */
function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
