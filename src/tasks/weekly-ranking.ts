import cron from 'node-cron';
import { Client } from 'discord.js';
import { generateWeeklyReport } from '../services/ranking.service';
import { getAllClanConfigs } from '../utils/guild';
import { broadcastToGuild } from '../services/cross-platform.service';
import logger from '../config/logger';

let weeklyTask: cron.ScheduledTask | null = null;

export function startWeeklyRanking(client: Client): void {
  weeklyTask = cron.schedule('0 8 * * 1', async () => {
    logger.info('Generando ranking semanal...');
    const clans = await getAllClanConfigs();
    for (const { clanTag, guildId } of clans) {
      try {
        const report = await generateWeeklyReport(clanTag);
        await broadcastToGuild(guildId, report);
      } catch (err) {
        logger.error(`Weekly ranking failed for ${clanTag}:`, err);
      }
    }
  });
  logger.info('Weekly ranking task started (Mon 8:00)');
}

export function stopWeeklyRanking(): void {
  if (weeklyTask) weeklyTask.stop();
}
