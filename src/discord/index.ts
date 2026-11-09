import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from '../config';
import logger from '../config/logger';
import { stopSyncTasks } from '../tasks/sync-clan';
import { stopInactivityCheck } from '../tasks/check-inactivity';
import { stopReportTasks } from '../tasks/weekly-report';
import { stopMonthlyTasks } from '../tasks/monthly-report';
import { stopRoleUpdater } from '../tasks/update-roles';
import { stopBackupTask } from '../tasks/backup-database';
import { stopIPChecker } from '../tasks/check-ip';
import { stopWeeklyRanking } from '../tasks/weekly-ranking';
import { stopMonthlyRanking } from '../tasks/monthly-ranking';
import { handleInteraction } from './events/interactionCreate';
import { crGet } from '../api/client';

import { setDiscordClient } from '../services/cross-platform.service';


async function testApiConnection(): Promise<void> {

  logger.info(`Config -> CR_API_BASE_URL: ${config.CR_API_BASE_URL}`);

  try {
    const result = await crGet<object>(`/clans/${encodeURIComponent(config.CLAN_TAG)}`);
    const name = (result as { name?: string }).name || 'unknown';
    logger.info(`API OK -> Clan "${name}" conectado via ${config.CR_API_BASE_URL}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`API FAILED -> ${config.CR_API_BASE_URL} | ${msg}`);
    logger.error('Crear nueva API key en https://developer.clashroyale.com');
  }
}

export const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

setDiscordClient(client);

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Bot conectado como ${readyClient.user.tag}`);
  logger.info(`Sirviendo ${readyClient.guilds.cache.size} servidores`);
  await testApiConnection();

  client.user?.setActivity('/ayuda | Clash Royale', { type: 3 });


});

client.on(Events.GuildCreate, (guild) => {
  logger.info(`Bot añadido al servidor: ${guild.name} (${guild.id})`);
});

client.on(Events.Error, (error) => {
  logger.error('Error de Discord:', error);
});

client.on(Events.Warn, (warning) => {
  logger.warn('Advertencia de Discord:', warning);
});

client.on(Events.InteractionCreate, handleInteraction);

export async function startDiscordBot(): Promise<void> {
  await client.login(config.DISCORD_TOKEN);

  logger.info('Bot iniciado correctamente');
}

export function stopDiscordBot(): void {
  logger.info('Apagando bot...');
  stopSyncTasks();
  stopInactivityCheck();
  stopReportTasks();
  stopMonthlyTasks();
  stopRoleUpdater();
  stopBackupTask();
  stopIPChecker();
  stopWeeklyRanking();
  stopMonthlyRanking();
  client.destroy();

}
