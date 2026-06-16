import prisma from '../database/prisma';
import { getClanMembers } from '../api/clan';

export async function getUnregisteredMembers(clanTag: string): Promise<
  { tag: string; name: string; role: string; trophies: number }[]
> {
  const members = await getClanMembers(clanTag);
  const registered = await prisma.jugador.findMany({
    where: { clanTag, registrado: true },
    select: { tag: true },
  });

  const registeredTags = new Set(registered.map((p) => p.tag));

  return members
    .filter((m) => !registeredTags.has(m.tag))
    .map((m) => ({
      tag: m.tag,
      name: m.name,
      role: m.role,
      trophies: m.trophies,
    }));
}
