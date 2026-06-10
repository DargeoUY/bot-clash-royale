import cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import prisma from '../database/prisma';
import { getClanMembers } from '../api/clan';
import { getPlayerInfo } from '../api/player';
import { getAllClanConfigs } from '../utils/guild';
import { EMBED_COLOR } from '../utils/embeds';
import logger from '../config/logger';

interface PlayerStats {
  tag: string;
  name: string;
  wins: number;
  losses: number;
  battleCount: number;
  winRate: number;
}

let statsTask: cron.ScheduledTask | null = null;

export async function publishStatsRanking(
  client: Client,
  clanTag: string,
  guildId: string,
): Promise<void> {
  logger.info(`Stats ranking: fetching data for ${clanTag}...`);

  const members = await getClanMembers(clanTag);
  const stats: PlayerStats[] = [];
  let errors = 0;

  for (const member of members) {
    try {
      const player = await getPlayerInfo(member.tag);
      const rate = player.battleCount > 0
        ? Math.round((player.wins / player.battleCount) * 100)
        : 0;
      stats.push({
        tag: player.tag,
        name: player.name,
        wins: player.wins,
        losses: player.losses,
        battleCount: player.battleCount,
        winRate: rate,
      });
    } catch (err) {
      errors++;
      logger.warn(`Stats: could not fetch ${member.tag}: ${(err as Error).message}`);
    }
  }

  if (stats.length === 0) {
    logger.warn(`No stats data for ${clanTag}`);
    return;
  }

  const topWins = [...stats].sort((a, b) => b.wins - a.wins);
  const topRate = [...stats].sort((a, b) => b.winRate - a.winRate);
  const totalWins = stats.reduce((s, p) => s + p.wins, 0);
  const totalLosses = stats.reduce((s, p) => s + p.losses, 0);
  const clanRate = (totalWins + totalLosses) > 0
    ? Math.round((totalWins / (totalWins + totalLosses)) * 100)
    : 0;

  // Save to database
  for (const s of stats) {
    try {
      await prisma.player.upsert({
        where: { tag: s.tag },
        update: {
          name: s.name,
          status: 'active',
          clanTag,
        },
        create: {
          tag: s.tag,
          name: s.name,
          clanTag,
          status: 'active',
        },
      });
    } catch { /* skip */ }
  }

  // Post to channel
  const channelKey = `channel_stats_${guildId}`;
  let cfg = await prisma.botConfig.findUnique({ where: { key: channelKey } });
  if (!cfg) {
    cfg = await prisma.botConfig.findUnique({ where: { key: `channel_ranking_${guildId}` } });
  }
  if (!cfg) {
    logger.warn(`No stats/ranking channel for guild ${guildId}`);
    return;
  }

  try {
    const channel = (await client.channels.fetch(cfg.value)) as TextChannel;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('📊 Ranking de Estadísticas del Clan')
      .setColor(EMBED_COLOR)
      .setDescription(`**${members.length}** jugadores | **${totalWins.toLocaleString()}** victorias | **${totalLosses.toLocaleString()}** derrotas | **${clanRate}%** win rate del clan`)
      .setFooter({ text: `Actualizado cada 24h | Errores: ${errors}` })
      .setTimestamp();

    const topWinsList = topWins.slice(0, 10).map((p, i) => {
      const m = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `${m} **${p.name}** — ${p.wins}V / ${p.losses}D (${p.winRate}%)`;
    }).join('\n');

    embed.addFields({ name: '🏆 Top Victorias', value: topWinsList || 'Sin datos', inline: false });

    const topRateList = topRate.slice(0, 10).map((p, i) => {
      const m = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `${m} **${p.name}** — ${p.winRate}%`;
    }).join('\n');

    embed.addFields({ name: '🎯 Top Win Rate', value: topRateList || 'Sin datos', inline: false });

    await channel.send({ embeds: [embed] });
    logger.info(`Stats ranking published to ${channel.name} (${stats.length} players)`);
  } catch (err) {
    logger.error(`Error publishing stats: ${(err as Error).message}`);
  }
}

export function startStatsRanking(client: Client): void {
  // Run at 8:00 AM UTC daily
  statsTask = cron.schedule('0 8 * * *', async () => {
    logger.info('Stats ranking task: starting...');
    const clans = await getAllClanConfigs();
    for (const { clanTag, guildId } of clans) {
      try {
        await publishStatsRanking(client, clanTag, guildId);
      } catch (err) {
        logger.error(`Stats ranking failed for ${clanTag}: ${(err as Error).message}`);
      }
    }
  });

  logger.info('Stats ranking task started (daily at 8:00 AM UTC)');
}

export function stopStatsRanking(): void {
  if (statsTask) statsTask.stop();
  logger.info('Stats ranking task stopped');
}
