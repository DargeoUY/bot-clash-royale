import cron from 'node-cron';
import { spawn } from 'child_process';
import { mkdir, unlink } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { config } from '../config';
import logger from '../config/logger';
let task: cron.ScheduledTask | null = null;
export async function backupDatabase(): Promise<void> {
  const url = new URL(config.DATABASE_URL);
  await mkdir('backups', { recursive: true, mode: 0o700 });
  const file = path.join('backups', `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
  // No shell and no password in argv. Backup targets the MariaDB/MySQL database actually in use.
  const child = spawn('mariadb-dump', ['--single-transaction', '--skip-lock-tables', '--host', url.hostname,
    '--port', url.port || '3306', '--user', decodeURIComponent(url.username), decodeURIComponent(url.pathname.slice(1))],
    { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.resume();
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error('Database backup failed')));
  });
  try {
    await Promise.all([pipeline(child.stdout, createWriteStream(file, { mode: 0o600, flags: 'wx' })), completion]);
    logger.info('Respaldo de base de datos finalizado.');
  } catch (error) { child.kill(); await unlink(file).catch(() => {}); throw error; }
}
export function startBackupTask(): void {
  task = cron.schedule('0 4 * * *', () => { backupDatabase().catch(() => logger.error('Falló respaldo de base de datos')); });
}
export function stopBackupTask(): void { task?.stop(); }
