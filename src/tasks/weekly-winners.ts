import cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import prisma from '../database/prisma';
import { getAllClanConfigs } from '../utils/guild';
import { isTelegramConfigured, sendTelegramRanking } from '../services/telegram.service';
import { EMBED_COLOR } from '../utils/embeds';
import logger from '../config/logger';

interface WeeklyWinner {
  name: string;
  tag: string;
  value: string;
  roleKey: string;
  roleName: string;
}

let winnerTask: cron.ScheduledTask | null = null;

export async function publishWeeklyWinners(
  client: Client,
  clanTag: string,
  guildId: string,
): Promise<void> {
  const accKey = `weekly_acc_${clanTag}`;
  const cfg = await prisma.botConfig.findUnique({ where: { key: accKey } });
  if (!cfg) {
    logger.info(`No weekly stats for ${clanTag} yet`);
    return;
  }

  interface AccEntry { tag: string; name: string; wins: number; losses: number; donations: number; trophies: number; fame: number; }
  let acc: AccEntry[];
  try {
    acc = JSON.parse(cfg.value);
  } catch { return; }

  const categories: { key: string; sort: (a: AccEntry, b: AccEntry) => number; label: string; roleKey: string; roleName: string; format: (e: AccEntry) => string }[] = [
    {
      key: 'v_d',
      sort: (a, b) => {
        const wrA = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0;
        const wrB = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0;
        return wrB - wrA || (b.wins - a.wins);
      },
      label: '⚔️ Victorias / Derrotas',
      roleKey: 'campeon',
      roleName: '🏆 Campeón del Mes',
      format: (e) => `${e.wins}V / ${e.losses}D`,
    },
    {
      key: 'donaciones',
      sort: (a, b) => b.donations - a.donations,
      label: '💎 Donaciones de Cartas',
      roleKey: 'donador',
      roleName: '💎 Donador Legendario',
      format: (e) => `${e.donations} cartas`,
    },
    {
      key: 'copas',
      sort: (a, b) => b.trophies - a.trophies,
      label: '🏆 Mayor Cantidad de Copas',
      roleKey: 'copas',
      roleName: '🏆 Rey de Copas',
      format: (e) => `${e.trophies >= 0 ? '+' : ''}${e.trophies} copas`,
    },
    {
      key: 'guerra',
      sort: (a, b) => b.fame - a.fame,
      label: '⚔️ Guerra de Clanes',
      roleKey: 'guerrero',
      roleName: '⚔️ Guerrero Élite',
      format: (e) => `${e.fame} fama`,
    },
  ];

  const winners: WeeklyWinner[] = [];

  for (const cat of categories) {
    const sorted = [...acc].filter((e) => {
      if (cat.key === 'v_d') return (e.wins + e.losses) > 0;
      if (cat.key === 'donaciones') return e.donations > 0;
      if (cat.key === 'copas') return true;
      if (cat.key === 'guerra') return e.fame > 0;
      return false;
    }).sort(cat.sort);

    if (sorted.length > 0) {
      winners.push({
        name: sorted[0].name,
        tag: sorted[0].tag,
        value: cat.format(sorted[0]),
        roleKey: cat.roleKey,
        roleName: cat.roleName,
      });
    }
  }

  if (winners.length === 0) return;

  // Get guild
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  // Remove old winner roles
  for (const w of winners) {
    const roleCfg = await prisma.botConfig.findUnique({
      where: { key: `role_${w.roleKey}_${guildId}` },
    });
    if (!roleCfg) continue;
    const role = guild.roles.cache.get(roleCfg.value);
    if (!role) continue;

    // Remove role from all members who have it
    for (const [, member] of role.members) {
      try {
        await member.roles.remove(role);
        logger.info(`Removed ${w.roleName} from ${member.user.tag}`);
      } catch (err) {
        logger.warn(`Could not remove role from ${member.user.tag}: ${(err as Error).message}`);
      }
    }
  }

  // Assign new winner roles
  const embed = new EmbedBuilder()
    .setTitle('🏆 Ganadores de la Semana')
    .setColor(EMBED_COLOR)
    .setDescription('¡Felicitaciones a los campeones de esta semana!')
    .setFooter({ text: 'Roles asignados por 1 semana' })
    .setTimestamp();

  for (const w of winners) {
    // Find player by tag to get discordId
    const player = await prisma.player.findUnique({ where: { tag: w.tag } });
    if (!player?.discordId) {
      embed.addFields({ name: w.roleName, value: `**${w.name}** — ${w.value}\n⚠️ No vinculado a Discord` });
      continue;
    }

    const roleCfg = await prisma.botConfig.findUnique({
      where: { key: `role_${w.roleKey}_${guildId}` },
    });
    if (!roleCfg) continue;

    try {
      const member = await guild.members.fetch(player.discordId);
      const role = guild.roles.cache.get(roleCfg.value);
      if (member && role) {
        await member.roles.add(role);
        logger.info(`Assigned ${w.roleName} to ${member.user.tag}`);
      }
    } catch (err) {
      logger.warn(`Could not assign role to ${player.discordId}: ${(err as Error).message}`);
    }

    embed.addFields({ name: w.roleName, value: `**${w.name}** — ${w.value}` });
    }

    // Send to Telegram
    if (isTelegramConfigured()) {
      let tgText = '<b>🏆 Ganadores de la Semana</b>\n\n';
      for (const w of winners) {
        tgText += `${w.roleName}: <b>${w.name}</b> — ${w.value}\n`;
      }
      await sendTelegramRanking(tgText);
    }

    // Post to ranking channel
  const channelCfg = await prisma.botConfig.findUnique({
    where: { key: `channel_ranking_${guildId}` },
  });
  if (channelCfg) {
    try {
      const channel = (await client.channels.fetch(channelCfg.value)) as TextChannel;
      if (channel) await channel.send({ embeds: [embed] });
    } catch { /* ok */ }
  }

  // Reset weekly accumulator
  await prisma.botConfig.delete({ where: { key: accKey } });
  logger.info(`Weekly winners published for ${clanTag} and accumulator reset`);
}

