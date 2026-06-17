import { Bot, Context } from 'grammy';
import { getClanInfo } from '../api/clan';
import { getPlayerInfo } from '../api/player';
import { isValidPlayerTag, formatPlayerTag } from '../utils/validators';
import { getLeaderboard } from '../services/points.service';
import { getPlayerPoints } from '../services/points.service';
import { getWeeklyTrophyRanking, getMonthlyTrophyRanking, getDonationRanking, getWarRanking } from '../services/ranking.service';
import { activateVacation } from '../services/vacation.service';
import { checkInactivity } from '../services/inactivity.service';
import prisma from '../database/prisma';
import { checkTelegramMember } from './middleware';
import logger from '../config/logger';

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
        where: { idChatTelegram: ctx.chat!.id },
      });
      if (!clan) {
        await ctx.reply('Este grupo no está vinculado a ningún clan.');
        return;
      }
      if (!player.clan?.tag || formatPlayerTag(player.clan.tag) !== clan.tag) {
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
    const match = typeof ctx.match === 'string' ? ctx.match : '';
    const tag = match.trim();
    if (!tag) {
      const player = await prisma.jugador.findFirst({
        where: { idTelegram: String(ctx.from!.id) },
      });
      if (!player) {
        await ctx.reply('No estás registrado. Usá /perfil #TAG o registrate con /registrar.');
        return;
      }
      await ctx.reply(
        `🏆 ${player.name}\n` +
        `Tag: ${player.tag}\n` +
        `Trofeos: ${player.trophies || 0}\n` +
        `Rol: ${player.role || 'miembro'}\n` +
        `Registrado: ✅`,
      );
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
    const args = (typeof ctx.match === 'string' ? ctx.match : '').trim().split(/\s+/);
    const tipo = args[0] || 'puntos';
    const periodo = args[1] || 'mensual';
    try {
      if (tipo === 'trofeos') {
        const ranking = periodo === 'semanal'
          ? await getWeeklyTrophyRanking(clan.tag)
          : await getMonthlyTrophyRanking(clan.tag);
        if (ranking.length === 0) {
          await ctx.reply('Sin datos de ranking de trofeos.');
          return;
        }
        const lines = ranking.map((p) => {
          const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
          const signo = p.delta >= 0 ? '+' : '';
          return `${medal} ${p.name} — ${signo}${p.delta} 🏆`;
        });
        await ctx.reply(`🏆 Ranking de Trofeos (${periodo})\n\n${lines.join('\n')}`);
      } else if (tipo === 'donaciones') {
        const ranking = await getDonationRanking(clan.tag);
        if (ranking.length === 0) {
          await ctx.reply('Sin datos de donaciones.');
          return;
        }
        const lines = ranking.map((p) => {
          const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
          return `${medal} ${p.name} — ${p.donations} donadas`;
        });
        await ctx.reply(`💎 Ranking de Donaciones\n\n${lines.join('\n')}`);
      } else if (tipo === 'guerra') {
        const ranking = await getWarRanking(clan.tag);
        if (ranking.length === 0) {
          await ctx.reply('Sin datos de guerra este mes.');
          return;
        }
        const lines = ranking.map((p) => {
          const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
          return `${medal} ${p.name} — ${p.fame} fama`;
        });
        await ctx.reply(`⚔️ Ranking de Guerra (mensual)\n\n${lines.join('\n')}`);
      } else {
        const leaderboard = await getLeaderboard(clan.tag, periodo as 'semanal' | 'mensual' | 'general');
        if (leaderboard.length === 0) {
          await ctx.reply('Sin datos de ranking todavía.');
          return;
        }
        const lines = leaderboard.map((p) => {
          const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `${p.rank}.`;
          return `${medal} ${p.name} — ${p.points} pts`;
        });
        await ctx.reply(`🏆 Ranking de Puntos (${periodo})\n\n${lines.join('\n')}`);
      }
    } catch {
      await ctx.reply('Error al obtener ranking. Uso: /ranking <tipo> <periodo>');
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
      const info = await getClanInfo(clan.tag) as any;
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

  bot.command('puntos', async (ctx: Context) => {
    const match = typeof ctx.match === 'string' ? ctx.match : '';
    const tag = match.trim();
    if (!tag) {
      await ctx.reply('Usá: /puntos #TAG');
      return;
    }
    try {
      const pts = await getPlayerPoints(tag);
      await ctx.reply(
        `⭐ Puntos de ${tag}\n\n` +
        `Total: ${pts.total}\n` +
        `⚔️ Guerra: ${pts.war}\n` +
        `📋 Actividad: ${pts.activity}\n` +
        `🎁 Extra: ${pts.bonus}\n` +
        `Temporada: ${pts.season}`,
      );
    } catch {
      await ctx.reply('Error al obtener puntos.');
    }
  });

  bot.command('ausencia', async (ctx: Context) => {
    const args = (typeof ctx.match === 'string' ? ctx.match : '').trim().split(/\s+/);
    const daysStr = args[0];
    const reason = args.slice(1).join(' ') || null;
    if (!daysStr || isNaN(Number(daysStr))) {
      await ctx.reply('Usá: /ausencia <días> [motivo]\nEj: /ausencia 5 Estoy de viaje');
      return;
    }
    const days = parseInt(daysStr, 10);
    const player = await prisma.jugador.findFirst({
      where: { idTelegram: String(ctx.from!.id) },
    });
    if (!player) {
      await ctx.reply('No estás registrado. Usá /registrar primero.');
      return;
    }
    try {
      const result = await activateVacation(player.tag, days, reason, `telegram:${ctx.from!.id}`);
      await ctx.reply(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
    } catch {
      await ctx.reply('Error al activar modo vacaciones.');
    }
  });

  bot.command('inactivos', async (ctx: Context) => {
    const clan = await prisma.clan.findFirst({
      where: { idChatTelegram: ctx.chat!.id },
    });
    if (!clan) {
      await ctx.reply('Este grupo no está vinculado a ningún clan.');
      return;
    }
    try {
      const results = await checkInactivity(clan.tag, null);
      if (results.length === 0) {
        await ctx.reply('✅ No hay miembros inactivos.');
        return;
      }
      const lines = results.map((p) =>
        `• ${p.nombreJugador} — ${p.diasInactivo} días (${p.status})`,
      );
      await ctx.reply(`⚠️ Miembros inactivos:\n\n${lines.join('\n')}`);
    } catch {
      await ctx.reply('Error al verificar inactividad.');
    }
  });

  bot.command('guia', async (ctx: Context) => {
    await ctx.reply(
      '📋 *Guía del Bot*\n\n' +
      '1️⃣ Registrate con /registrar #TAG\n' +
      '2️⃣ Vinculá tu cuenta de Clash Royale\n' +
      '3️⃣ Usá los comandos disponibles\n\n' +
      'Comandos: /clan, /perfil, /ranking, /guerra, /puntos, /ausencia, /inactivos, /ayuda',
      { parse_mode: 'Markdown' },
    );
  });
}
