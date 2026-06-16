import cron from 'node-cron';
import { Client } from 'discord.js';
import prisma from '../database/prisma';
import logger from '../config/logger';

let task: cron.ScheduledTask | null = null;

export function startRoleUpdater(client: Client): void {
  task = cron.schedule('0 */12 * * *', async () => {
    logger.debug('Updating roles...');
    try {
      const guild = client.guilds.cache.first();
      if (!guild) return;

      const activoKey = `role_activo_${guild.id}`;
      const activoCfg = await prisma.configuracionBot.findUnique({ where: { key: activoKey } });
      if (!activoCfg) return;

      const activoRole = guild.roles.cache.get(activoCfg.value);
      if (!activoRole) return;

      const players = await prisma.jugador.findMany({
        where: { isRegistered: true, discordId: { not: null } },
      });

      for (const player of players) {
        if (!player.idDiscord) continue;
        try {
          const member = await guild.members.fetch(player.idDiscord);
          const isActive = player.ultimaActividad &&
            (Date.now() - player.ultimaActividad.getTime()) / (1000 * 60 * 60 * 24) < 3;

          if (isActive && !member.roles.cache.has(activoRole.id)) {
            await member.roles.add(activoRole);
          } else if (!isActive && member.roles.cache.has(activoRole.id)) {
            await member.roles.remove(activoRole);
          }
        } catch {
          // Member not in guild or other error
        }
      }

      logger.debug('Roles updated');
    } catch (error) {
      logger.error('Role updater failed:', error);
    }
  });

  logger.info('Role updater started (every 12h)');
}

export function stopRoleUpdater(): void {
  if (task) task.stop();
}
