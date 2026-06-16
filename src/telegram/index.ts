import { Bot, Context } from 'grammy';
import logger from '../config/logger';
import { crearConexion, limpiarExpirados } from '../services/telegram-link.service';
import { setTelegramBot } from '../services/cross-platform.service';
import { registrarComandos } from './comandos';

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  logger.warn('TELEGRAM_TOKEN no definido — bot de Telegram desactivado');
}

const bot = token ? new Bot(token) : null;

if (bot) {
  bot.on('my_chat_member', async (ctx) => {
    try {
      const chat = ctx.chat;
      const oldMember = ctx.myChatMember.old_chat_member;
      const newMember = ctx.myChatMember.new_chat_member;
      if (newMember.status === 'member' && oldMember.status !== 'member' && oldMember.status !== 'administrator') {
        const codigo = await crearConexion(chat.id);
        await ctx.api.sendMessage(
          chat.id,
          `🤖 ¡Bot Clash Royale activo en este grupo!\n\n` +
          `Para vincular este grupo con Discord y tu clan:\n\n` +
          `1️⃣ Copiá este código: **${codigo}**\n` +
          `2️⃣ Andá a Discord y usá el comando \`/auto-setup\`\n` +
          `3️⃣ En el formulario, pegá el código en el campo "Código de Telegram"\n\n` +
          `⚠️ El código expira en 1 hora.`,
          { parse_mode: 'Markdown' },
        );
      }
      if (newMember.status === 'left' || newMember.status === 'kicked') {
        const prisma = (await import('../database/prisma')).default;
        await prisma.clan.updateMany({
          where: { idChatTelegram: chat.id },
          data: { idChatTelegram: null },
        });
        logger.info(`Bot eliminado del chat ${chat.id}, vínculo eliminado`);
      }
    } catch (err) {
      logger.error('Error en my_chat_member:', err);
    }
  });

  bot.command('start', (ctx) => ctx.reply(
    '🤖 Bot Clash Royale activo.\n\n' +
    'Comandos:\n' +
    '/registrar #TAG — Vincular tu cuenta\n' +
    '/clan — Info del clan\n' +
    '/perfil #TAG — Perfil de jugador\n' +
    '/guerra — Estado de guerra\n' +
    '/ranking — Tabla de posiciones\n' +
    '/ayuda — Esta ayuda',
  ));

  bot.command('ayuda', (ctx) => {
    ctx.reply(
      'Comandos disponibles (requieren registro):\n' +
      '/clan — Info del clan\n' +
      '/perfil #TAG — Perfil de jugador\n' +
      '/guerra — Estado de guerra\n' +
      '/ranking — Tabla de posiciones\n' +
      '/registrar #TAG — Vincular tu cuenta',
    );
  });

  registrarComandos(bot);
}

export async function startTelegramBot(): Promise<void> {
  if (!bot) return;
  setTelegramBot(bot);
  bot.start();
  setInterval(limpiarExpirados, 10 * 60 * 1000);
  logger.info('Bot de Telegram iniciado');
}
