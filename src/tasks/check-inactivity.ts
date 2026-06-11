import cron from 'node-cron';
import { client } from '../bot';
import { checkInactivity } from '../services/inactivity.service';
import { notifyInactivePlayer, notifyInactivityChannel, STATUS_LABELS } from '../services/notification.service';
import { processExpiredVacations } from '../services/vacation.service';
import { getAllClanConfigs } from '../utils/guild';
import { sendTelegramMessage } from '../services/telegram.service';
import prisma from '../database/prisma';
import logger from '../config/logger';

let task: cron.ScheduledTask | null = null;

async function maybeSendInactivityTelegram(guildId: string, results: { playerName: string; daysInactive: number; status: string }[]): Promise<void> {
  if (results.length === 0) return;

  const key = `last_telegram_inactivity_${guildId}`;
  const cfg = await prisma.botConfig.findUnique({ where: { key } });
  const now = Date.now();
  const threeDays = 3 * 24 * 60 * 60 * 1000;

  if (cfg) {
    const last = parseInt(cfg.value, 10);
    if (!isNaN(last) && (now - last) < threeDays) return;
  }

  await prisma.botConfig.upsert({
    where: { key },
    update: { value: String(now) },
    create: { key, value: String(now) },
  });

  results.sort((a, b) => b.daysInactive - a.daysInactive);

  let msg = '<b>⚠️ Miembros inactivos del clan</b>\n\n';
  for (const r of results) {
    const label = STATUS_LABELS[r.status] || r.status;
    msg += `${label} | <b>${r.playerName}</b> — ${r.daysInactive} días\n`;
  }

  const result = await sendTelegramMessage(msg);
  if (result.ok) {
    logger.info('Telegram inactivity notification sent');
  }
}

export function startInactivityCheck(): void {
  task = cron.schedule('0 */6 * * *', async () => {
    logger.debug('Running inactivity check for all clans...');
    try {
      await processExpiredVacations();

      const clans = await getAllClanConfigs();
      for (const { clanTag, guildId } of clans) {
        try {
          const results = await checkInactivity(clanTag, guildId);
          for (const player of results) {
            await notifyInactivePlayer(client, player);
          }
          await notifyInactivityChannel(client, guildId, results);

          await maybeSendInactivityTelegram(guildId, results);
        } catch (err) {
          logger.error(`Inactivity check failed for ${clanTag}:`, err);
        }
      }

      logger.info(`Inactivity check done`);
    } catch (error) {
      logger.error('Inactivity check failed:', error);
    }
  });

  logger.info('Inactivity check started (every 6h, multi-clan)');
}

export function stopInactivityCheck(): void {
  if (task) task.stop();
}
