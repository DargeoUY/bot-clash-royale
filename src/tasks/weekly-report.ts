import cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import prisma from '../database/prisma';
import { config } from '../config';
import { getLeaderboard } from '../services/points.service';
import { EMBED_COLOR } from '../utils/embeds';
import logger from '../config/logger';

let weeklyTask: cron.ScheduledTask | null = null;

export function startReportTasks(client: Client): void {
  weeklyTask = cron.schedule('0 0 * * 1', async () => {
    logger.info('Generating weekly report...');
    await publishWeeklyReport(client);
  });

  logger.info('Report tasks started');
}

export function stopReportTasks(): void {
  if (weeklyTask) weeklyTask.stop();
}

async function publishWeeklyReport(client: Client): Promise<void> {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channelKey = `channel_war_${guild.id}`;
  const cfg = await prisma.configuracionBot.findUnique({ where: { key: channelKey } });
  if (!cfg) return;

  try {
    const channel = (await client.channels.fetch(cfg.value)) as TextChannel;
    if (!channel) return;

    const leaderboard = await getLeaderboard(config.CLAN_TAG, 'semanal');

    const embed = new EmbedBuilder()
      .setTitle('📊 Reporte Semanal de Guerra')
      .setColor(EMBED_COLOR)
      .setTimestamp();

    if (leaderboard.length > 0) {
      let description = '';
      for (let i = 0; i < Math.min(leaderboard.length, 10); i++) {
        const p = leaderboard[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        description += `${medal} **${p.name}** — ${p.points} pts\n`;
      }
      embed.setDescription(description);

      if (leaderboard[0]) {
        embed.addFields({
          name: '🏆 MVP de la Semana',
          value: `**${leaderboard[0].name}** con ${leaderboard[0].points} puntos`,
        });
      }
    } else {
      embed.setDescription('Sin datos de guerra esta semana.');
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.error('Error publishing weekly report:', error);
  }
}
