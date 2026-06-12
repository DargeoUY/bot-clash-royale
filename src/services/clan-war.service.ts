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
    if (!isNaN(d.getTime())) return d;
    const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/);
    if (m) {
      const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7] || '000'}Z`;
      const parsed = new Date(iso);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
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

    // Detect changes BEFORE upserting (so we can compare with pre-existing DB state)
    const changes = await detectMemberChanges(clanTag, members);

    for (const member of members) {
      const lastSeen = parseSafeDate(member.lastSeen);

      await prisma.player.upsert({
        where: { tag: member.tag },
        update: {
          name: member.name,
          role: member.role,
          expLevel: member.expLevel,
          trophies: member.trophies,
          clanTag,
          status: 'active',
          ...(lastSeen ? { lastActiveAt: lastSeen } : {}),
        },
        create: {
          tag: member.tag,
          name: member.name,
          role: member.role,
          expLevel: member.expLevel,
          trophies: member.trophies,
          clanTag,
          status: 'active',
          ...(lastSeen ? { lastActiveAt: lastSeen } : {}),
        },
      });
    }

    logger.info(`Clan members synced: ${members.length} players`);

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
  let cfg = await prisma.botConfig.findUnique({ where: { key: channelKey } });

  if (!cfg) {
    cfg = await prisma.botConfig.findUnique({ where: { key: `channel_alerts_${guildId}` } });
  }
  if (!cfg) return;

  try {
    const channel = (await client.channels.fetch(cfg.value)) as TextChannel;
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
  const alreadyDone = await prisma.botConfig.findUnique({
    where: { key: `first_sync_done_${guildId}` },
  });
  if (alreadyDone) return;

  const channels = ['war', 'alerts', 'ranking'];
  for (const ch of channels) {
    const key = `channel_${ch}_${guildId}`;
    const cfg = await prisma.botConfig.findUnique({ where: { key } });
    if (!cfg) continue;

    try {
      const channel = (await client.channels.fetch(cfg.value)) as TextChannel;
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

  await prisma.botConfig.create({
    data: { key: `first_sync_done_${guildId}`, value: '1' },
  });
}

export async function syncCurrentWar(clanTag: string): Promise<void> {
  try {
    const race = await getCurrentRiverRace(clanTag);

    if (!race.clan || !race.periodLogs) return;

    const periodLog = race.periodLogs[0];
    if (!periodLog) return;

    const latestEntry = periodLog.items[0];
    if (!latestEntry) return;

    const clanStanding = latestEntry.standings.find(
      (s) => s.clan.tag === clanTag,
    );

    const existingWar = await prisma.warLog.findFirst({
      where: {
        clanTag,
        seasonId: String(latestEntry.seasonId),
        warType: 'riverRace',
      },
    });

    if (existingWar) {
      if (clanStanding) {
        await prisma.warLog.update({
          where: { id: existingWar.id },
          data: {
            participants: clanStanding.clan.participants.length,
            fame: clanStanding.clan.fame,
          },
        });

        for (const participant of clanStanding.clan.participants) {
          await prisma.warParticipant.upsert({
            where: { warLogId_playerTag: { warLogId: existingWar.id, playerTag: participant.tag } },
            update: {
              fame: participant.fame,
              repairPoints: participant.repairPoints,
              boatsAttacked: participant.boatAttacks,
              decksUsed: participant.decksUsed,
              decksUsedToday: participant.decksUsedToday,
            },
            create: {
              warLogId: existingWar.id,
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
      logger.debug(`War updated: season ${latestEntry.seasonId}, ${clanStanding?.clan?.participants?.length ?? 0} participants`);
      return;
    }

    const startDate = parseSafeDate(race.periodLogs[0]?.startTime) ?? parseSafeDate(latestEntry.createdDate) ?? new Date();

    const warLog = await prisma.warLog.create({
      data: {
        clanTag,
        seasonId: String(latestEntry.seasonId),
        warType: 'riverRace',
        startDate,
        endDate: null,
        participants: clanStanding?.clan?.participants?.length ?? 0,
        fame: clanStanding?.clan?.fame ?? 0,
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

    logger.info(`War synced: season ${latestEntry.seasonId}, ${clanStanding?.clan?.participants?.length ?? 0} participants`);

  } catch (error) {
    if (error instanceof CRApiError && error.status === 404) {
      logger.debug(`No active war for clan ${clanTag}`);
      return;
    }
    logger.error(`Error syncing war for clan ${clanTag}:`, error);
  }
}
