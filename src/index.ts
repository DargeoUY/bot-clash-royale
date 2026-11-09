import { config } from './config';
import logger from './config/logger';
import prisma from './database/prisma';
import { startWebServer } from './web';
import { client, startDiscordBot, stopDiscordBot } from './discord';
import { startTelegramBot, stopTelegramBot } from './telegram';
import { whatsapp } from './whatsapp';
import { syncClanData, syncCurrentWar } from './services/clan-war.service';
import { processExpiredVacations } from './services/vacation.service';
import { generateWeeklyReport, generateMonthlyReport, resetWeeklyBaseline, resetMonthlyBaseline } from './services/ranking.service';
import { broadcastToClan } from './services/cross-platform.service';
import { startInactivityCheck } from './tasks/check-inactivity';
import { startReportTasks } from './tasks/weekly-report';
import { startMonthlyTasks } from './tasks/monthly-report';
import { startRoleUpdater } from './tasks/update-roles';
import { startBackupTask } from './tasks/backup-database';
import { startIPChecker } from './tasks/check-ip';
import { startWeeklyRanking } from './tasks/weekly-ranking';
import { startMonthlyRanking } from './tasks/monthly-ranking';

async function main() {
  await prisma.$connect();
  const server = startWebServer();
  // A failure in one messaging provider must not prevent the web or other providers from starting.
  if (config.DISCORD_TOKEN) {
    startDiscordBot().then(() => {
      startInactivityCheck(client); startReportTasks(client); startMonthlyTasks(client);
      startRoleUpdater(client); startWeeklyRanking(client); startMonthlyRanking(client);
    }).catch(() => logger.error('No se pudo conectar Discord. La web sigue disponible.'));
  }
  await startTelegramBot();
  void whatsapp.restore();
  startBackupTask(); startIPChecker();
  let syncing = false;
  const tick = async () => {
    if (syncing) return;
    syncing = true;
    try {
      await processExpiredVacations();
      await prisma.webSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await prisma.webInvite.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      for (const clan of await prisma.clan.findMany()) {
        try { await syncClanData(clan.tag, client.isReady() ? client : undefined); await syncCurrentWar(clan.tag); }
        catch { logger.warn(`Sincronización fallida: ${clan.tag}`); }
      }
    } finally { syncing = false; }
  };
  const timer = setInterval(() => { tick().catch(() => logger.error('Error de sincronización')); }, 300000);
  void tick().catch(() => logger.error('Error de sincronización inicial'));
  // Non-Discord clans receive a daily report through their own enabled channels.
  const cron = await import('node-cron');
  const reports = cron.schedule('0 18 * * *', async () => {
    for (const clan of await prisma.clan.findMany({ where: { OR: [{ idServidorDiscord: null }, { discordEnabled: false }] } })) {
      try { await broadcastToClan(clan.tag, await generateWeeklyReport(clan.tag)); }
      catch { logger.warn(`No se pudo publicar reporte: ${clan.tag}`); }
    }
  });
  const weekly = cron.schedule('0 8 * * 1', async () => {
    for (const clan of await prisma.clan.findMany({ where: { OR: [{ idServidorDiscord: null }, { discordEnabled: false }] } })) {
      try { await broadcastToClan(clan.tag, await generateWeeklyReport(clan.tag)); await resetWeeklyBaseline(clan.tag); }
      catch { logger.warn(`No se pudo publicar ranking semanal: ${clan.tag}`); }
    }
  });
  const monthly = cron.schedule('0 8 1 * *', async () => {
    for (const clan of await prisma.clan.findMany({ where: { OR: [{ idServidorDiscord: null }, { discordEnabled: false }] } })) {
      try { await broadcastToClan(clan.tag, await generateMonthlyReport(clan.tag)); await resetMonthlyBaseline(clan.tag); }
      catch { logger.warn(`No se pudo publicar ranking mensual: ${clan.tag}`); }
    }
  });
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return; stopping = true;
    clearInterval(timer); reports.stop(); weekly.stop(); monthly.stop();
    server.close(); stopDiscordBot();
    await Promise.allSettled([stopTelegramBot(), whatsapp.stop()]);
    await prisma.$disconnect(); process.exit(0);
  };
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}
main().catch(() => { logger.error('No se pudo iniciar la aplicación. Revisá base de datos y configuración.'); process.exit(1); });
