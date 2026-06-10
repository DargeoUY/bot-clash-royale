import cron from 'node-cron';
import { config } from '../config';
import { syncClanData, syncCurrentWar } from '../services/clan-war.service';
import logger from '../config/logger';

let clanSyncTask: cron.ScheduledTask | null = null;
let warSyncTask: cron.ScheduledTask | null = null;

function formatTag(tag: string): string {
  return tag.startsWith('#') ? tag : `#${tag}`;
}

export function startSyncTasks(): void {
  const clanTag = formatTag(config.CLAN_TAG);

  clanSyncTask = cron.schedule('0 * * * *', async () => {
    logger.debug('Running clan sync task...');
    try {
      await syncClanData(clanTag);
      logger.debug('Clan sync completed');
    } catch (error) {
      logger.error('Clan sync task failed:', error);
    }
  });

  warSyncTask = cron.schedule('*/30 * * * *', async () => {
    logger.debug('Running war sync task...');
    try {
      await syncCurrentWar(clanTag);
      logger.debug('War sync completed');
    } catch (error) {
      logger.error('War sync task failed:', error);
    }
  });

  logger.info(`Sync tasks started: clan every 1h, war every 30min (clan: ${clanTag})`);
}

export function stopSyncTasks(): void {
  if (clanSyncTask) {
    clanSyncTask.stop();
  }
  if (warSyncTask) {
    warSyncTask.stop();
  }
  logger.info('Sync tasks stopped');
}
