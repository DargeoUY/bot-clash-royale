import { getPlayerInfo } from '../api/player';
import { getClanInfo, getCurrentRiverRace } from '../api/clan';
import prisma from '../database/prisma';
import logger from '../config/logger';

function fechaHoy() { const d = new Date(); return { dia: d.getDate(), mes: d.getMonth()+1, anio: d.getFullYear() }; }
function fechaAyer() { const d = new Date(); d.setDate(d.getDate()-1); return { dia: d.getDate(), mes: d.getMonth()+1, anio: d.getFullYear() }; }
function todayKey(): string { return new Date().toISOString().split('T')[0]; }
function yesterdayKey(): string { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }
function getMonday(): string { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0]; }

const cooldowns = new Map<number, number>();
const COOLDOWN_MS = 10_000;

async function loadDeltasWithNames(clanTag: string): Promise<{ tag: string; name: string; wins: number; losses: number; donations: number; trophies: number }[]> {
  const f = fechaHoy();
  let rows = await prisma.deltaDiario.findMany({ where: { clanTag, dia: f.dia, mes: f.mes, anio: f.anio } });
  if (rows.length === 0) { const fy = fechaAyer(); rows = await prisma.deltaDiario.findMany({ where: { clanTag, dia: fy.dia, mes: fy.mes, anio: fy.anio } }); }
  if (rows.length === 0) return [];
  const players = await prisma.player.findMany({ where: { tag: { in: rows.map(r => r.playerTag) } }, select: { tag: true, name: true } });
  const nameMap = new Map(players.map(p => [p.tag, p.name]));
  return rows.map(r => ({ tag: r.playerTag, name: nameMap.get(r.playerTag) || r.playerTag, wins: r.partidasGanadas, losses: r.partidasPerdidas, donations: r.cartasDonadas, trophies: r.trofeos }));
}

async function loadWeeklyWithNames(clanTag: string): Promise<{ tag: string; name: string; wins: number; losses: number; donations: number; trophies: number; fame: number }[]> {
  const monday = getMonday();
  const rows = await prisma.acumuladoSemanal.findMany({ where: { clanTag, inicioSemana: monday } });
  if (rows.length === 0) return [];
  const players = await prisma.player.findMany({ where: { tag: { in: rows.map(r => r.playerTag) } }, select: { tag: true, name: true } });
  const nameMap = new Map(players.map(p => [p.tag, p.name]));
  return rows.map(r => ({ tag: r.playerTag, name: nameMap.get(r.playerTag) || r.playerTag, wins: r.partidasGanadas, losses: r.partidasPerdidas, donations: r.cartasDonadas, trophies: r.trofeos, fame: r.fama }));
}

