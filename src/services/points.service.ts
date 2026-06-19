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

  await prisma.puntoJugador.upsert({
    where: { tagJugador_season: { tagJugador: playerTag, season } },
    update: {
      puntosTotales: { increment: points },
      ...(reason.startsWith('war_') ? { puntosGuerra: { increment: points } } : {}),
      ...(reason === 'donation' ? { puntosActividad: { increment: points } } : {}),
      ...(reason === 'bonus' || reason === 'penalty' ? { puntosExtra: { increment: points } } : {}),
    },
    create: {
      tagJugador: playerTag,
      puntosTotales: Math.max(points, 0),
      puntosGuerra: reason.startsWith('war_') ? points : 0,
      puntosActividad: reason === 'donation' ? points : 0,
      puntosExtra: reason === 'bonus' || reason === 'penalty' ? points : 0,
      season,
    },
  });

  await prisma.historialPunto.create({
    data: {
      tagJugador: playerTag,
      points,
      razon: reason,
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
  const points = await prisma.puntoJugador.findUnique({
    where: { tagJugador_season: { tagJugador: playerTag, season } },
  });

  return {
    total: points?.puntosTotales || 0,
    war: points?.puntosGuerra || 0,
    activity: points?.puntosActividad || 0,
    bonus: points?.puntosExtra || 0,
    season,
  };
}

export async function getPointHistory(playerTag: string): Promise<
  { points: number; reason: string; description: string | null; date: Date }[]
> {
  const history = await prisma.historialPunto.findMany({
    where: { tagJugador: playerTag },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return history.map((h) => ({
    points: h.points,
    reason: h.razon,
    description: h.description,
    date: h.createdAt,
  }));
}

export async function getLeaderboard(
  clanTag: string,
  period: 'semanal' | 'mensual' | 'general',
): Promise<{ tag: string; nombre: string; points: number; rank: number }[]> {
  const season = getSeason();

  const points = await prisma.puntoJugador.findMany({
    where: {
      season: period === 'general' ? undefined : season,
      jugador: { clanTag },
    },
    include: { jugador: true },
    orderBy: { puntosTotales: 'desc' },
    take: 20,
  });

  return points.map((p, i) => ({
    tag: p.tagJugador,
    nombre: p.jugador.nombre,
    points: p.puntosTotales,
    rank: i + 1,
  }));
}

export async function calculateWarPoints(clanTag: string, warLogId: number): Promise<void> {
  const participants = await prisma.participanteGuerra.findMany({
    where: { idRegistroGuerra: warLogId },
    include: { jugador: { include: { vacaciones: { where: { activo: true } } } } },
  });

  for (const p of participants) {
    if (p.jugador.vacaciones.length > 0) continue;

    let points = 0;
    points += (p.batallasJugadas || 0) * 1;
    points += (p.batallasGanadas || 0) * 2;
    points += (p.mazosUsados || 0) * 1;
    points += Math.floor((p.fame || 0) * 0.5);

    if (points > 0) {
      await addPoints(p.tagJugador, points, 'war_battle', `Guerra #${warLogId}`);
    }
  }
}

export async function resetSeason(): Promise<void> {
  logger.info('Season reset — los puntos persisten en PointHistory');
}
