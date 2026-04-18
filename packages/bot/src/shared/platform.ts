/**
 * BotPlatform — Platform abstraction interface
 * Each messaging platform implements this interface.
 */

export interface MessageContent {
  text: string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  replyToMessageId?: number;
}

export interface PermissionRequest {
  sessionId: string;
  requestId: string;
  toolName: string;
  description: string;
  timeout: number; // ms
}

export interface BotCommand {
  command: string;
  description: string;
}

export interface InlineButton {
  text: string;
  callbackData: string;
}

/** File attachment received from a platform user (photo, document, etc.) */
export interface FileMessage {
  chatId: string;
  text: string;        // caption, may be empty
  filename: string;
  mimeType: string;
  size: number;
  data: Buffer;        // raw file bytes
}

export interface BotPlatform {
  /** Start the platform adapter (connect, register commands, etc.) */
  start(): Promise<void>;

  /** Send a text message to a chat. Returns the platform message ID. */
  sendMessage(chatId: string, content: MessageContent): Promise<number | undefined>;

  /** Edit an existing message (for streaming). Returns true if edit succeeded. */
  editMessage(chatId: string, messageId: number, content: MessageContent): Promise<boolean>;

  /** Send a permission approval prompt with buttons */
  sendPermission(chatId: string, request: PermissionRequest): Promise<void>;

  /** Send a question with selectable option buttons (e.g. AskUserQuestion) */
  sendQuestion(chatId: string, question: string, options: Array<{ label: string; description?: string; callbackData: string }>): Promise<void>;

  /** Register bot commands with the platform */
  registerCommands(commands: BotCommand[]): Promise<void>;

  /** Send a message with inline keyboard buttons */
  sendInlineButtons(chatId: string, text: string, buttons: InlineButton[]): Promise<void>;

  /** Register handler for incoming text messages */
  onMessage(handler: (chatId: string, text: string) => void): void;

  /** Register handler for incoming file messages (photos, documents) */
  onFileMessage(handler: (msg: FileMessage) => void): void;

  /** Register handler for button callbacks */
  onCallback(handler: (chatId: string, action: string, data: string) => void): void;
}
