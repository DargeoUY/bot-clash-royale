import cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import prisma from '../database/prisma';
import { getClanMembers } from '../api/clan';
import { getPlayerInfo } from '../api/player';
import { getCurrentRiverRace } from '../api/clan';
import { getAllClanConfigs } from '../utils/guild';
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
let lightTask: cron.ScheduledTask | null = null;

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

const nowHour = () => new Date().getHours();

async function loadMidnightSnapshot(clanTag: string, dateStr: string): Promise<Map<string, PlayerStats> | null> {
  const rows = await prisma.statsSnapshot.findMany({
    where: { clanTag, date: dateStr },
  });
  if (rows.length === 0) return null;
  const map = new Map<string, PlayerStats>();
  for (const r of rows) {
    map.set(r.playerTag, { tag: r.playerTag, name: '', wins: r.wins, losses: r.losses, donations: r.donations, trophies: r.trophies });
  }
  return map;
}

async function saveMidnightSnapshot(clanTag: string, stats: PlayerStats[]): Promise<void> {
  const date = todayKey();
  for (const s of stats) {
    await prisma.statsSnapshot.upsert({
      where: { playerTag_date: { playerTag: s.tag, date } },
      create: { playerTag: s.tag, date, clanTag, wins: s.wins, losses: s.losses, donations: s.donations, trophies: s.trophies },
      update: { wins: s.wins, losses: s.losses, donations: s.donations, trophies: s.trophies },
    });
  }
  logger.info(`Midnight snapshot saved for ${clanTag} (${stats.length} players to DB)`);
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
        // Also update daily_deltas from midnight
        await updateRunningDeltas(clanTag, stats);
      }
    } catch (err) {
      logger.error(`Midnight snapshot failed for ${clanTag}: ${(err as Error).message}`);
    }
  }
}

// Lightweight: only copas from member list → updates daily_deltas every 15 min
async function run15MinUpdate(): Promise<void> {
  const clans = await getAllClanConfigs();
  for (const { clanTag } of clans) {
    try {
      const midnight = await loadMidnightSnapshot(clanTag, todayKey());
      if (!midnight) continue;

      const members = await getClanMembers(clanTag);
      const stats: PlayerStats[] = members.map(m => ({
        tag: m.tag,
        name: m.name,
        wins: 0, losses: 0, donations: 0,
        trophies: m.trophies,
      }));

      await updateRunningDeltas(clanTag, stats);
    } catch (err) {
      logger.debug(`15min update failed for ${clanTag}: ${(err as Error).message}`);
    }
  }
}

async function updateRunningDeltas(clanTag: string, stats: PlayerStats[]): Promise<void> {
  const midnight = await loadMidnightSnapshot(clanTag, todayKey());
  if (!midnight) return;

  const date = todayKey();
  for (const s of stats) {
    const base = midnight.get(s.tag);
    const dw = base ? Math.max(0, s.wins - base.wins) : 0;
    const dl = base ? Math.max(0, s.losses - base.losses) : 0;
    const dd = base ? Math.max(0, s.donations - base.donations) : 0;
    const dt = Math.max(0, s.trophies - (base?.trophies || 0));

    await prisma.dailyDelta.upsert({
      where: { playerTag_date: { playerTag: s.tag, date } },
      create: { playerTag: s.tag, date, clanTag, wins: dw, losses: dl, donations: dd, trophies: dt },
      update: { wins: dw, losses: dl, donations: dd, trophies: dt },
    });
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

    await prisma.dailyDelta.deleteMany({ where: { playerTag: p.tag } });
    const monday = getWeekStart();
    await prisma.weeklyAcc.deleteMany({ where: { playerTag: p.tag, weekStart: monday } });
  }
}

function getWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1); // Monday
  return d.toISOString().split('T')[0];
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

    // Save daily deltas to DB
    const yesterdayDate = yesterdayKey();
    for (const d of deltas) {
      await prisma.dailyDelta.upsert({
        where: { playerTag_date: { playerTag: d.tag, date: yesterdayDate } },
        create: { playerTag: d.tag, date: yesterdayDate, clanTag, wins: d.wins, losses: d.losses, donations: d.donations, trophies: d.trophies },
        update: { wins: d.wins, losses: d.losses, donations: d.donations, trophies: d.trophies },
      });
    }

    // Add to weekly accumulator
    const monday = getWeekStart();
    for (const d of deltas) {
      const fame = warStats.find(w => w.tag === d.tag)?.fame || 0;
      await prisma.weeklyAcc.upsert({
        where: { playerTag_weekStart: { playerTag: d.tag, weekStart: monday } },
        create: { playerTag: d.tag, weekStart: monday, clanTag, wins: d.wins, losses: d.losses, donations: d.donations, trophies: Math.max(0, d.trophies), fame },
        update: {
          wins: { increment: d.wins },
          losses: { increment: d.losses },
          donations: { increment: d.donations },
          trophies: { increment: Math.max(0, d.trophies) },
          fame: { increment: fame },
        },
      });
    }

    // Add to monthly accumulator
    const monthlyEntries = deltas.map((d) => ({
      tag: d.tag,
      name: d.name,
      trophies: Math.max(0, d.trophies),
      fame: warStats.find((w) => w.tag === d.tag)?.fame || 0,
    }));
    await addToMonthlyAccumulator(clanTag, monthlyEntries);

    // Rankings
    const byTrophies = [...deltas]
      .filter(d => d.trophies > 0)
      .sort((a, b) => b.trophies - a.trophies);
    const byBattles = [...deltas]
      .filter(d => d.wins + d.losses > 0)
      .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
    const byDonations = [...deltas]
      .filter(d => d.donations > 0)
      .sort((a, b) => b.donations - a.donations);
    const byFame = [...warStats]
      .filter(p => p.fame > 0)
      .sort((a, b) => b.fame - a.fame);

    const totalDailyW = deltas.reduce((s, d) => s + d.wins, 0);
    const totalDailyL = deltas.reduce((s, d) => s + d.losses, 0);
    const totalDonations = deltas.reduce((s, d) => s + d.donations, 0);
    const totalFame = warStats.reduce((s, p) => s + p.fame, 0);

    function formatList(items: { name: string }[], fmt: (item: unknown, i: number) => string, limit = 5): string {
      if (items.length === 0) return '_Sin datos_';
      return items.slice(0, limit).map((item, i) => fmt(item, i)).join('\n');
    }

    // ── Header ──
    const header = new EmbedBuilder()
      .setTitle(`📊 Ranking Diario — ${yesterdayLabel}`)
      .setColor(EMBED_COLOR)
      .setDescription(`**${members.length}** jugadores | ✅ ${totalDailyW}V ❌ ${totalDailyL}D | 💎 ${totalDonations.toLocaleString()} donaciones | ⚡ ${totalFame.toLocaleString()} fama`)
      .setFooter({ text: `Midnight → Midnight | Errores: ${errors}` })
      .setTimestamp();
    await channel.send({ embeds: [header] });

    // ── Copas ──
    if (byTrophies.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle('--- Top Diario Copas ---')
        .setColor(0xFFD700)
        .setDescription(byTrophies.slice(0, 5).map((d, i) => {
          const sign = d.trophies > 0 ? '+' : '';
          return `${medal(i)} **${d.name}** — ${sign}${d.trophies}`;
        }).join('\n') || '_Sin datos_');
      await channel.send({ embeds: [embed] });
    }

    // ── Batallas ──
    if (byBattles.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle('--- Top Diario Batallas ---')
        .setColor(0xE74C3C)
        .setDescription(byBattles.slice(0, 5).map((d, i) =>
          `${medal(i)} **${d.name}** — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)`
        ).join('\n') || '_Sin datos_');
      await channel.send({ embeds: [embed] });
    }

    // ── Donaciones ──
    if (byDonations.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle('--- Top Diario Donaciones ---')
        .setColor(0xFF69B4)
        .setDescription(byDonations.slice(0, 5).map((d, i) =>
          `${medal(i)} **${d.name}** — ${d.donations.toLocaleString()} 💎`
        ).join('\n') || '_Sin datos_');
      await channel.send({ embeds: [embed] });
    }

    // ── Guerra ──
    if (byFame.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle('--- Top Diario Guerra ---')
        .setColor(0x9B59B6)
        .setDescription(byFame.slice(0, 5).map((p, i) =>
          `${medal(i)} **${p.name}** — ${p.fame.toLocaleString()} ⚡ fama`
        ).join('\n') || '_Sin datos_');
      await channel.send({ embeds: [embed] });
    }

    logger.info(`Stats ranking published to ${channel.name} (${current.length} players)`);
  } catch (err) {
    logger.error(`Error publishing stats: ${(err as Error).message}`);
  }
}

