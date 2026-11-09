import prisma from '../database/prisma';
import { getClanInfo, getCurrentRiverRace } from '../api/clan';
import { getPlayerInfo } from '../api/player';
import { getLeaderboard, getPlayerPoints, addPoints } from '../services/points.service';
import { getWeeklyTrophyRanking, getMonthlyTrophyRanking, getDonationRanking, getWarRanking } from '../services/ranking.service';
import { activateVacation, cancelVacation } from '../services/vacation.service';
import { getInactivitySummary } from '../services/inactivity.service';
import { syncClanData, syncCurrentWar } from '../services/clan-war.service';
import { formatPlayerTag, isValidPlayerTag } from '../utils/validators';

export interface CommandActor { id: string; clanTag: string; admin: boolean; playerTag?: string | null }
export const sharedCommands = ['ayuda', 'clan', 'perfil', 'ranking', 'guerra', 'puntos', 'ausencia', 'inactivos', 'sync', 'premiar'];
export async function executeCommand(actor: CommandActor, input: string): Promise<string> {
  const [raw, ...args] = input.trim().split(/\s+/);
  const command = raw.replace(/^[/!]/, '').split('@')[0].toLowerCase();
  if (['inactivos', 'sync', 'premiar'].includes(command) && !actor.admin) throw new Error('Se requiere permiso de administrador.');
  const tag = args[0] && isValidPlayerTag(args[0]) ? formatPlayerTag(args[0]) : actor.playerTag;
  async function requirePlayer() {
    if (!tag) throw new Error('Indicá el tag del jugador.');
    const p = await prisma.jugador.findFirst({ where: { tag, clanTag: actor.clanTag, estado: 'active' } });
    if (!p) throw new Error('El jugador no pertenece a este clan.');
    return p;
  }
  switch (command) {
    case 'ayuda': return 'Comandos: /clan, /perfil [#TAG], /ranking puntos|trofeos|donaciones|guerra [semanal|mensual], /guerra, /puntos [#TAG], /ausencia días motivo, /ausencia cancelar. Administración: /inactivos, /sync, /premiar #TAG cantidad motivo.';
    case 'clan': {
      const c = await getClanInfo(actor.clanTag);
      return `${c.name} (${c.tag})\nMiembros: ${c.members}/50\nTrofeos: ${c.clanScore}\n${c.description || ''}`;
    }
    case 'perfil': {
      const p = await requirePlayer();
      const info = await getPlayerInfo(p.tag);
      return `${info.name} (${info.tag})\nTrofeos: ${info.trophies}\nNivel: ${info.expLevel}\nRol: ${p.rol || 'miembro'}`;
    }
    case 'puntos': {
      const p = await requirePlayer(); const points = await getPlayerPoints(p.tag);
      return `${p.nombre}\nTotal: ${points.total}\nGuerra: ${points.war}\nActividad: ${points.activity}\nExtra: ${points.bonus}\nTemporada: ${points.season}`;
    }
    case 'ranking': {
      const type = args[0] || 'puntos'; const period = args[1] === 'semanal' ? 'semanal' : 'mensual';
      if (type === 'trofeos') {
        const rows = await (period === 'semanal' ? getWeeklyTrophyRanking : getMonthlyTrophyRanking)(actor.clanTag);
        return rows.map(p => `${p.rank}. ${p.nombre}: ${p.delta >= 0 ? '+' : ''}${p.delta}`).join('\n') || 'Sin datos.';
      }
      if (type === 'donaciones') return (await getDonationRanking(actor.clanTag)).map(p => `${p.rank}. ${p.nombre}: ${p.donations}`).join('\n') || 'Sin datos.';
      if (type === 'guerra') return (await getWarRanking(actor.clanTag)).map(p => `${p.rank}. ${p.nombre}: ${p.fame}`).join('\n') || 'Sin datos.';
      return (await getLeaderboard(actor.clanTag, period)).map(p => `${p.rank}. ${p.nombre}: ${p.points} pts`).join('\n') || 'Sin datos.';
    }
    case 'guerra': {
      const race = await getCurrentRiverRace(actor.clanTag);
      return `Guerra actual\nFama: ${race.clan?.fame || 0}\nParticipantes: ${race.clan?.participants?.length || 0}\n` +
        (race.clan?.participants || []).map(p => `${p.name}: ${p.fame} fama · ${p.decksUsedToday || 0} mazos hoy`).join('\n');
    }
    case 'ausencia': {
      if (!actor.playerTag) throw new Error('Un administrador debe vincular tu cuenta a un jugador.');
      await prisma.jugador.findFirstOrThrow({ where: { tag: actor.playerTag, clanTag: actor.clanTag, estado: 'active' } });
      const result = args[0] === 'cancelar' ? await cancelVacation(actor.playerTag) :
        await activateVacation(actor.playerTag, Number(args[0]), args.slice(1).join(' ').slice(0, 400) || null, actor.id);
      if (!result.success) throw new Error(result.message);
      await audit(actor, command, result.message); return result.message;
    }
    case 'inactivos': {
      const result = await getInactivitySummary(actor.clanTag);
      return [...result.warning, ...result.inactive, ...result.kick_suggested].map(p => `${p.nombreJugador}: ${p.diasInactivo} días (${p.status})`).join('\n') || 'Sin miembros inactivos.';
    }
    case 'sync': {
      const result = await syncClanData(actor.clanTag); await syncCurrentWar(actor.clanTag);
      await audit(actor, command, String(result.memberCount)); return `Sincronizados ${result.memberCount} miembros.`;
    }
    case 'premiar': {
      const p = await requirePlayer(); const amount = Number(args[1]);
      if (!Number.isInteger(amount) || !amount || Math.abs(amount) > 10000 || !args[2]) throw new Error('Uso: /premiar #TAG cantidad entre -10000 y 10000 motivo');
      await addPoints(p.tag, amount, amount > 0 ? 'bonus' : 'penalty', args.slice(2).join(' ').slice(0, 400));
      await audit(actor, command, `${p.tag}: ${amount}`); return 'Puntos actualizados.';
    }
    default: throw new Error('Comando desconocido. Escribí /ayuda.');
  }
}
export async function audit(actor: CommandActor, action: string, detail: string): Promise<void> {
  await prisma.auditEvent.create({ data: { clanTag: actor.clanTag, actor: actor.id, action, detail } });
}
