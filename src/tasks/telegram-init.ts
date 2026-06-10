import { Client } from 'discord.js';
import { loadTelegramConfig } from '../services/telegram.service';
import logger from '../config/logger';

export function initTelegram(client: Client): void {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  loadTelegramConfig(guild.id);
  logger.info('Telegram init: config cargada si existe');
}
