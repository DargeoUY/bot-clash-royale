import cron from 'node-cron';
import { exec } from 'child_process';
import { config } from '../config';
import logger from '../config/logger';
import path from 'path';

let task: cron.ScheduledTask | null = null;

export function startBackupTask(): void {
  task = cron.schedule('0 4 * * *', async () => {
    logger.info('Running database backup...');
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(process.cwd(), 'backups', `backup-${timestamp}.sql`);
      const dbUrl = config.DATABASE_URL;

      const cmd = `pg_dump "${dbUrl}" > "${backupFile}"`;

      exec(cmd, (error) => {
        if (error) {
          logger.error('Backup failed:', error);
        } else {
          logger.info(`Backup saved: ${backupFile}`);
        }
      });
    } catch (error) {
      logger.error('Backup task error:', error);
    }
  });

  logger.info('Backup task started (daily at 4:00 AM)');
}

export function stopBackupTask(): void {
  if (task) task.stop();
}
