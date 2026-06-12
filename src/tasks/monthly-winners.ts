import cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import prisma from '../database/prisma';
import { getAllClanConfigs } from '../utils/guild';
import { isTelegramConfigured, sendTelegramRanking } from '../services/telegram.service';
import { EMBED_COLOR } from '../utils/embeds';
import logger from '../config/logger';

let monthlyTask: cron.ScheduledTask | null = null;

export async function publishMonthlyWinners(
  client: Client,
  clanTag: string,
  guildId: string,
): Promise<void> {
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // January = 1 in DB
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const rows = await prisma.acumuladoMensual.findMany({
    where: { clanTag, mes: prevMonth, anio: year },
  });
  if (rows.length === 0) {
    logger.info(`No monthly stats for ${clanTag} (${prevMonth}/${year})`);
    return;
  }

  const players = await prisma.player.findMany({
    where: { tag: { in: rows.map(r => r.playerTag) } },
    select: { tag: true, name: true },
  });
  const nameMap = new Map(players.map(p => [p.tag, p.name]));

  const acc = rows.map(r => ({
    tag: r.playerTag,
    name: nameMap.get(r.playerTag) || r.playerTag,
    trophies: r.trofeos,
    fame: r.fama,
  }));

  const byTrophies = [...acc].filter(e => e.trophies > 0).sort((a, b) => b.trophies - a.trophies).slice(0, 10);
  const byFame = [...acc].filter(e => e.fame > 0).sort((a, b) => b.fame - a.fame).slice(0, 10);
  if (byTrophies.length === 0 && byFame.length === 0) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const prevMonthDate = new Date(year, prevMonth - 1, 1);
  const monthName = prevMonthDate.toLocaleString('es', { month: 'long', year: 'numeric' });

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Ranking Mensual — ${monthName}`)
    .setColor(EMBED_COLOR)
    .setDescription('Estos son los campeones del mes pasado:')
    .setFooter({ text: '¡Felicitaciones!' })
    .setTimestamp();

  const medal = (i: number) => i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`;

  if (byTrophies.length > 0) {
    const lines = byTrophies.map((e, i) => `**${medal(i)} ${e.name}** — +${e.trophies} copas`);
    const half = Math.ceil(lines.length / 2);
    embed.addFields(
      { name: '🏆 Mayor Cantidad de Copas', value: lines.slice(0, half).join('\n') || '—', inline: true },
      { name: '\u200b', value: lines.slice(half).join('\n') || '—', inline: true },
    );
  }

  if (byFame.length > 0) {
    const lines = byFame.map((e, i) => `**${medal(i)} ${e.name}** — ${e.fame} fama`);
    const half = Math.ceil(lines.length / 2);
    embed.addFields(
      { name: '⚔️ Participación en Guerra', value: lines.slice(0, half).join('\n') || '—', inline: true },
      { name: '\u200b', value: lines.slice(half).join('\n') || '—', inline: true },
    );
  }

  if (isTelegramConfigured()) {
    let tgText = `<b>🏆 Ranking Mensual — ${monthName}</b>\n\n`;
    if (byTrophies.length > 0) {
      tgText += '<b>🏆 Copas</b>\n';
      for (let i = 0; i < Math.min(byTrophies.length, 5); i++) {
        tgText += `${['🥇','🥈','🥉'][i] || `${i+1}`} <b>${byTrophies[i].name}</b> — +${byTrophies[i].trophies}\n`;
      }
      tgText += '\n';
    }
    if (byFame.length > 0) {
      tgText += '<b>⚔️ Guerra</b>\n';
      for (let i = 0; i < Math.min(byFame.length, 5); i++) {
        tgText += `${['🥇','🥈','🥉'][i] || `${i+1}`} <b>${byFame[i].name}</b> — ${byFame[i].fame} fama\n`;
      }
    }
    await sendTelegramRanking(tgText);
  }

  const channelCfg = await prisma.botConfig.findUnique({ where: { key: `channel_ranking_${guildId}` } });
  if (channelCfg) {
    try {
      const channel = (await client.channels.fetch(channelCfg.value)) as TextChannel;
      if (channel) await channel.send({ embeds: [embed] });
    } catch { /* ok */ }
  }

  await prisma.acumuladoMensual.deleteMany({ where: { clanTag, mes: prevMonth, anio: year } });
  logger.info(`Monthly winners published for ${clanTag} and accumulator reset`);
}

export async function addToMonthlyAccumulator(
  clanTag: string,
  entries: { tag: string; name: string; trophies: number; fame: number }[],
): Promise<void> {
  const now = new Date();
  const mes = now.getMonth() + 1;
  const anio = now.getFullYear();

  for (const e of entries) {
    const where = { playerTag_mes_anio: { playerTag: e.tag, mes, anio } };
    const existing = await prisma.acumuladoMensual.findUnique({ where });
    if (existing) {
      await prisma.acumuladoMensual.update({
        where,
        data: { trofeos: { increment: e.trophies }, fama: { increment: e.fame } },
      });
    } else {
      await prisma.acumuladoMensual.create({
        data: { playerTag: e.tag, mes, anio, clanTag, trofeos: e.trophies, fama: e.fame },
      });
    }
  }
}

export function startMonthlyWinners(client: Client): void {
  monthlyTask = cron.schedule('0 12 1 * *', async () => {
    logger.info('Monthly winners task: starting...');
    const clans = await getAllClanConfigs();
    for (const { clanTag, guildId } of clans) {
      try { await publishMonthlyWinners(client, clanTag, guildId); }
      catch (err) { logger.error(`Monthly winners failed for ${clanTag}: ${(err as Error).message}`); }
    }
  });
  logger.info('Monthly winners task started (1st of month at 12:00 PM UTC)');
}

export function stopMonthlyWinners(): void {
  if (monthlyTask) monthlyTask.stop();
}