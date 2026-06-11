import prisma from '../database/prisma';
import { config } from '../config';
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
  my_chat_member?: {
    chat: { id: number; type: string; title?: string };
    new_chat_member: { status: string };
  };
}

const DEFAULT_WELCOME = `<b>¡Bienvenido a UruguayConQueso! 🧀</b>

Este es el canal de notificaciones del clan. Recibirás:
• Ranking diario de copas y donaciones
• Lista de inactivos cada 3 días
• Ganadores semanales y mensuales

<b>Comandos disponibles:</b>
/registrar #TAG — Vincula tu cuenta (obligatorio)
/perfil — Ver tu perfil
/clan — Info del clan
/help — Ayuda

<i>Este mensaje es automático.</i>`;

let welcomeText: string | null = null;
let welcomeImage: string | null = null;

async function loadWelcomeConfig(): Promise<void> {
  const [textCfg, imgCfg] = await Promise.all([
    prisma.botConfig.findFirst({ where: { key: { startsWith: 'telegram_welcome_text_' } } }),
    prisma.botConfig.findFirst({ where: { key: { startsWith: 'telegram_welcome_image_' } } }),
  ]);
  welcomeText = textCfg?.value || null;
  welcomeImage = imgCfg?.value || null;
}

async function buildWelcomeMessage(): Promise<string> {
  let msg = welcomeText || DEFAULT_WELCOME;

  const [clan, whatsappCfg] = await Promise.all([
    prisma.clan.findFirst(),
    prisma.botConfig.findFirst({
      where: { key: { startsWith: 'channel_whatsapp_' }, value: { not: '' } },
    }),
  ]);

  let extra = '';
  if (clan) {
    extra += `\n\n<b>${clan.name}</b> — ${clan.memberCount ?? '?'}/50 miembros`;
    if (clan.level) extra += ` | Nivel ${clan.level}`;
  }
  if (whatsappCfg) {
    extra += `\n📱 <b>WhatsApp:</b> ${whatsappCfg.value}`;
  }

  msg += extra;
  return msg;
}

async function sendText(chatId: number, text: string, replyTo?: number): Promise<void> {
  try {
    const token = config.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    const params = new URLSearchParams({
      chat_id: String(chatId),
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: 'true',
    });
    if (replyTo) params.set('reply_to_message_id', String(replyTo));

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } catch (err) {
    logger.debug(`Telegram sendText error: ${(err as Error).message}`);
  }
}

async function sendPhoto(chatId: number, photoUrl: string, caption: string): Promise<void> {
  try {
    const token = config.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    const params = new URLSearchParams({
      chat_id: String(chatId),
      photo: photoUrl,
      caption,
      parse_mode: 'HTML',
    });

    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } catch (err) {
    logger.debug(`Telegram sendPhoto error: ${(err as Error).message}`);
  }
}

async function sendWelcome(chatId: number): Promise<void> {
  const text = await buildWelcomeMessage();
  if (welcomeImage) {
    await sendPhoto(chatId, welcomeImage, text);
  } else {
    await sendText(chatId, text);
  }
}

async function pollUpdates(token: string): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`;
    const resp = await fetch(url);
    const data = await resp.json() as { ok: boolean; result: TgUpdate[] };

    if (!data.ok || !Array.isArray(data.result)) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;

      // Bot added to a new group → generate link code
      if (update.my_chat_member) {
        const mcm = update.my_chat_member;
        const isGroup = mcm.chat.type === 'group' || mcm.chat.type === 'supergroup';
        if (isGroup && mcm.new_chat_member.status === 'member') {
          const groupChatId = mcm.chat.id;

          const alreadyLinked = await prisma.botConfig.findUnique({
            where: { key: `telegram_group_clan_${groupChatId}` },
          });
          if (!alreadyLinked) {
            const existingPending = await prisma.botConfig.findFirst({
              where: { key: { startsWith: 'pending_link_' }, value: String(groupChatId) },
            });
            if (!existingPending) {
              const code = Math.random().toString(36).substring(2, 6).toUpperCase();
              await prisma.botConfig.create({
                data: { key: `pending_link_${code}`, value: String(groupChatId) },
              });
              await sendText(groupChatId,
                `🔗 <b>Vinculá este grupo con tu clan</b>\n\n` +
                `Código: <code>${code}</code>\n\n` +
                `En Discord usá <b>/vincular</b> y completá el formulario con tu clan tag y este código.`
              );
              logger.info(`Pending link code ${code} created for chat ${groupChatId} (${mcm.chat.title || 'group'})`);
            }
          }
        }
        continue;
      }

      const msg = update.message;
      if (!msg) continue;

      if (msg.new_chat_members) {
        for (const member of msg.new_chat_members) {
          if (member.is_bot) continue;
          await sendWelcome(msg.chat.id);
          logger.info(`Telegram welcome sent to ${member.first_name}`);
          break;
        }
      }

      if (msg.text && msg.from && !msg.from.is_bot && msg.text.trim().startsWith('/')) {
        const { handleTelegramCommand } = await import('../services/telegram-commands');
        const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
        const reply = await handleTelegramCommand(msg.chat.id, msg.from.id, msg.text.trim(), isGroup);
        if (reply) {
          await sendText(msg.chat.id, reply.text, msg.message_id);
          if (reply.privateText) {
            await sendText(msg.from.id, reply.privateText);
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

  loadWelcomeConfig();
  setInterval(loadWelcomeConfig, 5 * 60 * 1000);

  logger.info('Telegram polling started (every 5s)');
  intervalId = setInterval(async () => {
    try {
      const token = config.TELEGRAM_BOT_TOKEN;
      if (!token) return;

      const chatCfg = await prisma.botConfig.findFirst({
        where: { key: { startsWith: 'telegram_chat_' } },
      });
      if (token && chatCfg) {
        await pollUpdates(token);
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