export async function publishWeeklyRanking(
  client: Client,
  clanTag: string,
  guildId: string,
): Promise<void> {
  const monday = getWeekStart();
  const rows = await prisma.weeklyAcc.findMany({
    where: { clanTag, weekStart: monday },
  });
  if (rows.length === 0) return;

  const players = await prisma.player.findMany({
    where: { tag: { in: rows.map(r => r.playerTag) } },
    select: { tag: true, name: true },
  });
  const nameMap = new Map(players.map(p => [p.tag, p.name]));

  const acc = rows.map(r => ({
    tag: r.playerTag,
    name: nameMap.get(r.playerTag) || r.playerTag,
    wins: r.wins,
    losses: r.losses,
    donations: r.donations,
    trophies: r.trophies,
    fame: r.fame,
  }));

  const members = await getClanMembers(clanTag);

  const byTrophies = [...acc]
    .filter(e => e.trophies !== 0)
    .sort((a, b) => b.trophies - a.trophies);
  const byBattles = [...acc]
    .filter(e => e.wins + e.losses > 0)
    .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  const byDonations = [...acc]
    .filter(e => e.donations > 0)
    .sort((a, b) => b.donations - a.donations);
  const byFame = [...acc]
    .filter(e => e.fame > 0)
    .sort((a, b) => b.fame - a.fame);

  function fmtList(items: { name: string }[], fmt: (item: unknown, i: number) => string, limit = 5): string {
    if (items.length === 0) return '_Sin datos_';
    return items.slice(0, limit).map((item, i) => fmt(item, i)).join('\n');
  }

  const totalW = acc.reduce((s, e) => s + e.wins, 0);
  const totalL = acc.reduce((s, e) => s + e.losses, 0);
  const totalD = acc.reduce((s, e) => s + e.donations, 0);
  const totalF = acc.reduce((s, e) => s + e.fame, 0);

  const channelKey = `channel_ranking_${guildId}`;
  const cfg = await prisma.botConfig.findUnique({ where: { key: channelKey } });
  if (!cfg) return;

  try {
    const channel = (await client.channels.fetch(cfg.value)) as TextChannel;
    if (!channel) return;

    // ── Header ──
    const header = new EmbedBuilder()
      .setTitle('📊 Ranking Semanal')
      .setColor(EMBED_COLOR)
      .setDescription(`**${members.length}** jugadores | ✅ ${totalW}V ❌ ${totalL}D | 💎 ${totalD.toLocaleString()} donaciones | ⚡ ${totalF.toLocaleString()} fama`)
      .setFooter({ text: 'Semana completa' })
      .setTimestamp();
    await channel.send({ embeds: [header] });

    // ── Copas ──
    if (byTrophies.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle('--- Top Semanal Copas ---')
        .setColor(0xFFD700)
        .setDescription(byTrophies.slice(0, 5).map((d, i) => {
          const sign = d.trophies > 0 ? '+' : '';
          return `${medal(i)} **${d.name}** — ${sign}${d.trophies}`;
        }).join('\n'));
      await channel.send({ embeds: [embed] });
    }

    // ── Batallas ──
    if (byBattles.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle('--- Top Semanal Batallas ---')
        .setColor(0xE74C3C)
        .setDescription(byBattles.slice(0, 5).map((d, i) =>
          `${medal(i)} **${d.name}** — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)`
        ).join('\n'));
      await channel.send({ embeds: [embed] });
    }

    // ── Donaciones ──
    if (byDonations.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle('--- Top Semanal Donaciones ---')
        .setColor(0xFF69B4)
        .setDescription(byDonations.slice(0, 5).map((d, i) =>
          `${medal(i)} **${d.name}** — ${d.donations.toLocaleString()} 💎`
        ).join('\n'));
      await channel.send({ embeds: [embed] });
    }

    // ── Guerra ──
    if (byFame.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle('--- Top Semanal Guerra ---')
        .setColor(0x9B59B6)
        .setDescription(byFame.slice(0, 5).map((p, i) =>
          `${medal(i)} **${p.name}** — ${p.fame.toLocaleString()} ⚡ fama`
        ).join('\n'));
      await channel.send({ embeds: [embed] });
    }

    logger.info(`Weekly ranking published for ${clanTag}`);

    // Reset weekly accumulator after publishing
    await prisma.weeklyAcc.deleteMany({ where: { clanTag, weekStart: monday } });
    logger.info(`Weekly accumulator reset for ${clanTag}`);
  } catch (err) {
    logger.error(`Error publishing weekly ranking: ${(err as Error).message}`);
  }
}
export function startStatsRanking(client: Client): void {
  // Bootstrap: init if first time, otherwise preserve data
  (async () => {
    try {
      const clans = await getAllClanConfigs();
      for (const { clanTag } of clans) {
        const existing = await prisma.statsSnapshot.findFirst({
          where: { clanTag, date: todayKey() },
        });
        if (!existing) {
          // First time: clean old data
          await prisma.dailyDelta.deleteMany({ where: { clanTag } });
          await prisma.weeklyAcc.deleteMany({ where: { clanTag } });
          logger.info(`Bootstrap: first run for ${clanTag}, counters reset to 0`);
        } else {
          logger.info(`Bootstrap: ${clanTag} already initialized, data preserved`);
        }
      }
    } catch (err) {
      logger.warn('Bootstrap check failed:', (err as Error).message);
    }
    await runMidnightSnapshot();
    logger.info('Bootstrap: midnight snapshot saved/refreshed');
  })();

  // Midnight: full player data snapshot (baseline of the day)
  midnightTask = cron.schedule('0 0 * * *', async () => {
    logger.info('Midnight snapshot: saving baseline...');
    await runMidnightSnapshot();
  });

  // Every 15 min: lightweight copas update
  lightTask = cron.schedule('*/15 * * * *', async () => {
    if (nowHour() === 0) return;
    await run15MinUpdate();
  });

  // Monthly cleanup: remove data older than 30 days
  cron.schedule('0 3 1 * *', async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const result1 = await prisma.statsSnapshot.deleteMany({ where: { date: { lt: cutoffStr } } });
    const result2 = await prisma.dailyDelta.deleteMany({ where: { date: { lt: cutoffStr } } });
    logger.info(`Monthly cleanup: deleted ${result1.count} snapshots, ${result2.count} deltas older than ${cutoffStr}`);
  });

  // 9 AM daily: publish yesterday's complete ranking
  statsTask = cron.schedule('0 9 * * *', async () => {
    logger.info('Daily ranking task: starting...');
    const clans = await getAllClanConfigs();
    const now = new Date();
    const isMonday = now.getDay() === 1;

    for (const { clanTag, guildId } of clans) {
      try {
        await publishStatsRanking(client, clanTag, guildId);
        if (isMonday) {
          await publishWeeklyRanking(client, clanTag, guildId);
        }
      } catch (err) {
        logger.error(`Stats ranking failed for ${clanTag}: ${(err as Error).message}`);
      }
    }
  });

  logger.info('Stats ranking: midnight (00:00) + 15min light + daily/weekly publish (09:00)');
}

