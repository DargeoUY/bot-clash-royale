import prisma from '../database/prisma';
import { config } from '../config';
import logger from '../config/logger';

export interface InactivityCheck {
  playerTag: string;
  playerName: string;
  discordId: string | null;
  daysInactive: number;
  status: 'active' | 'warning' | 'inactive' | 'kick_suggested';
  shouldNotify: boolean;
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

  const thresholds = getThresholds(clan.memberCount || 50);
  const baseThreshold = config.INACTIVITY_THRESHOLD_DAYS;
  const now = new Date();

  const players = await prisma.player.findMany({
    where: {
      clanTag,
      isRegistered: true,
    },
    include: {
      vacations: {
        where: {
          isActive: true,
          endDate: { gt: now },
        },
      },
    },
  });

  const results: InactivityCheck[] = [];

  for (const player of players) {
    if (player.vacations.length > 0) continue;
    if (!player.lastActiveAt) continue;

    const daysInactive = Math.floor(
      (now.getTime() - player.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24),
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

    const existingLog = await prisma.inactivityLog.findFirst({
      where: { playerTag: player.tag, status },
      orderBy: { createdAt: 'desc' },
    });

    const shouldNotify = !existingLog || daysInactive > (existingLog.daysInactive || 0);

    if (shouldNotify) {
      await prisma.inactivityLog.create({
        data: {
          playerTag: player.tag,
          daysInactive,
          status,
          notifiedAt: new Date(),
          notifiedCount: (existingLog?.notifiedCount || 0) + 1,
        },
      });
    }

    results.push({
      playerTag: player.tag,
      playerName: player.name,
      discordId: player.discordId,
      daysInactive,
      status,
      shouldNotify,
    });
  }

  logger.info(`Inactivity check: ${results.length} players flagged (clan size: ${clan.memberCount})`);
  return results;
}
