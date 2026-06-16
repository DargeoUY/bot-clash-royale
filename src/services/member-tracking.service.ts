import prisma from '../database/prisma';
import { ClanMember } from '../api/types';
import logger from '../config/logger';

export interface MemberChanges {
  joined: { tag: string; name: string; role: string }[];
  left: { tag: string; name: string; role: string }[];
  rejoined: { tag: string; name: string }[];
  totalActive: number;
}

export async function detectMemberChanges(
  clanTag: string,
  currentMembers: ClanMember[],
): Promise<MemberChanges> {
  const currentTags = new Set(currentMembers.map((m) => m.tag));

  const existingPlayers = await prisma.jugador.findMany({
    where: { clanTag },
  });

  const existingTags = new Map(
    existingPlayers.map((p) => [p.tag, { status: p.status, name: p.name }]),
  );

  const joined: MemberChanges['joined'] = [];
  const left: MemberChanges['left'] = [];
  const rejoined: MemberChanges['rejoined'] = [];

  // Detect new members (not in DB at all, or previously left)
  for (const member of currentMembers) {
    const existing = existingTags.get(member.tag);
    if (!existing) {
      joined.push({ tag: member.tag, name: member.name, role: member.role });
    } else if (existing.status === 'left') {
      rejoined.push({ tag: member.tag, name: member.name });
    }
  }

  // Detect left members (in DB but not in current clan)
  for (const [tag, info] of existingTags) {
    if (!currentTags.has(tag) && info.status === 'active') {
      left.push({ tag, name: info.name, role: 'unknown' });
    }
  }

  // Update DB: mark left players, reactivate returning ones
  for (const p of left) {
    await prisma.jugador.update({
      where: { tag: p.tag },
      data: { status: 'left', salioEn: new Date(), clanTag: null },
    });
    await prisma.historialClan.create({
      data: { tagJugador: p.tag, clanTag, evento: 'left', nombreJugador: p.name },
    });
  }

  for (const p of rejoined) {
    await prisma.jugador.update({
      where: { tag: p.tag },
      data: { status: 'active', salioEn: null, clanTag },
    });
    await prisma.historialClan.create({
      data: { tagJugador: p.tag, clanTag, evento: 'joined', nombreJugador: p.name },
    });
  }

  for (const p of joined) {
    await prisma.historialClan.create({
      data: { tagJugador: p.tag, clanTag, evento: 'joined', nombreJugador: p.name },
    });
  }

  if (joined.length > 0 || left.length > 0 || rejoined.length > 0) {
    logger.info(
      `Member changes: +${joined.length} joined, -${left.length} left, ${rejoined.length} rejoined`,
    );
  }

  return {
    joined,
    left,
    rejoined,
    totalActive: currentMembers.length,
  };
}

export async function getClanStats(_clanTag: string): Promise<{
  totalJoined: number;
  totalLeft: number;
  thisMonth: { joined: number; left: number };
}> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalJoined, totalLeft, monthJoined, monthLeft] = await Promise.all([
    prisma.historialClan.count({ where: { evento: 'joined' } }),
    prisma.historialClan.count({ where: { evento: 'left' } }),
    prisma.historialClan.count({ where: { evento: 'joined', createdAt: { gte: monthStart } } }),
    prisma.historialClan.count({ where: { evento: 'left', createdAt: { gte: monthStart } } }),
  ]);

  return {
    totalJoined,
    totalLeft,
    thisMonth: { joined: monthJoined, left: monthLeft },
  };
}
