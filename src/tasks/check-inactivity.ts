import cron from 'node-cron';
import { Client } from 'discord.js';
import { checkInactivity } from '../services/inactivity.service';
import { notifyDailyInactivitySummary } from '../services/notification.service';
import { processExpiredVacations } from '../services/vacation.service';
import { getAllClanConfigs } from '../utils/guild';
import logger from '../config/logger';

let dailyTask: cron.ScheduledTask | null = null;

export function startInactivityCheck(client: Client): void {
  dailyTask = cron.schedule('0 8 * * *', async () => {
    logger.info('Running daily inactivity report...');
    try {
      await processExpiredVacations();
      const clans = await getAllClanConfigs();
      for (const { clanTag, guildId } of clans) {
        try {
          const results = await checkInactivity(clanTag, guildId);
          await notifyDailyInactivitySummary(client, guildId, results);
        } catch (err) {
          logger.error(`Daily inactivity report failed for ${clanTag}:`, err);
        }
      }
    } catch (error) {
      logger.error('Daily inactivity report failed:', error);
    }
  }, { timezone: 'America/Montevideo' });

  logger.info('Daily inactivity report scheduled at 8:00 AM (UTC-3)');
}

export function stopInactivityCheck(): void {
  if (dailyTask) dailyTask.stop();
}
