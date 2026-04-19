/**
 * Feishu adapter — implements BotPlatform using @larksuiteoapi/node-sdk
 * Uses WSClient (WebSocket long connection) for receiving events.
 * Card action callbacks are handled via card.action.trigger event subscription
 * through the same WebSocket connection. HTTP card webhook is kept as fallback.
 */

import { IncomingMessage, ServerResponse } from 'http';
import {
  Client,
  EventDispatcher,
  CardActionHandler,
  WSClient,
  adaptDefault,
} from '@larksuiteoapi/node-sdk';
import {
  BotPlatform,
  MessageContent,
  PermissionRequest,
  BotCommand,
  InlineButton,
  FileMessage,
} from '../shared/platform';
import { PermissionManager } from '../core/permission';

type MessageHandler = (chatId: string, text: string) => void;
type CallbackHandler = (chatId: string, action: string, data: string) => void;

export class FeishuAdapter implements BotPlatform {
  private client: Client;
  private wsClient: WSClient;
  private verificationToken: string;
  private encryptKey: string;
  private eventDispatcher: EventDispatcher;
  private cardHandler: CardActionHandler;

  private messageHandlers: MessageHandler[] = [];
  private callbackHandlers: CallbackHandler[] = [];
  private fileMessageHandlers: Array<(msg: FileMessage) => void> = [];
  private permissionManager!: PermissionManager;

  /** Map numeric ID (returned to bridge) → Feishu message_id string */
  private msgIdMap = new Map<number, string>();
  private nextMsgId = 1;

  /** Command handlers registered by handlers.ts: command → (chatId, arg) => void */
  private commandHandlers = new Map<string, (chatId: string, arg: string) => void>();

  constructor(appId: string, appSecret: string, verificationToken?: string, encryptKey?: string) {
    this.verificationToken = verificationToken || '';
    this.encryptKey = encryptKey || '';

    console.log(`[FeishuAdapter] Initializing with App ID: ${appId.substring(0, 8)}...`);
    this.client = new Client({ appId, appSecret, appType: 0 }); // SelfBuild = 0

    // Event dispatcher for message and card action events (used by WSClient)
    // The SDK's handleEventData automatically sends the response back through WebSocket,
    // so we only need to process the event here — no manual sendMessage needed.
    this.eventDispatcher = new EventDispatcher({
      verificationToken: this.verificationToken,
      encryptKey: this.encryptKey,
    }).register({
      'im.message.receive_v1': async (data: any) => {
        this.handleIncomingMessage(data);
      },
      'card.action.trigger': async (data: any) => {
        const eventData = data?.event || data;
        console.log('[Feishu] Card action event received via EventDispatcher');
        this.handleCardAction(eventData);
        // Return nothing — SDK's handleEventData sends { code: 0 } response automatically
      },
    });

    // WSClient — WebSocket long connection, no public URL needed
    this.wsClient = new WSClient({ appId, appSecret });

    // Card action handler — receives card button callbacks via HTTP endpoint
    this.cardHandler = new CardActionHandler(
      {
        verificationToken: this.verificationToken,
        encryptKey: this.encryptKey,
      },
      async (data: any) => {
        this.handleCardAction(data);
      },
    );
  }

  /** Inject permission manager (set after construction) */
  setPermissionManager(pm: PermissionManager): void {
    this.permissionManager = pm;
  }

  /**
   * Register a command handler (called by handlers.ts).
   * Feishu has no built-in command routing — we match /command text manually.
   */
  registerCommand(command: string, handler: (chatId: string, arg: string) => void): void {
    this.commandHandlers.set(command, handler);
  }

  async start(): Promise<void> {
    await this.wsClient.start({ eventDispatcher: this.eventDispatcher });
    console.log('[Feishu] WebSocket connected');
  }

  /** Close WebSocket connection */
  close(): void {
    this.wsClient.close();
  }

  // ── BotPlatform implementation ──────────────────────────────────────

