import prisma from '../database/prisma';
import { config } from '../config';
import logger from '../config/logger';

export interface VacationResult {
  success: boolean;
  message: string;
  endDate?: Date;
  daysUsed?: number;
}

export async function activateVacation(
  playerTag: string,
  days: number,
  reason: string | null,
  createdBy: string,
): Promise<VacationResult> {
  if (days > config.VACATION_MAX_DAYS) {
    return { success: false, message: `El máximo es ${config.VACATION_MAX_DAYS} días.` };
  }

  const season = getCurrentSeason();
  const usedDays = await getVacationDaysUsed(playerTag, season);

  if (usedDays + days > config.VACATION_MAX_DAYS) {
    return {
      success: false,
      message: `Ya usaste ${usedDays}/${config.VACATION_MAX_DAYS} días esta temporada. Solo te quedan ${config.VACATION_MAX_DAYS - usedDays}.`,
    };
  }

  const existingActive = await prisma.vacacion.findFirst({
    where: { tagJugador: playerTag, activo: true },
  });

  if (existingActive) {
    return {
      success: false,
      message: `Ya tenés un modo vacaciones activo hasta ${existingActive.fechaFin.toLocaleDateString('es-AR')}. Usá /ausencia extender o /ausencia cancelar.`,
    };
  }

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

  await prisma.vacacion.create({
    data: {
      tagJugador: playerTag,
      reason,
      fechaInicio: startDate,
      fechaFin: endDate,
      creadoPor: createdBy,
    },
  });

  logger.info(`Vacation activated: ${playerTag} ${days}d - "${reason || 'sin motivo'}"`);

  return {
    success: true,
    message: `Modo vacaciones activado hasta ${endDate.toLocaleDateString('es-AR')}.`,
    endDate,
    daysUsed: usedDays + days,
  };
}

export async function extendVacation(
  playerTag: string,
  additionalDays: number,
): Promise<VacationResult> {
  const active = await prisma.vacacion.findFirst({
    where: { tagJugador: playerTag, activo: true },
  });

  if (!active) {
    return { success: false, message: 'No tenés un modo vacaciones activo.' };
  }

  const season = getCurrentSeason();
  const usedDays = await getVacationDaysUsed(playerTag, season);

  if (usedDays + additionalDays > config.VACATION_MAX_DAYS) {
    return {
      success: false,
      message: `Extender ${additionalDays} días excedería el límite de ${config.VACATION_MAX_DAYS} por temporada.`,
    };
  }

  const newEndDate = new Date(active.fechaFin.getTime() + additionalDays * 24 * 60 * 60 * 1000);

  await prisma.vacacion.update({
    where: { id: active.id },
    data: { fechaFin: newEndDate },
  });

  return {
    success: true,
    message: `Vacaciones extendidas hasta ${newEndDate.toLocaleDateString('es-AR')}.`,
    endDate: newEndDate,
    daysUsed: usedDays + additionalDays,
  };
}

export async function cancelVacation(playerTag: string): Promise<VacationResult> {
  const active = await prisma.vacacion.findFirst({
    where: { tagJugador: playerTag, activo: true },
  });

  if (!active) {
    return { success: false, message: 'No tenés un modo vacaciones activo.' };
  }

  await prisma.vacacion.update({
    where: { id: active.id },
    data: { activo: false },
  });

  return { success: true, message: 'Modo vacaciones cancelado. Bienvenido de vuelta.' };
}

export async function processExpiredVacations(): Promise<void> {
  const now = new Date();
  const expired = await prisma.vacacion.findMany({
    where: { activo: true, fechaFin: { lte: now } },
    include: { jugador: true },
  });

  for (const vac of expired) {
    await prisma.vacacion.update({
      where: { id: vac.id },
      data: { activo: false },
    });
    logger.info(`Vacation expired for ${vac.tagJugador}`);
  }
}

async function getVacationDaysUsed(playerTag: string, season: string): Promise<number> {
  const vacations = await prisma.vacacion.findMany({
    where: { tagJugador: playerTag },
  });

  let total = 0;
  for (const v of vacations) {
    const start = new Date(Math.max(v.fechaInicio.getTime(), new Date(`${season}-01`).getTime()));
    const end = new Date(Math.min(v.fechaFin.getTime(), new Date().getTime()));
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (days > 0) total += days;
  }

  return Math.min(total, config.VACATION_MAX_DAYS);
}

function getCurrentSeason(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