// Called by daily ranking to add today's stats to the weekly accumulator
export async function addToWeeklyAccumulator(
  clanTag: string,
  entries: { tag: string; name: string; wins: number; losses: number; donations: number; trophies: number; fame: number }[],
): Promise<void> {
  const accKey = `weekly_acc_${clanTag}`;
  const existing = await prisma.botConfig.findUnique({ where: { key: accKey } });

  interface AccEntry { tag: string; name: string; wins: number; losses: number; donations: number; trophies: number; fame: number; }
  let acc: AccEntry[] = [];
  if (existing) {
    try { acc = JSON.parse(existing.value); } catch { acc = []; }
  }

  const map = new Map(acc.map((e) => [e.tag, e]));
  for (const e of entries) {
    const prev = map.get(e.tag);
    if (prev) {
      prev.wins += e.wins;
      prev.losses += e.losses;
      prev.donations += e.donations;
      prev.trophies += e.trophies;
      prev.fame += e.fame;
      prev.name = e.name;
    } else {
      map.set(e.tag, { ...e });
    }
  }

  await prisma.botConfig.upsert({
    where: { key: accKey },
    update: { value: JSON.stringify([...map.values()]) },
    create: { key: accKey, value: JSON.stringify([...map.values()]) },
  });
}

export function startWeeklyWinners(client: Client): void {
  // Every Monday at 10:00 AM UTC
  winnerTask = cron.schedule('0 10 * * 1', async () => {
    logger.info('Weekly winners task: starting...');
    const clans = await getAllClanConfigs();
    for (const { clanTag, guildId } of clans) {
      try {
        await publishWeeklyWinners(client, clanTag, guildId);
      } catch (err) {
        logger.error(`Weekly winners failed for ${clanTag}: ${(err as Error).message}`);
      }
    }
  });

  logger.info('Weekly winners task started (Mondays at 10:00 AM UTC)');
}

export function stopWeeklyWinners(): void {
  if (winnerTask) winnerTask.stop();
}
