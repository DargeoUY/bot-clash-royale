import cron from 'node-cron';
import { client } from '../discord';
import { checkInactivity } from '../services/inactivity.service';
import { notifyInactivePlayer, notifyInactivityChannel } from '../services/notification.service';
import { processExpiredVacations } from '../services/vacation.service';
import { getAllClanConfigs } from '../utils/guild';
import logger from '../config/logger';

let task: cron.ScheduledTask | null = null;

export function startInactivityCheck(): void {
  task = cron.schedule('0 */6 * * *', async () => {
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
        } catch (err) {
          logger.error(`Inactivity check failed for ${clanTag}:`, err);
        }
      }

      logger.info(`Inactivity check done`);
    } catch (error) {
      logger.error('Inactivity check failed:', error);
    }
  });

  logger.info('Inactivity check started (every 6h, multi-clan)');
}

export function stopInactivityCheck(): void {
  if (task) task.stop();
}
