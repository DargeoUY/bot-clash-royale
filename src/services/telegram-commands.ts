import { getPlayerInfo } from '../api/player';
import { getClanInfo } from '../api/clan';
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

function medal(i: number): string {
  return i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`;
}

export interface TgReply {
  text: string;
  privateText?: string;
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

      const clanCfg = await prisma.botConfig.findFirst({
        where: { key: { startsWith: 'clan_tag_' } },
      });
      const clanTag = clanCfg?.value || '#28P8RQUY';
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

    const clanCfg = await prisma.botConfig.findFirst({
      where: { key: { startsWith: 'clan_tag_' } },
    });
    const clanTag = clanCfg?.value || '#28P8RQUY';

    interface AccEntry { tag: string; name: string; wins: number; losses: number; donations: number; trophies: number; fame: number; }

    let msg = '<b>📊 Ranking del Clan</b>\n\n';

    // Daily deltas
    try {
      const deltaCfg = await prisma.botConfig.findUnique({
        where: { key: `daily_deltas_${cleanTag(clanTag)}` },
      });
      if (deltaCfg) {
        const deltas = JSON.parse(deltaCfg.value) as { name: string; trophies: number; wins: number; losses: number }[];

        const byTrophies = [...deltas].sort((a, b) => b.trophies - a.trophies).slice(0, 5);
        if (byTrophies.length > 0) {
          msg += '<b>🏆 Copas (hoy)</b>\n';
          byTrophies.forEach((d, i) => {
            const sign = d.trophies > 0 ? '+' : '';
            msg += `${medal(i)} <b>${d.name}</b> — ${sign}${d.trophies}\n`;
          });
          msg += '\n';
        }

        const byBattles = [...deltas]
          .map(d => ({ name: d.name, battles: d.wins + d.losses }))
          .sort((a, b) => b.battles - a.battles)
          .slice(0, 5);
        if (byBattles.some(d => d.battles > 0)) {
          msg += '<b>⚔️ Batallas (hoy)</b>\n';
          byBattles.forEach((d, i) => {
            msg += `${medal(i)} <b>${d.name}</b> — ${d.battles} batallas\n`;
          });
          msg += '\n';
        }
      }
    } catch { /* ok */ }

    // Weekly accumulator
    try {
      const accCfg = await prisma.botConfig.findUnique({
        where: { key: `weekly_acc_${cleanTag(clanTag)}` },
      });
      if (accCfg) {
        const acc: AccEntry[] = JSON.parse(accCfg.value);

        const byBattles = [...acc]
          .map(e => ({ name: e.name, battles: e.wins + e.losses }))
          .sort((a, b) => b.battles - a.battles)
          .slice(0, 5);
        if (byBattles.some(e => e.battles > 0)) {
          msg += '<b>⚔️ Batallas (semana)</b>\n';
          byBattles.forEach((e, i) => {
            msg += `${medal(i)} <b>${e.name}</b> — ${e.battles} batallas\n`;
          });
          msg += '\n';
        }

        const byDons = [...acc].sort((a, b) => b.donations - a.donations).slice(0, 5);
        if (byDons.some(e => e.donations > 0)) {
          msg += '<b>💎 Donaciones (semana)</b>\n';
          byDons.forEach((e, i) => {
            msg += `${medal(i)} <b>${e.name}</b> — ${e.donations.toLocaleString()}\n`;
          });
          msg += '\n';
        }

        const byFame = [...acc].sort((a, b) => b.fame - a.fame).slice(0, 5);
        if (byFame.some(e => e.fame > 0)) {
          msg += '<b>⚡ Fama de guerra (semana)</b>\n';
          byFame.forEach((e, i) => {
            msg += `${medal(i)} <b>${e.name}</b> — ${e.fame.toLocaleString()}\n`;
          });
        }

        if (acc.length === 0 || acc.every(e => e.wins + e.losses + e.donations + e.fame === 0)) {
          msg += '<i>Sin actividad esta semana todavía.</i>';
        }
      } else {
        msg += '<i>Sin datos semanales todavía.</i>';
      }
    } catch {
      msg += '<i>Error al cargar ranking semanal.</i>';
    }

    return { text: msg };
  }

  if (cmd === '/clan') {
    if (!checkCooldown(userId)) {
      return { text: '⏳ Esperá unos segundos antes de usar otro comando.' };
    }

    const err = await requireRegistration(userId);
    if (err) return { text: err };

    const clanCfg = await prisma.botConfig.findFirst({
      where: { key: { startsWith: 'clan_tag_' } },
    });
    const clanTag = clanCfg?.value || '#28P8RQUY';

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

  return null;
}
