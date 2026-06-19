import prisma from '../database/prisma';
import { getLeaderboard } from './points.service';
import logger from '../config/logger';

function getWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function getMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

export async function getWeeklyTrophyRanking(clanTag: string): Promise<{ tag: string; nombre: string; delta: number; trofeos: number; rank: number }[]> {
  const players = await prisma.jugador.findMany({
    where: { clanTag, estado: 'active' },
  });
  const withDelta = players.map((p) => {
    const base = p.trofeosInicioSemana ?? p.trofeos ?? 0;
    const current = p.trofeos ?? 0;
    return { tag: p.tag, nombre: p.nombre, delta: current - base, trofeos: current };
  });
  return withDelta
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 10)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

export async function getMonthlyTrophyRanking(clanTag: string): Promise<{ tag: string; nombre: string; delta: number; trofeos: number; rank: number }[]> {
  const players = await prisma.jugador.findMany({
    where: { clanTag, estado: 'active' },
  });
  const withDelta = players.map((p) => {
    const base = p.trofeosInicioMes ?? p.trofeos ?? 0;
    const current = p.trofeos ?? 0;
    return { tag: p.tag, nombre: p.nombre, delta: current - base, trofeos: current };
  });
  return withDelta
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 10)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

export async function getDonationRanking(clanTag: string): Promise<{ tag: string; nombre: string; donations: number; rank: number }[]> {
  const players = await prisma.jugador.findMany({
    where: { clanTag, estado: 'active' },
    include: {
      donaciones: {
        orderBy: { season: 'desc' },
        take: 1,
      },
    },
  });
  const sorted = players
    .map((p) => ({ tag: p.tag, nombre: p.nombre, donations: p.donaciones[0]?.donations || 0 }))
    .sort((a, b) => b.donations - a.donations)
    .slice(0, 10);
  return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
}

export async function getWarRanking(clanTag: string): Promise<{ tag: string; nombre: string; fame: number; rank: number }[]> {
  const month = getMonthRange();
  const participants = await prisma.participanteGuerra.findMany({
    where: {
      registroGuerra: {
        clanTag,
        startDate: { gte: month.start },
      },
    },
    include: { jugador: true },
  });
  const fameMap = new Map<string, { name: string; fame: number }>();
  for (const p of participants) {
    const current = fameMap.get(p.tagJugador) || { nombre: p.jugador.nombre, fame: 0 };
    current.fame += p.fame || 0;
    fameMap.set(p.tagJugador, current);
  }
  const sorted = Array.from(fameMap.entries())
    .map(([tag, data]) => ({ tag, nombre: data.nombre, fame: data.fame }))
    .sort((a, b) => b.fame - a.fame)
    .slice(0, 10);
  return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
}

export async function resetWeeklyBaseline(clanTag: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE Jugador SET trofeosInicioSemana = trofeos WHERE clanTag = ?`,
    clanTag,
  );
}

export async function resetMonthlyBaseline(clanTag: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE Jugador SET trofeosInicioMes = trofeos WHERE clanTag = ?`,
    clanTag,
  );
}

export async function generateWeeklyReport(clanTag: string): Promise<string> {
  const ranking = await getWeeklyTrophyRanking(clanTag);
  if (ranking.length === 0) return 'Sin datos para el ranking semanal.';
  const lines = ranking.map((p) => {
    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
    const signo = p.delta >= 0 ? '+' : '';
    return `${medal} **${p.nombre}** — ${signo}${p.delta} 🏆`;
  });
  return `📅 *Ranking Semanal de Copas*\n\n${lines.join('\n')}`;
}

export async function generateMonthlyReport(clanTag: string): Promise<string> {
  const trofeos = await getMonthlyTrophyRanking(clanTag);
  const donaciones = await getDonationRanking(clanTag);
  const guerra = await getWarRanking(clanTag);
  let msg = '📅 *Ranking Mensual*\n\n';
  msg += '🏆 *Trofeos:*\n';
  msg += trofeos.slice(0, 5).map((p) => `${p.rank}. ${p.nombre} — ${p.delta >= 0 ? '+' : ''}${p.delta}`).join('\n') + '\n\n';
  msg += '💎 *Donaciones:*\n';
  msg += donaciones.slice(0, 5).map((p) => `${p.rank}. ${p.nombre} — ${p.donations}`).join('\n') + '\n\n';
  msg += '⚔️ *Guerra:*\n';
  msg += guerra.slice(0, 5).map((p) => `${p.rank}. ${p.nombre} — ${p.fame} fama`).join('\n');
  return msg;
}
