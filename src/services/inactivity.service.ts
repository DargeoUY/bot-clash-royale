import prisma from '../database/prisma';
import { config } from '../config';
import logger from '../config/logger';

export interface InactivityCheck {
  playerTag: string;
  nombreJugador: string;
  idDiscord: string | null;
  diasInactivo: number;
  status: 'active' | 'warning' | 'inactive' | 'kick_suggested';
  shouldNotify: boolean;
}

export function statusDisplay(status: string): string {
  const map: Record<string, string> = {
    warning: 'aviso',
    inactive: 'inactivo',
    kick_suggested: 'expulsion',
    active: 'activo',
  };
  return map[status] || status;
}

function getThresholds(memberCount: number): { warning: number; inactive: number; kick: number } {
  if (memberCount >= 43) {
    return { warning: 2, inactive: 4, kick: 6 };
  } else if (memberCount >= 30) {
    return { warning: 2, inactive: 5, kick: 10 };
  }
  return { warning: 2, inactive: 7, kick: 14 };
}

export async function checkInactivity(clanTag: string, _guildId: string | null): Promise<InactivityCheck[]> {
  const clan = await prisma.clan.findUnique({ where: { tag: clanTag } });
  if (!clan) return [];

  const thresholds = getThresholds(clan.totalMiembros || 50);
  const baseThreshold = config.INACTIVITY_THRESHOLD_DAYS;
  const now = new Date();

  const players = await prisma.jugador.findMany({
    where: {
      clanTag,
    },
    include: {
      vacaciones: {
        where: {
          activo: true,
          endDate: { gt: now },
        },
      },
    },
  });

  const results: InactivityCheck[] = [];

  for (const player of players) {
    if (player.vacaciones.length > 0) continue;
    if (!player.ultimaActividad) continue;

    const daysInactive = Math.floor(
      (now.getTime() - player.ultimaActividad.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysInactive < baseThreshold) continue;

    let status: InactivityCheck['status'] = 'active';
    if (daysInactive >= thresholds.kick) {
      status = 'kick_suggested';
    } else if (daysInactive >= thresholds.inactive) {
      status = 'inactive';
    } else if (daysInactive >= thresholds.warning) {
      status = 'warning';
    }

    const existingLog = await prisma.registroInactividad.findFirst({
      where: { tagJugador: player.tag, status },
      orderBy: { createdAt: 'desc' },
    });

    const shouldNotify = !existingLog || daysInactive > (existingLog.diasInactivo || 0);

    if (shouldNotify) {
      await prisma.registroInactividad.create({
        data: {
          tagJugador: player.tag,
          diasInactivo: daysInactive,
          status,
          notificadoEn: new Date(),
          vecesNotificado: (existingLog?.vecesNotificado || 0) + 1,
        },
      });
    }

    results.push({
      playerTag: player.tag,
      nombreJugador: player.name,
      idDiscord: player.idDiscord,
      diasInactivo: daysInactive,
      status,
      shouldNotify,
    });
  }

  logger.info(`Inactivity check: ${results.length} players flagged (clan size: ${clan.totalMiembros})`);
  return results;
}

export async function getInactivitySummary(clanTag: string): Promise<{
  warning: InactivityCheck[];
  inactive: InactivityCheck[];
  kick_suggested: InactivityCheck[];
  total: number;
}> {
  const results = await checkInactivity(clanTag, null);
  return {
    warning: results.filter((r) => r.status === 'warning'),
    inactive: results.filter((r) => r.status === 'inactive'),
    kick_suggested: results.filter((r) => r.status === 'kick_suggested'),
    total: results.length,
  };
}