// Cached version: reads from DB only, 0 API calls. Used by /ranking stats.
export async function publishCachedRanking(
  client: Client,
  clanTag: string,
  guildId: string,
): Promise<void> {
  const today = todayKey();
  const rows = await prisma.dailyDelta.findMany({
    where: { clanTag, date: today },
  });
  if (rows.length === 0) {
    logger.warn(`No cached deltas for ${clanTag}`);
    return;
  }

  // Also get names from player table
  const players = await prisma.player.findMany({
    where: { tag: { in: rows.map(r => r.playerTag) } },
    select: { tag: true, name: true },
  });
  const nameMap = new Map(players.map(p => [p.tag, p.name]));

  const deltas = rows.map(r => ({
    name: nameMap.get(r.playerTag) || r.playerTag,
    trophies: r.trophies,
    wins: r.wins,
    losses: r.losses,
    donations: r.donations,
  }));

  const byTrophies = [...deltas].filter(d => d.trophies > 0).sort((a, b) => b.trophies - a.trophies);
  const byBattles = [...deltas].filter(d => d.wins + d.losses > 0).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  const byDonations = [...deltas].filter(d => d.donations > 0).sort((a, b) => b.donations - a.donations);

  const totalW = deltas.reduce((s, d) => s + d.wins, 0);
  const totalL = deltas.reduce((s, d) => s + d.losses, 0);
  const totalD = deltas.reduce((s, d) => s + d.donations, 0);

  const channelKey = `channel_ranking_${guildId}`;
  const cfg = await prisma.botConfig.findUnique({ where: { key: channelKey } });
  if (!cfg) return;

  try {
    const channel = (await client.channels.fetch(cfg.value)) as TextChannel;
    if (!channel) return;

    const header = new EmbedBuilder()
      .setTitle('📊 Ranking Diario (desde caché)')
      .setColor(EMBED_COLOR)
      .setDescription(`${deltas.length} jugadores | ✅ ${totalW}V ❌ ${totalL}D | 💎 ${totalD.toLocaleString()} donaciones`)
      .setTimestamp();
    await channel.send({ embeds: [header] });

    if (byTrophies.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle('--- Top Diario Copas ---')
        .setColor(0xFFD700)
        .setDescription(byTrophies.slice(0, 5).map((d, i) => `${medal(i)} **${d.name}** — +${d.trophies}`).join('\n'));
      await channel.send({ embeds: [embed] });
    }

    if (byBattles.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle('--- Top Diario Batallas ---')
        .setColor(0xE74C3C)
        .setDescription(byBattles.slice(0, 5).map((d, i) => `${medal(i)} **${d.name}** — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)`).join('\n'));
      await channel.send({ embeds: [embed] });
    }

    if (byDonations.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle('--- Top Diario Donaciones ---')
        .setColor(0xFF69B4)
        .setDescription(byDonations.slice(0, 5).map((d, i) => `${medal(i)} **${d.name}** — ${d.donations.toLocaleString()} 💎`).join('\n'));
      await channel.send({ embeds: [embed] });
    }

    logger.info(`Cached ranking published for ${clanTag} (${deltas.length} players, 0 API calls)`);
  } catch (err) {
    logger.error(`Error publishing cached ranking: ${(err as Error).message}`);
  }
}

