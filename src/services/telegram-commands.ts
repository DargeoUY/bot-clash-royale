import { getPlayerInfo } from '../api/player';
import { getClanInfo } from '../api/clan';
import prisma from '../database/prisma';
import { sendTelegramMessage } from './telegram.service';
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

export async function handleTelegramCommand(
  chatId: number,
  userId: number,
  text: string,
  isGroup: boolean,
): Promise<string | null> {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === '/start' || cmd === '/help') {
    let msg = '<b>Comandos disponibles</b>\n\n';
    msg += '/registrar #TAG — Vincula tu cuenta de Clash Royale\n';
    msg += '/perfil — Ver tu perfil (requiere /registrar)\n';
    msg += '/clan — Info del clan\n';
    msg += '/help — Este mensaje\n\n';
    msg += '<i>Usá /registrar primero para recibir notificaciones de inactividad por privado.</i>';
    return msg;
  }

  if (cmd === '/registrar') {
    if (!checkCooldown(userId)) {
      return '⏳ Esperá unos segundos antes de usar otro comando.';
    }

    if (parts.length < 2) {
      return 'Uso: /registrar #TAG\nEjemplo: <code>/registrar #P9Y8R2G</code>';
    }

    const tag = cleanTag(parts[1]);
    try {
      const player = await getPlayerInfo(tag);
      if (!player) return '❌ Jugador no encontrado. Verificá el tag.';

      const clanCfg = await prisma.botConfig.findFirst({
        where: { key: { startsWith: 'clan_tag_' } },
      });
      const clanTag = clanCfg?.value || '#28P8RQUY';
      const expectedClan = cleanTag(clanTag);

      if (player.clan?.tag !== expectedClan) {
        return `❌ ${player.name} no está en UruguayConQueso. Está en ${player.clan?.name || 'ningún clan'}.`;
      }

      const existing = await prisma.player.findFirst({
        where: { telegramId: String(userId), tag: { not: tag } },
      });
      if (existing) {
        return `⚠️ Ya tenés vinculada la cuenta ${existing.name} (${existing.tag}).\nUsá /perfil para verla.`;
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
      return `✅ ¡Vinculado! Bienvenido <b>${player.name}</b>.\nAhora recibirás notificaciones de inactividad por privado.`;
    } catch (err) {
      logger.error(`Telegram register error: ${(err as Error).message}`);
      return '❌ Error al verificar el jugador. Intentá de nuevo.';
    }
  }

  if (cmd === '/perfil') {
    if (!checkCooldown(userId)) {
      return '⏳ Esperá unos segundos antes de usar otro comando.';
    }

    const player = await prisma.player.findFirst({
      where: { telegramId: String(userId) },
    });
    if (!player) {
      return '⚠️ No tenés una cuenta vinculada.\nUsá /registrar #TAG primero.';
    }

    let msg = `<b>${player.name}</b> (${player.tag})\n`;
    if (player.role) msg += `Rol: ${player.role}\n`;
    msg += `Nivel: ${player.expLevel ?? '?'}\n`;
    msg += `Copas: ${player.trophies ?? '?'}\n`;
    if (player.lastActiveAt) {
      const days = Math.floor((Date.now() - player.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24));
      msg += `Última actividad: hace ${days} días\n`;
    }
    return msg;
  }

  if (cmd === '/clan') {
    if (!checkCooldown(userId)) {
      return '⏳ Esperá unos segundos antes de usar otro comando.';
    }

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
      return msg;
    } catch {
      return '❌ No se pudo obtener info del clan.';
    }
  }

  return null;
}
