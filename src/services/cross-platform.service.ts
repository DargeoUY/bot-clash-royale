import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { Bot as TelegramBot } from 'grammy';
import prisma from '../database/prisma';
import logger from '../config/logger';
import { whatsapp } from '../whatsapp';
let discordClient: Client | undefined;
let telegramBot: TelegramBot | null = null;
export function setDiscordClient(client: Client): void { discordClient = client; }
export function setTelegramBot(bot: TelegramBot | null): void { telegramBot = bot; }
export async function sendToChannel(guildId: string, channelKey: string, content: string | EmbedBuilder): Promise<void> {
  const clan = await prisma.clan.findFirst({ where: { idServidorDiscord: guildId, discordEnabled: true } });
  if (!clan || !discordClient?.isReady()) return;
  try {
    const cfg = await prisma.configuracionBot.findUnique({ where: { clave: `${channelKey}_${guildId}` } });
    if (!cfg) return;
    const channel = await discordClient.channels.fetch(cfg.valor) as TextChannel | null;
    if (!channel || channel.guildId !== guildId) return;
    await channel.send(typeof content === 'string' ? { content, allowedMentions: { parse: [] } } : { embeds: [content], allowedMentions: { parse: [] } });
  } catch { logger.warn(`No se pudo enviar mensaje Discord: ${channelKey}`); }
}
export async function sendToTelegram(guildId: string, text: string): Promise<void> {
  const clan = await prisma.clan.findFirst({ where: { idServidorDiscord: guildId } });
  if (clan) await sendTelegramToClan(clan.tag, text);
}
async function sendTelegramToClan(clanTag: string, text: string) {
  const clan = await prisma.clan.findUnique({ where: { tag: clanTag } });
  if (!telegramBot || !clan?.telegramEnabled || !clan.idChatTelegram) return;
  for (let i = 0; i < text.length; i += 4000) await telegramBot.api.sendMessage(String(clan.idChatTelegram), text.slice(i, i + 4000));
}
export async function broadcastToClan(clanTag: string, text: string): Promise<void> {
  const clan = await prisma.clan.findUnique({ where: { tag: clanTag } });
  if (!clan) return;
  const outcomes = await Promise.allSettled([
    clan.idServidorDiscord ? sendToChannel(clan.idServidorDiscord, 'channel_ranking', text) : Promise.resolve(),
    sendTelegramToClan(clanTag, text), whatsapp.send(clanTag, text),
  ]);
  outcomes.forEach((result, i) => { if (result.status === 'rejected') logger.warn(`No se pudo publicar por canal ${i} para ${clanTag}`); });
}
export async function broadcastToGuild(guildId: string, text: string): Promise<void> {
  const clan = await prisma.clan.findFirst({ where: { idServidorDiscord: guildId } });
  if (clan) await broadcastToClan(clan.tag, text);
}
