import { Client } from 'discord.js';
import prisma from '../database/prisma';
import { configureTelegram } from '../services/telegram.service';
import logger from '../config/logger';

export function initTelegram(client: Client): void {
  // Intentar cargar la config del primer guild
  const guild = client.guilds.cache.first();
  if (!guild) return;

  loadTelegramConfig(guild.id);
  logger.info('Telegram init: config cargada si existe');
}

async function loadTelegramConfig(guildId: string): Promise<void> {
  const tokenCfg = await prisma.botConfig.findUnique({
    where: { key: `telegram_token_${guildId}` },
  });
  const chatCfg = await prisma.botConfig.findUnique({
    where: { key: `telegram_chat_${guildId}` },
  });

  if (tokenCfg && chatCfg) {
    configureTelegram(tokenCfg.value, chatCfg.value);
    logger.info('Telegram configured successfully');
  }
}
