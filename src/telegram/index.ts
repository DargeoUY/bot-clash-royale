import { Bot } from 'grammy';
import logger from '../config/logger';

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  logger.warn('TELEGRAM_TOKEN no definido — bot de Telegram desactivado');
}

const bot = token ? new Bot(token) : null;

bot?.command('start', (ctx) => ctx.reply('🤖 Bot Clash Royale activo. Usá /ayuda para ver comandos.'));

bot?.command('ayuda', (ctx) => {
  ctx.reply(
    'Comandos disponibles:\n' +
    '/clan — Info del clan\n' +
    '/perfil <tag> — Perfil de jugador\n' +
    '/guerra — Estado de guerra\n' +
    '/registrar <tag> — Vincular cuenta',
  );
});

export async function startTelegramBot(): Promise<void> {
  if (!bot) return;
  bot.start();
  logger.info('Bot de Telegram iniciado');
}
