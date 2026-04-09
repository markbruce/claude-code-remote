/**
 * Telegram adapter — implements BotPlatform using grammy
 */

import { Bot, InlineKeyboard } from 'grammy';
import { BotPlatform, MessageContent, PermissionRequest, BotCommand } from '../shared/platform';
import { PermissionManager } from '../core/permission';
import { formatPermissionPrompt } from './formatter';

type MessageHandler = (chatId: string, text: string) => void;
type CallbackHandler = (chatId: string, action: string, data: string) => void;

export class TelegramAdapter implements BotPlatform {
  private bot: Bot;
  private messageHandlers: MessageHandler[] = [];
  private callbackHandlers: CallbackHandler[] = [];
  private permissionManager!: PermissionManager; // Set via setPermissionManager

  constructor(token: string) {
    this.bot = new Bot(token);
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
      const data = ctx.callbackQuery.data || '';
      const action = data.startsWith('approve') ? 'approve' : 'deny';

      for (const handler of this.callbackHandlers) {
        handler(chatId, action, data.split(':')[1] || '');
      }
      await ctx.answerCallbackQuery();
    });

    // Start polling
    await this.bot.start({
      onStart: (info) => console.log(`[Telegram] Bot @${info.username} started`),
    });
  }

  async sendMessage(chatId: string, content: MessageContent): Promise<void> {
    try {
      await this.bot.api.sendMessage(chatId, content.text, {
        parse_mode: content.parseMode === 'Markdown' ? 'MarkdownV2' : undefined,
      });
    } catch (error) {
      console.error(`[Telegram] Send error to ${chatId}:`, error);
      // Retry without parse_mode on formatting error
      if (content.parseMode) {
        try {
          await this.bot.api.sendMessage(chatId, content.text);
        } catch { /* give up */ }
      }
    }
  }

  async editMessage(chatId: string, messageId: number, content: MessageContent): Promise<void> {
    try {
      await this.bot.api.editMessageText(chatId, messageId, content.text, {
        parse_mode: content.parseMode === 'Markdown' ? 'MarkdownV2' : undefined,
      });
    } catch { /* ignore edit errors (message unchanged, etc.) */ }
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

  async registerCommands(commands: BotCommand[]): Promise<void> {
    await this.bot.api.setMyCommands(
      commands.map((c) => ({ command: c.command, description: c.description }))
    );
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
    this.bot.on('message:text', (ctx) => {
      // Skip commands — they are handled by bot.command() handlers
      if (ctx.message.text.startsWith('/')) return;
      const chatId = String(ctx.chat.id);
      for (const h of this.messageHandlers) {
        h(chatId, ctx.message.text);
      }
    });
  }

  onCallback(handler: CallbackHandler): void {
    this.callbackHandlers.push(handler);
  }
}
