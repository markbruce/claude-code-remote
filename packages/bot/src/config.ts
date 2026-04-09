/**
 * Bot service configuration
 */

export interface BotConfig {
  serverUrl: string;         // Claude Code Remote server URL
  botPort: number;           // HTTP port for bind callbacks
  platform: 'telegram';      // Active platform
  telegramBotToken?: string; // Telegram bot token
}

export function loadConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    serverUrl: overrides.serverUrl || process.env.BOT_SERVER_URL || 'http://localhost:3000',
    botPort: overrides.botPort || parseInt(process.env.BOT_PORT || '3001', 10),
    platform: overrides.platform || 'telegram',
    telegramBotToken: overrides.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN,
  };
}
