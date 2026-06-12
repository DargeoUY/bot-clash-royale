import cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import prisma from '../database/prisma';
import { getClanMembers } from '../api/clan';
import { getPlayerInfo } from '../api/player';
import { getCurrentRiverRace } from '../api/clan';
import { getAllClanConfigs } from '../utils/guild';
import { addToWeeklyAccumulator } from './weekly-winners';
import { addToMonthlyAccumulator } from './monthly-winners';
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

function formatTwoColumns(lines: string[], limit: number): { left: string; right: string } {
  const half = Math.ceil(limit / 2);
  return {
    left: lines.slice(0, half).join('\n') || '—',
    right: lines.slice(half, limit).join('\n') || '—',
  };
}

let statsTask: cron.ScheduledTask | null = null;
let midnightTask: cron.ScheduledTask | null = null;

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

async function loadMidnightSnapshot(clanTag: string, dateStr: string): Promise<Map<string, PlayerStats> | null> {
  const key = `stats_midnight_${clanTag}_${dateStr}`;
  const cfg = await prisma.botConfig.findUnique({ where: { key } });
  if (!cfg) return null;
  try {
    const raw = JSON.parse(cfg.value) as PlayerStats[];
    if (!Array.isArray(raw)) return null;
    return new Map(raw.map((s) => [s.tag, s]));
  } catch {
    return null;
  }
}

async function saveMidnightSnapshot(clanTag: string, stats: PlayerStats[]): Promise<void> {
  const key = `stats_midnight_${clanTag}_${todayKey()}`;
  await prisma.botConfig.upsert({
    where: { key },
    update: { value: JSON.stringify(stats) },
    create: { key, value: JSON.stringify(stats) },
  });
  logger.info(`Midnight snapshot saved for ${clanTag} (${stats.length} players)`);
}

async function runMidnightSnapshot(): Promise<void> {
  const clans = await getAllClanConfigs();
  for (const { clanTag } of clans) {
    try {
      const members = await getClanMembers(clanTag);
      const stats: PlayerStats[] = [];
      for (const member of members) {
        try {
          const player = await getPlayerInfo(member.tag);
          stats.push({
            tag: player.tag,
            name: player.name,
            wins: player.wins,
            losses: player.losses,
            donations: player.totalDonations || 0,
            trophies: player.trophies,
          });
        } catch { /* skip */ }
      }
      if (stats.length > 0) {
        await saveMidnightSnapshot(clanTag, stats);
      }
    } catch (err) {
      logger.error(`Midnight snapshot failed for ${clanTag}: ${(err as Error).message}`);
    }
  }
}

