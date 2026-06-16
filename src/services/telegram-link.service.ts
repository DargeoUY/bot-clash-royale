import crypto from 'crypto';
import prisma from '../database/prisma';
import logger from '../config/logger';

export function generarCodigo(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

export async function crearConexion(chatId: number): Promise<string> {
  const codigo = generarCodigo();
  const expiraEn = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.conexionTelegram.create({
    data: { codigo, chatId, expiraEn },
  });
  logger.info(`Código de conexión generado: ${codigo} para chat ${chatId}`);
  return codigo;
}

export async function validarConexion(codigo: string): Promise<{ chatId: number; guildId?: string } | null> {
  const conexion = await prisma.conexionTelegram.findUnique({
    where: { codigo },
  });
  if (!conexion) return null;
  if (conexion.usado) return null;
  if (conexion.expiraEn < new Date()) {
    await prisma.conexionTelegram.delete({ where: { id: conexion.id } });
    return null;
  }
  return { chatId: Number(conexion.chatId), guildId: conexion.guildId ?? undefined };
}

export async function marcarUsado(codigo: string, guildId: string): Promise<void> {
  await prisma.conexionTelegram.update({
    where: { codigo },
    data: { usado: true, guildId },
  });
}

export async function limpiarExpirados(): Promise<void> {
  const result = await prisma.conexionTelegram.deleteMany({
    where: { expiraEn: { lt: new Date() } },
  });
  if (result.count > 0) logger.info(`Conexiones expiradas limpiadas: ${result.count}`);
}

export async function obtenerChatIdPorGuild(guildId: string): Promise<number | null> {
  const clan = await prisma.clan.findFirst({
    where: { idServidorDiscord: guildId, idChatTelegram: { not: null } },
  });
  return clan?.idChatTelegram ? Number(clan.idChatTelegram) : null;
}