// Returns embeds with ALL players from DB (for admin private view)
export async function buildAdminRankingEmbeds(clanTag: string): Promise<EmbedBuilder[]> {
  const today = todayKey();
  const rows = await prisma.dailyDelta.findMany({
    where: { clanTag, date: today },
  });
  if (rows.length === 0) return [];

  const players = await prisma.player.findMany({
    where: { tag: { in: rows.map(r => r.playerTag) } },
    select: { tag: true, name: true },
  });
  const nameMap = new Map(players.map(p => [p.tag, p.name]));

  const deltas = rows.map(r => ({
    name: nameMap.get(r.playerTag) || r.playerTag,
    trophies: r.trophies,
    wins: r.wins,
    losses: r.losses,
    donations: r.donations,
  }));

  const embeds: EmbedBuilder[] = [];
  const totalW = deltas.reduce((s, d) => s + d.wins, 0);
  const totalL = deltas.reduce((s, d) => s + d.losses, 0);
  const totalD = deltas.reduce((s, d) => s + d.donations, 0);

  const header = new EmbedBuilder()
    .setTitle('📊 Ranking Completo (admin)')
    .setColor(EMBED_COLOR)
    .setDescription(`**${deltas.length}** jugadores | ✅ ${totalW}V ❌ ${totalL}D | 💎 ${totalD.toLocaleString()} donaciones`)
    .setTimestamp();
  embeds.push(header);

  const byTrophies = [...deltas].sort((a, b) => b.trophies - a.trophies);
  if (byTrophies.length > 0) {
    const trophiesDesc = byTrophies.map((d, i) => {
      const sign = d.trophies > 0 ? '+' : '';
      return `${medal(i)} **${d.name}** — ${sign}${d.trophies}`;
    }).join('\n');
    for (let i = 0; i < trophiesDesc.length; i += 1024) {
      embeds.push(new EmbedBuilder().setTitle('--- Copas (todos) ---').setColor(0xFFD700).setDescription(trophiesDesc.slice(i, i + 1024)));
    }
  }

  const byBattles = [...deltas].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  if (byBattles.length > 0) {
    const battlesDesc = byBattles.map((d, i) => `${medal(i)} **${d.name}** — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)`).join('\n');
    for (let i = 0; i < battlesDesc.length; i += 1024) {
      embeds.push(new EmbedBuilder().setTitle('--- Batallas (todos) ---').setColor(0xE74C3C).setDescription(battlesDesc.slice(i, i + 1024)));
    }
  }

  const byDonations = [...deltas].sort((a, b) => b.donations - a.donations);
  if (byDonations.length > 0) {
    const donDesc = byDonations.map((d, i) => `${medal(i)} **${d.name}** — ${d.donations.toLocaleString()} 💎`).join('\n');
    for (let i = 0; i < donDesc.length; i += 1024) {
      embeds.push(new EmbedBuilder().setTitle('--- Donaciones (todos) ---').setColor(0xFF69B4).setDescription(donDesc.slice(i, i + 1024)));
    }
  }

  return embeds;
}

export function stopStatsRanking(): void {
  if (statsTask) statsTask.stop();
  if (midnightTask) midnightTask.stop();
  if (lightTask) lightTask.stop();
  logger.info('Stats ranking tasks stopped');
}
