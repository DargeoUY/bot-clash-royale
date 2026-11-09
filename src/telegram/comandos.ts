import { executeCommand, sharedCommands } from '../platform/commands';
import { Bot, Context } from 'grammy';
import { getPlayerInfo } from '../api/player';
import { isValidPlayerTag, formatPlayerTag } from '../utils/validators';
import prisma from '../database/prisma';

export function registrarComandos(bot: Bot): void {
  bot.command('registrar', async (ctx: Context) => {
    const match = typeof ctx.match === 'string' ? ctx.match : '';
    const tag = match.trim();
    if (!tag) {
      await ctx.reply('Usá: /registrar #TAG (ej: /registrar #PLAYER123)');
      return;
    }
    if (!isValidPlayerTag(tag)) {
      await ctx.reply('Tag inválido. Usá el formato #ABC123');
      return;
    }
    const playerTag = formatPlayerTag(tag);
    const userId = String(ctx.from!.id);
    try {
      const player = await getPlayerInfo(playerTag);
      const clan = await prisma.clan.findFirst({
        where: { idChatTelegram: ctx.chat!.id, telegramEnabled: true },
      });
      if (!clan) {
        await ctx.reply('Este grupo no está vinculado a ningún clan.');
        return;
      }
      if (!player.clan?.tag || formatPlayerTag(player.clan.tag) !== clan.tag) {
        await ctx.reply('Esa cuenta no pertenece al clan vinculado a este grupo.');
        return;
      }
      const existing = await prisma.jugador.findUnique({ where: { tag: playerTag } });
      if (existing?.idTelegram && existing.idTelegram !== userId) {
        await ctx.reply('Esta cuenta ya está vinculada. Consultá al administrador.'); return;
      }
      await prisma.jugador.upsert({
        where: { tag: playerTag },
        update: { idTelegram: userId, nombre: player.name, trofeos: player.trophies, registrado: true },
        create: {
          tag: playerTag, nombre: player.name, trofeos: player.trophies,
          clanTag: clan.tag, idTelegram: userId, registrado: true,
        },
      });
      await ctx.reply(
        `✅ Registro exitoso\n\n` +
        `Jugador: ${player.name}\n` +
        `Tag: ${playerTag}\n` +
        `Trofeos: ${player.trophies}\n\n` +
        `Ya podés usar todos los comandos.`,
      );
    } catch {
      await ctx.reply('Error al registrar. Verificá que el tag sea correcto.');
    }
  });

  for (const command of sharedCommands) {
    bot.command(command, async ctx => {
      try {
        const clan = await prisma.clan.findFirst({ where: { idChatTelegram: ctx.chat!.id, telegramEnabled: true } });
        if (!clan) { await ctx.reply('Este grupo no está vinculado a un clan activo.'); return; }
        const member = await ctx.getChatMember(ctx.from!.id);
        const player = await prisma.jugador.findFirst({ where: { clanTag: clan.tag, estado: 'active', idTelegram: String(ctx.from!.id) } });
        const text = await executeCommand({ id: `telegram:${ctx.from!.id}`, clanTag: clan.tag,
          admin: ['administrator', 'creator'].includes(member.status), playerTag: player?.tag },
          '/' + command + ' ' + String(ctx.match || ''));
        // Plain text avoids user-controlled Markdown/HTML interpretation.
        for (let i = 0; i < text.length; i += 4000) await ctx.reply(text.slice(i, i + 4000));
      } catch (error) { await ctx.reply(error instanceof Error ? error.message : 'No se pudo completar.'); }
    });
  }
}
