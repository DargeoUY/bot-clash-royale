import cron from 'node-cron';
import { Client } from 'discord.js';
import prisma from '../database/prisma';
import { assignRecluta } from '../services/role-manager.service';
import logger from '../config/logger';

let task: cron.ScheduledTask | null = null;

export function startRoleUpdater(client: Client): void {
  task = cron.schedule('*/10 * * * *', async () => {
    logger.debug('Updating roles...');
    try {
      const guild = client.guilds.cache.first();
      if (!guild) return;

      const configs = await prisma.configuracionBot.findMany({
        where: {
          clave: { startsWith: `role_` },
          OR: [{ clave: `role_recluta_${guild.id}` }],
        },
      });
      const reclutaRoleId = configs.find((c) => c.clave === `role_recluta_${guild.id}`)?.valor;
      if (!reclutaRoleId) return;
      const reclutaRole = guild.roles.cache.get(reclutaRoleId);
      if (!reclutaRole) return;

      const unregistered = await prisma.jugador.findMany({
        where: { registrado: true, idDiscord: { not: null } },
      });
      for (const player of unregistered) {
        if (!player.idDiscord) continue;
        try {
          const member = await guild.members.fetch(player.idDiscord);
          if (!member.roles.cache.has(reclutaRole.id)) {
            await member.roles.add(reclutaRole);
          }
        } catch {
          // skip
        }
      }
      logger.debug('Roles updated');
    } catch (error) {
      logger.error('Role updater failed:', error);
    }
  });
  logger.info('Role updater started (every 10 min)');
}

export function stopRoleUpdater(): void {
  if (task) task.stop();
}