function checkCooldown(userId: number): boolean { const last = cooldowns.get(userId); if (last && Date.now() - last < COOLDOWN_MS) return false; cooldowns.set(userId, Date.now()); return true; }
function cleanTag(tag: string): string { return tag.startsWith('#') ? tag : `#${tag}`; }
function medal(i: number): string { return i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`; }

async function requireRegistration(userId: number): Promise<TgReply | null> {
  const player = await prisma.player.findFirst({ where: { telegramId: String(userId) } });
  if (!player) return { text: '⚠️ No tenés una cuenta vinculada.\nUsá /registrar #TAG primero.', guideImages: GUIA_IMGS };
  return null;
}

async function getClanForChat(chatId: number): Promise<string> {
  const cfg = await prisma.botConfig.findUnique({ where: { key: `telegram_group_clan_${chatId}` } });
  if (cfg) return cfg.value;
  const clanCfg = await prisma.botConfig.findFirst({ where: { key: { startsWith: 'clan_tag_' } } });
  return clanCfg?.value || '#28P8RQUY';
}

const GUIA_IMGS = ['https://i.ibb.co/BK6ywDCG/Screenshot-2026-06-11-14-33-07-149-com-supercell-clashroyale-edit.jpg','https://i.ibb.co/S49jmzPf/Screenshot-2026-06-11-14-34-55-569-com-supercell-clashroyale-edit.jpg'];

export interface TgReply { text: string; privateText?: string; extraMessages?: string[]; guideImages?: string[]; }

export async function handleTelegramCommand(chatId: number, userId: number, text: string, isGroup: boolean): Promise<TgReply | null> {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === '/start' || cmd === '/help') {
    let msg = '<b>Comandos disponibles</b>\n\n';
    msg += '/registrar #TAG — Vincula tu cuenta de Clash Royale\n';
    msg += '/perfil — Ver tu perfil (requiere /registrar)\n';
    msg += '/ranking — Ranking diario y semanal\n';
    msg += '/rankingn — Ranking completo (solo líderes)\n';
    msg += '/clan — Info del clan\n';
    msg += '/help — Este mensaje';
    return { text: msg };
  }

  if (cmd === '/registrar') {
    if (!checkCooldown(userId)) return { text: '⏳ Esperá unos segundos antes de usar otro comando.' };
    if (parts.length < 2) return { text: 'Uso: /registrar #TAG\nEjemplo: <code>/registrar #P9Y8R2G</code>', guideImages: GUIA_IMGS };
    const tag = cleanTag(parts[1]);
    try {
      const player = await getPlayerInfo(tag);
      if (!player) return { text: '❌ Jugador no encontrado. Verificá el tag.', guideImages: GUIA_IMGS };
      const clanTag = await getClanForChat(chatId);
      const expectedClan = cleanTag(clanTag);
      if (player.clan?.tag !== expectedClan) return { text: `❌ ${player.name} no está en UruguayConQueso. Está en ${player.clan?.name || 'ningún clan'}.`, guideImages: GUIA_IMGS };
      const existing = await prisma.player.findFirst({ where: { telegramId: String(userId), tag: { not: tag } } });
      if (existing) return { text: `⚠️ Ya tenés vinculada la cuenta ${existing.name} (${existing.tag}).\nUsá /perfil para verla.` };
      await prisma.player.upsert({
        where: { tag },
        update: { name: player.name, telegramId: String(userId), clanTag: expectedClan },
        create: { tag, name: player.name, role: player.role, expLevel: player.expLevel, trophies: player.trophies, clanTag: expectedClan, telegramId: String(userId), status: 'active' },
      });
      logger.info(`Telegram user ${userId} linked to ${player.name} (${tag})`);
      const privateMsg = `✅ ¡Vinculado! Bienvenido <b>${player.name}</b> (${player.tag}).\n\nRol: ${player.role || 'Miembro'}\nNivel: ${player.expLevel || '?'}\nCopas: ${player.trophies || '?'}\nArena: ${player.arena?.name || '?'}\n\nAhora podés usar /perfil, /ranking y /clan.`;
      if (isGroup) return { text: `✅ ${player.name} vinculado correctamente.`, privateText: privateMsg };
      return { text: privateMsg };
    } catch (err) { logger.error(`Telegram register error: ${(err as Error).message}`); return { text: '❌ Error al verificar el jugador. Intentá de nuevo.' }; }
  }

  if (cmd === '/perfil') {
    if (!checkCooldown(userId)) return { text: '⏳ Esperá unos segundos antes de usar otro comando.' };
    const err = await requireRegistration(userId); if (err) return err;
    const player = await prisma.player.findFirst({ where: { telegramId: String(userId) } });
    let msg = `<b>${player!.name}</b> (${player!.tag})\n`;
    if (player!.role) msg += `Rol: ${player!.role}\n`;
    msg += `Nivel: ${player!.expLevel ?? '?'}\nCopas: ${player!.trophies ?? '?'}\n`;
    if (player!.lastActiveAt) { const days = Math.floor((Date.now() - player!.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24)); msg += `Última actividad: hace ${days} días\n`; }
    return { text: msg };
  }

  if (cmd === '/ranking') {
    if (!checkCooldown(userId)) return { text: '⏳ Esperá unos segundos antes de usar otro comando.' };
    const err = await requireRegistration(userId); if (err) return err;
    const clanTag = await getClanForChat(chatId);
    const extra: string[] = [];
    let header = '<b>📊 Ranking del Clan</b>';

    try {
      const deltas = await loadDeltasWithNames(clanTag);
      const byTrophies = [...deltas].filter(d => d.trophies > 0).sort((a, b) => b.trophies - a.trophies).slice(0, 5);
      let m = '<b>--- Top Diario Copas ---</b>\n';
      if (byTrophies.length > 0) byTrophies.forEach((d, i) => { m += `${medal(i)} <b>${d.name}</b> — +${d.trophies}\n`; });
      else m += '<i>Sin datos. Se calculan a medianoche.</i>\n';
      extra.push(m);

      const byBattles = [...deltas].filter(d => d.wins + d.losses > 0).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)).slice(0, 5);
      m = '<b>--- Top Diario Batallas ---</b>\n';
      if (byBattles.length > 0) byBattles.forEach((d, i) => { m += `${medal(i)} <b>${d.name}</b> — ${d.wins + d.losses} batallas\n`; });
      else m += '<i>Sin datos. Se contabilizan desde la medianoche.</i>\n';
      extra.push(m);

      const byDons = [...deltas].filter(d => d.donations > 0).sort((a, b) => b.donations - a.donations).slice(0, 5);
      m = '<b>--- Top Diario Donaciones ---</b>\n';
      if (byDons.length > 0) byDons.forEach((d, i) => { m += `${medal(i)} <b>${d.name}</b> — ${d.donations.toLocaleString()} 💎\n`; });
      else m += '<i>Sin datos. Se contabilizan desde la medianoche.</i>\n';
      extra.push(m);

      let guerraText = '<i>Sin datos. La guerra se actualiza en tiempo real.</i>';
      try { const race = await getCurrentRiverRace(clanTag); if (race.clan?.participants?.length) { const byFame = [...race.clan.participants].sort((a, b) => b.fame - a.fame).slice(0, 5).filter(p => p.fame > 0); if (byFame.length > 0) { guerraText = ''; byFame.forEach((p, i) => { guerraText += `${medal(i)} <b>${p.name}</b> — ${p.fame.toLocaleString()} ⚡ fama\n`; }); } } } catch { /* ok */ }
      extra.push('<b>--- Top Diario Guerra ---</b>\n' + guerraText);
    } catch { /* ok */ }

    try {
      const acc = await loadWeeklyWithNames(clanTag);
      if (acc.length > 0 && acc.some(e => e.wins + e.losses + e.donations + e.fame > 0)) {
        const byBattles = [...acc].map(e => ({ name: e.name, battles: e.wins + e.losses })).sort((a, b) => b.battles - a.battles).slice(0, 5).filter(e => e.battles > 0);
        let m = '<b>--- Top Semanal Batallas ---</b>\n';
        if (byBattles.length > 0) byBattles.forEach((e, i) => { m += `${medal(i)} <b>${e.name}</b> — ${e.battles} batallas\n`; });
        else m += '<i>Sin datos.</i>\n';
        extra.push(m);
        const byDons = [...acc].sort((a, b) => b.donations - a.donations).slice(0, 5).filter(e => e.donations > 0);
        m = '<b>--- Top Semanal Donaciones ---</b>\n';
        if (byDons.length > 0) byDons.forEach((e, i) => { m += `${medal(i)} <b>${e.name}</b> — ${e.donations.toLocaleString()} 💎\n`; });
        else m += '<i>Sin datos.</i>\n';
        extra.push(m);
        const byFame = [...acc].sort((a, b) => b.fame - a.fame).slice(0, 5).filter(e => e.fame > 0);
        m = '<b>--- Top Semanal Guerra ---</b>\n';
        if (byFame.length > 0) byFame.forEach((e, i) => { m += `${medal(i)} <b>${e.name}</b> — ${e.fame.toLocaleString()} ⚡ fama\n`; });
        else m += '<i>Sin datos.</i>\n';
        extra.push(m);
      } else header += '\n<i>Sin datos semanales todavía.</i>';
    } catch { header += '\n<i>Error al cargar ranking semanal.</i>'; }
    if (extra.length === 0) header += '\n<i>Sin datos todavía. El ranking se actualiza cada 5 min.</i>';
    return { text: header, extraMessages: extra };
  }

  if (cmd === '/clan') {
    if (!checkCooldown(userId)) return { text: '⏳ Esperá unos segundos antes de usar otro comando.' };
    const err = await requireRegistration(userId); if (err) return err;
    const clanTag = await getClanForChat(chatId);
    try {
      const clan = await getClanInfo(clanTag);
      let msg = `<b>${clan.name}</b> (${clan.tag})\nMiembros: ${clan.members}/50\nCopas: ${clan.clanScore}\nTrofeos req.: ${clan.requiredTrophies}\nGuerra: ${clan.clanWarTrophies ?? 0} copas\nPaís: ${clan.location?.name || 'Internacional'}\n`;
      if (clan.description) msg += `\n${clan.description}`;
      return { text: msg };
    } catch { return { text: '❌ No se pudo obtener info del clan.' }; }
  }

  if (cmd === '/rankingn') {
    if (!checkCooldown(userId)) return { text: '⏳ Esperá unos segundos antes de usar otro comando.' };
    const err = await requireRegistration(userId); if (err) return err;
    const player = await prisma.player.findFirst({ where: { telegramId: String(userId) }, select: { role: true } });
    if (player?.role !== 'leader' && player?.role !== 'coLeader') return { text: '⛔ Solo para líderes y co-líderes.' };
    const clanTag = await getClanForChat(chatId);
    let msg = '<b>📊 Ranking Completo (admin)</b>\n\n';
    try {
      const deltas = await loadDeltasWithNames(clanTag);
      const byTrophies = [...deltas].sort((a, b) => b.trophies - a.trophies);
      msg += '<b>--- Copas (todos) ---</b>\n'; byTrophies.forEach((d, i) => { msg += `${i + 1}. <b>${d.name}</b> — ${d.trophies > 0 ? '+' : ''}${d.trophies}\n`; });
      const byBattles = [...deltas].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
      msg += '\n<b>--- Batallas (todos) ---</b>\n'; byBattles.forEach((d, i) => { msg += `${i + 1}. <b>${d.name}</b> — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)\n`; });
      const byDons = [...deltas].sort((a, b) => b.donations - a.donations);
      msg += '\n<b>--- Donaciones (todos) ---</b>\n'; byDons.forEach((d, i) => { msg += `${i + 1}. <b>${d.name}</b> — ${d.donations.toLocaleString()} 💎\n`; });
      try { const race = await getCurrentRiverRace(clanTag); if (race.clan?.participants) { const byFame = [...race.clan.participants].sort((a, b) => b.fame - a.fame); msg += '\n<b>--- Guerra (todos) ---</b>\n'; byFame.forEach((p, i) => { msg += `${i + 1}. <b>${p.name}</b> — ${p.fame.toLocaleString()} ⚡ fama\n`; }); } } catch { /* ok */ }
    } catch { /* ok */ }
    return { text: '📊 Ranking completo enviado al privado.', privateText: msg };
  }

  return null;
}

