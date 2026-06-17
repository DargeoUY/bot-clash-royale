import cron from 'node-cron';
import { Client } from 'discord.js';
import { generateMonthlyReport, resetMonthlyBaseline } from '../services/ranking.service';
import { getAllClanConfigs } from '../utils/guild';
import { broadcastToGuild } from '../services/cross-platform.service';
import logger from '../config/logger';

let monthlyTask: cron.ScheduledTask | null = null;

export function startMonthlyRanking(client: Client): void {
  monthlyTask = cron.schedule('0 9 1 * *', async () => {
    logger.info('Generando ranking mensual...');
    const clans = await getAllClanConfigs();
    for (const { clanTag, guildId } of clans) {
      try {
        const report = await generateMonthlyReport(clanTag);
        await broadcastToGuild(guildId, report);
        await resetMonthlyBaseline(clanTag);
      } catch (err) {
        logger.error(`Monthly ranking failed for ${clanTag}:`, err);
      }
    }
  });
  logger.info('Monthly ranking task started (1st of month 9:00)');
}

export function stopMonthlyRanking(): void {
  if (monthlyTask) monthlyTask.stop();
}
