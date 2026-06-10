import http from 'http';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config';
import logger from './config/logger';
import { startSyncTasks, stopSyncTasks } from './tasks/sync-clan';
import { startInactivityCheck, stopInactivityCheck } from './tasks/check-inactivity';
import { startReportTasks, stopReportTasks } from './tasks/weekly-report';
import { startMonthlyTasks, stopMonthlyTasks } from './tasks/monthly-report';
import { startRoleUpdater, stopRoleUpdater } from './tasks/update-roles';
import { startBackupTask, stopBackupTask } from './tasks/backup-database';
import { startIPChecker, stopIPChecker } from './tasks/check-ip';
import { handleInteraction } from './events/interactionCreate';
import { crGet } from './api/client';

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
    logger.error('Si usas proxy.royaleapi.dev -> Whitelist IP: 45.79.218.79');
    logger.error('Si usas api.clashroyale.com -> Whitelist IP: la de tu servidor');
    logger.error('Despues actualizar CR_API_KEY en .env y reiniciar el container');
    logger.error('==========================================================');
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Bot conectado como ${readyClient.user.tag}`);
  logger.info(`Sirviendo ${readyClient.guilds.cache.size} servidores`);

  await testApiConnection();

  client.user?.setActivity('/ayuda | Clash Royale', { type: 3 }); // Watching

  startSyncTasks();
  startInactivityCheck();
  startReportTasks(client);
  startMonthlyTasks(client);
  startRoleUpdater(client);
  startBackupTask();
  startIPChecker();
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

export async function startBot(): Promise<void> {
  await client.login(config.DISCORD_TOKEN);
  logger.info('Bot iniciado correctamente');
}

const healthServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
});

function shutdown(): void {
  logger.info('Apagando bot...');
  stopSyncTasks();
  stopInactivityCheck();
  stopReportTasks();
  stopMonthlyTasks();
  stopRoleUpdater();
  stopBackupTask();
  stopIPChecker();
  client.destroy();
  healthServer.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startBot()
  .then(() => {
    healthServer.listen(config.HEALTHCHECK_PORT, () => {
      logger.info(`Healthcheck en puerto ${config.HEALTHCHECK_PORT}`);
    });
  })
  .catch((error) => {
    logger.error('Error fatal al iniciar el bot:', error);
    process.exit(1);
  });

export { client };
