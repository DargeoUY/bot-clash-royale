import { Router, Request, Response } from 'express';
import prisma from '../database/prisma';
import { getClanInfo } from '../api/clan';
import { getLeaderboard } from '../services/points.service';

export const dashboardRouter = Router();

function isAuthenticated(req: Request): boolean {
  return !!(req.session as Record<string, unknown>)?.user;
}

dashboardRouter.get('/dashboard', async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) {
    res.redirect('/auth/discord');
    return;
  }
  const session = (req.session as Record<string, unknown>).user as { clanTag: string; guildId: string; username: string };
  try {
    const [clanInfo, lb, players] = await Promise.all([
      getClanInfo(session.clanTag),
      getLeaderboard(session.clanTag, 'mensual'),
      prisma.jugador.findMany({ where: { clanTag: session.clanTag, status: 'active' } }),
    ]);
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clash Royale Bot — Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { color: #FFD700; margin-bottom: 10px; }
    h2 { color: #FFD700; margin: 20px 0 10px; border-bottom: 1px solid #333; padding-bottom: 5px; }
    .card { background: #16213e; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .stat { background: #0f3460; padding: 10px; border-radius: 6px; text-align: center; }
    .stat .value { font-size: 24px; font-weight: bold; color: #FFD700; }
    .stat .label { font-size: 12px; color: #888; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #333; }
    th { color: #FFD700; font-size: 12px; text-transform: uppercase; }
    tr:hover { background: #0f3460; }
    .rank-1 { color: #FFD700; }
    .rank-2 { color: #C0C0C0; }
    .rank-3 { color: #CD7F32; }
    .logout { float: right; color: #e74c3c; text-decoration: none; font-size: 14px; }
    .user { float: right; margin-right: 15px; font-size: 14px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <a href="/auth/logout" class="logout">Cerrar sesión</a>
    <span class="user">👤 ${session.username}</span>
    <h1>🏰 ${clanInfo.name}</h1>
    <p>Tag: ${clanInfo.tag} · ${players.length}/50 miembros</p>
    <div class="stats">
      <div class="stat"><div class="value">${clanInfo.clanScore}</div><div class="label">Trofeos</div></div>
      <div class="stat"><div class="value">${clanInfo.trophies || 0}</div><div class="label">Trofeos temporada</div></div>
      <div class="stat"><div class="value">${clanInfo.donationsPerWeek || 0}</div><div class="label">Donaciones/semana</div></div>
      <div class="stat"><div class="value">${clanInfo.members}/50</div><div class="label">Miembros</div></div>
    </div>
    <h2>🏆 Ranking Mensual</h2>
    <div class="card">
      ${lb.length === 0 ? '<p>Sin datos</p>' : `
      <table>
        <tr><th>#</th><th>Jugador</th><th>Puntos</th></tr>
        ${lb.map((p) => `<tr><td class="rank-${p.rank}">${p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : p.rank}</td><td>${p.name}</td><td>${p.points}</td></tr>`).join('')}
      </table>
      `}
    </div>
    <h2>👥 Miembros</h2>
    <div class="card">
      <table>
        <tr><th>Nombre</th><th>Tag</th><th>Trofeos</th><th>Rol</th><th>Discord</th><th>Telegram</th></tr>
        ${players.map((p) => `<tr><td>${p.name}</td><td>${p.tag}</td><td>${p.trophies || 0}</td><td>${p.role || '-'}</td><td>${p.idDiscord ? '✅' : '❌'}</td><td>${p.idTelegram ? '✅' : '❌'}</td></tr>`).join('')}
      </table>
    </div>
  </div>
</body>
</html>
    `);
  } catch (err) {
    res.status(500).send('Error al cargar el dashboard');
  }
});

dashboardRouter.get('/', (req: Request, res: Response) => {
  if (isAuthenticated(req)) {
    res.redirect('/dashboard');
  } else {
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Clash Royale Bot</title>
<style>
  body { font-family: sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; justify-content: center; align-items: center; height: 100vh; }
  .card { background: #16213e; padding: 40px; border-radius: 12px; text-align: center; }
  h1 { color: #FFD700; margin-bottom: 20px; }
  a { display: inline-block; background: #5865F2; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; }
  a:hover { background: #4752C4; }
</style></head>
<body>
  <div class="card">
    <h1>🏰 Clash Royale Bot</h1>
    <p style="margin-bottom:20px">Panel de administración para líderes</p>
    <a href="/auth/discord">Iniciar sesión con Discord</a>
  </div>
</body>
</html>
    `);
  }
});
