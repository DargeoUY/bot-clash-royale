import { getPlayerInfo } from '../api/player';
import { getClanInfo, getCurrentRiverRace } from '../api/clan';
import prisma from '../database/prisma';
import logger from '../config/logger';

const cooldowns = new Map<number, number>();
const COOLDOWN_MS = 10_000;

function checkCooldown(userId: number): boolean {
  const last = cooldowns.get(userId);
  if (last && Date.now() - last < COOLDOWN_MS) return false;
  cooldowns.set(userId, Date.now());
  return true;
}

function cleanTag(tag: string): string {
  return tag.startsWith('#') ? tag : `#${tag}`;
}

async function requireRegistration(userId: number): Promise<string | null> {
  const player = await prisma.player.findFirst({
    where: { telegramId: String(userId) },
  });
  if (!player) {
    return '⚠️ No tenés una cuenta vinculada.\nUsá /registrar #TAG primero.';
  }
  return null;
}

async function getClanForChat(chatId: number): Promise<string> {
  const cfg = await prisma.botConfig.findUnique({
    where: { key: `telegram_group_clan_${chatId}` },
  });
  if (cfg) return cfg.value;

  const clanCfg = await prisma.botConfig.findFirst({
    where: { key: { startsWith: 'clan_tag_' } },
  });
  return clanCfg?.value || '#28P8RQUY';
}

