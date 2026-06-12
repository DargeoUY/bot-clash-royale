import cron from 'node-cron';
import { exec } from 'child_process';
import { config } from '../config';
import logger from '../config/logger';
import path from 'path';
import fs from 'fs';

let task: cron.ScheduledTask | null = null;

export function startBackupTask(): void {
  task = cron.schedule('0 4 * * *', async () => {
    logger.info('Running database backup...');
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);
      const dbUrl = new URL(config.DATABASE_URL);

      const host = dbUrl.hostname;
      const port = dbUrl.port || '3306';
      const user = dbUrl.username;
      const password = decodeURIComponent(dbUrl.password);
      const database = decodeURIComponent(dbUrl.pathname.slice(1));

      const cmd = `mysqldump --single-transaction -h "${host}" -P ${port} -u "${user}" -p"${password}" "${database}" > "${backupFile}"`;

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
