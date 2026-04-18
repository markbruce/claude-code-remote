/**
 * Feishu adapter — implements BotPlatform using @larksuiteoapi/node-sdk
 */

import { IncomingMessage, ServerResponse } from 'http';
import {
  Client,
  EventDispatcher,
  CardActionHandler,
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

    // Event dispatcher for message events
    this.eventDispatcher = new EventDispatcher({
      verificationToken: this.verificationToken,
      encryptKey: this.encryptKey,
    }).register({
      'im.message.receive_v1': async (data: any) => {
        this.handleIncomingMessage(data);
      },
    });

    // Card action handler for button callbacks
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
    console.log('[Feishu] Adapter ready (webhook events handled by HTTP server)');
  }

  // ── BotPlatform implementation ──────────────────────────────────────

  async sendMessage(chatId: string, content: MessageContent): Promise<number | undefined> {
    try {
      const receiveIdType = chatId.startsWith('oc_') ? 'chat_id' : 'open_id';
      const msgType = 'text';
      const textContent = JSON.stringify({ text: content.text });

      const resp = await this.client.im.message.create({
        data: {
          receive_id: chatId,
          msg_type: msgType,
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

      await this.client.im.message.patch({
        data: { content: textContent },
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

  // ── Webhook HTTP handler ────────────────────────────────────────────

  /**
   * Handle incoming HTTP request for Feishu webhook.
   * Called from index.ts HTTP server for /webhook/feishu path.
   */
  handleWebhook(req: IncomingMessage, res: ServerResponse): void {
    const path = '/webhook/feishu';

    // Check if this is a card action callback or event callback
    // Both use the same path — differentiate by examining the body
    // The SDK's adaptDefault handles URL verification and event dispatch
    const eventAdapter = adaptDefault(path, this.eventDispatcher, { autoChallenge: true });

    // Try event dispatcher first, then card handler
    eventAdapter(req, res).catch(() => {
      // If event dispatcher didn't handle it, try card handler
      const cardAdapter = adaptDefault(path, this.cardHandler);
      cardAdapter(req, res).catch((err: any) => {
        console.error('[Feishu] Webhook handling error:', err?.message || err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Error');
        }
      });
    });
  }

  // ── Internal event processing ───────────────────────────────────────

  private handleIncomingMessage(data: any): void {
    try {
      const event = data?.event || data;
      const senderId = event?.sender?.sender_id?.open_id || event?.sender?.sender_id?.user_id;
      const message = event?.message;

      if (!senderId || !message) return;

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

        // Regular message — skip commands (handled above)
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
        this.handleFileMessage(senderId, message, content);
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

      // Download image via SDK
      const messageId = message.message_id;
      const result = await this.client.im.messageResource.get({
        params: { type: 'image' },
        path: { message_id: messageId, file_key: imageKey },
      });

      // Get readable stream and convert to Buffer
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
      // Can't reply here — no ctx available
    }
  }

  private async handleFileMessage(chatId: string, message: any, content: string): Promise<void> {
    try {
      const parsed = JSON.parse(content || '{}');
      const fileKey = parsed.file_key;
      const fileName = parsed.file_name || `file_${fileKey}`;
      const mimeType = 'application/octet-stream';

      if (!fileKey) return;

      // Download file via SDK
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

      // Size check
      if (data.length > 10 * 1024 * 1024) {
        await this.sendMessage(chatId, { text: '⚠️ File too large (max 10MB).' });
        return;
      }

      const msg: FileMessage = {
        chatId,
        text: '',
        filename: fileName,
        mimeType,
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
      const action = data?.action;
      const openId = data?.open_id;
      if (!action || !openId) return;

      const value = action.value;
      if (!value) return;

      // Parse the callback data from card button value
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      const actionType = parsed.action || '';
      const actionData = parsed.data || '';

      for (const h of this.callbackHandlers) {
        h(openId, actionType, actionData);
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
            value: JSON.stringify({ action: 'approve', data: String(callbackKey) }),
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '❌ Deny' },
            type: 'danger',
            value: JSON.stringify({ action: 'deny', data: String(callbackKey) }),
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
    value: JSON.stringify({ action: 'question', data: opt.callbackData }),
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
    value: JSON.stringify({ action: 'inline', data: btn.callbackData }),
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