async function cleanLeftPlayers(clanTag: string, activeTags: Set<string>): Promise<void> {
  const dbPlayers = await prisma.player.findMany({
    where: { clanTag, status: 'active' },
    select: { tag: true, name: true },
  });

  const now = new Date();
  for (const p of dbPlayers) {
    if (activeTags.has(p.tag)) continue;

    logger.info(`Player ${p.name} (${p.tag}) left ${clanTag}, cleaning up...`);

    await prisma.player.update({
      where: { tag: p.tag },
      data: { status: 'left', leftAt: now },
    });

    for (const key of [`daily_deltas_${clanTag}`, `weekly_acc_${clanTag}`]) {
      const cfg = await prisma.botConfig.findUnique({ where: { key } });
      if (!cfg) continue;
      try {
        const data = JSON.parse(cfg.value);
        if (Array.isArray(data)) {
          const filtered = data.filter((e: { tag: string }) => e.tag !== p.tag);
          await prisma.botConfig.update({ where: { key }, data: { value: JSON.stringify(filtered) } });
        }
      } catch { /* skip corrupt data */ }
    }
  }
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

  // Clean up players who left the clan
  const activeTags = new Set(current.map(c => c.tag));
  await cleanLeftPlayers(clanTag, activeTags);

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

  // Load midnight snapshots (today = this midnight, yesterday = previous midnight)
  const todaySnap = await loadMidnightSnapshot(clanTag, todayKey());
  const yesterdaySnap = await loadMidnightSnapshot(clanTag, yesterdayKey());
  const isFirstDay = !yesterdaySnap;

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

    if (isFirstDay) {
      // Bootstrap: save today's midnight snapshot if it doesn't exist yet
      if (!todaySnap) {
        await saveMidnightSnapshot(clanTag, current);
        logger.info(`Bootstrap: saved first midnight snapshot for ${clanTag}`);
      }

      const header = new EmbedBuilder()
        .setTitle('📊 Ranking del Clan — Día 1 (sin datos aún)')
        .setColor(EMBED_COLOR)
        .setDescription(
          `**${members.length}** jugadores sincronizados.\n\n` +
          `📌 Se guardó la primera foto. A las 00:00 se toma otra.\n` +
          `Mañana a esta hora se publica el delta del día completo (medianoche a medianoche).`
        )
        .setFooter({ text: `Actualizado cada 24h | Errores: ${errors}` })
        .setTimestamp();
      await channel.send({ embeds: [header] });
      logger.info(`First day snapshot saved for ${clanTag} (${current.length} players)`);
      return;
    }

    if (!todaySnap) {
      logger.warn(`No today midnight snapshot for ${clanTag}, skipping`);
      return;
    }

    const deltas: DeltaStats[] = [];
    const yesterdayLabel = `ayer (${yesterdayKey()})`;

    for (const [tag, today] of todaySnap) {
      const yesterday = yesterdaySnap.get(tag);
      if (!yesterday) continue; // new player, skip

      const dw = today.wins - yesterday.wins;
      const dl = today.losses - yesterday.losses;
      const dd = today.donations - yesterday.donations;
      const dt = today.trophies - yesterday.trophies;
      const total = dw + dl;
      const wr = total > 0 ? Math.round((dw / total) * 100) : 0;

      deltas.push({
        tag,
        name: today.name,
        wins: dw,
        losses: dl,
        winRate: wr,
        donations: dd,
        trophies: dt,
      });
    }

    // Save daily deltas for Telegram /ranking
    const deltaKey = `daily_deltas_${clanTag}`;
    await prisma.botConfig.upsert({
      where: { key: deltaKey },
      update: { value: JSON.stringify(deltas) },
      create: { key: deltaKey, value: JSON.stringify(deltas) },
    });

    // Add to weekly accumulator
    const weeklyEntries = deltas.map((d) => ({
      tag: d.tag,
      name: d.name,
      wins: d.wins,
      losses: d.losses,
      donations: d.donations,
      trophies: d.trophies,
      fame: warStats.find((w) => w.tag === d.tag)?.fame || 0,
    }));
    await addToWeeklyAccumulator(clanTag, weeklyEntries);

    // Add to monthly accumulator
    const monthlyEntries = deltas.map((d) => ({
      tag: d.tag,
      name: d.name,
      trophies: d.trophies,
      fame: warStats.find((w) => w.tag === d.tag)?.fame || 0,
    }));
    await addToMonthlyAccumulator(clanTag, monthlyEntries);

    // Rankings
    const byDailyWR = [...deltas]
      .filter((d) => d.wins + d.losses > 0)
      .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
    const byDonations = [...deltas].sort((a, b) => b.donations - a.donations);
    const byTrophies = [...deltas].sort((a, b) => b.trophies - a.trophies);
    const byFame = [...warStats].sort((a, b) => b.fame - a.fame);

    const totalDailyW = deltas.reduce((s, d) => s + d.wins, 0);
    const totalDailyL = deltas.reduce((s, d) => s + d.losses, 0);
    const totalDonations = deltas.reduce((s, d) => s + d.donations, 0);
    const totalFame = warStats.reduce((s, p) => s + p.fame, 0);

    // Publish
    const header = new EmbedBuilder()
      .setTitle(`📊 Ranking del Clan — ${yesterdayLabel}`)
      .setColor(EMBED_COLOR)
      .setDescription(
        `**${members.length}** jugadores | ✅ ${totalDailyW}V ❌ ${totalDailyL}D ayer | 💎 ${totalDonations.toLocaleString()} donaciones`
      )
      .setFooter({ text: `Actualizado cada 24h | Errores: ${errors}` })
      .setTimestamp();
    await channel.send({ embeds: [header] });

    if (byDailyWR.length > 0) {
      const wrLines = byDailyWR.map((d, i) =>
        `**${medal(i)}** **${d.name}**\n᛫ ${d.wins}V / ${d.losses}D — ${d.winRate}% WR`
      );
      const cols = formatTwoColumns(wrLines, 10);
      const wr = new EmbedBuilder()
        .setTitle('⚔️ Victorias / Derrotas')
        .setColor(0xE74C3C)
        .addFields(
          { name: '\u200b', value: cols.left, inline: true },
          { name: '\u200b', value: cols.right, inline: true },
        );
      await channel.send({ embeds: [wr] });
    }

    if (byDonations.some((d) => d.donations > 0)) {
      const donLines = byDonations.map((d, i) =>
        `**${medal(i)}** **${d.name}**\n᛫ ${d.donations.toLocaleString()} 💎 donadas`
      );
      const cols = formatTwoColumns(donLines, 10);
      const don = new EmbedBuilder()
        .setTitle('💎 Donaciones de Cartas')
        .setColor(0xFF69B4)
        .addFields(
          { name: '\u200b', value: cols.left, inline: true },
          { name: '\u200b', value: cols.right, inline: true },
        );
      await channel.send({ embeds: [don] });
    }

    logger.info(`Stats ranking published to ${channel.name} (${current.length} players)`);
  } catch (err) {
    logger.error(`Error publishing stats: ${(err as Error).message}`);
  }
}

export function startStatsRanking(client: Client): void {
  // Bootstrap: save first midnight snapshot now so Day 1 starts immediately
  runMidnightSnapshot().then(() => {
    logger.info('Bootstrap: initial midnight snapshot saved');
  }).catch(err => {
    logger.error('Bootstrap snapshot failed:', (err as Error).message);
  });
  midnightTask = cron.schedule('0 0 * * *', async () => {
    logger.info('Midnight snapshot: saving baseline...');
    await runMidnightSnapshot();
  });

  statsTask = cron.schedule('0 9 * * *', async () => {
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

  logger.info('Stats ranking: midnight snapshot (00:00) + publish (09:00)');
}

export function stopStatsRanking(): void {
  if (statsTask) statsTask.stop();
  if (midnightTask) midnightTask.stop();
  logger.info('Stats ranking tasks stopped');
}
