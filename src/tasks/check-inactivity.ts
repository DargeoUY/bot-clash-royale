import cron from 'node-cron';
import { Client } from 'discord.js';
import { checkInactivity } from '../services/inactivity.service';
import { notifyInactivePlayer, notifyInactivityChannel, notifyDailyInactivitySummary, assignInactivityRoles } from '../services/notification.service';
import { processExpiredVacations } from '../services/vacation.service';
import { getAllClanConfigs } from '../utils/guild';
import logger from '../config/logger';

let checkTask: cron.ScheduledTask | null = null;
let dailyTask: cron.ScheduledTask | null = null;

async function runInactivityCheck(client: Client): Promise<void> {
  logger.debug('Running inactivity check for all clans...');
  try {
    await processExpiredVacations();

    const clans = await getAllClanConfigs();
    for (const { clanTag, guildId } of clans) {
      try {
        const results = await checkInactivity(clanTag, guildId);
        for (const player of results) {
          await notifyInactivePlayer(client, player);
        }
        await notifyInactivityChannel(client, guildId, results);
        await assignInactivityRoles(client, guildId, results);
      } catch (err) {
        logger.error(`Inactivity check failed for ${clanTag}:`, err);
      }
    }

    logger.info('Inactivity check done');
  } catch (error) {
    logger.error('Inactivity check failed:', error);
  }
}

export function startInactivityCheck(client: Client): void {
  checkTask = cron.schedule('0 */6 * * *', () => runInactivityCheck(client));
  dailyTask = cron.schedule('0 8 * * *', async () => {
    logger.info('Running daily inactivity report...');
    try {
      await processExpiredVacations();
      const clans = await getAllClanConfigs();
      for (const { clanTag, guildId } of clans) {
        try {
          const results = await checkInactivity(clanTag, guildId);
          await notifyDailyInactivitySummary(client, guildId, results);
          await assignInactivityRoles(client, guildId, results);
        } catch (err) {
          logger.error(`Daily inactivity report failed for ${clanTag}:`, err);
        }
      }
    } catch (error) {
      logger.error('Daily inactivity report failed:', error);
    }
  });

  logger.info('Inactivity check started (every 6h + daily report at 8:00)');
}

export function stopInactivityCheck(): void {
  if (checkTask) checkTask.stop();
  if (dailyTask) dailyTask.stop();
}