function medal(i: number): string {
  return i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`;
}

export interface TgReply {
  text: string;
  privateText?: string;
  extraMessages?: string[];
}

export async function handleTelegramCommand(
  chatId: number,
  userId: number,
  text: string,
  isGroup: boolean,
): Promise<TgReply | null> {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === '/start' || cmd === '/help') {
    let msg = '<b>Comandos disponibles</b>\n\n';
    msg += '/registrar #TAG — Vincula tu cuenta de Clash Royale\n';
    msg += '/perfil — Ver tu perfil (requiere /registrar)\n';
    msg += '/ranking — Ranking diario y semanal\n';
    msg += '/clan — Info del clan\n';
    msg += '/help — Este mensaje';
    return { text: msg };
  }

  if (cmd === '/registrar') {
    if (!checkCooldown(userId)) {
      return { text: '⏳ Esperá unos segundos antes de usar otro comando.' };
    }

    if (parts.length < 2) {
      return { text: 'Uso: /registrar #TAG\nEjemplo: <code>/registrar #P9Y8R2G</code>' };
    }

    const tag = cleanTag(parts[1]);
    try {
      const player = await getPlayerInfo(tag);
      if (!player) return { text: '❌ Jugador no encontrado. Verificá el tag.' };

      const clanTag = await getClanForChat(chatId);
      const expectedClan = cleanTag(clanTag);

      if (player.clan?.tag !== expectedClan) {
        return { text: `❌ ${player.name} no está en UruguayConQueso. Está en ${player.clan?.name || 'ningún clan'}.` };
      }

      const existing = await prisma.player.findFirst({
        where: { telegramId: String(userId), tag: { not: tag } },
      });
      if (existing) {
        return { text: `⚠️ Ya tenés vinculada la cuenta ${existing.name} (${existing.tag}).\nUsá /perfil para verla.` };
      }

      await prisma.player.upsert({
        where: { tag },
        update: { name: player.name, telegramId: String(userId), clanTag: expectedClan },
        create: {
          tag,
          name: player.name,
          role: player.role,
          expLevel: player.expLevel,
          trophies: player.trophies,
          clanTag: expectedClan,
          telegramId: String(userId),
          status: 'active',
        },
      });

      logger.info(`Telegram user ${userId} linked to ${player.name} (${tag})`);

      const privateMsg = `✅ ¡Vinculado! Bienvenido <b>${player.name}</b> (${player.tag}).\n\n` +
        `Rol: ${player.role || 'Miembro'}\n` +
        `Nivel: ${player.expLevel || '?'}\n` +
        `Copas: ${player.trophies || '?'}\n` +
        `Arena: ${player.arena?.name || '?'}\n\n` +
        `Ahora podés usar /perfil, /ranking y /clan.`;

      if (isGroup) {
        return { text: `✅ ${player.name} vinculado correctamente.`, privateText: privateMsg };
      }
      return { text: privateMsg };
    } catch (err) {
      logger.error(`Telegram register error: ${(err as Error).message}`);
      return { text: '❌ Error al verificar el jugador. Intentá de nuevo.' };
    }
  }

  if (cmd === '/perfil') {
    if (!checkCooldown(userId)) {
      return { text: '⏳ Esperá unos segundos antes de usar otro comando.' };
    }

    const err = await requireRegistration(userId);
    if (err) return { text: err };

    const player = await prisma.player.findFirst({
      where: { telegramId: String(userId) },
    });

    let msg = `<b>${player!.name}</b> (${player!.tag})\n`;
    if (player!.role) msg += `Rol: ${player!.role}\n`;
    msg += `Nivel: ${player!.expLevel ?? '?'}\n`;
    msg += `Copas: ${player!.trophies ?? '?'}\n`;
    if (player!.lastActiveAt) {
      const days = Math.floor((Date.now() - player!.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24));
      msg += `Última actividad: hace ${days} días\n`;
    }
    return { text: msg };
  }

  if (cmd === '/ranking') {
    if (!checkCooldown(userId)) {
      return { text: '⏳ Esperá unos segundos antes de usar otro comando.' };
    }

    const err = await requireRegistration(userId);
    if (err) return { text: err };

    const player = await prisma.player.findFirst({
      where: { telegramId: String(userId) },
      select: { role: true },
    });
    const isLeader = player?.role === 'leader' || player?.role === 'coLeader';

    const clanTag = await getClanForChat(chatId);

    interface AccEntry { tag: string; name: string; wins: number; losses: number; donations: number; trophies: number; fame: number; }

    const extra: string[] = [];
    let header: string;

    // Admin: show ALL players privately
    if (isLeader) {
      let allPrivate = '<b>📊 Ranking Completo — Todos los jugadores</b>\n\n';

      try {
        const deltaCfg = await prisma.botConfig.findUnique({
          where: { key: `daily_deltas_${clanTag}` },
        });
        if (deltaCfg) {
          const deltas = JSON.parse(deltaCfg.value) as { name: string; trophies: number; wins: number; losses: number; donations: number }[];

          const byTrophies = [...deltas].sort((a, b) => b.trophies - a.trophies);
          allPrivate += '<b>--- Copas (todos) ---</b>\n';
          byTrophies.forEach((d, i) => {
            const sign = d.trophies > 0 ? '+' : '';
            allPrivate += `${i + 1}. <b>${d.name}</b> — ${sign}${d.trophies}\n`;
          });

          const byBattles = [...deltas].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
          allPrivate += '\n<b>--- Batallas (todos) ---</b>\n';
          byBattles.forEach((d, i) => {
            allPrivate += `${i + 1}. <b>${d.name}</b> — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)\n`;
          });

          const byDons = [...deltas].sort((a, b) => b.donations - a.donations);
          allPrivate += '\n<b>--- Donaciones (todos) ---</b>\n';
          byDons.forEach((d, i) => {
            allPrivate += `${i + 1}. <b>${d.name}</b> — ${d.donations.toLocaleString()} 💎\n`;
          });
        }
      } catch { /* ok */ }

      return { text: '📊 Ranking completo enviado al privado.', privateText: allPrivate };
    }

    // Non-admin: top 5 per category (current behavior)
    header = '<b>📊 Ranking del Clan</b>';

    // Daily deltas
    try {
      const deltaCfg = await prisma.botConfig.findUnique({
        where: { key: `daily_deltas_${clanTag}` },
      });
      if (deltaCfg) {
        const deltas = JSON.parse(deltaCfg.value) as { name: string; trophies: number; wins: number; losses: number; donations: number }[];

        // Copas
        const byTrophies = [...deltas].filter(d => d.trophies > 0).sort((a, b) => b.trophies - a.trophies).slice(0, 5);
        if (byTrophies.length > 0) {
          let m = '<b>--- Top Diario Copas ---</b>\n';
          byTrophies.forEach((d, i) => {
            m += `${medal(i)} <b>${d.name}</b> — +${d.trophies}\n`;
          });
          extra.push(m);
        }

        // Batallas
        const byBattles = [...deltas]
          .map(d => ({ name: d.name, battles: d.wins + d.losses }))
          .sort((a, b) => b.battles - a.battles)
          .slice(0, 5)
          .filter(d => d.battles > 0);
        if (byBattles.length > 0) {
          let m = '<b>--- Top Diario Batallas ---</b>\n';
          byBattles.forEach((d, i) => {
            m += `${medal(i)} <b>${d.name}</b> — ${d.battles} batallas\n`;
          });
          extra.push(m);
        }

        // Donaciones
        const byDons = [...deltas].sort((a, b) => b.donations - a.donations).slice(0, 5).filter(d => d.donations > 0);
        if (byDons.length > 0) {
          let m = '<b>--- Top Diario Donaciones ---</b>\n';
          byDons.forEach((d, i) => {
            m += `${medal(i)} <b>${d.name}</b> — ${d.donations.toLocaleString()} 💎\n`;
          });
          extra.push(m);
        }
      }
    } catch { /* ok */ }

    // Weekly accumulator
    try {
      const accCfg = await prisma.botConfig.findUnique({
        where: { key: `weekly_acc_${clanTag}` },
      });
      if (accCfg) {
        const acc: AccEntry[] = JSON.parse(accCfg.value);

        // Batallas semanales
        const byBattles = [...acc]
          .map(e => ({ name: e.name, battles: e.wins + e.losses }))
          .sort((a, b) => b.battles - a.battles)
          .slice(0, 5)
          .filter(e => e.battles > 0);
        if (byBattles.length > 0) {
          let m = '<b>--- Top Semanal Batallas ---</b>\n';
          byBattles.forEach((e, i) => {
            m += `${medal(i)} <b>${e.name}</b> — ${e.battles} batallas\n`;
          });
          extra.push(m);
        }

        // Donaciones semanales
        const byDons = [...acc].sort((a, b) => b.donations - a.donations).slice(0, 5).filter(e => e.donations > 0);
        if (byDons.length > 0) {
          let m = '<b>--- Top Semanal Donaciones ---</b>\n';
          byDons.forEach((e, i) => {
            m += `${medal(i)} <b>${e.name}</b> — ${e.donations.toLocaleString()} 💎\n`;
          });
          extra.push(m);
        }

        // Fama semanal
        const byFame = [...acc].sort((a, b) => b.fame - a.fame).slice(0, 5).filter(e => e.fame > 0);
        if (byFame.length > 0) {
          let m = '<b>--- Top Semanal Guerra ---</b>\n';
          byFame.forEach((e, i) => {
            m += `${medal(i)} <b>${e.name}</b> — ${e.fame.toLocaleString()} ⚡ fama\n`;
          });
          extra.push(m);
        }

        if (acc.length === 0 || acc.every(e => e.wins + e.losses + e.donations + e.fame === 0)) {
          header += '\n<i>Sin actividad esta semana todavía.</i>';
        }
      } else {
        header += '\n<i>Sin datos semanales todavía.</i>';
      }
    } catch {
      header += '\n<i>Error al cargar ranking semanal.</i>';
    }

    if (extra.length === 0) {
      header += '\n<i>Sin datos todavía. El ranking se actualiza cada 15 min.</i>';
    }

    return { text: header, extraMessages: extra };
  }

  if (cmd === '/clan') {
    if (!checkCooldown(userId)) {
      return { text: '⏳ Esperá unos segundos antes de usar otro comando.' };
    }

    const err = await requireRegistration(userId);
    if (err) return { text: err };

    const clanTag = await getClanForChat(chatId);

    try {
      const clan = await getClanInfo(clanTag);
      let msg = `<b>${clan.name}</b> (${clan.tag})\n`;
      msg += `Miembros: ${clan.members}/50\n`;
      msg += `Copas: ${clan.clanScore}\n`;
      msg += `Trofeos req.: ${clan.requiredTrophies}\n`;
      msg += `Guerra: ${clan.clanWarTrophies ?? 0} copas\n`;
      msg += `País: ${clan.location?.name || 'Internacional'}\n`;
      if (clan.description) msg += `\n${clan.description}`;
      return { text: msg };
    } catch {
      return { text: '❌ No se pudo obtener info del clan.' };
    }
  }

  if (cmd === '/rankingn') {
    if (!checkCooldown(userId)) {
      return { text: '⏳ Esperá unos segundos antes de usar otro comando.' };
    }

    const err = await requireRegistration(userId);
    if (err) return { text: err };

    const player = await prisma.player.findFirst({
      where: { telegramId: String(userId) },
      select: { role: true },
    });
    if (player?.role !== 'leader' && player?.role !== 'coLeader') {
      return { text: '⛔ Solo para líderes y co-líderes.' };
    }

    const clanTag = await getClanForChat(chatId);

    let msg = '<b>📊 Ranking Completo (admin)</b>\n\n';

    // Daily deltas
    try {
      const deltaCfg = await prisma.botConfig.findUnique({
        where: { key: `daily_deltas_${clanTag}` },
      });
      if (deltaCfg) {
        const deltas = JSON.parse(deltaCfg.value) as { name: string; trophies: number; wins: number; losses: number; donations: number }[];

        const byTrophies = [...deltas].sort((a, b) => b.trophies - a.trophies);
        msg += '<b>--- Copas (todos) ---</b>\n';
        byTrophies.forEach((d, i) => {
          const sign = d.trophies > 0 ? '+' : '';
          msg += `${i + 1}. <b>${d.name}</b> — ${sign}${d.trophies}\n`;
        });

        const byBattles = [...deltas].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
        msg += '\n<b>--- Batallas (todos) ---</b>\n';
        byBattles.forEach((d, i) => {
          msg += `${i + 1}. <b>${d.name}</b> — ${d.wins + d.losses} batallas (${d.wins}V/${d.losses}D)\n`;
        });

        const byDons = [...deltas].sort((a, b) => b.donations - a.donations);
        msg += '\n<b>--- Donaciones (todos) ---</b>\n';
        byDons.forEach((d, i) => {
          msg += `${i + 1}. <b>${d.name}</b> — ${d.donations.toLocaleString()} 💎\n`;
        });
      }
    } catch { /* ok */ }

    // Guerra (live from API)
    try {
      const race = await getCurrentRiverRace(clanTag);
      if (race.clan?.participants) {
        const byFame = [...race.clan.participants].sort((a, b) => b.fame - a.fame);
        msg += '\n<b>--- Guerra (todos) ---</b>\n';
        byFame.forEach((p, i) => {
          msg += `${i + 1}. <b>${p.name}</b> — ${p.fame.toLocaleString()} ⚡ fama\n`;
        });
      }
    } catch { /* ok */ }

    return { text: '📊 Ranking completo enviado al privado.', privateText: msg };
  }

  return null;
}
