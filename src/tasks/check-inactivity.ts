import cron from 'node-cron';
import { client } from '../bot';
import { config } from '../config';
import { checkInactivity } from '../services/inactivity.service';
import { notifyInactivePlayer, notifyInactivityChannel } from '../services/notification.service';
import { processExpiredVacations } from '../services/vacation.service';
import logger from '../config/logger';

let task: cron.ScheduledTask | null = null;

export function startInactivityCheck(): void {
  task = cron.schedule('0 */6 * * *', async () => {
    logger.debug('Running inactivity check...');
    try {
      await processExpiredVacations();

      const guild = client.guilds.cache.first();
      const results = await checkInactivity(config.CLAN_TAG, guild?.id || null);

      for (const player of results) {
        await notifyInactivePlayer(client, player);
      }

      if (guild) {
        await notifyInactivityChannel(client, guild.id, results);
      }

      logger.info(`Inactivity check done: ${results.length} flagged`);
    } catch (error) {
      logger.error('Inactivity check failed:', error);
    }
  });

  logger.info('Inactivity check task started (every 6h)');
}

export function stopInactivityCheck(): void {
  if (task) {
    task.stop();
    logger.info('Inactivity check task stopped');
  }
}
