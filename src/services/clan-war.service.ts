import prisma from '../database/prisma';
import { getClanInfo, getClanMembers, getCurrentRiverRace } from '../api/clan';
import { CRApiError } from '../api/client';
import logger from '../config/logger';

export async function syncClanData(clanTag: string): Promise<void> {
  try {
    const clanInfo = await getClanInfo(clanTag);

    const clan = await prisma.clan.upsert({
      where: { tag: clanTag },
      update: {
        name: clanInfo.name,
        description: clanInfo.description,
        level: clanInfo.clanScore > 0 ? Math.floor(clanInfo.clanScore / 100) : undefined,
        memberCount: clanInfo.members,
      },
      create: {
        tag: clanTag,
        name: clanInfo.name,
        description: clanInfo.description,
        memberCount: clanInfo.members,
      },
    });

    logger.info(`Clan synced: ${clan.name} (${clan.memberCount} members)`);

    const members = await getClanMembers(clanTag);

    for (const member of members) {
      await prisma.player.upsert({
        where: { tag: member.tag },
        update: {
          name: member.name,
          role: member.role,
          expLevel: member.expLevel,
          trophies: member.trophies,
          clanTag,
          lastActiveAt: new Date(member.lastSeen),
        },
        create: {
          tag: member.tag,
          name: member.name,
          role: member.role,
          expLevel: member.expLevel,
          trophies: member.trophies,
          clanTag,
          lastActiveAt: new Date(member.lastSeen),
        },
      });
    }

    logger.info(`Clan members synced: ${members.length} players`);

  } catch (error) {
    if (error instanceof CRApiError) {
      logger.error(`CR API error syncing clan ${clanTag}: [${error.status}] ${error.message}`);
    } else {
      logger.error(`Unexpected error syncing clan ${clanTag}:`, error);
    }
    throw error;
  }
}

export async function syncCurrentWar(clanTag: string): Promise<void> {
  try {
    const race = await getCurrentRiverRace(clanTag);

    if (!race.clan || !race.periodLogs) return;

    const periodLog = race.periodLogs[0];
    if (!periodLog) return;

    const latestEntry = periodLog.items[0];
    if (!latestEntry) return;

    const existingWar = await prisma.warLog.findFirst({
      where: {
        clanTag,
        seasonId: String(latestEntry.seasonId),
        warType: 'riverRace',
      },
    });

    if (existingWar) return;

    const clanStanding = latestEntry.standings.find(
      (s) => s.clan.tag === clanTag,
    );

    const warLog = await prisma.warLog.create({
      data: {
        clanTag,
        seasonId: String(latestEntry.seasonId),
        warType: 'riverRace',
        startDate: new Date(race.periodLogs[0].periodIndex > 0 ? '' : new Date()),
        endDate: new Date(),
        participants: clanStanding?.clan.participants.length,
        fame: clanStanding?.clan.fame,
      },
    });

    if (clanStanding) {
      for (const participant of clanStanding.clan.participants) {
        const existingParticipant = await prisma.warParticipant.findFirst({
          where: { warLogId: warLog.id, playerTag: participant.tag },
        });

        if (!existingParticipant) {
          await prisma.warParticipant.create({
            data: {
              warLogId: warLog.id,
              playerTag: participant.tag,
              fame: participant.fame,
              repairPoints: participant.repairPoints,
              boatsAttacked: participant.boatAttacks,
              decksUsed: participant.decksUsed,
              decksUsedToday: participant.decksUsedToday,
            },
          });
        }
      }
    }

    logger.info(`War synced: season ${latestEntry.seasonId}, ${clanStanding?.clan.participants.length || 0} participants`);

  } catch (error) {
    if (error instanceof CRApiError && error.status === 404) {
      logger.debug(`No active war for clan ${clanTag}`);
      return;
    }
    logger.error(`Error syncing war for clan ${clanTag}:`, error);
  }
}
