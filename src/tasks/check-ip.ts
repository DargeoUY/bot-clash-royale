import cron from 'node-cron';
import { checkAndUpdateIP } from '../services/ip-updater.service';
import logger from '../config/logger';

let task: cron.ScheduledTask | null = null;

export function startIPChecker(): void {
  task = cron.schedule('*/10 * * * *', async () => {
    logger.debug('Checking IP...');
    try {
      const email = process.env.CR_DEV_EMAIL;
      const password = process.env.CR_DEV_PASSWORD;
      const keyId = process.env.CR_API_KEY_ID;

      await checkAndUpdateIP(email, password, keyId);
    } catch (error) {
      logger.error('IP check failed:', error);
    }
  });

  logger.info('IP checker started (every 10 min)');
}

export function stopIPChecker(): void {
  if (task) {
    task.stop();
    logger.info('IP checker stopped');
  }
}
