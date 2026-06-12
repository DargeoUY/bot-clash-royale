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

function fechaHoy() { const d = new Date(); return { dia: d.getDate(), mes: d.getMonth() + 1, anio: d.getFullYear() }; }
function fechaAyer() { const d = new Date(); d.setDate(d.getDate() - 1); return { dia: d.getDate(), mes: d.getMonth() + 1, anio: d.getFullYear() }; }
function fechaToWhere(f: { dia: number; mes: number; anio: number }) { return { dia: f.dia, mes: f.mes, anio: f.anio }; }

interface PlayerStats { tag: string; name: string; wins: number; losses: number; donations: number; trophies: number; }
interface WarStats { tag: string; name: string; fame: number; decksUsed: number; }
interface DeltaStats { tag: string; name: string; wins: number; losses: number; winRate: number; donations: number; trophies: number; }

function medal(i: number): string { return i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`; }
function formatTop(lines: string[], limit: number): string { return lines.length === 0 ? 'Sin datos' : lines.slice(0, limit).join('\n'); }
function formatTwoColumns(lines: string[], limit: number): { left: string; right: string } {
  const half = Math.ceil(limit / 2);
  return { left: lines.slice(0, half).join('\n') || '—', right: lines.slice(half, limit).join('\n') || '—' };
}

let statsTask: cron.ScheduledTask | null = null;
let midnightTask: cron.ScheduledTask | null = null;
let lightTask: cron.ScheduledTask | null = null;

function todayKey(): string { return new Date().toISOString().split('T')[0]; }
function yesterdayKey(): string { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }
const nowHour = () => new Date().getHours();

async function loadMidnightSnapshot(clanTag: string, fecha: { dia: number; mes: number; anio: number }): Promise<Map<string, PlayerStats> | null> {
  const rows = await prisma.puntoGuardado.findMany({ where: { clanTag, ...fechaToWhere(fecha) } });
  if (rows.length === 0) return null;
  const players = await prisma.player.findMany({ where: { tag: { in: rows.map(r => r.playerTag) } }, select: { tag: true, name: true } });
  const nameMap = new Map(players.map(p => [p.tag, p.name]));
  const map = new Map<string, PlayerStats>();
  for (const r of rows) map.set(r.playerTag, { tag: r.playerTag, name: nameMap.get(r.playerTag) || r.playerTag, wins: r.partidasGanadas, losses: r.partidasPerdidas, donations: r.cartasDonadas, trophies: r.trofeos });
  return map;
}

async function saveMidnightSnapshot(clanTag: string, stats: PlayerStats[]): Promise<void> {
  const f = fechaHoy();
  for (const s of stats) {
    await prisma.puntoGuardado.upsert({
      where: { playerTag_dia_mes_anio: { playerTag: s.tag, dia: f.dia, mes: f.mes, anio: f.anio } },
      create: { playerTag: s.tag, dia: f.dia, mes: f.mes, anio: f.anio, clanTag, partidasGanadas: s.wins, partidasPerdidas: s.losses, cartasDonadas: s.donations, trofeos: s.trophies },
      update: { partidasGanadas: s.wins, partidasPerdidas: s.losses, cartasDonadas: s.donations, trofeos: s.trophies },
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
        try { const player = await getPlayerInfo(member.tag); stats.push({ tag: player.tag, name: player.name, wins: player.wins, losses: player.losses, donations: player.totalDonations || 0, trophies: player.trophies }); } catch { /* skip */ }
      }
      if (stats.length > 0) { await saveMidnightSnapshot(clanTag, stats); await updateRunningDeltas(clanTag, stats); }
    } catch (err) { logger.error(`Midnight snapshot failed for ${clanTag}: ${(err as Error).message}`); }
  }
}

async function run15MinUpdate(): Promise<void> {
  const clans = await getAllClanConfigs();
  for (const { clanTag } of clans) {
    try {
      const midnight = await loadMidnightSnapshot(clanTag, fechaHoy());
      if (!midnight) continue;
      const members = await getClanMembers(clanTag);
      const stats: PlayerStats[] = members.map(m => ({ tag: m.tag, name: m.name, wins: 0, losses: 0, donations: 0, trophies: m.trophies }));
      await updateRunningDeltas(clanTag, stats);
    } catch (err) { logger.debug(`15min update failed for ${clanTag}: ${(err as Error).message}`); }
  }
}

async function updateRunningDeltas(clanTag: string, stats: PlayerStats[]): Promise<void> {
  const f = fechaHoy();
  const midnight = await loadMidnightSnapshot(clanTag, f);
  if (!midnight) return;
  for (const s of stats) {
    const base = midnight.get(s.tag);
    const dt = Math.max(0, s.trophies - (base?.trophies || 0));
    const where = { playerTag_dia_mes_anio: { playerTag: s.tag, dia: f.dia, mes: f.mes, anio: f.anio } };
const existing = await prisma.deltaDiario.findUnique({ where });
     if (existing) {
       await prisma.deltaDiario.update({ where, data: { trofeos: dt } });
     } else {
       const dw = base ? Math.max(0, s.wins - base.wins) : 0;
       const dl = base ? Math.max(0, s.losses - base.losses) : 0;
       const dd = base ? Math.max(0, s.donations - base.donations) : 0;
      await prisma.deltaDiario.create({ data: { playerTag: s.tag, dia: f.dia, mes: f.mes, anio: f.anio, clanTag, partidasGanadas: dw, partidasPerdidas: dl, cartasDonadas: dd, trofeos: dt } });
    }
  }
}

async function cleanLeftPlayers(clanTag: string, activeTags: Set<string>): Promise<void> {
  const dbPlayers = await prisma.player.findMany({ where: { clanTag, status: 'active' }, select: { tag: true, name: true } });
  const now = new Date();
  for (const p of dbPlayers) {
    if (activeTags.has(p.tag)) continue;
    logger.info(`Player ${p.name} (${p.tag}) left ${clanTag}, cleaning up...`);
    await prisma.player.update({ where: { tag: p.tag }, data: { status: 'left', leftAt: now } });
    await prisma.deltaDiario.deleteMany({ where: { playerTag: p.tag } });
    const monday = getWeekStart();
    await prisma.acumuladoSemanal.deleteMany({ where: { playerTag: p.tag, inicioSemana: monday } });
  }
}

function getWeekStart(): string { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0]; }

export async function publishStatsRanking(client: Client, clanTag: string, guildId: string): Promise<void> {
  logger.info(`Stats ranking: fetching data for ${clanTag}...`);
  const members = await getClanMembers(clanTag);
  const current: PlayerStats[] = [];
  let errors = 0;
  for (const member of members) {
    try { const player = await getPlayerInfo(member.tag); current.push({ tag: player.tag, name: player.name, wins: player.wins, losses: player.losses, donations: player.totalDonations || 0, trophies: player.trophies }); } catch (err) { errors++; logger.warn(`Stats: could not fetch ${member.tag}: ${(err as Error).message}`); }
  }
  if (current.length === 0) { logger.warn(`No stats data for ${clanTag}`); return; }

  const activeTags = new Set(current.map(c => c.tag));
  await cleanLeftPlayers(clanTag, activeTags);

  const warStats: WarStats[] = [];
  try { const race = await getCurrentRiverRace(clanTag); if (race.clan?.participants) { for (const p of race.clan.participants) warStats.push({ tag: p.tag, name: p.name, fame: p.fame, decksUsed: p.decksUsed }); } } catch { /* ok */ }

  const todaySnap = await loadMidnightSnapshot(clanTag, fechaHoy());
  const yesterdaySnap = await loadMidnightSnapshot(clanTag, fechaAyer());
  const isFirstDay = !yesterdaySnap;

  for (const s of current) { try { await prisma.player.upsert({ where: { tag: s.tag }, update: { name: s.name, status: 'active', clanTag }, create: { tag: s.tag, name: s.name, clanTag, status: 'active' } }); } catch { /* skip */ } }

  const channelKey = `channel_stats_${guildId}`;
  let cfg = await prisma.botConfig.findUnique({ where: { key: channelKey } });
  if (!cfg) cfg = await prisma.botConfig.findUnique({ where: { key: `channel_ranking_${guildId}` } });
  if (!cfg) { logger.warn(`No stats/ranking channel for guild ${guildId}`); return; }

  try {
    const channel = (await client.channels.fetch(cfg.value)) as TextChannel;
    if (!channel) return;

    if (isFirstDay) {
      if (!todaySnap) { await saveMidnightSnapshot(clanTag, current); logger.info(`Bootstrap: saved first midnight snapshot for ${clanTag}`); }
      const header = new EmbedBuilder().setTitle('📊 Ranking del Clan — Día 1 (sin datos aún)').setColor(EMBED_COLOR)
        .setDescription(`**${members.length}** jugadores sincronizados.\n\n📌 Se guardó la primera foto. A las 00:00 se toma otra.\nMañana a esta hora se publica el delta del día completo (medianoche a medianoche).`)
        .setFooter({ text: `Actualizado cada 24h | Errores: ${errors}` }).setTimestamp();
      await channel.send({ embeds: [header] });
      logger.info(`First day snapshot saved for ${clanTag} (${current.length} players)`);
      return;
    }

    if (!todaySnap) { logger.warn(`No today midnight snapshot for ${clanTag}, skipping`); return; }

    const deltas: DeltaStats[] = [];
    const yesterdayLabel = `ayer (${yesterdayKey()})`;
    for (const [tag, today] of todaySnap) {
      const yesterday = yesterdaySnap.get(tag);
      if (!yesterday) continue;
      const dw = Math.max(0, today.wins - yesterday.wins); const dl = Math.max(0, today.losses - yesterday.losses); const dd = Math.max(0, today.donations - yesterday.donations); const dt = Math.max(0, today.trophies - yesterday.trophies);
      const total = dw + dl; const wr = total > 0 ? Math.round((dw / total) * 100) : 0;
      deltas.push({ tag, name: today.name, wins: dw, losses: dl, winRate: wr, donations: dd, trophies: dt });
    }

    const fAyer = fechaAyer();
    for (const d of deltas) {
      await prisma.deltaDiario.upsert({
        where: { playerTag_dia_mes_anio: { playerTag: d.tag, dia: fAyer.dia, mes: fAyer.mes, anio: fAyer.anio } },
        create: { playerTag: d.tag, dia: fAyer.dia, mes: fAyer.mes, anio: fAyer.anio, clanTag, partidasGanadas: d.wins, partidasPerdidas: d.losses, cartasDonadas: d.donations, trofeos: d.trophies },
        update: { partidasGanadas: d.wins, partidasPerdidas: d.losses, cartasDonadas: d.donations, trofeos: d.trophies },
      });
    }

    const monday = getWeekStart();
    for (const d of deltas) {
      const fame = warStats.find(w => w.tag === d.tag)?.fame || 0;
      await prisma.acumuladoSemanal.upsert({
        where: { playerTag_inicioSemana: { playerTag: d.tag, inicioSemana: monday } },
        create: { playerTag: d.tag, inicioSemana: monday, clanTag, partidasGanadas: d.wins, partidasPerdidas: d.losses, cartasDonadas: d.donations, trofeos: Math.max(0, d.trophies), fama: fame },
        update: { partidasGanadas: { increment: d.wins }, partidasPerdidas: { increment: d.losses }, cartasDonadas: { increment: d.donations }, trofeos: { increment: Math.max(0, d.trophies) }, fama: { increment: fame } },
      });
    }

    const monthlyEntries = deltas.map(d => ({ tag: d.tag, name: d.name, trophies: Math.max(0, d.trophies), fame: warStats.find(w => w.tag === d.tag)?.fame || 0 }));
    await addToMonthlyAccumulator(clanTag, monthlyEntries);

    const byTrophies = [...deltas].filter(d => d.trophies > 0).sort((a, b) => b.trophies - a.trophies);
    const byBattles = [...deltas].filter(d => d.wins + d.losses > 0).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
    const byDonations = [...deltas].filter(d => d.donations > 0).sort((a, b) => b.donations - a.donations);
    const byFame = [...warStats].filter(p => p.fame > 0).sort((a, b) => b.fame - a.fame);
    const totalDailyW = deltas.reduce((s, d) => s + d.wins, 0);
    const totalDailyL = deltas.reduce((s, d) => s + d.losses, 0);
    const totalDonations = deltas.reduce((s, d) => s + d.donations, 0);
    const totalFame = warStats.reduce((s, p) => s + p.fame, 0);

    const header = new EmbedBuilder().setTitle(`📊 Ranking Diario — ${yesterdayLabel}`).setColor(EMBED_COLOR)
      .setDescription(`**${members.length}** jugadores | ✅ ${totalDailyW}V ❌ ${totalDailyL}D | 💎 ${totalDonations.toLocaleString()} donaciones | ⚡ ${totalFame.toLocaleString()} fama`)
      .setFooter({ text: `Midnight → Midnight | Errores: ${errors}` }).setTimestamp();
    await channel.send({ embeds: [header] });

    if (byTrophies.length > 0) { const e = new EmbedBuilder().setTitle('--- Top Diario Copas ---').setColor(0xFFD700).setDescription(byTrophies.slice(0, 5).map((d, i) => { const sign = d.trophies > 0 ? '+' : ''; return `${medal(i)} **${d.name}** — ${sign}${d.trophies}`; }).join('\n') || '_Sin datos_'); await channel.send({ embeds: [e] }); }
    if (byBattles.length > 0) { const e = new EmbedBuilder().setTitle('--- Top Diario Batallas ---').setColor(0xE74C3C).setDescription(byBattles.slice(0, 5).map((d, i) => `${medal(i)} **${d.name}** — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)`).join('\n') || '_Sin datos_'); await channel.send({ embeds: [e] }); }
    if (byDonations.length > 0) { const e = new EmbedBuilder().setTitle('--- Top Diario Donaciones ---').setColor(0xFF69B4).setDescription(byDonations.slice(0, 5).map((d, i) => `${medal(i)} **${d.name}** — ${d.donations.toLocaleString()} 💎`).join('\n') || '_Sin datos_'); await channel.send({ embeds: [e] }); }
    if (byFame.length > 0) { const e = new EmbedBuilder().setTitle('--- Top Diario Guerra ---').setColor(0x9B59B6).setDescription(byFame.slice(0, 5).map((p, i) => `${medal(i)} **${p.name}** — ${p.fame.toLocaleString()} ⚡ fama`).join('\n') || '_Sin datos_'); await channel.send({ embeds: [e] }); }

    logger.info(`Stats ranking published to ${channel.name} (${current.length} players)`);
  } catch (err) { logger.error(`Error publishing stats: ${(err as Error).message}`); }
}

export async function publishWeeklyRanking(client: Client, clanTag: string, guildId: string): Promise<void> {
  const monday = getWeekStart();
  const rows = await prisma.acumuladoSemanal.findMany({ where: { clanTag, inicioSemana: monday } });
  if (rows.length === 0) return;
  const players = await prisma.player.findMany({ where: { tag: { in: rows.map(r => r.playerTag) } }, select: { tag: true, name: true } });
  const nameMap = new Map(players.map(p => [p.tag, p.name]));
  const acc = rows.map(r => ({ tag: r.playerTag, name: nameMap.get(r.playerTag) || r.playerTag, wins: r.partidasGanadas, losses: r.partidasPerdidas, donations: r.cartasDonadas, trophies: r.trofeos, fame: r.fama }));
  const members = await getClanMembers(clanTag);
  const byTrophies = [...acc].filter(e => e.trophies > 0).sort((a, b) => b.trophies - a.trophies);
  const byBattles = [...acc].filter(e => e.wins + e.losses > 0).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  const byDonations = [...acc].filter(e => e.donations > 0).sort((a, b) => b.donations - a.donations);
  const byFame = [...acc].filter(e => e.fame > 0).sort((a, b) => b.fame - a.fame);
  const totalW = acc.reduce((s, e) => s + e.wins, 0); const totalL = acc.reduce((s, e) => s + e.losses, 0);
  const totalD = acc.reduce((s, e) => s + e.donations, 0); const totalF = acc.reduce((s, e) => s + e.fame, 0);

  const channelKey = `channel_ranking_${guildId}`;
  const cfg = await prisma.botConfig.findUnique({ where: { key: channelKey } });
  if (!cfg) return;
  try {
    const channel = (await client.channels.fetch(cfg.value)) as TextChannel;
    if (!channel) return;
    const header = new EmbedBuilder().setTitle('📊 Ranking Semanal').setColor(EMBED_COLOR).setDescription(`**${members.length}** jugadores | ✅ ${totalW}V ❌ ${totalL}D | 💎 ${totalD.toLocaleString()} donaciones | ⚡ ${totalF.toLocaleString()} fama`).setFooter({ text: 'Semana completa' }).setTimestamp();
    await channel.send({ embeds: [header] });
    if (byTrophies.length > 0) { const e = new EmbedBuilder().setTitle('--- Top Semanal Copas ---').setColor(0xFFD700).setDescription(byTrophies.slice(0, 5).map((d, i) => { const sign = d.trophies > 0 ? '+' : ''; return `${medal(i)} **${d.name}** — ${sign}${d.trophies}`; }).join('\n')); await channel.send({ embeds: [e] }); }
    if (byBattles.length > 0) { const e = new EmbedBuilder().setTitle('--- Top Semanal Batallas ---').setColor(0xE74C3C).setDescription(byBattles.slice(0, 5).map((d, i) => `${medal(i)} **${d.name}** — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)`).join('\n')); await channel.send({ embeds: [e] }); }
    if (byDonations.length > 0) { const e = new EmbedBuilder().setTitle('--- Top Semanal Donaciones ---').setColor(0xFF69B4).setDescription(byDonations.slice(0, 5).map((d, i) => `${medal(i)} **${d.name}** — ${d.donations.toLocaleString()} 💎`).join('\n')); await channel.send({ embeds: [e] }); }
    if (byFame.length > 0) { const e = new EmbedBuilder().setTitle('--- Top Semanal Guerra ---').setColor(0x9B59B6).setDescription(byFame.slice(0, 5).map((p, i) => `${medal(i)} **${p.name}** — ${p.fame.toLocaleString()} ⚡ fama`).join('\n')); await channel.send({ embeds: [e] }); }
    logger.info(`Weekly ranking published for ${clanTag}`);
    await prisma.acumuladoSemanal.deleteMany({ where: { clanTag, inicioSemana: monday } });
    logger.info(`Weekly accumulator reset for ${clanTag}`);
  } catch (err) { logger.error(`Error publishing weekly ranking: ${(err as Error).message}`); }
}

export function startStatsRanking(client: Client): void {
  (async () => {
    try {
      const clans = await getAllClanConfigs();
      for (const { clanTag } of clans) {
        const f = fechaHoy();
        const existing = await prisma.puntoGuardado.findFirst({ where: { clanTag, dia: f.dia, mes: f.mes, anio: f.anio } });
        if (!existing) {
          logger.info(`Bootstrap: first run for ${clanTag}, initializing snapshot (preserving existing deltas/accumulators)`);
        } else {
          logger.info(`Bootstrap: ${clanTag} already initialized, data preserved`);
        }
      }
    } catch (err) { logger.warn('Bootstrap check failed:', (err as Error).message); }
    await runMidnightSnapshot();
    logger.info('Bootstrap: midnight snapshot saved/refreshed');
  })();

  midnightTask = cron.schedule('0 0 * * *', async () => { logger.info('Midnight snapshot: saving baseline...'); await runMidnightSnapshot(); });
  lightTask = cron.schedule('*/5 * * * *', async () => { if (nowHour() === 0) return; await run15MinUpdate(); });

  cron.schedule('0 3 1 * *', async () => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const d = cutoff.getDate(); const m = cutoff.getMonth() + 1; const a = cutoff.getFullYear();
    const cond = { OR: [{ anio: { lt: a } }, { anio: a, mes: { lt: m } }, { anio: a, mes: m, dia: { lt: d } }] };
    const r1 = await prisma.puntoGuardado.deleteMany({ where: cond });
    const r2 = await prisma.deltaDiario.deleteMany({ where: cond });
    logger.info(`Monthly cleanup: deleted ${r1.count} snapshots, ${r2.count} deltas`);
  });

  statsTask = cron.schedule('0 9 * * *', async () => {
    logger.info('Daily ranking task: starting...');
    const clans = await getAllClanConfigs(); const now = new Date(); const isMonday = now.getDay() === 1;
    for (const { clanTag, guildId } of clans) {
      try { await publishStatsRanking(client, clanTag, guildId); if (isMonday) await publishWeeklyRanking(client, clanTag, guildId); }
      catch (err) { logger.error(`Stats ranking failed for ${clanTag}: ${(err as Error).message}`); }
    }
  });
  logger.info('Stats ranking: midnight (00:00) + 5min light + daily/weekly publish (09:00)');
}

export async function publishCachedRanking(client: Client, clanTag: string, guildId: string): Promise<void> {
  const fHoy = fechaHoy();
  let rows = await prisma.deltaDiario.findMany({ where: { clanTag, dia: fHoy.dia, mes: fHoy.mes, anio: fHoy.anio } });
  const usedDate = rows.length > 0 ? todayKey() : yesterdayKey();
  if (rows.length === 0) { const fAyer = fechaAyer(); rows = await prisma.deltaDiario.findMany({ where: { clanTag, dia: fAyer.dia, mes: fAyer.mes, anio: fAyer.anio } }); }
  if (rows.length === 0) { logger.warn(`No cached deltas for ${clanTag}`); return; }
  const players = await prisma.player.findMany({ where: { tag: { in: rows.map(r => r.playerTag) } }, select: { tag: true, name: true } });
  const nameMap = new Map(players.map(p => [p.tag, p.name]));
  const deltas = rows.map(r => ({ name: nameMap.get(r.playerTag) || r.playerTag, trophies: r.trofeos, wins: r.partidasGanadas, losses: r.partidasPerdidas, donations: r.cartasDonadas }));
  const byTrophies = [...deltas].filter(d => d.trophies > 0).sort((a, b) => b.trophies - a.trophies);
  const byBattles = [...deltas].filter(d => d.wins + d.losses > 0).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  const byDonations = [...deltas].filter(d => d.donations > 0).sort((a, b) => b.donations - a.donations);
  const totalW = deltas.reduce((s, d) => s + d.wins, 0); const totalL = deltas.reduce((s, d) => s + d.losses, 0); const totalD = deltas.reduce((s, d) => s + d.donations, 0);
  const channelKey = `channel_ranking_${guildId}`; const cfg = await prisma.botConfig.findUnique({ where: { key: channelKey } }); if (!cfg) return;
  try {
    const channel = (await client.channels.fetch(cfg.value)) as TextChannel; if (!channel) return;
    const header = new EmbedBuilder().setTitle(`📊 Ranking Diario${usedDate !== todayKey() ? ' (ayer)' : ''}`).setColor(EMBED_COLOR).setDescription(`${deltas.length} jugadores | ✅ ${totalW}V ❌ ${totalL}D | 💎 ${totalD.toLocaleString()} donaciones`).setFooter({ text: 'Los contadores arrancan de 0 y se acumulan durante el día.' }).setTimestamp();
    await channel.send({ embeds: [header] });
    await channel.send({ embeds: [new EmbedBuilder().setTitle('--- Top Diario Copas ---').setColor(0xFFD700).setDescription(byTrophies.length > 0 ? byTrophies.slice(0, 5).map((d, i) => `${medal(i)} **${d.name}** — +${d.trophies}`).join('\n') : '_Sin datos todavía. Las diferencias de copas se calculan a medianoche._')] });
    await channel.send({ embeds: [new EmbedBuilder().setTitle('--- Top Diario Batallas ---').setColor(0xE74C3C).setDescription(byBattles.length > 0 ? byBattles.slice(0, 5).map((d, i) => `${medal(i)} **${d.name}** — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)`).join('\n') : '_Sin datos todavía. Las batallas se contabilizan desde la medianoche._')] });
    await channel.send({ embeds: [new EmbedBuilder().setTitle('--- Top Diario Donaciones ---').setColor(0xFF69B4).setDescription(byDonations.length > 0 ? byDonations.slice(0, 5).map((d, i) => `${medal(i)} **${d.name}** — ${d.donations.toLocaleString()} 💎`).join('\n') : '_Sin datos todavía. Las donaciones se contabilizan desde la medianoche._')] });
    let guerraDesc = '_Sin datos todavía. La guerra se actualiza en tiempo real._';
    try { const race = await getCurrentRiverRace(clanTag); if (race.clan?.participants?.length) { const byFame = [...race.clan.participants].sort((a, b) => b.fame - a.fame).slice(0, 5).filter(p => p.fame > 0); if (byFame.length > 0) guerraDesc = byFame.map((p, i) => `${medal(i)} **${p.name}** — ${p.fame.toLocaleString()} ⚡ fama`).join('\n'); } } catch { /* ok */ }
    await channel.send({ embeds: [new EmbedBuilder().setTitle('--- Top Diario Guerra ---').setColor(0x9B59B6).setDescription(guerraDesc)] });
    logger.info(`Cached ranking published for ${clanTag} (${deltas.length} players)`);
  } catch (err) { logger.error(`Error publishing cached ranking: ${(err as Error).message}`); }
}

export async function buildAdminRankingEmbeds(clanTag: string): Promise<EmbedBuilder[]> {
  const fHoy = fechaHoy(); let rows = await prisma.deltaDiario.findMany({ where: { clanTag, dia: fHoy.dia, mes: fHoy.mes, anio: fHoy.anio } });
  if (rows.length === 0) { const fAyer = fechaAyer(); rows = await prisma.deltaDiario.findMany({ where: { clanTag, dia: fAyer.dia, mes: fAyer.mes, anio: fAyer.anio } }); }
  if (rows.length === 0) return [];
  const players = await prisma.player.findMany({ where: { tag: { in: rows.map(r => r.playerTag) } }, select: { tag: true, name: true } });
  const nameMap = new Map(players.map(p => [p.tag, p.name]));
  const deltas = rows.map(r => ({ name: nameMap.get(r.playerTag) || r.playerTag, trophies: r.trofeos, wins: r.partidasGanadas, losses: r.partidasPerdidas, donations: r.cartasDonadas }));
  const embeds: EmbedBuilder[] = [];
  const totalW = deltas.reduce((s, d) => s + d.wins, 0); const totalL = deltas.reduce((s, d) => s + d.losses, 0); const totalD = deltas.reduce((s, d) => s + d.donations, 0);
  embeds.push(new EmbedBuilder().setTitle('📊 Ranking Completo (admin)').setColor(EMBED_COLOR).setDescription(`**${deltas.length}** jugadores | ✅ ${totalW}V ❌ ${totalL}D | 💎 ${totalD.toLocaleString()} donaciones`).setTimestamp());
  const byTrophies = [...deltas].sort((a, b) => b.trophies - a.trophies);
  if (byTrophies.length > 0) { const t = byTrophies.map((d, i) => { const s = d.trophies > 0 ? '+' : ''; return `${medal(i)} **${d.name}** — ${s}${d.trophies}`; }).join('\n'); for (let i = 0; i < t.length; i += 1024) embeds.push(new EmbedBuilder().setTitle('--- Copas (todos) ---').setColor(0xFFD700).setDescription(t.slice(i, i + 1024))); }
  const byBattles = [...deltas].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  if (byBattles.length > 0) { const t = byBattles.map((d, i) => `${medal(i)} **${d.name}** — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)`).join('\n'); for (let i = 0; i < t.length; i += 1024) embeds.push(new EmbedBuilder().setTitle('--- Batallas (todos) ---').setColor(0xE74C3C).setDescription(t.slice(i, i + 1024))); }
  const byDonations = [...deltas].sort((a, b) => b.donations - a.donations);
  if (byDonations.length > 0) { const t = byDonations.map((d, i) => `${medal(i)} **${d.name}** — ${d.donations.toLocaleString()} 💎`).join('\n'); for (let i = 0; i < t.length; i += 1024) embeds.push(new EmbedBuilder().setTitle('--- Donaciones (todos) ---').setColor(0xFF69B4).setDescription(t.slice(i, i + 1024))); }
  try { const race = await getCurrentRiverRace(clanTag); if (race.clan?.participants?.length) { const byFame = [...race.clan.participants].sort((a, b) => b.fame - a.fame); const t = byFame.map((p, i) => `${medal(i)} **${p.name}** — ${p.fame.toLocaleString()} ⚡ fama`).join('\n'); for (let i = 0; i < t.length; i += 1024) embeds.push(new EmbedBuilder().setTitle('--- Guerra (todos) ---').setColor(0x9B59B6).setDescription(t.slice(i, i + 1024))); } } catch { /* ok */ }
  return embeds;
}

export function stopStatsRanking(): void {
  if (statsTask) statsTask.stop(); if (midnightTask) midnightTask.stop(); if (lightTask) lightTask.stop();
  logger.info('Stats ranking tasks stopped');
}