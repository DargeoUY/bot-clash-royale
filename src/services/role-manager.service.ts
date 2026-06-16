import { Guild, Role } from 'discord.js';
import prisma from '../database/prisma';
import { getLeaderboard } from './points.service';
import logger from '../config/logger';

const ROLE_NAMES: Record<string, string> = {
  leader: '👑 Líder',
  coLeader: '🔱 Co-Líder',
  campeonSemanal: '🏆 Campeón Semanal de Copas',
  campeonMensual: '🏆 Campeón Mensual de Copas',
  donadorLegendario: '💎 Donador Legendario',
  donadorEpico: '💎 Donador Épico',
  donadorPocoComun: '💎 Donador Poco Común',
  guerreroCelestial: '🌟 Guerrero Celestial',
  guerreroLegendario: '🌟 Guerrero Legendario',
  guerreroEpico: '🌟 Guerrero Épico',
  veterano: '🏅 Veterano',
  recluta: '🆕 Recluta',
};

async function findOrCreateRole(guild: Guild, name: string, color?: string): Promise<Role> {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing;
  const role = await guild.roles.create({
    name,
    color: color ? parseInt(color.replace('#', ''), 16) : undefined,
  });
  return role;
}

async function assignRole(guild: Guild, memberId: string, roleName: string): Promise<void> {
  try {
    const member = await guild.members.fetch(memberId);
    const role = await findOrCreateRole(guild, roleName);
    await member.roles.add(role);
  } catch (err) {
    logger.warn(`No se pudo asignar rol ${roleName} a ${memberId}: ${(err as Error).message}`);
  }
}

async function removeRole(guild: Guild, memberId: string, roleName: string): Promise<void> {
  try {
    const member = await guild.members.fetch(memberId);
    const role = guild.roles.cache.find((r) => r.name === roleName);
    if (role) await member.roles.remove(role);
  } catch (err) {
    logger.warn(`No se pudo quitar rol ${roleName} a ${memberId}: ${(err as Error).message}`);
  }
}

export async function assignWeeklyChampion(guild: Guild, clanTag: string): Promise<void> {
  const lb = await getLeaderboard(clanTag, 'semanal');
  const winner = lb[0];
  if (!winner) return;
  const player = await prisma.jugador.findUnique({ where: { tag: winner.tag } });
  if (!player?.idDiscord) return;
  const member = await guild.members.fetch(player.idDiscord);
  const role = await findOrCreateRole(guild, ROLE_NAMES.campeonSemanal, '#FFD700');
  for (const [, m] of await guild.members.fetch()) {
    if (m.roles.cache.has(role.id) && m.id !== member.id) {
      await m.roles.remove(role);
    }
  }
  await member.roles.add(role);
  logger.info(`Campeón semanal asignado: ${winner.name}`);
}

export async function assignMonthlyChampion(guild: Guild, clanTag: string): Promise<void> {
  const lb = await getLeaderboard(clanTag, 'mensual');
  const winner = lb[0];
  if (!winner) return;
  const player = await prisma.jugador.findUnique({ where: { tag: winner.tag } });
  if (!player?.idDiscord) return;
  const role = await findOrCreateRole(guild, ROLE_NAMES.campeonMensual, '#FFD700');
  const member = await guild.members.fetch(player.idDiscord);
  for (const [, m] of await guild.members.fetch()) {
    if (m.roles.cache.has(role.id) && m.id !== member.id) {
      await m.roles.remove(role);
    }
  }
  await member.roles.add(role);
  logger.info(`Campeón mensual asignado: ${winner.name}`);
}

export async function assignDonorRoles(guild: Guild, clanTag: string): Promise<void> {
  const lb = await getLeaderboard(clanTag, 'mensual');
  const topDonor = lb[0];
  if (!topDonor) return;
  const player = await prisma.jugador.findUnique({ where: { tag: topDonor.tag } });
  if (!player?.idDiscord) return;
  const member = await guild.members.fetch(player.idDiscord);
  const donationRecords = await prisma.registroDonacion.findMany({
    where: { tagJugador: topDonor.tag },
    orderBy: { season: 'desc' },
    take: 3,
  });
  const firstPlaceCount = donationRecords.filter((r) => r.donations > 0).length;
  if (firstPlaceCount >= 3) {
    await assignRole(guild, player.idDiscord, ROLE_NAMES.donadorLegendario);
  } else if (firstPlaceCount >= 2) {
    await assignRole(guild, player.idDiscord, ROLE_NAMES.donadorEpico);
  } else {
    await assignRole(guild, player.idDiscord, ROLE_NAMES.donadorPocoComun);
  }
}

export async function assignWarriorRolesFromWar(guild: Guild, clanTag: string, warLogId: number): Promise<void> {
  const participants = await prisma.participanteGuerra.findMany({
    where: { idRegistroGuerra: warLogId, registroGuerra: { clanTag } },
    include: { jugador: true },
    orderBy: { fame: 'desc' },
  });
  const top3 = participants.slice(0, 3);
  const roleMap: Record<number, string> = {
    0: ROLE_NAMES.guerreroCelestial,
    1: ROLE_NAMES.guerreroLegendario,
    2: ROLE_NAMES.guerreroEpico,
  };
  for (let i = 0; i < top3.length; i++) {
    const p = top3[i];
    if (!p.jugador.idDiscord) continue;
    await assignRole(guild, p.jugador.idDiscord, roleMap[i]);
  }
}

export async function removeExpiredWarriorRoles(guild: Guild): Promise<void> {
  for (const name of [ROLE_NAMES.guerreroCelestial, ROLE_NAMES.guerreroLegendario, ROLE_NAMES.guerreroEpico]) {
    const role = guild.roles.cache.find((r) => r.name === name);
    if (!role) continue;
    for (const [, member] of await guild.members.fetch()) {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
      }
    }
  }
  logger.info('Roles de guerreros expirados eliminados');
}

export async function assignRecluta(guild: Guild, discordId: string): Promise<void> {
  await assignRole(guild, discordId, ROLE_NAMES.recluta);
}
