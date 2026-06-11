import { sendTelegramMessage } from '../services/telegram.service';
import { handleTelegramCommand } from '../services/telegram-commands';
import prisma from '../database/prisma';
import logger from '../config/logger';

let polling = false;
let intervalId: NodeJS.Timeout | null = null;
let lastUpdateId = 0;

interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    text?: string;
    new_chat_members?: { id: number; first_name: string; is_bot?: boolean }[];
    from?: { id: number; first_name: string; is_bot?: boolean };
  };
}

async function buildWelcomeMessage(): Promise<string> {
  let msg = '<b>¡Bienvenido a UruguayConQueso! 🧀</b>\n\n';
  msg += 'Este es el canal de notificaciones del clan. Recibirás:\n';
  msg += '• Ranking diario de copas y donaciones\n';
  msg += '• Lista de inactivos cada 3 días\n';
  msg += '• Ganadores semanales y mensuales\n\n';

  msg += '<b>Comandos disponibles:</b>\n';
  msg += '/registrar #TAG — Vincula tu cuenta (obligatorio)\n';
  msg += '/perfil — Ver tu perfil\n';
  msg += '/clan — Info del clan\n';
  msg += '/help — Ayuda\n\n';

  const [clan, whatsappCfg] = await Promise.all([
    prisma.clan.findFirst(),
    prisma.botConfig.findFirst({
      where: { key: { startsWith: 'channel_whatsapp_' }, value: { not: '' } },
    }),
  ]);

  if (clan) {
    msg += `<b>${clan.name}</b> — ${clan.memberCount ?? '?'}/50 miembros\n`;
    if (clan.level) msg += `Nivel: ${clan.level}\n`;
  }

  if (whatsappCfg) {
    msg += `\n📱 <b>WhatsApp:</b> ${whatsappCfg.value}\n`;
  }

  msg += '\n<i>Este mensaje es automático.</i>';
  return msg;
}

async function pollUpdates(token: string): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`;
    const resp = await fetch(url);
    const data = await resp.json() as { ok: boolean; result: TgUpdate[] };

    if (!data.ok || !Array.isArray(data.result)) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg) continue;

      const chatId = msg.chat.id;
      const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

      if (msg.new_chat_members) {
        for (const member of msg.new_chat_members) {
          if (member.is_bot) continue;
          const welcomeText = await buildWelcomeMessage();
          await sendTelegramMessage(welcomeText);
          logger.info(`Telegram welcome sent to ${member.first_name}`);
          break;
        }
      }

      if (msg.text && msg.from && !msg.from.is_bot) {
        const text = msg.text.trim();
        if (text.startsWith('/')) {
          const reply = await handleTelegramCommand(chatId, msg.from.id, text, isGroup);
          if (reply) {
            const params = new URLSearchParams({
              chat_id: String(chatId),
              text: reply,
              parse_mode: 'HTML',
              reply_to_message_id: String(msg.message_id),
            });

            const tokenCfg = await prisma.botConfig.findFirst({
              where: { key: { startsWith: 'telegram_token_' } },
            });
            if (tokenCfg?.value) {
              await fetch(`https://api.telegram.org/bot${tokenCfg.value}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
              });
            }
          }
        }
      }
    }
  } catch (err) {
    logger.debug(`Telegram poll error: ${(err as Error).message}`);
  }
}

export function startTelegramWelcome(): void {
  if (polling) return;
  polling = true;
  logger.info('Telegram polling started (every 5s)');
  intervalId = setInterval(async () => {
    try {
      const tokenCfg = await prisma.botConfig.findFirst({
        where: { key: { startsWith: 'telegram_token_' } },
      });
      const chatCfg = await prisma.botConfig.findFirst({
        where: { key: { startsWith: 'telegram_chat_' } },
      });
      if (tokenCfg?.value && chatCfg?.value) {
        await pollUpdates(tokenCfg.value);
      }
    } catch (err) {
      logger.debug(`Telegram poll loop error: ${(err as Error).message}`);
    }
  }, 5000);
}

export function stopTelegramWelcome(): void {
  polling = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
