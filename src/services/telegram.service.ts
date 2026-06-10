import logger from '../config/logger';
import prisma from '../database/prisma';

let botToken: string | null = null;
let chatId: string | null = null;

export function configureTelegram(token: string, chat: string): void {
  botToken = token;
  chatId = chat;
  logger.info('Telegram configured');
}

export async function loadTelegramConfig(guildId: string): Promise<void> {
  const tokenCfg = await prisma.botConfig.findUnique({
    where: { key: `telegram_token_${guildId}` },
  });
  const chatCfg = await prisma.botConfig.findUnique({
    where: { key: `telegram_chat_${guildId}` },
  });
  if (tokenCfg && chatCfg) {
    configureTelegram(tokenCfg.value, chatCfg.value);
    logger.info('Telegram config loaded from DB');
  }
}

export function isTelegramConfigured(): boolean {
  return !!(botToken && chatId);
}

export async function sendTelegramMessage(text: string): Promise<{ ok: boolean; error?: string }> {
  if (!botToken || !chatId) return { ok: false, error: 'No configurado' };

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const data = await resp.json() as { ok: boolean; description?: string };
    if (!resp.ok || !data.ok) {
      const err = data.description || `HTTP ${resp.status}`;
      logger.warn(`Telegram failed: ${err}`);
      return { ok: false, error: err };
    }

    logger.info('Telegram message sent');
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    logger.error(`Telegram error: ${msg}`);
    return { ok: false, error: msg };
  }
}

export async function sendTelegramRanking(text: string): Promise<void> {
  const result = await sendTelegramMessage(text);
  if (!result.ok) {
    logger.warn(`Telegram ranking not sent: ${result.error}`);
  }
}
