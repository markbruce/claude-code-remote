/**
 * Telegram adapter — implements BotPlatform using grammy
 */

import { Bot, InlineKeyboard } from 'grammy';
import { BotPlatform, MessageContent, PermissionRequest, BotCommand, InlineButton, FileMessage } from '../shared/platform';
import { PermissionManager } from '../core/permission';
import { formatPermissionPrompt } from './formatter';

type MessageHandler = (chatId: string, text: string) => void;
type CallbackHandler = (chatId: string, action: string, data: string) => void;

export class TelegramAdapter implements BotPlatform {
  private bot: Bot;
  private messageHandlers: MessageHandler[] = [];
  private callbackHandlers: CallbackHandler[] = [];
  private fileMessageHandlers: Array<(msg: FileMessage) => void> = [];
  private permissionManager!: PermissionManager; // Set via setPermissionManager
  private messageListenerRegistered = false;
  private fileMessageListenerRegistered = false;

  constructor(token: string) {
    console.log(`[TelegramAdapter] Initializing with API base: https://api.telegram.org`);
    this.bot = new Bot(token, {
      client: {
        apiRoot: 'https://api.telegram.org',
      },
    });
    this.bot.catch((err) => {
      const e = err as any;
      console.error(`[TelegramAdapter] Bot error:`, e?.message || e);
      if (e?.stack) console.error(`[TelegramAdapter] Stack:`, e.stack.substring(0, 500));
    });
  }

  /** Inject permission manager (set after construction) */
  setPermissionManager(pm: PermissionManager): void {
    this.permissionManager = pm;
  }

  /** Get the grammy bot instance (for handlers.ts to register commands) */
  getBot(): Bot {
    return this.bot;
  }

  async start(): Promise<void> {
    // Register callback query handler
    this.bot.on('callback_query', async (ctx) => {
      const chatId = String(ctx.chat?.id);
      const raw = ctx.callbackQuery.data || '';
      const colonIdx = raw.indexOf(':');
      const action = colonIdx >= 0 ? raw.substring(0, colonIdx) : raw;
      const data = colonIdx >= 0 ? raw.substring(colonIdx + 1) : '';

      try {
        for (const handler of this.callbackHandlers) {
          handler(chatId, action, data);
        }
        await ctx.answerCallbackQuery();
      } catch {
        // Stale callbacks (bot restart) — answerCallbackQuery fails, safe to ignore
      }
    });

    // Start polling with auto-restart on errors
    const startPolling = async () => {
      while (true) {
        try {
          await this.bot.start({
            onStart: (info) => console.log(`[Telegram] Bot @${info.username} started`),
          });
        } catch (err: any) {
          if (err?.description?.includes('terminated by other getUpdates')) {
            console.log(`[Telegram] Polling interrupted, restarting in 3s...`);
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          console.error(`[Telegram] Polling error:`, err?.message || err);
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        // bot.start() resolved normally — loop exited
        console.log(`[Telegram] Polling stopped.`);
        break;
      }
    };
    startPolling();
  }

  async sendMessage(chatId: string, content: MessageContent): Promise<number | undefined> {
    try {
      const result = await this.bot.api.sendMessage(chatId, content.text, {
        parse_mode: content.parseMode === 'Markdown' ? 'MarkdownV2' : undefined,
      });
      return result.message_id;
    } catch (error) {
      console.error(`[Telegram] Send error to ${chatId}:`, error);
      // Retry without parse_mode on formatting error
      if (content.parseMode) {
        try {
          const result = await this.bot.api.sendMessage(chatId, content.text);
          return result.message_id;
        } catch { /* give up */ }
      }
    }
    return undefined;
  }

  async editMessage(chatId: string, messageId: number, content: MessageContent): Promise<boolean> {
    try {
      await this.bot.api.editMessageText(chatId, messageId, content.text, {
        parse_mode: content.parseMode === 'Markdown' ? 'MarkdownV2' : undefined,
      });
      return true;
    } catch (err: any) {
      // "message is not modified" is benign — content unchanged
      if (err?.description?.includes('message is not modified')) return true;
      console.error(`[Telegram] Edit error for msg ${messageId}:`, err?.message || err);
      return false;
    }
  }

  async sendPermission(chatId: string, request: PermissionRequest): Promise<void> {
    // NOTE: Permission is already registered in bridge.ts onChatPermissionRequest handler.
    // The request.callbackKey field contains the short key from PermissionManager.register().
    // We only render the UI here — no double registration.
    const text = formatPermissionPrompt(request.toolName, request.description);
    const callbackKey = (request as any).callbackKey;

    const keyboard = new InlineKeyboard()
      .text('✅ Approve', `approve:${callbackKey}`)
      .text('❌ Deny', `deny:${callbackKey}`);

    await this.bot.api.sendMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard,
    });
  }

