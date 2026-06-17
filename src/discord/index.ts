import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from '../config';
import logger from '../config/logger';
import { startSyncTasks, stopSyncTasks } from '../tasks/sync-clan';
import { startInactivityCheck, stopInactivityCheck } from '../tasks/check-inactivity';
import { startReportTasks, stopReportTasks } from '../tasks/weekly-report';
import { startMonthlyTasks, stopMonthlyTasks } from '../tasks/monthly-report';
import { startRoleUpdater, stopRoleUpdater } from '../tasks/update-roles';
import { startBackupTask, stopBackupTask } from '../tasks/backup-database';
import { startIPChecker, stopIPChecker } from '../tasks/check-ip';
import { startWeeklyRanking, stopWeeklyRanking } from '../tasks/weekly-ranking';
import { startMonthlyRanking, stopMonthlyRanking } from '../tasks/monthly-ranking';
import { handleInteraction } from './events/interactionCreate';
import { crGet } from '../api/client';
import { startWebServer } from '../web';
import { setDiscordClient } from '../services/cross-platform.service';
import { startTelegramBot } from '../telegram';

async function testApiConnection(): Promise<void> {
  const keyPreview = config.CR_API_KEY.substring(0, 20) + '...';
  logger.info(`Config -> CR_API_BASE_URL: ${config.CR_API_BASE_URL}`);
  logger.info(`Config -> CR_API_KEY: ${keyPreview}`);
  try {
    const result = await crGet<object>('/clans/%2328P8RQUY');
    const name = (result as { name?: string }).name || 'unknown';
    logger.info(`API OK -> Clan "${name}" conectado via ${config.CR_API_BASE_URL}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`API FAILED -> ${config.CR_API_BASE_URL} | ${keyPreview} | ${msg}`);
    logger.error('==========================================================');
    logger.error('SOLUCION: Crear nueva API key en https://developer.clashroyale.com');
    logger.error('Whitelistear la IP fija de tu VPS en la API key');
    logger.error('==========================================================');
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
  await startTelegramBot();
  client.user?.setActivity('/ayuda | Clash Royale', { type: 3 });
  startSyncTasks();
  startInactivityCheck();
  startReportTasks(client);
  startMonthlyTasks(client);
  startRoleUpdater(client);
  startBackupTask();
  startIPChecker();
  startWeeklyRanking(client);
  startMonthlyRanking(client);
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
  startWebServer();
  logger.info('Bot iniciado correctamente');
}

function shutdown(): void {
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
  process.exit(0);
}
