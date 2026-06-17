import cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import prisma from '../database/prisma';
import { config } from '../config';
import { getLeaderboard } from '../services/points.service';
import { EMBED_COLOR } from '../utils/embeds';
import logger from '../config/logger';

let monthlyTask: cron.ScheduledTask | null = null;
let seasonResetTask: cron.ScheduledTask | null = null;

export function startMonthlyTasks(client: Client): void {
  monthlyTask = cron.schedule('0 0 1 * *', async () => {
    logger.info('Generating monthly report...');
    await publishMonthlyReport(client);
  });

  seasonResetTask = cron.schedule('5 0 1 * *', async () => {
    logger.info('Resetting season points...');
    await resetSeasonRoles(client);
  });

  logger.info('Monthly tasks started');
}

export function stopMonthlyTasks(): void {
  if (monthlyTask) monthlyTask.stop();
  if (seasonResetTask) seasonResetTask.stop();
}

async function publishMonthlyReport(client: Client): Promise<void> {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channelKey = `channel_ranking_${guild.id}`;
  const cfg = await prisma.configuracionBot.findUnique({ where: { clave: channelKey } });
  if (!cfg) return;

  try {
    const channel = (await client.channels.fetch(cfg.valor)) as TextChannel;
    if (!channel) return;

    const leaderboard = await getLeaderboard(config.CLAN_TAG, 'mensual');

    const embed = new EmbedBuilder()
      .setTitle('🏆 Ranking Mensual')
      .setColor(EMBED_COLOR)
      .setTimestamp();

    if (leaderboard.length > 0) {
      let description = '';
      for (let i = 0; i < Math.min(leaderboard.length, 10); i++) {
        const p = leaderboard[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        description += `${medal} **${p.name}** — ${p.points} pts\n`;
      }
      embed.setDescription(description);

      if (leaderboard[0]) {
        embed.addFields({
          name: '👑 Campeón del Mes',
          value: `**${leaderboard[0].name}** con ${leaderboard[0].points} puntos`,
        });
      }
    } else {
      embed.setDescription('Sin datos este mes.');
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.error('Error publishing monthly report:', error);
  }
}

async function resetSeasonRoles(client: Client): Promise<void> {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const campeonKey = `role_campeon_mensual_${guild.id}`;
  const campeonCfg = await prisma.configuracionBot.findUnique({ where: { clave: campeonKey } });
  if (!campeonCfg) return;

  const leaderboard = await getLeaderboard(config.CLAN_TAG, 'mensual');
  if (leaderboard.length === 0) return;

  const role = guild.roles.cache.get(campeonCfg.valor);
  if (!role) return;

  for (const [, member] of role.members) {
    try {
      await member.roles.remove(role);
    } catch { /* skip */ }
  }

  try {
    const winnerDiscordId = await getDiscordIdByPlayerTag(leaderboard[0].tag);
    if (winnerDiscordId) {
      const member = await guild.members.fetch(winnerDiscordId);
      await member.roles.add(role);
      logger.info(`Campeón del Mes: ${leaderboard[0].name}`);
    }
  } catch (error) {
    logger.error('Error assigning Campeón del Mes role:', error);
  }
}

async function getDiscordIdByPlayerTag(tag: string): Promise<string | null> {
  const player = await prisma.jugador.findUnique({ where: { tag } });
  return player?.idDiscord || null;
}
