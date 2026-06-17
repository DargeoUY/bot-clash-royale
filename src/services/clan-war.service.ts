import { Client, TextChannel, EmbedBuilder, ChannelType } from 'discord.js';
import prisma from '../database/prisma';
import { getClanInfo, getClanMembers, getCurrentRiverRace } from '../api/clan';
import { CRApiError } from '../api/client';
import { detectMemberChanges } from './member-tracking.service';
import { EMBED_COLOR } from '../utils/embeds';
import logger from '../config/logger';

function parseSafeDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export async function syncClanData(
  clanTag: string,
  client?: Client,
): Promise<{ memberCount: number; changes: { joined: number; left: number; rejoined: number } }> {
  try {
    const clanInfo = await getClanInfo(clanTag);

    const clan = await prisma.clan.upsert({
      where: { tag: clanTag },
      update: {
        name: clanInfo.name,
        description: clanInfo.description,
        level: clanInfo.clanScore > 0 ? Math.floor(clanInfo.clanScore / 100) : undefined,
        totalMiembros: clanInfo.members,
      },
      create: {
        tag: clanTag,
        name: clanInfo.name,
        description: clanInfo.description,
        totalMiembros: clanInfo.members,
      },
    });

    logger.info(`Clan synced: ${clan.name} (${clan.totalMiembros} members)`);

    const members = await getClanMembers(clanTag);

    for (const member of members) {
      const lastSeen = parseSafeDate(member.lastSeen);
      if (!lastSeen) {
        logger.warn(`lastSeen inválido para ${member.name}: "${member.lastSeen}" (tipo=${typeof member.lastSeen})`);
      }

      await prisma.jugador.upsert({
        where: { tag: member.tag },
        update: {
          name: member.name,
          role: member.role,
          expLevel: member.expLevel,
          trophies: member.trophies,
          clanTag,
          status: 'active',
          ...(lastSeen ? { ultimaActividad: lastSeen } : {}),
        },
        create: {
          tag: member.tag,
          name: member.name,
          role: member.role,
          expLevel: member.expLevel,
          trophies: member.trophies,
          trofeosInicioSemana: member.trophies,
          trofeosInicioMes: member.trophies,
          clanTag,
          status: 'active',
          ...(lastSeen ? { ultimaActividad: lastSeen } : {}),
        },
      });
    }

    logger.info(`Clan members synced: ${members.length} players`);

    const changes = await detectMemberChanges(clanTag, members);

    if (client) {
      const guild = client.guilds.cache.first();
      if (guild) {
        await updateCategoryName(guild, members.length);
        await publishMemberChanges(client, guild.id, changes);
        await publishFirstSyncTest(client, guild.id);
      }
    }

    return {
      memberCount: members.length,
      changes: {
        joined: changes.joined.length,
        left: changes.left.length,
        rejoined: changes.rejoined.length,
      },
    };
  } catch (error) {
    if (error instanceof CRApiError) {
      logger.error(`CR API error syncing clan ${clanTag}: [${error.status}] ${error.message}`);
    } else {
      logger.error(`Unexpected error syncing clan ${clanTag}:`, error);
    }
    throw error;
  }
}

async function updateCategoryName(guild: import('discord.js').Guild, memberCount: number): Promise<void> {
  try {
    const category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name.startsWith('🏰'),
    );
    if (category) {
      const newName = `🏰 CLASH ROYALE · ${memberCount}/50`;
      if (category.name !== newName) {
        await category.setName(newName);
        logger.debug(`Category renamed to: ${newName}`);
      }
    }
  } catch (err) {
    logger.warn(`Could not update category name: ${(err as Error).message}`);
  }
}

