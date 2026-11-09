import { Bot } from 'grammy';
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
      if (['member', 'administrator'].includes(newMember.status) && ['left', 'kicked'].includes(oldMember.status)) {
        await ctx.api.sendMessage(chat.id, 'Bot activo. Un administrador del grupo debe usar /vincular y pegar el código en Canales de la web.');
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

  bot.command('vincular', async ctx => {
    if (!ctx.chat || ctx.chat.type === 'private') return;
    const member = await ctx.getChatMember(ctx.from!.id);
    if (!['administrator', 'creator'].includes(member.status)) { await ctx.reply('Solo administradores del grupo.'); return; }
    const codigo = await crearConexion(ctx.chat.id);
    await ctx.reply(`Código de vinculación: ${codigo}. Vence en una hora. Pegalo en Canales de la web.`);
  });
  bot.command('start', (ctx) => ctx.reply(
    '🤖 Bot Clash Royale activo.\n\n' +
    'Comandos:\n' +
    '/registrar #TAG — Vincular tu cuenta\n' +
    '/clan — Info del clan\n' +
    '/perfil [tag] — Perfil de jugador\n' +
    '/ranking <tipo> <periodo> — Rankings\n' +
    '/guerra — Estado de guerra\n' +
    '/puntos <tag> — Ver tus puntos\n' +
    '/ausencia <días> [motivo] — Modo vacaciones\n' +
    '/inactivos — Ver inactivos\n' +
    '/guia — Guía del bot\n' +
    '/ayuda — Esta ayuda',
  ));

  bot.command('ayuda', (ctx) => {
    ctx.reply(
      '🤖 *Comandos disponibles*\n\n' +
      '👤 *Jugadores*\n' +
      '/registrar #TAG — Vincular cuenta\n' +
      '/perfil [tag] — Ver perfil\n' +
      '/ranking <tipo> <periodo> — Rankings\n' +
      '   Tipos: trofeos, donaciones, guerra, puntos\n' +
      '   Periodo: semanal, mensual\n' +
      '/puntos <tag> — Ver puntos acumulados\n' +
      '/guerra — Estado de guerra\n' +
      '/ausencia <días> [motivo] — Vacaciones\n\n' +
      '⚙️ *Información*\n' +
      '/clan — Info del clan\n' +
      '/inactivos — Miembros inactivos\n' +
      '/guia — Guía completa\n' +
      '/ayuda — Esta ayuda',
      { parse_mode: 'Markdown' },
    );
  });

  registrarComandos(bot);
}

let cleanup: NodeJS.Timeout | undefined;
export async function stopTelegramBot(): Promise<void> {
  clearInterval(cleanup); if (bot?.isRunning()) await bot.stop();
}

export async function startTelegramBot(): Promise<void> {
  if (!bot) return;
  setTelegramBot(bot);
  bot.catch(() => logger.error('Error procesando actualización Telegram'));
  void bot.start().catch(() => logger.error('Telegram detenido por error de conexión'));
  cleanup = setInterval(() => { limpiarExpirados().catch(() => logger.warn('No se pudo limpiar códigos Telegram')); }, 10 * 60 * 1000);
  logger.info('Bot de Telegram iniciado');
}
