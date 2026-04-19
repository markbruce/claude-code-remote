/**
 * Bot service configuration
 */

export interface BotConfig {
  serverUrl: string;         // Claude Code Remote server URL
  botPort: number;           // HTTP port for bind callbacks
  telegramBotToken?: string; // Telegram bot token
  // Feishu
  feishuAppId?: string;
  feishuAppSecret?: string;
  feishuVerificationToken?: string;
  feishuEncryptKey?: string;
}

export function loadConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    serverUrl: overrides.serverUrl || process.env.BOT_SERVER_URL || 'http://localhost:3000',
    botPort: overrides.botPort || parseInt(process.env.BOT_PORT || '3001', 10),
    telegramBotToken: overrides.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN,
    feishuAppId: overrides.feishuAppId || process.env.FEISHU_APP_ID,
    feishuAppSecret: overrides.feishuAppSecret || process.env.FEISHU_APP_SECRET,
    feishuVerificationToken: overrides.feishuVerificationToken || process.env.FEISHU_VERIFICATION_TOKEN,
    feishuEncryptKey: overrides.feishuEncryptKey || process.env.FEISHU_ENCRYPT_KEY,
  };
}
