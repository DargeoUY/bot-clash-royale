import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { Bot as TelegramBot } from 'grammy';
import prisma from '../database/prisma';
import { obtenerChatIdPorGuild } from './telegram-link.service';
import logger from '../config/logger';

let discordClient: Client;
let telegramBot: TelegramBot | null = null;

export function setDiscordClient(client: Client): void {
  discordClient = client;
}

export function setTelegramBot(bot: TelegramBot | null): void {
  telegramBot = bot;
}

export async function sendToChannel(guildId: string, channelKey: string, content: string | EmbedBuilder): Promise<void> {
  try {
    const cfg = await prisma.configuracionBot.findUnique({ where: { clave: `${channelKey}_${guildId}` } });
    if (!cfg) return;
    const channel = await discordClient.channels.fetch(cfg.valor) as TextChannel;
    if (!channel) return;
    if (typeof content === 'string') {
      await channel.send(content);
    } else {
      await channel.send({ embeds: [content] });
    }
  } catch (err) {
    logger.warn(`Error sending to channel ${channelKey}:`, err);
  }
}

export async function sendToTelegram(guildId: string, text: string): Promise<void> {
  if (!telegramBot) return;
  const chatId = await obtenerChatIdPorGuild(guildId);
  if (!chatId) return;
  try {
    await telegramBot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.warn(`Error sending to Telegram chat ${chatId}:`, err);
  }
}

export async function broadcastToGuild(guildId: string, text: string): Promise<void> {
  await Promise.all([
    sendToChannel(guildId, 'channel_ranking', text),
    sendToTelegram(guildId, text),
  ]);
}
