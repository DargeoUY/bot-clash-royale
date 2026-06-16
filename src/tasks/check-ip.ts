import cron from 'node-cron';
import { client } from '../discord';
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

      const result = await checkAndUpdateIP(email, password, keyId);

      if (result.changed) {
        const guild = client.guilds.cache.first();
        if (guild) {
          const owner = await guild.fetchOwner().catch(() => null);
          if (owner) {
            const msg = result.updated
              ? `✅ IP actualizada automáticamente: **${result.newIP}**. La CR API key ya permite esta IP.`
              : `⚠️ Tu IP pública cambió a **${result.newIP}**.\n\nAndá a https://developer.clashroyale.com y actualizá la key, o configurá las credenciales de developer con \`/config\`.`;
            await owner.send(msg).catch(() => {});
          }
        }
      }
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
