import logger from '../config/logger';

let botToken: string | null = null;
let chatId: string | null = null;

export function configureTelegram(token: string, chat: string): void {
  botToken = token;
  chatId = chat;
  logger.info('Telegram configured');
}

export function isTelegramConfigured(): boolean {
  return !!(botToken && chatId);
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!botToken || !chatId) return false;

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

    if (!resp.ok) {
      logger.warn(`Telegram send failed: ${resp.status} ${await resp.text()}`);
      return false;
    }

    logger.info('Telegram message sent');
    return true;
  } catch (err) {
    logger.error(`Telegram error: ${(err as Error).message}`);
    return false;
  }
}

export async function sendTelegramRanking(text: string): Promise<boolean> {
  return sendTelegramMessage(text);
}
