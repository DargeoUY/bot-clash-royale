import cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import prisma from '../database/prisma';
import { getClanMembers } from '../api/clan';
import { getPlayerInfo } from '../api/player';
import { getCurrentRiverRace } from '../api/clan';
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
  donations: number;
  trophies: number;
}

interface WarStats {
  tag: string;
  name: string;
  fame: number;
  decksUsed: number;
}

function formatTop(list: string[], limit: number): string {
  if (list.length === 0) return 'Sin datos';
  return list.slice(0, limit).join('\n');
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
        donations: player.totalDonations || 0,
        trophies: player.trophies,
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

  // Rankings
  const byWinRate = [...stats].sort((a, b) => b.winRate - a.winRate);
  const byDonations = [...stats].sort((a, b) => b.donations - a.donations);
  const byTrophies = [...stats].sort((a, b) => b.trophies - a.trophies);

  // War stats
  const warStats: WarStats[] = [];
  try {
    const race = await getCurrentRiverRace(clanTag);
    if (race.clan?.participants) {
      for (const p of race.clan.participants) {
        warStats.push({
          tag: p.tag,
          name: p.name,
          fame: p.fame,
          decksUsed: p.decksUsed,
        });
      }
    }
  } catch { /* ok */ }
  const byFame = [...warStats].sort((a, b) => b.fame - a.fame);

  // Totals
  const totalWins = stats.reduce((s, p) => s + p.wins, 0);
  const totalLosses = stats.reduce((s, p) => s + p.losses, 0);
  const totalDonations = stats.reduce((s, p) => s + p.donations, 0);
  const clanRate = (totalWins + totalLosses) > 0
    ? Math.round((totalWins / (totalWins + totalLosses)) * 100)
    : 0;
  const totalFame = warStats.reduce((s, p) => s + p.fame, 0);

  // Save to database
  for (const s of stats) {
    try {
      await prisma.player.upsert({
        where: { tag: s.tag },
        update: { name: s.name, status: 'active', clanTag },
        create: { tag: s.tag, name: s.name, clanTag, status: 'active' },
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
      .setTitle('📊 Ranking del Clan — Semanal')
      .setColor(EMBED_COLOR)
      .setDescription(
        `**${members.length}** jugadores | **${clanRate}%** WR global | ` +
        `✅ ${totalWins.toLocaleString()}V ❌ ${totalLosses.toLocaleString()}D | ` +
        `💎 ${totalDonations.toLocaleString()} donaciones`
      )
      .setFooter({ text: `Actualizado cada 24h | Errores: ${errors}` })
      .setTimestamp();

    // ── Victorias/Derrotas (por win rate) ──
    const wrList = byWinRate.map((p, i) => {
      const m = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`;
      return `**${m}** **${p.name}** — ${p.wins}V / ${p.losses}D (${p.winRate}%)`;
    });
    embed.addFields({ name: '⚔️ Victorias / Derrotas', value: formatTop(wrList, 5) });

    // ── Donaciones de Cartas ──
    const donList = byDonations.map((p, i) => {
      const m = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`;
      return `**${m}** **${p.name}** — ${p.donations.toLocaleString()} 💎`;
    });
    embed.addFields({ name: '💎 Donaciones de Cartas', value: formatTop(donList, 5) });

    // ── Copas ──
    const tropList = byTrophies.map((p, i) => {
      const m = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`;
      return `**${m}** **${p.name}** — 🏆 ${p.trophies}`;
    });
    embed.addFields({ name: '🏆 Mayor Cantidad de Copas', value: formatTop(tropList, 5) });

    // ── Guerra de Clanes ──
    if (warStats.length > 0) {
      const warList = byFame.map((p, i) => {
        const m = i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`;
        return `**${m}** **${p.name}** — ${p.fame} fama ⚡ ${p.decksUsed} decks`;
      });
      embed.addFields({
        name: `⚔️ Guerra de Clanes (${totalFame} fama total)`,
        value: formatTop(warList, 5),
      });
    } else {
      embed.addFields({
        name: '⚔️ Guerra de Clanes',
        value: 'Sin guerra activa en este momento.',
      });
    }

    await channel.send({ embeds: [embed] });
    logger.info(`Stats ranking published to ${channel.name} (${stats.length} players)`);
  } catch (err) {
    logger.error(`Error publishing stats: ${(err as Error).message}`);
  }
}

export function startStatsRanking(client: Client): void {
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