  /** Rate limiter for Feishu API calls (1 call per interval per key) */
  private lastCallTime = new Map<string, number>();
  private callQueue = new Map<string, Promise<unknown>>();

  private async rateLimitedCall<T>(key: string, fn: () => Promise<T>, minIntervalMs = 500): Promise<T> {
    // Chain on existing queue for the same key to serialize calls
    const existing = this.callQueue.get(key);
    if (existing) {
      return new Promise<T>((resolve, reject) => {
        existing.then(() => fn().then(resolve, reject), reject);
      });
    }
    const lastTime = this.lastCallTime.get(key) || 0;
    const now = Date.now();
    const wait = Math.max(0, minIntervalMs - (now - lastTime));
    const promise = (async () => {
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      const result = await fn();
      this.lastCallTime.set(key, Date.now());
      this.callQueue.delete(key);
      return result;
    })();
    this.callQueue.set(key, promise);
    return promise;
  }

  async sendMessage(chatId: string, content: MessageContent): Promise<number | undefined> {
    try {
      const receiveIdType = chatId.startsWith('oc_') ? 'chat_id' : 'open_id';
      const textContent = JSON.stringify({ text: content.text });

      const resp = await this.client.im.message.create({
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: textContent,
        },
        params: {
          receive_id_type: receiveIdType as any,
        },
      });

      const feishuMsgId = resp.data?.message_id;
      if (!feishuMsgId) return undefined;

      const numericId = this.nextMsgId++;
      this.msgIdMap.set(numericId, feishuMsgId);
      return numericId;
    } catch (error: any) {
      console.error(`[Feishu] Send error to ${chatId}:`, error?.message || error);
      return undefined;
    }
  }

  async editMessage(chatId: string, messageId: number, content: MessageContent): Promise<boolean> {
    try {
      const feishuMsgId = this.msgIdMap.get(messageId);
      if (!feishuMsgId) return false;

      const textContent = JSON.stringify({ text: content.text });

      // Use update (PUT) not patch (PATCH):
      // PATCH only supports card messages, PUT supports text and rich text.
      // Throttle edits: max 1 per second per message
      const editKey = `edit:${feishuMsgId}`;
      const lastEdit = this.lastCallTime.get(editKey) || 0;
      const elapsed = Date.now() - lastEdit;
      if (elapsed < 1000) {
        await new Promise(r => setTimeout(r, 1000 - elapsed));
      }
      this.lastCallTime.set(editKey, Date.now());
      await this.client.im.message.update({
        data: { msg_type: 'text', content: textContent },
        path: { message_id: feishuMsgId },
      });
      return true;
    } catch (error: any) {
      console.error(`[Feishu] Edit error for msg ${messageId}:`, error?.message || error);
      return false;
    }
  }

  async sendPermission(chatId: string, request: PermissionRequest): Promise<void> {
    const callbackKey = (request as any).callbackKey;
    const card = buildPermissionCard(request.toolName, request.description, callbackKey);
    await this.sendCardMessage(chatId, card);
  }

  async sendQuestion(
    chatId: string,
    question: string,
    options: Array<{ label: string; description?: string; callbackData: string }>,
  ): Promise<void> {
    const card = buildQuestionCard(question, options);
    await this.sendCardMessage(chatId, card);
  }

  async registerCommands(commands: BotCommand[]): Promise<void> {
    // Feishu commands are configured in developer console, not via API.
    // This is a no-op — command routing is handled internally by text matching.
    console.log(`[FeishuAdapter] ${commands.length} commands registered (text-based routing)`);
  }

  async sendInlineButtons(chatId: string, text: string, buttons: InlineButton[]): Promise<void> {
    const card = buildInlineButtonsCard(text, buttons);
    try {
      await this.sendCardMessage(chatId, card);
    } catch (error: any) {
      console.error(`[Feishu] sendInlineButtons error:`, error?.message || error);
      // Fallback: send as plain text
      try {
        await this.sendMessage(chatId, { text });
      } catch { /* give up */ }
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onCallback(handler: CallbackHandler): void {
    this.callbackHandlers.push(handler);
  }

  onFileMessage(handler: (msg: FileMessage) => void): void {
    this.fileMessageHandlers.push(handler);
  }

  // ── Card callback HTTP handler ──────────────────────────────────────

  /**
   * Handle card action HTTP callback.
   * WSClient receives message events, but card button clicks come via HTTP.
   * Called from index.ts HTTP server for /webhook/feishu path.
   */
  handleCardWebhook(req: IncomingMessage, res: ServerResponse): void {
    const cardAdapter = adaptDefault('/webhook/feishu', this.cardHandler, { autoChallenge: true });
    cardAdapter(req, res).catch((err: any) => {
      console.error('[Feishu] Card webhook error:', err?.message || err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Error');
      }
    });
  }

  // ── Internal event processing ───────────────────────────────────────

  private handleIncomingMessage(data: any): void {
    try {
      console.log(`[Feishu] Raw message event:`, JSON.stringify(data).substring(0, 500));
      const event = data?.event || data;
      const senderId = event?.sender?.sender_id?.open_id || event?.sender?.sender_id?.user_id;
      const message = event?.message;

      console.log(`[Feishu] Parsed: senderId=${senderId}, message=${!!message}, msgType=${message?.message_type}`);

      if (!senderId || !message) {
        console.log(`[Feishu] Skipping: missing senderId or message`);
        return;
      }

      const msgType = message.message_type;
      const content = message.content;

      // Handle text messages
      if (msgType === 'text') {
        const parsed = JSON.parse(content || '{}');
        const text: string = parsed.text || '';
        if (!text) return;

        // Command routing
        if (text.startsWith('/')) {
          const parts = text.split(/\s+/);
          const cmd = parts[0].substring(1).toLowerCase();
          const arg = parts.slice(1).join(' ');
          const handler = this.commandHandlers.get(cmd);
          if (handler) {
            handler(senderId, arg);
            return;
          }
        }

        // Regular message — skip unrecognized commands
        if (text.startsWith('/')) return;

        for (const h of this.messageHandlers) {
          h(senderId, text);
        }
      }
      // Handle image messages
      else if (msgType === 'image') {
        this.handleImageMessage(senderId, message, content);
      }
      // Handle file messages
      else if (msgType === 'file') {
        this.handleFileMessageEvent(senderId, message, content);
      }
    } catch (err) {
      console.error('[Feishu] Message processing error:', err);
    }
  }

  private async handleImageMessage(chatId: string, message: any, content: string): Promise<void> {
    try {
      const parsed = JSON.parse(content || '{}');
      const imageKey = parsed.image_key;
      if (!imageKey) return;

      const messageId = message.message_id;
      const result = await this.client.im.messageResource.get({
        params: { type: 'image' },
        path: { message_id: messageId, file_key: imageKey },
      });

      const stream = result.getReadableStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);

      const msg: FileMessage = {
        chatId,
        text: '',
        filename: `${imageKey}.jpg`,
        mimeType: 'image/jpeg',
        size: data.length,
        data,
      };
      for (const h of this.fileMessageHandlers) h(msg);
    } catch (err) {
      console.error('[Feishu] Image processing error:', err);
    }
  }

  private async handleFileMessageEvent(chatId: string, message: any, content: string): Promise<void> {
    try {
      const parsed = JSON.parse(content || '{}');
      const fileKey = parsed.file_key;
      const fileName = parsed.file_name || `file_${fileKey}`;

      if (!fileKey) return;

      const messageId = message.message_id;
      const result = await this.client.im.messageResource.get({
        params: { type: 'file' },
        path: { message_id: messageId, file_key: fileKey },
      });

      const stream = result.getReadableStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);

      if (data.length > 10 * 1024 * 1024) {
        await this.sendMessage(chatId, { text: '⚠️ File too large (max 10MB).' });
        return;
      }

      const msg: FileMessage = {
        chatId,
        text: '',
        filename: fileName,
        mimeType: 'application/octet-stream',
        size: data.length,
        data,
      };
      for (const h of this.fileMessageHandlers) h(msg);
    } catch (err) {
      console.error('[Feishu] File processing error:', err);
    }
  }

  private handleCardAction(data: any): void {
    try {
      console.log(`[Feishu] Card action raw data:`, JSON.stringify(data, null, 2));
      const action = data?.action;
      // card.action.trigger event: operator_id is in data.operator.operator_id or data.operator.open_id
      // Old card callback (HTTP): open_id is directly in data.open_id
      const openId = data?.operator?.operator_id?.open_id
        || data?.operator?.open_id
        || data?.operator?.user_id
        || data?.open_id;
      if (!action || !openId) {
        console.log(`[Feishu] Card action missing action or openId, action=${!!action}, openId=${!!openId}`);
        console.log(`[Feishu] Card action full data:`, JSON.stringify(data, null, 2));
        return;
      }

      const value = action.value;
      if (!value) {
        console.log(`[Feishu] Card action missing value`);
        return;
      }

      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      const rawAction = parsed.action || '';
      const rawData = parsed.data || '';
      console.log(`[Feishu] Card action parsed: rawAction=${rawAction}, rawData=${rawData}`);

      // Inline buttons store callbackData as "action:data" (e.g. "machine:0"),
      // wrapped in { action: 'inline', data: 'machine:0' }.
      // Unwrap to match bridge's handleCallback format.
      let finalAction = rawAction;
      let finalData = rawData;
      if (rawAction === 'inline' && rawData.includes(':')) {
        const colonIdx = rawData.indexOf(':');
        finalAction = rawData.substring(0, colonIdx);
        finalData = rawData.substring(colonIdx + 1);
      }

      for (const h of this.callbackHandlers) {
        h(openId, finalAction, finalData);
      }
    } catch (err) {
      console.error('[Feishu] Card action processing error:', err);
    }
  }

  /** Send an interactive card message */
  private async sendCardMessage(chatId: string, card: object): Promise<void> {
    const receiveIdType = chatId.startsWith('oc_') ? 'chat_id' : 'open_id';
    await this.client.im.message.create({
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
      params: {
        receive_id_type: receiveIdType as any,
      },
    });
  }
}

