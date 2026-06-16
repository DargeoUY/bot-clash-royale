import cron from 'node-cron';
import { client } from '../discord';
import { syncClanData, syncCurrentWar } from '../services/clan-war.service';
import { getAllClanConfigs } from '../utils/guild';
import logger from '../config/logger';

let clanSyncTask: cron.ScheduledTask | null = null;
let warSyncTask: cron.ScheduledTask | null = null;

export function startSyncTasks(): void {
  clanSyncTask = cron.schedule('*/5 * * * *', async () => {
    logger.debug('Running clan sync for all clans (5min)...');
    const clans = await getAllClanConfigs();
    for (const { clanTag } of clans) {
      try {
        const result = await syncClanData(clanTag, client);
        logger.info(`Clan ${clanTag}: ${result.memberCount} members, +${result.changes.joined}/-${result.changes.left}`);
      } catch (error) {
        logger.error(`Clan sync failed for ${clanTag}:`, error);
      }
    }
  });

  warSyncTask = cron.schedule('*/5 * * * *', async () => {
    logger.debug('Running war sync for all clans (5min)...');
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

  logger.info('Sync tasks started: clan + war every 5min');
}

export function stopSyncTasks(): void {
  if (clanSyncTask) clanSyncTask.stop();
  if (warSyncTask) warSyncTask.stop();
  logger.info('Sync tasks stopped');
}
