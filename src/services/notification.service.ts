import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import prisma from '../database/prisma';
import { InactivityCheck } from './inactivity.service';
import { EMBED_COLOR, EMBED_ERROR_COLOR } from '../utils/embeds';
import logger from '../config/logger';

export const STATUS_LABELS: Record<string, string> = {
  warning: '⚠️ Advertencia',
  inactive: '🔴 Inactivo',
  kick_suggested: '⛔ Expulsión sugerida',
};

async function sendTelegramDM(telegramId: string, playerName: string, daysInactive: number, status: string): Promise<void> {
  try {
    const tokenCfg = await prisma.botConfig.findFirst({
      where: { key: { startsWith: 'telegram_token_' } },
    });
    if (!tokenCfg?.value) return;

    const label = STATUS_LABELS[status] || status;
    let text = `<b>Aviso de Inactividad</b>\n\n`;
    text += `${label}\n`;
    text += `Hace <b>${daysInactive}</b> días que no registrás actividad en el clan.\n`;
    text += `Jugador: <b>${playerName}</b>\n\n`;
    text += '<i>Usá /ausencia en Discord si vas a estar fuera.</i>';

    const params = new URLSearchParams({
      chat_id: telegramId,
      text,
      parse_mode: 'HTML',
    });

    const url = `https://api.telegram.org/bot${tokenCfg.value}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    logger.info(`Telegram DM sent to ${playerName} (${daysInactive}d inactive)`);
  } catch (err) {
    logger.debug(`Telegram DM failed for ${playerName}: ${(err as Error).message}`);
  }
}

export async function notifyInactivePlayer(
  client: Client,
  player: InactivityCheck,
): Promise<void> {
  if (!player.shouldNotify) return;

  const dbPlayer = await prisma.player.findUnique({
    where: { tag: player.playerTag },
    select: { discordId: true, telegramId: true },
  });

  if (dbPlayer?.telegramId) {
    await sendTelegramDM(dbPlayer.telegramId, player.playerName, player.daysInactive, player.status);
  }

  if (!player.discordId) return;

  try {
    const user = await client.users.fetch(player.discordId);
    const statusMessages: Record<string, string> = {
      warning: `⚠️ Hace ${player.daysInactive} días que no registrás actividad en el clan. ¡Volvé a jugar tus batallas de guerra!`,
      inactive: `🚨 Estás inactivo hace ${player.daysInactive} días. Tu lugar en el clan está en riesgo.`,
      kick_suggested: `⛔ Llevás ${player.daysInactive} días inactivo. Un líder revisará tu caso pronto.`,
    };

    const embed = new EmbedBuilder()
      .setTitle('Aviso de Inactividad')
      .setDescription(statusMessages[player.status] || 'Has estado inactivo.')
      .setColor(player.status === 'kick_suggested' ? EMBED_ERROR_COLOR : EMBED_COLOR)
      .addFields({ name: 'Días inactivo', value: `${player.daysInactive}`, inline: true })
      .setFooter({ text: 'Usá /ausencia si vas a estar fuera por un tiempo' });

    await user.send({ embeds: [embed] });
    logger.info(`DM sent to ${player.playerName} (${player.daysInactive}d inactive)`);
  } catch (error) {
    logger.warn(`Could not DM ${player.playerName}: ${(error as Error).message}`);
  }
}

export async function notifyInactivityChannel(
  client: Client,
  guildId: string,
  results: InactivityCheck[],
): Promise<void> {
  const newAlerts = results.filter((r) => r.shouldNotify);
  if (newAlerts.length === 0) return;

  const channelKey = `channel_alerts_${guildId}`;
  const cfg = await prisma.botConfig.findUnique({ where: { key: channelKey } });
  if (!cfg) return;

  try {
    const channel = (await client.channels.fetch(cfg.value)) as TextChannel;
    if (!channel) return;

    for (const player of newAlerts) {
      const embed = new EmbedBuilder()
        .setTitle(`⚠️ Inactividad: ${player.playerName}`)
        .setColor(player.status === 'kick_suggested' ? EMBED_ERROR_COLOR : EMBED_COLOR)
        .addFields(
          { name: 'Días inactivo', value: `${player.daysInactive}`, inline: true },
          { name: 'Estado', value: STATUS_LABELS[player.status] || player.status, inline: true },
        )
        .setFooter({ text: player.playerTag })
        .setTimestamp();

      if (player.status === 'kick_suggested') {
        embed.setDescription('⛔ Se sugiere revisar su permanencia en el clan.');
      }

      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    logger.error('Error notifying inactivity channel:', error);
  }
}
