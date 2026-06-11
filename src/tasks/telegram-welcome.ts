import { sendTelegramMessage } from '../services/telegram.service';
import prisma from '../database/prisma';
import logger from '../config/logger';

let polling = false;
let intervalId: NodeJS.Timeout | null = null;
let lastUpdateId = 0;

interface TgUpdate {
  update_id: number;
  message?: {
    chat: { id: number; type: string };
    new_chat_members?: { id: number; first_name: string; is_bot?: boolean }[];
  };
}

async function buildWelcomeMessage(clanTag: string): Promise<string> {
  let msg = '<b>¡Bienvenido a UruguayConQueso! 🧀</b>\n\n';
  msg += 'Este es el canal de notificaciones del clan. Recibirás:\n';
  msg += '• Ranking diario de copas y donaciones\n';
  msg += '• Lista de inactivos cada 3 días\n';
  msg += '• Ganadores semanales y mensuales\n\n';

  msg += '<b>Comandos disponibles en Discord:</b>\n';
  msg += '/perfil | /clan | /guerra | /ranking | /inactivos\n';
  msg += '/torneo | /whatsapp | /ausencia | /puntos\n\n';

  const [clan, whatsappCfg] = await Promise.all([
    prisma.clan.findUnique({ where: { tag: clanTag } }),
    prisma.botConfig.findFirst({
      where: { key: { startsWith: 'channel_whatsapp_' }, value: { not: '' } },
    }),
  ]);

  if (clan) {
    msg += `<b>${clan.name || clanTag}</b> — ${clan.memberCount ?? '?'}/50 miembros\n`;
    if (clan.level) msg += `Nivel: ${clan.level}\n`;
  }

  if (whatsappCfg) {
    msg += `\n📱 <b>Grupo de WhatsApp:</b> ${whatsappCfg.value}\n`;
  }

  msg += '\n<i>Este mensaje es automático. Para interactuar usá Discord.</i>';
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

      const members = update.message?.new_chat_members;
      if (!members) continue;

      for (const member of members) {
        if (member.is_bot) continue;

        const clanCfg = await prisma.botConfig.findFirst({
          where: { key: { startsWith: 'clan_tag_' } },
        });
        const clanTag = clanCfg?.value || '#28P8RQUY';
        const welcomeText = await buildWelcomeMessage(clanTag);

        await sendTelegramMessage(welcomeText);
        logger.info(`Telegram welcome sent to ${member.first_name}`);
        break;
      }
    }
  } catch (err) {
    logger.debug(`Telegram poll error: ${(err as Error).message}`);
  }
}

export function startTelegramWelcome(): void {
  if (polling) return;
  polling = true;
  logger.info('Telegram welcome polling started (every 5s)');
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
      logger.debug(`Telegram welcome loop error: ${(err as Error).message}`);
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