async function publishMemberChanges(
  client: Client,
  guildId: string,
  changes: { joined: { tag: string; name: string; role: string }[]; left: { tag: string; name: string }[]; rejoined: { tag: string; name: string }[] },
): Promise<void> {
  if (changes.joined.length + changes.left.length + changes.rejoined.length === 0) return;

  const channelKey = `channel_members_${guildId}`;
  let cfg = await prisma.configuracionBot.findUnique({ where: { clave: channelKey } });

  if (!cfg) {
    cfg = await prisma.configuracionBot.findUnique({ where: { clave: `channel_alerts_${guildId}` } });
  }
  if (!cfg) return;

  try {
      const channel = (await client.channels.fetch(cfg.valor)) as TextChannel;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('📊 Cambios en el Clan')
      .setColor(EMBED_COLOR)
      .setTimestamp();

    const lines: string[] = [];
    for (const j of changes.joined) {
      lines.push(`🟢 **${j.name}** se unió al clan (${j.role})`);
    }
    for (const r of changes.rejoined) {
      lines.push(`🔵 **${r.name}** volvió al clan`);
    }
    for (const l of changes.left) {
      lines.push(`🔴 **${l.name}** salió del clan`);
    }

    embed.setDescription(lines.join('\n') || 'Sin cambios');

    if (changes.joined.length > 0 || changes.rejoined.length > 0) {
      embed.setFooter({ text: `+${changes.joined.length + changes.rejoined.length} ingresos | -${changes.left.length} bajas` });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.warn(`Could not publish member changes: ${(err as Error).message}`);
  }
}

async function publishFirstSyncTest(client: Client, guildId: string): Promise<void> {
  const alreadyDone = await prisma.configuracionBot.findUnique({
    where: { clave: `first_sync_done_${guildId}` },
  });
  if (alreadyDone) return;

  const channels = ['war', 'alerts', 'ranking'];
  for (const ch of channels) {
    const key = `channel_${ch}_${guildId}`;
    const cfg = await prisma.configuracionBot.findUnique({ where: { clave: key } });
    if (!cfg) continue;

    try {
    const channel = (await client.channels.fetch(cfg.valor)) as TextChannel;
      if (!channel) continue;

      const labels: Record<string, string> = {
        war: '⚔️ Reportes de guerra',
        alerts: '🚨 Alertas de inactividad',
        ranking: '🏆 Ranking y premios',
      };

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`✅ ${labels[ch] || ch}`)
            .setDescription(`Este canal está configurado correctamente.\nLos reportes automáticos se publicarán acá.`)
            .setColor(EMBED_COLOR),
        ],
      });
    } catch {
      // skip
    }
  }

  await prisma.configuracionBot.create({
    data: { clave: `first_sync_done_${guildId}`, valor: '1' },
  });
}

export async function syncCurrentWar(clanTag: string): Promise<void> {
  try {
    const race = await getCurrentRiverRace(clanTag);

    if (!race.clan || !race.periodLogs) return;

    const periodLog = race.periodLogs[0];
    if (!periodLog) return;

    const latestEntry = periodLog.items[0];
    if (!latestEntry || !latestEntry.standings) return;

    const existingWar = await prisma.registroGuerra.findFirst({
      where: {
        clanTag,
        idTemporada: String(latestEntry.seasonId),
        tipoGuerra: 'riverRace',
      },
    });

    if (existingWar) return;

    const clanStanding = latestEntry.standings.find(
      (s) => s.clan.tag === clanTag,
    );

    const warLog = await prisma.registroGuerra.create({
      data: {
        clanTag,
        idTemporada: String(latestEntry.seasonId),
        tipoGuerra: 'riverRace',
        startDate: new Date(race.periodLogs[0].periodIndex > 0 ? '' : new Date()),
        endDate: new Date(),
        participantes: clanStanding?.clan.participants.length,
        fame: clanStanding?.clan.fame,
      },
    });

    if (clanStanding) {
      for (const participant of clanStanding.clan.participants) {
        const existingParticipant = await prisma.participanteGuerra.findFirst({
          where: { idRegistroGuerra: warLog.id, tagJugador: participant.tag },
        });

        if (!existingParticipant) {
          await prisma.participanteGuerra.create({
            data: {
              idRegistroGuerra: warLog.id,
              tagJugador: participant.tag,
              fame: participant.fame,
              puntosReparacion: participant.repairPoints,
              barcosAtacados: participant.boatAttacks,
              mazosUsados: participant.decksUsed,
              mazosUsadosHoy: participant.decksUsedToday,
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
