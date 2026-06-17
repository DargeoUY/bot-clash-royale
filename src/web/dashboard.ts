import { Router, Request, Response } from 'express';
import prisma from '../database/prisma';
import { getClanInfo } from '../api/clan';
import { getLeaderboard } from '../services/points.service';

export const dashboardRouter = Router();

function isAuthenticated(req: Request): boolean {
  return !!((req.session as any)?.user);
}

const BG_IMAGE = 'https://images2.alphacoders.com/112/1124066.jpg';
const LOGO_URL = 'https://staticg.sportskeeda.com/editor/2025/09/c3b8c-17586187081987-1920.jpg';

dashboardRouter.get('/dashboard', async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) {
    res.redirect('/auth/discord');
    return;
  }
  const session = (req.session as any).user as { clanTag: string; guildId: string; username: string };
  try {
    const [clanInfo, lb, players] = await Promise.all([
      getClanInfo(session.clanTag),
      getLeaderboard(session.clanTag, 'mensual'),
      prisma.jugador.findMany({ where: { clanTag: session.clanTag, status: 'active' } }),
    ]);
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${clanInfo.name} — Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a12;
      min-height: 100vh;
      color: #e0e0e0;
      position: relative;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background: url('${BG_IMAGE}') center/cover no-repeat fixed;
      opacity: 0.15;
      z-index: 0;
    }
    .container {
      position: relative;
      z-index: 1;
      max-width: 1100px;
      margin: 0 auto;
      padding: 30px 20px 60px;
    }
    .top-bar {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 12px;
      margin-bottom: 30px;
    }
    .user-badge {
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 100px;
      padding: 8px 18px 8px 8px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      color: #aaa;
    }
    .user-badge i { font-size: 18px; }
    .user-badge .avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-weight: 700; font-size: 14px;
    }
    .btn-logout {
      background: rgba(239,68,68,0.15);
      border: 1px solid rgba(239,68,68,0.25);
      color: #ef4444;
      padding: 8px 16px;
      border-radius: 100px;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
    }
    .btn-logout:hover { background: rgba(239,68,68,0.25); }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .logo {
      width: 90px;
      height: 90px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid rgba(255,215,0,0.3);
      box-shadow: 0 0 40px rgba(255,215,0,0.1);
      margin-bottom: 16px;
    }
    .header h1 {
      font-size: 32px;
      font-weight: 800;
      background: linear-gradient(135deg, #ffd700, #f59e0b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .header .tag {
      font-size: 14px;
      color: #666;
      margin-top: 4px;
    }
    .header .tag span { color: #ffd700; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 40px;
    }
    .stat-card {
      background: rgba(255,255,255,0.04);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
      padding: 20px;
      text-align: center;
      transition: transform 0.2s, border-color 0.2s;
    }
    .stat-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255,215,0,0.2);
    }
    .stat-card .icon {
      font-size: 28px;
      margin-bottom: 8px;
      display: block;
    }
    .stat-card .value {
      font-size: 28px;
      font-weight: 800;
      color: #ffd700;
    }
    .stat-card .label {
      font-size: 12px;
      color: #777;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 4px;
    }
    .section-title {
      font-size: 20px;
      font-weight: 700;
      color: #ffd700;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-title i { font-size: 18px; opacity: 0.7; }
    .card {
      background: rgba(255,255,255,0.03);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 32px;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    thead th {
      text-align: left;
      padding: 10px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #666;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    tbody td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.03);
    }
    tbody tr:hover { background: rgba(255,255,255,0.03); }
    .rank-cell {
      font-weight: 700;
      font-size: 13px;
    }
    .rank-1 { color: #ffd700; }
    .rank-2 { color: #c0c0c0; }
    .rank-3 { color: #cd7f32; }
    .medal { font-size: 16px; }
    .name-cell { font-weight: 600; }
    .points-cell { color: #ffd700; font-weight: 700; }
    .badge { display: inline-block; font-size: 11px; padding: 2px 10px; border-radius: 100px; font-weight: 600; }
    .badge-discord { background: rgba(88,101,242,0.2); color: #8ea1e1; }
    .badge-telegram { background: rgba(0,136,204,0.2); color: #66bff0; }
    .badge-both { background: rgba(255,215,0,0.15); color: #ffd700; }
    .badge-none { background: rgba(255,255,255,0.05); color: #555; }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #555;
    }
    .empty-state i { font-size: 40px; margin-bottom: 12px; display: block; opacity: 0.3; }
    .footer {
      text-align: center;
      font-size: 12px;
      color: #444;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid rgba(255,255,255,0.04);
    }
    @media (max-width: 600px) {
      .container { padding: 20px 12px; }
      .header h1 { font-size: 24px; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="top-bar">
      <div class="user-badge">
        <div class="avatar">${session.username.charAt(0).toUpperCase()}</div>
        ${session.username}
      </div>
      <a href="/auth/logout" class="btn-logout"><i class="fas fa-sign-out-alt"></i> Salir</a>
    </div>

    <div class="header">
      <img src="${LOGO_URL}" alt="Clash Royale" class="logo" onerror="this.style.display='none'">
      <h1>${clanInfo.name}</h1>
      <div class="tag">${clanInfo.tag} · <span>${players.length}</span>/50 miembros</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <i class="fas fa-trophy icon"></i>
        <div class="value">${clanInfo.clanScore?.toLocaleString() || 0}</div>
        <div class="label">Trofeos del clan</div>
      </div>
      <div class="stat-card">
        <i class="fas fa-shield-halved icon"></i>
        <div class="value">${clanInfo.clanWarTrophies || 0}</div>
        <div class="label">Trofeos de guerra</div>
      </div>
      <div class="stat-card">
        <i class="fas fa-hand-holding-heart icon"></i>
        <div class="value">${clanInfo.donationsPerWeek || 0}</div>
        <div class="label">Donaciones/semana</div>
      </div>
      <div class="stat-card">
        <i class="fas fa-users icon"></i>
        <div class="value">${clanInfo.members || players.length}</div>
        <div class="label">Miembros</div>
      </div>
    </div>

    <div class="section-title"><i class="fas fa-crown"></i> Ranking Mensual</div>
    <div class="card">
      ${lb.length === 0 ? '<div class="empty-state"><i class="fas fa-trophy"></i>Sin datos de ranking</div>' : `
      <table>
        <thead>
          <tr><th>#</th><th>Jugador</th><th>Puntos</th></tr>
        </thead>
        <tbody>
          ${lb.map((p) => `<tr>
            <td class="rank-cell rank-${p.rank}">${p.rank === 1 ? '<span class="medal">🥇</span>' : p.rank === 2 ? '<span class="medal">🥈</span>' : p.rank === 3 ? '<span class="medal">🥉</span>' : p.rank}</td>
            <td class="name-cell">${p.name}</td>
            <td class="points-cell">${p.points.toLocaleString()}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      `}
    </div>

    <div class="section-title"><i class="fas fa-users"></i> Miembros</div>
    <div class="card">
      <table>
        <thead>
          <tr><th>Nombre</th><th>Trofeos</th><th>Rol</th><th>Conexión</th></tr>
        </thead>
        <tbody>
          ${players.map((p) => {
            const conn = p.idDiscord && p.idTelegram ? '<span class="badge badge-both"><i class="fas fa-check"></i> Ambos</span>'
              : p.idDiscord ? '<span class="badge badge-discord"><i class="fab fa-discord"></i> Discord</span>'
              : p.idTelegram ? '<span class="badge badge-telegram"><i class="fab fa-telegram"></i> Telegram</span>'
              : '<span class="badge badge-none"><i class="fas fa-times"></i> Sin conectar</span>';
            return `<tr>
              <td class="name-cell">${p.name}</td>
              <td>${p.trophies?.toLocaleString() || 0}</td>
              <td>${p.role || '-'}</td>
              <td>${conn}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="footer">
      Asistente Royale &mdash; Panel de administración
    </div>
  </div>
</body>
</html>`);
  } catch (err) {
    res.status(500).send('Error al cargar el dashboard');
  }
});

dashboardRouter.get('/', (req: Request, res: Response) => {
  if (isAuthenticated(req)) {
    res.redirect('/dashboard');
  } else {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Asistente Royale</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a12;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background: url('${BG_IMAGE}') center/cover no-repeat fixed;
      opacity: 0.12;
      z-index: 0;
    }
    .login-card {
      position: relative;
      z-index: 1;
      background: rgba(255,255,255,0.03);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      padding: 50px 40px;
      text-align: center;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
    }
    .login-logo {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid rgba(255,215,0,0.3);
      box-shadow: 0 0 50px rgba(255,215,0,0.08);
      margin-bottom: 20px;
    }
    .login-card h1 {
      font-size: 26px;
      font-weight: 800;
      background: linear-gradient(135deg, #ffd700, #f59e0b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 6px;
    }
    .login-card p {
      color: #666;
      font-size: 14px;
      margin-bottom: 30px;
    }
    .btn-discord {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: #5865F2;
      color: #fff;
      padding: 14px 32px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      transition: all 0.2s;
      border: none;
      cursor: pointer;
    }
    .btn-discord:hover {
      background: #4752C4;
      transform: translateY(-1px);
      box-shadow: 0 8px 25px rgba(88,101,242,0.25);
    }
    .btn-discord i { font-size: 20px; }
    .login-footer {
      margin-top: 24px;
      font-size: 12px;
      color: #444;
    }
  </style>
</head>
<body>
  <div class="login-card">
    <img src="${LOGO_URL}" alt="Clash Royale" class="login-logo" onerror="this.style.display='none'">
    <h1>Asistente Royale</h1>
    <p>Panel de administración para líderes y co-líderes</p>
    <a href="/auth/discord" class="btn-discord">
      <i class="fab fa-discord"></i>
      Iniciar sesión con Discord
    </a>
    <div class="login-footer">
      <i class="fas fa-shield-halved"></i> Solo líderes y co-líderes del clan
    </div>
  </div>
</body>
</html>`);
  }
});
