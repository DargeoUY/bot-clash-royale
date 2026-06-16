import { Bot, Context } from 'grammy';
import { getClanInfo } from '../api/clan';
import { getPlayerInfo } from '../api/player';

export function registrarComandos(bot: Bot): void {
  bot.command('clan', async (ctx: Context) => {
    const tag = process.env.CLAN_TAG || '#28P8RQUY';
    try {
      const info = await getClanInfo(tag);
      await ctx.reply(
        `🏰 ${info.name}\n` +
        `Tag: ${info.tag}\n` +
        `Miembros: ${info.members}/50\n` +
        `Trofeos: ${info.clanScore}\n` +
        `Descripción: ${info.description || 'Sin descripción'}`,
      );
    } catch {
      await ctx.reply('Error al obtener info del clan.');
    }
  });

  bot.command('perfil', async (ctx: Context) => {
    const tag = ctx.match;
    if (!tag) {
      await ctx.reply('Usá: /perfil #TAG');
      return;
    }
    try {
      const player = await getPlayerInfo(tag);
      await ctx.reply(
        `🏆 ${player.name}\n` +
        `Tag: ${player.tag}\n` +
        `Nivel: ${player.expLevel}\n` +
        `Trofeos: ${player.trophies}\n` +
        `Victorias: ${player.wins}\n` +
        `Arena: ${player.arena?.name || 'N/A'}`,
      );
    } catch {
      await ctx.reply('No se encontró el jugador.');
    }
  });
}
