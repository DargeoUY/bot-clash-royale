import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import prisma from '../database/prisma';
import { InactivityCheck } from './inactivity.service';
import { EMBED_COLOR, EMBED_ERROR_COLOR } from '../utils/embeds';
import { sendToTelegram } from './cross-platform.service';
import logger from '../config/logger';

export async function notifyInactivePlayer(
  client: Client,
  player: InactivityCheck,
): Promise<void> {
  if (!player.idDiscord || !player.shouldNotify) return;

  try {
    const user = await client.users.fetch(player.idDiscord);
    const statusMessages: Record<string, string> = {
      warning: `⚠️ Hace ${player.diasInactivo} días que no registrás actividad en el clan. ¡Volvé a jugar tus batallas de guerra!`,
      inactive: `🚨 Estás inactivo hace ${player.diasInactivo} días. Tu lugar en el clan está en riesgo. Se te descontaron puntos.`,
      kick_suggested: `⛔ Llevás ${player.diasInactivo} días inactivo. Un líder revisará tu caso pronto.`,
    };

    const embed = new EmbedBuilder()
      .setTitle('Aviso de Inactividad')
      .setDescription(statusMessages[player.status] || 'Has estado inactivo.')
      .setColor(player.status === 'kick_suggested' ? EMBED_ERROR_COLOR : EMBED_COLOR)
      .addFields({ name: 'Días inactivo', value: `${player.diasInactivo}`, inline: true })
      .setFooter({ text: 'Usá /ausencia si vas a estar fuera por un tiempo' });

    await user.send({ embeds: [embed] });
    logger.info(`DM sent to ${player.nombreJugador} (${player.diasInactivo}d inactive)`);
  } catch (error) {
    logger.warn(`Could not DM ${player.nombreJugador}: ${(error as Error).message}`);
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
  const cfg = await prisma.configuracionBot.findUnique({ where: { clave: channelKey } });
  if (cfg) {
    try {
      const channel = (await client.channels.fetch(cfg.valor)) as TextChannel;
      if (channel) {
        for (const player of newAlerts) {
          const embed = new EmbedBuilder()
            .setTitle(`⚠️ Inactividad: ${player.nombreJugador}`)
            .setColor(player.status === 'kick_suggested' ? EMBED_ERROR_COLOR : EMBED_COLOR)
            .addFields(
              { name: 'Días inactivo', value: `${player.diasInactivo}`, inline: true },
              { name: 'Estado', value: player.status, inline: true },
            )
            .setFooter({ text: player.playerTag })
            .setTimestamp();

          if (player.status === 'kick_suggested') {
            embed.setDescription('⛔ Se sugiere revisar su permanencia en el clan.');
          }

          await channel.send({ embeds: [embed] });
        }
      }
    } catch (error) {
      logger.error('Error notifying inactivity channel:', error);
    }
  }

  for (const player of newAlerts) {
    const msg = `⚠️ *Inactividad:* ${player.nombreJugador} — ${player.diasInactivo} días (${player.status})`;
    await sendToTelegram(guildId, msg);
  }
}

export async function notifyDailyInactivitySummary(
  client: Client,
  guildId: string,
  results: InactivityCheck[],
): Promise<void> {
  if (results.length === 0) return;

  const channelKey = `channel_alerts_${guildId}`;
  const cfg = await prisma.configuracionBot.findUnique({ where: { clave: channelKey } });
  if (!cfg) return;

  try {
    const channel = (await client.channels.fetch(cfg.valor)) as TextChannel;
    if (!channel) return;

    const warning = results.filter((r) => r.status === 'warning');
    const inactive = results.filter((r) => r.status === 'inactive');
    const kick = results.filter((r) => r.status === 'kick_suggested');

    const lines: string[] = [];
    if (kick.length > 0) lines.push(`⛔ **Para expulsión:**`, ...kick.map((p) => `  • ${p.nombreJugador} — ${p.diasInactivo} días`), '');
    if (inactive.length > 0) lines.push(`🔴 **Inactivos:**`, ...inactive.map((p) => `  • ${p.nombreJugador} — ${p.diasInactivo} días`), '');
    if (warning.length > 0) lines.push(`🟡 **Aviso:**`, ...warning.map((p) => `  • ${p.nombreJugador} — ${p.diasInactivo} días`));

    const embed = new EmbedBuilder()
      .setTitle('📋 Reporte Diario de Inactividad')
      .setDescription(lines.join('\n') || 'Sin inactivos')
      .setColor(EMBED_COLOR)
      .setFooter({ text: `Total: ${results.length} inactivos` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    const telegramMsg = `📋 *Reporte Diario de Inactividad*\n${results.map((p) => `• ${p.nombreJugador} — ${p.diasInactivo}d (${p.status})`).join('\n')}`;
    await sendToTelegram(guildId, telegramMsg);
  } catch (error) {
    logger.error('Error sending daily inactivity summary:', error);
  }
}

export async function assignInactivityRoles(
  client: Client,
  guildId: string,
  results: InactivityCheck[],
): Promise<void> {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return;

    const inactiveRoleCfg = await prisma.configuracionBot.findUnique({
      where: { clave: `role_inactive_${guildId}` },
    });
    const vacationRoleCfg = await prisma.configuracionBot.findUnique({
      where: { clave: `role_ausente_${guildId}` },
    });
    if (!inactiveRoleCfg && !vacationRoleCfg) return;

    const inactiveRole = inactiveRoleCfg ? guild.roles.cache.get(inactiveRoleCfg.valor) : null;
    const vacationRole = vacationRoleCfg ? guild.roles.cache.get(vacationRoleCfg.valor) : null;

    const inactiveTags = new Set(
      results.filter((r) => r.status === 'inactive' || r.status === 'kick_suggested').map((r) => r.playerTag),
    );

    const allRegistered = await prisma.jugador.findMany({
      where: { clanTag: { not: undefined }, idDiscord: { not: null } },
      select: { tag: true, idDiscord: true, status: true },
    });

    for (const player of allRegistered) {
      if (!player.idDiscord) continue;
      try {
        const member = await guild.members.fetch(player.idDiscord).catch(() => null);
        if (!member) continue;

        if (inactiveRole) {
          const shouldHave = inactiveTags.has(player.tag);
          const has = member.roles.cache.has(inactiveRole.id);
          if (shouldHave && !has) await member.roles.add(inactiveRole);
          else if (!shouldHave && has && (player.status === 'active' || player.status === 'warning')) {
            const hasKick = results.some((r) => r.playerTag === player.tag && r.status === 'kick_suggested');
            const hasInactive = results.some((r) => r.playerTag === player.tag && r.status === 'inactive');
            if (!hasKick && !hasInactive) await member.roles.remove(inactiveRole);
          }
        }
      } catch {
        // member not in guild, skip
      }
    }
  } catch (error) {
    logger.error('Error assigning inactivity roles:', error);
  }
}
