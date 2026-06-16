import cron from 'node-cron';
import { client } from '../bot';
import { syncClanData, syncCurrentWar } from '../services/clan-war.service';
import { getAllClanConfigs } from '../utils/guild';
import logger from '../config/logger';

let clanSyncTask: cron.ScheduledTask | null = null;
let warSyncTask: cron.ScheduledTask | null = null;

export function startSyncTasks(): void {
  clanSyncTask = cron.schedule('0 * * * *', async () => {
    logger.debug('Running clan sync for all clans...');
    const clans = await getAllClanConfigs();
    for (const { clanTag } of clans) {
      try {
        const result = await syncClanData(clanTag, client);
        logger.info(`Clan ${clanTag}: ${result.totalMiembros} members, +${result.changes.joined}/-${result.changes.left}`);
      } catch (error) {
        logger.error(`Clan sync failed for ${clanTag}:`, error);
      }
    }
  });

  warSyncTask = cron.schedule('*/30 * * * *', async () => {
    logger.debug('Running war sync for all clans...');
    const clans = await getAllClanConfigs();
    for (const { clanTag } of clans) {
      try {
        await syncCurrentWar(clanTag);
        logger.debug(`War sync done: ${clanTag}`);
      } catch (error) {
        logger.error(`War sync failed for ${clanTag}:`, error);
      }
    }
  });

  logger.info('Sync tasks started: clan every 1h, war every 30min (multi-clan)');
}

export function stopSyncTasks(): void {
  if (clanSyncTask) clanSyncTask.stop();
  if (warSyncTask) warSyncTask.stop();
  logger.info('Sync tasks stopped');
}
