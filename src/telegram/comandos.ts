import { Bot, Context } from 'grammy';
import { getClanInfo } from '../api/clan';
import { getPlayerInfo } from '../api/player';
import { isValidPlayerTag, formatPlayerTag } from '../utils/validators';
import { getLeaderboard } from '../services/points.service';
import prisma from '../database/prisma';
import { checkTelegramMember } from './middleware';
import logger from '../config/logger';

export function registrarComandos(bot: Bot): void {
  bot.command('registrar', async (ctx: Context) => {
    const tag = ctx.match?.trim();
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
        where: { idChatTelegram: ctx.chat!.id },
      });
      if (!clan) {
        await ctx.reply('Este grupo no está vinculado a ningún clan.');
        return;
      }
      if (!player.clanTag || formatPlayerTag(player.clanTag) !== clan.tag) {
        await ctx.reply('Esa cuenta no pertenece al clan vinculado a este grupo.');
        return;
      }
      await prisma.jugador.upsert({
        where: { tag: playerTag },
        update: { idTelegram: userId, name: player.name, trophies: player.trophies, registrado: true },
        create: {
          tag: playerTag, name: player.name, trophies: player.trophies,
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

  bot.command('clan', async (ctx: Context) => {
    const clan = await prisma.clan.findFirst({
      where: { idChatTelegram: ctx.chat!.id },
    });
    if (!clan) {
      await ctx.reply('Este grupo no está vinculado a ningún clan.');
      return;
    }
    try {
      const info = await getClanInfo(clan.tag);
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
    const tag = ctx.match?.trim();
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

  bot.command('ranking', async (ctx: Context) => {
    const clan = await prisma.clan.findFirst({
      where: { idChatTelegram: ctx.chat!.id },
    });
    if (!clan) {
      await ctx.reply('Este grupo no está vinculado a ningún clan.');
      return;
    }
    try {
      const leaderboard = await getLeaderboard(clan.tag, 'mensual');
      if (leaderboard.length === 0) {
        await ctx.reply('Sin datos de ranking todavía.');
        return;
      }
      const lines = leaderboard.map((p) => {
        const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
        return `${medal} ${p.name} — ${p.points} pts`;
      });
      await ctx.reply(`🏆 Ranking Mensual\n\n${lines.join('\n')}`);
    } catch {
      await ctx.reply('Error al obtener ranking.');
    }
  });

  bot.command('guerra', async (ctx: Context) => {
    const clan = await prisma.clan.findFirst({
      where: { idChatTelegram: ctx.chat!.id },
    });
    if (!clan) {
      await ctx.reply('Este grupo no está vinculado a ningún clan.');
      return;
    }
    try {
      const info = await getClanInfo(clan.tag);
      const warInfo = info.currentWar;
      if (!warInfo) {
        await ctx.reply('No hay datos de guerra actual.');
        return;
      }
      await ctx.reply(
        `⚔️ Estado de Guerra\n\n` +
        `Fama: ${warInfo.fame || 0}\n` +
        `Puestos: ${warInfo.rank || '-'}\n` +
        `Participantes: ${warInfo.participants || 0}`,
      );
    } catch {
      await ctx.reply('Error al obtener datos de guerra.');
    }
  });
}