  async sendQuestion(chatId: string, question: string, options: Array<{ label: string; description?: string; callbackData: string }>): Promise<void> {
    const { escapeMd } = await import('./formatter');
    const keyboard = new InlineKeyboard();
    for (const opt of options) {
      const label = opt.description
        ? `${opt.label} — ${opt.description.substring(0, 40)}`
        : opt.label;
      keyboard.text(label.substring(0, 60), opt.callbackData).row();
    }
    try {
      await this.bot.api.sendMessage(chatId, `❓ ${escapeMd(question)}`, {
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard,
      });
    } catch {
      await this.bot.api.sendMessage(chatId, `❓ ${question}`, { reply_markup: keyboard });
    }
  }

  async registerCommands(commands: BotCommand[]): Promise<void> {
    try {
      await this.bot.api.setMyCommands(
        commands.map((c) => ({ command: c.command, description: c.description }))
      );
      console.log(`[TelegramAdapter] Commands registered successfully`);
    } catch (err: any) {
      // Don't crash — commands are cosmetic, bot works without them
      console.warn(`[TelegramAdapter] Failed to register commands (non-fatal): ${err.message || err}`);
    }
  }

  async sendInlineButtons(chatId: string, text: string, buttons: InlineButton[]): Promise<void> {
    try {
      const keyboard = new InlineKeyboard();
      for (const btn of buttons) {
        keyboard.text(btn.text, btn.callbackData).row();
      }
      await this.bot.api.sendMessage(chatId, text, { reply_markup: keyboard });
    } catch (error) {
      console.error(`[Telegram] sendInlineButtons error:`, (error as any)?.message || error);
      // Fallback: send as plain text
      try {
        await this.bot.api.sendMessage(chatId, text);
      } catch { /* give up */ }
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
    // Register grammy handler only once
    if (!this.messageListenerRegistered) {
      this.messageListenerRegistered = true;
      this.bot.on('message:text', async (ctx, next) => {
        // Skip commands — pass to command handlers in the chain
        if (ctx.message.text.startsWith('/')) {
          await next();
          return;
        }
        const chatId = String(ctx.chat.id);
        for (const h of this.messageHandlers) {
          h(chatId, ctx.message.text);
        }
      });
    }
  }

  onCallback(handler: CallbackHandler): void {
    this.callbackHandlers.push(handler);
  }

  onFileMessage(handler: (msg: FileMessage) => void): void {
    this.fileMessageHandlers.push(handler);
    if (this.fileMessageListenerRegistered) return;
    this.fileMessageListenerRegistered = true;

    // Photo handler — download largest size
    this.bot.on('message:photo', async (ctx) => {
      try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1]; // largest
        const data = await this.downloadTelegramFile(photo.file_id);
        const msg: FileMessage = {
          chatId: String(ctx.chat.id),
          text: ctx.message.caption || '',
          filename: `${photo.file_unique_id}.jpg`,
          mimeType: 'image/jpeg',
          size: data.length,
          data,
        };
        for (const h of this.fileMessageHandlers) h(msg);
      } catch (err) {
        console.error('[Telegram] Photo processing error:', err);
        await ctx.reply('⚠️ Failed to process photo.');
      }
    });

    // Document handler — generic files
    this.bot.on('message:document', async (ctx) => {
      try {
        const doc = ctx.message.document;
        // Size check before downloading
        if (doc.file_size && doc.file_size > 10 * 1024 * 1024) {
          await ctx.reply('⚠️ File too large (max 10MB).');
          return;
        }
        const data = await this.downloadTelegramFile(doc.file_id);
        const msg: FileMessage = {
          chatId: String(ctx.chat.id),
          text: ctx.message.caption || '',
          filename: doc.file_name || `file_${doc.file_unique_id}`,
          mimeType: doc.mime_type || 'application/octet-stream',
          size: data.length,
          data,
        };
        for (const h of this.fileMessageHandlers) h(msg);
      } catch (err) {
        console.error('[Telegram] Document processing error:', err);
        await ctx.reply('⚠️ Failed to process file.');
      }
    });
  }

  /** Download a file from Telegram's file API */
  private async downloadTelegramFile(fileId: string): Promise<Buffer> {
    const file = await this.bot.api.getFile(fileId);
    if (!file.file_path) throw new Error('No file_path returned by Telegram');
    const url = `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}