// ── Card builders ─────────────────────────────────────────────────────

function buildPermissionCard(toolName: string, description: string, callbackKey: number): object {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '🔧 Claude requests tool execution' },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**Tool:** ${escapeCardText(toolName)}\n**Details:** ${escapeCardText(description.substring(0, 200))}`,
        },
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '✅ Approve' },
            type: 'primary',
            value: { action: 'approve', data: String(callbackKey) },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '❌ Deny' },
            type: 'danger',
            value: { action: 'deny', data: String(callbackKey) },
          },
        ],
      },
    ],
  };
}

function buildQuestionCard(
  question: string,
  options: Array<{ label: string; description?: string; callbackData: string }>,
): object {
  const buttons = options.slice(0, 5).map((opt) => ({
    tag: 'button',
    text: {
      tag: 'plain_text',
      content: opt.description
        ? `${opt.label} — ${opt.description.substring(0, 40)}`
        : opt.label,
    },
    type: 'default' as const,
    value: { action: 'question', data: opt.callbackData },
  }));

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: `❓ ${question}` },
      template: 'turquoise',
    },
    elements: [
      { tag: 'action', actions: buttons },
    ],
  };
}

function buildInlineButtonsCard(text: string, buttons: InlineButton[]): object {
  const cardButtons = buttons.map((btn) => ({
    tag: 'button',
    text: { tag: 'plain_text', content: btn.text.substring(0, 60) },
    type: 'default' as const,
    value: { action: 'inline', data: btn.callbackData },
  }));

  return {
    config: { wide_screen_mode: true },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: escapeCardText(text) },
      },
      { tag: 'action', actions: cardButtons },
    ],
  };
}

/** Escape text for use in lark_md card content */
function escapeCardText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
