import { Context } from 'grammy';
import prisma from '../database/prisma';

interface CtxWithMember extends Context {
  member?: unknown;
}

export async function checkTelegramMember(ctx: CtxWithMember, next: () => Promise<void>): Promise<void> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) {
    await ctx.reply('Error: no se pudo identificar el chat o usuario.');
    return;
  }
  const clan = await prisma.clan.findFirst({
    where: { idChatTelegram: chatId },
  });
  if (!clan) {
    await ctx.reply('Este grupo no está vinculado a ningún clan. Usá Discord para configurar.');
    return;
  }
  const player = await prisma.jugador.findFirst({
    where: { idTelegram: String(userId), clanTag: clan.tag },
  });
  if (!player) {
    await ctx.reply('Disculpa, no perteneces a este clan. Registrate con /registrar #TAG');
    return;
  }
  ctx.member = player;
  await next();
}
