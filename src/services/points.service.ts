import prisma from '../database/prisma';
import logger from '../config/logger';

function getSeason(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function addPoints(
  playerTag: string,
  points: number,
  reason: string,
  description?: string,
): Promise<void> {
  const season = getSeason();

  await prisma.playerPoint.upsert({
    where: { playerTag_season: { playerTag, season } },
    update: {
      totalPoints: { increment: points },
      ...(reason.startsWith('war_') ? { warPoints: { increment: points } } : {}),
      ...(reason === 'donation' ? { activityPoints: { increment: points } } : {}),
      ...(reason === 'bonus' || reason === 'penalty' ? { bonusPoints: { increment: points } } : {}),
    },
    create: {
      playerTag,
      totalPoints: Math.max(points, 0),
      warPoints: reason.startsWith('war_') ? points : 0,
      activityPoints: reason === 'donation' ? points : 0,
      bonusPoints: reason === 'bonus' || reason === 'penalty' ? points : 0,
      season,
    },
  });

  await prisma.pointHistory.create({
    data: {
      playerTag,
      points,
      reason,
      description,
      season,
    },
  });

  logger.debug(`Points: ${playerTag} ${points > 0 ? '+' : ''}${points} (${reason})`);
}

export async function getPlayerPoints(playerTag: string): Promise<{
  total: number;
  war: number;
  activity: number;
  bonus: number;
  season: string;
}> {
  const season = getSeason();
  const points = await prisma.playerPoint.findUnique({
    where: { playerTag_season: { playerTag, season } },
  });

  return {
    total: points?.totalPoints || 0,
    war: points?.warPoints || 0,
    activity: points?.activityPoints || 0,
    bonus: points?.bonusPoints || 0,
    season,
  };
}

export async function getPointHistory(playerTag: string): Promise<
  { points: number; reason: string; description: string | null; date: Date }[]
> {
  const history = await prisma.pointHistory.findMany({
    where: { playerTag },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return history.map((h) => ({
    points: h.points,
    reason: h.reason,
    description: h.description,
    date: h.createdAt,
  }));
}

export async function getLeaderboard(
  clanTag: string,
  period: 'semanal' | 'mensual' | 'general',
): Promise<{ tag: string; name: string; points: number; rank: number }[]> {
  const season = getSeason();

  const points = await prisma.playerPoint.findMany({
    where: {
      season: period === 'general' ? undefined : season,
      player: { clanTag },
    },
    include: { player: true },
    orderBy: { totalPoints: 'desc' },
    take: 20,
  });

  return points.map((p, i) => ({
    tag: p.playerTag,
    name: p.player.name,
    points: p.totalPoints,
    rank: i + 1,
  }));
}

export async function calculateWarPoints(clanTag: string, warLogId: number): Promise<void> {
  const participants = await prisma.warParticipant.findMany({
    where: { warLogId },
    include: { player: { include: { vacations: { where: { isActive: true } } } } },
  });

  for (const p of participants) {
    if (p.player.vacations.length > 0) continue;

    let points = 0;
    points += (p.battlesPlayed || 0) * 1;
    points += (p.battlesWon || 0) * 2;
    points += (p.decksUsed || 0) * 1;
    points += Math.floor((p.fame || 0) * 0.5);

    if (points > 0) {
      await addPoints(p.playerTag, points, 'war_battle', `Guerra #${warLogId}`);
    }
  }
}

export async function resetSeason(): Promise<void> {
  logger.info('Season reset — los puntos persisten en PointHistory');
}
