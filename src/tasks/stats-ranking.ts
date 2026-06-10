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
  donations: number;
  trophies: number;
}

interface WarStats {
  tag: string;
  name: string;
  fame: number;
  decksUsed: number;
}

interface DeltaStats {
  tag: string;
  name: string;
  wins: number;
  losses: number;
  winRate: number;
  donations: number;
  trophies: number;
}

function medal(i: number): string {
  return i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`;
}

function formatTop(lines: string[], limit: number): string {
  return lines.length === 0 ? 'Sin datos' : lines.slice(0, limit).join('\n');
}

let statsTask: cron.ScheduledTask | null = null;

async function loadPreviousSnapshot(clanTag: string): Promise<{ date: string; stats: Map<string, PlayerStats> } | null> {
  const key = `stats_snapshot_${clanTag}`;
  const cfg = await prisma.botConfig.findUnique({ where: { key } });
  if (!cfg) return null;
  try {
    const data: { date: string; stats: PlayerStats[] } = JSON.parse(cfg.value);
    return { date: data.date, stats: new Map(data.stats.map((s) => [s.tag, s])) };
  } catch {
    return null;
  }
}

async function saveSnapshot(clanTag: string, stats: PlayerStats[]): Promise<void> {
  const key = `stats_snapshot_${clanTag}`;
  const today = new Date().toISOString().split('T')[0];
  await prisma.botConfig.upsert({
    where: { key },
    update: { value: JSON.stringify({ date: today, stats }) },
    create: { key, value: JSON.stringify({ date: today, stats }) },
  });
}

export async function publishStatsRanking(
  client: Client,
  clanTag: string,
  guildId: string,
): Promise<void> {
  logger.info(`Stats ranking: fetching data for ${clanTag}...`);

  const members = await getClanMembers(clanTag);
  const current: PlayerStats[] = [];
  let errors = 0;

  for (const member of members) {
    try {
      const player = await getPlayerInfo(member.tag);
      current.push({
        tag: player.tag,
        name: player.name,
        wins: player.wins,
        losses: player.losses,
        donations: player.totalDonations || 0,
        trophies: player.trophies,
      });
    } catch (err) {
      errors++;
      logger.warn(`Stats: could not fetch ${member.tag}: ${(err as Error).message}`);
    }
  }

  if (current.length === 0) {
    logger.warn(`No stats data for ${clanTag}`);
    return;
  }

  // War stats
  const warStats: WarStats[] = [];
  try {
    const race = await getCurrentRiverRace(clanTag);
    if (race.clan?.participants) {
      for (const p of race.clan.participants) {
        warStats.push({ tag: p.tag, name: p.name, fame: p.fame, decksUsed: p.decksUsed });
      }
    }
  } catch { /* ok */ }

  // Daily deltas
  const today = new Date().toISOString().split('T')[0];
  const snapshot = await loadPreviousSnapshot(clanTag);
  const prev = snapshot?.stats ?? null;
  const isFirstDay = !snapshot || snapshot.date === today;
  const deltas: DeltaStats[] = [];

  for (const c of current) {
    const p = prev?.get(c.tag);
    const dw = p ? c.wins - p.wins : c.wins;
    const dl = p ? c.losses - p.losses : c.losses;
    const dd = p ? c.donations - p.donations : c.donations;
    const dt = p ? c.trophies - p.trophies : c.trophies;
    const total = dw + dl;
    const wr = total > 0 ? Math.round((dw / total) * 100) : 0;

    deltas.push({
      tag: c.tag,
      name: c.name,
      wins: dw,
      losses: dl,
      winRate: wr,
      donations: dd,
      trophies: dt,
    });
  }

  // Save current as baseline for next day
  await saveSnapshot(clanTag, current);

  // Rankings (daily where possible, otherwise lifetime)
  const byDailyWR = [...deltas]
    .filter((d) => d.wins + d.losses > 0)
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
  const byDonations = [...deltas].sort((a, b) => b.donations - a.donations);
  const byTrophies = [...deltas].sort((a, b) => b.trophies - a.trophies);
  const byFame = [...warStats].sort((a, b) => b.fame - a.fame);

  // Totals
  const totalDailyW = deltas.reduce((s, d) => s + d.wins, 0);
  const totalDailyL = deltas.reduce((s, d) => s + d.losses, 0);
  const totalDonations = deltas.reduce((s, d) => s + d.donations, 0);
  const totalFame = warStats.reduce((s, p) => s + p.fame, 0);

  // Save players to DB
  for (const s of current) {
    try {
      await prisma.player.upsert({
        where: { tag: s.tag },
        update: { name: s.name, status: 'active', clanTag },
        create: { tag: s.tag, name: s.name, clanTag, status: 'active' },
      });
    } catch { /* skip */ }
  }

  // Channel
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

    const label = isFirstDay
      ? '📊 Ranking del Clan — Día 1 (sin datos diarios aún)'
      : '📊 Ranking del Clan — Diario';

    // ── Header ──
    const header = new EmbedBuilder()
      .setTitle(label)
      .setColor(EMBED_COLOR)
      .setFooter({ text: `Actualizado cada 24h | Errores: ${errors}` })
      .setTimestamp();

    if (isFirstDay) {
      header.setDescription(
        `**${members.length}** jugadores sincronizados.\n\n` +
        `📌 Hoy es el **primer día** de tracking. Se guardó la foto inicial.\n` +
        `Mañana se mostrarán solo las partidas **de hoy** (delta diario).`
      );
      await channel.send({ embeds: [header] });
      return;
    }

    header.setDescription(
      `**${members.length}** jugadores | ✅ ${totalDailyW}V ❌ ${totalDailyL}D hoy | 💎 ${totalDonations.toLocaleString()} donaciones`
    );
    await channel.send({ embeds: [header] });

    // ── 1. Victorias / Derrotas ──
    if (byDailyWR.length > 0) {
      const wrLines = byDailyWR.map((d, i) =>
        `**${medal(i)} ${d.name}**\n᛫ ${d.wins}V / ${d.losses}D — ${d.winRate}% WR`
      );
      const wr = new EmbedBuilder()
        .setTitle('⚔️ Victorias / Derrotas')
        .setColor(0xE74C3C)
        .setDescription(formatTop(wrLines, 10));
      await channel.send({ embeds: [wr] });
    }

    // ── 2. Donaciones de Cartas ──
    if (byDonations.some((d) => d.donations > 0)) {
      const donLines = byDonations.map((d, i) =>
        `**${medal(i)} ${d.name}**\n᛫ ${d.donations.toLocaleString()} cartas donadas`
      );
      const don = new EmbedBuilder()
        .setTitle('💎 Donaciones de Cartas')
        .setColor(0xFF69B4)
        .setDescription(formatTop(donLines, 10));
      await channel.send({ embeds: [don] });
    }

    // ── 3. Copas ──
    if (byTrophies.length > 0) {
      const tropLines = byTrophies.map((d, i) => {
        const diff = d.trophies >= 0 ? `+${d.trophies}` : `${d.trophies}`;
        return `**${medal(i)} ${d.name}**\n᛫ ${diff} copas`;
      });
      const trop = new EmbedBuilder()
        .setTitle('🏆 Mayor Cantidad de Copas')
        .setColor(0xFFD700)
        .setDescription(formatTop(tropLines, 10));
      await channel.send({ embeds: [trop] });
    }

    // ── 4. Guerra de Clanes ──
    if (warStats.length > 0) {
      const warLines = byFame.map((p, i) =>
        `**${medal(i)} ${p.name}**\n᛫ ${p.fame} fama ⚡ ${p.decksUsed} decks`
      );
      const war = new EmbedBuilder()
        .setTitle(`⚔️ Guerra de Clanes (${totalFame} fama)`)
        .setColor(0x9B59B6)
        .setDescription(formatTop(warLines, 10));
      await channel.send({ embeds: [war] });
    } else {
      const war = new EmbedBuilder()
        .setTitle('⚔️ Guerra de Clanes')
        .setColor(0x9B59B6)
        .setDescription('Sin guerra activa.');
      await channel.send({ embeds: [war] });
    }

    logger.info(`Stats ranking published to ${channel.name} (${current.length} players)`);
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
