import { Router, Request, Response } from 'express';
import prisma from '../database/prisma';
import { getClanInfo } from '../api/clan';
import { getLeaderboard } from '../services/points.service';
import {
  getWeeklyTrophyRanking,
  getMonthlyTrophyRanking,
  getDonationRanking,
  getWarRanking,
} from '../services/ranking.service';

export const dashboardRouter = Router();

function isAuthenticated(req: Request): boolean {
  return !!((req.session as any)?.user);
}

const BG_IMAGE = 'https://images2.alphacoders.com/112/1124066.jpg';
const LOGO_URL = 'https://staticg.sportskeeda.com/editor/2025/09/c3b8c-17586187081987-1920.jpg';

function renderRankingTable(
  rows: { rank: number; nombre: string; valor: string; extra?: string }[],
  col1: string,
  col2: string,
  col3?: string,
): string {
  if (rows.length === 0) return '<div class="empty-state"><i class="fas fa-trophy"></i>Sin datos</div>';
  return `<table><thead><tr><th>#</th><th>${col1}</th><th>${col2}</th>${col3 ? `<th>${col3}</th>` : ''}</tr></thead><tbody>
    ${rows.map((r) => `<tr>
      <td class="rank-cell rank-${r.rank}">${r.rank === 1 ? '<span class="medal">🥇</span>' : r.rank === 2 ? '<span class="medal">🥈</span>' : r.rank === 3 ? '<span class="medal">🥉</span>' : r.rank}</td>
      <td class="name-cell">${r.nombre}</td>
      <td class="points-cell">${r.valor}</td>
      ${col3 ? `<td>${r.extra || ''}</td>` : ''}
    </tr>`).join('')}
  </tbody></table>`;
}

async function fetchAllRankings(clanTag: string) {
  const [lb, trofeosSemanal, trofeosMensual, donaciones, guerra] = await Promise.all([
    getLeaderboard(clanTag, 'mensual'),
    getWeeklyTrophyRanking(clanTag),
    getMonthlyTrophyRanking(clanTag),
    getDonationRanking(clanTag),
    getWarRanking(clanTag),
  ]);
  return {
    puntos: lb.map((p) => ({ rank: p.rank, nombre: p.nombre, valor: `${p.points} pts` })),
    trofeosSemanal: trofeosSemanal.map((p) => ({ rank: p.rank, nombre: p.nombre, valor: `${p.delta >= 0 ? '+' : ''}${p.delta}`, extra: `${p.trofeos} 🏆` })),
    trofeosMensual: trofeosMensual.map((p) => ({ rank: p.rank, nombre: p.nombre, valor: `${p.delta >= 0 ? '+' : ''}${p.delta}`, extra: `${p.trofeos} 🏆` })),
    donaciones: donaciones.map((p) => ({ rank: p.rank, nombre: p.nombre, valor: `${p.donations} donadas` })),
    guerra: guerra.map((p) => ({ rank: p.rank, nombre: p.nombre, valor: `${p.fame} fama` })),
  };
}

// API JSON para auto-refresh
dashboardRouter.get('/dashboard/data', async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: 'No autenticado' }); return; }
  const session = (req.session as any).user as { clanTag: string };
  try {
    const rankings = await fetchAllRankings(session.clanTag);
    res.json(rankings);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

function tabBtn(id: string, label: string, icon: string, active?: boolean) {
  return `<button class="tab-btn${active ? ' active' : ''}" data-tab="${id}"><i class="fas fa-${icon}"></i> ${label}</button>`;
}

function tabContent(id: string, html: string, active?: boolean) {
  return `<div class="tab-pane${active ? ' active' : ''}" id="tab-${id}">${html}</div>`;
}

dashboardRouter.get('/dashboard', async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) { res.redirect('/auth/discord'); return; }
  const session = (req.session as any).user as { clanTag: string; guildId: string; username: string };
  try {
    const [clanInfo, players, rankings] = await Promise.all([
      getClanInfo(session.clanTag),
      prisma.jugador.findMany({ where: { clanTag: session.clanTag, estado: 'active' } }),
      fetchAllRankings(session.clanTag),
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
    body { font-family: 'Inter', sans-serif; background: #0a0a12; min-height: 100vh; color: #e0e0e0; position: relative; }
    body::before { content: ''; position: fixed; inset: 0; background: url('${BG_IMAGE}') center/cover no-repeat fixed; opacity: 0.15; z-index: 0; }
    .container { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; padding: 30px 20px 60px; }
    .top-bar { display: flex; justify-content: flex-end; align-items: center; gap: 12px; margin-bottom: 30px; }
    .user-badge { background: rgba(255,255,255,0.06); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08); border-radius: 100px; padding: 8px 18px 8px 8px; display: flex; align-items: center; gap: 10px; font-size: 14px; color: #aaa; }
    .user-badge .avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 14px; }
    .btn-logout { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.25); color: #ef4444; padding: 8px 16px; border-radius: 100px; text-decoration: none; font-size: 13px; font-weight: 600; transition: all 0.2s; }
    .btn-logout:hover { background: rgba(239,68,68,0.25); }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 3px solid rgba(255,215,0,0.3); box-shadow: 0 0 40px rgba(255,215,0,0.1); margin-bottom: 16px; }
    .header h1 { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #ffd700, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .header .tag { font-size: 14px; color: #666; margin-top: 4px; }
    .header .tag span { color: #ffd700; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 40px; }
    .stat-card { background: rgba(255,255,255,0.04); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 20px; text-align: center; transition: transform 0.2s, border-color 0.2s; }
    .stat-card:hover { transform: translateY(-2px); border-color: rgba(255,215,0,0.2); }
    .stat-card .icon { font-size: 28px; margin-bottom: 8px; display: block; }
    .stat-card .value { font-size: 28px; font-weight: 800; color: #ffd700; }
    .stat-card .label { font-size: 12px; color: #777; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
    .section-title { font-size: 20px; font-weight: 700; color: #ffd700; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
    .section-title i { font-size: 18px; opacity: 0.7; }
    .card { background: rgba(255,255,255,0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 20px; margin-bottom: 32px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    thead th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #666; border-bottom: 1px solid rgba(255,255,255,0.06); }
    tbody td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.03); }
    tbody tr:hover { background: rgba(255,255,255,0.03); }
    .rank-cell { font-weight: 700; font-size: 13px; }
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
    .empty-state { text-align: center; padding: 40px 20px; color: #555; }
    .empty-state i { font-size: 40px; margin-bottom: 12px; display: block; opacity: 0.3; }
    .footer { text-align: center; font-size: 12px; color: #444; margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.04); }
    /* Tabs */
    .tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
    .tab-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); color: #888; padding: 10px 18px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; font-family: inherit; display: flex; align-items: center; gap: 8px; }
    .tab-btn:hover { background: rgba(255,255,255,0.08); color: #ddd; }
    .tab-btn.active { background: rgba(255,215,0,0.12); border-color: rgba(255,215,0,0.25); color: #ffd700; }
    .tab-btn i { font-size: 14px; }
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }
    .refresh-indicator { font-size: 12px; color: #555; text-align: right; margin-top: 8px; }
    @media (max-width: 600px) { .container { padding: 20px 12px; } .header h1 { font-size: 24px; } .stats-grid { grid-template-columns: repeat(2, 1fr); } .tabs { gap: 4px; } .tab-btn { padding: 8px 12px; font-size: 12px; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="top-bar">
      <div class="user-badge"><div class="avatar">${session.username.charAt(0).toUpperCase()}</div>${session.username}</div>
      <a href="/auth/logout" class="btn-logout"><i class="fas fa-sign-out-alt"></i> Salir</a>
    </div>
    <div class="header">
      <img src="${LOGO_URL}" alt="Clash Royale" class="logo" onerror="this.style.display='none'">
      <h1>${clanInfo.name}</h1>
      <div class="tag">${clanInfo.tag} · <span>${players.length}</span>/50 miembros</div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><i class="fas fa-trophy icon"></i><div class="value">${clanInfo.clanScore?.toLocaleString() || 0}</div><div class="label">Trofeos del clan</div></div>
      <div class="stat-card"><i class="fas fa-shield-halved icon"></i><div class="value">${clanInfo.clanWarTrophies || 0}</div><div class="label">Trofeos de guerra</div></div>
      <div class="stat-card"><i class="fas fa-hand-holding-heart icon"></i><div class="value">${clanInfo.donationsPerWeek || 0}</div><div class="label">Donaciones/semana</div></div>
      <div class="stat-card"><i class="fas fa-users icon"></i><div class="value">${clanInfo.members || players.length}</div><div class="label">Miembros</div></div>
    </div>

    <div class="section-title"><i class="fas fa-crown"></i> Rankings</div>
    <div class="card">
      <div class="tabs" id="tabNav">
        ${tabBtn('puntos', 'Puntos', 'star', true)}
        ${tabBtn('trofeos-semanal', 'Trofeos Semanal', 'chart-line')}
        ${tabBtn('trofeos-mensual', 'Trofeos Mensual', 'chart-simple')}
        ${tabBtn('donaciones', 'Donaciones', 'hand-holding-heart')}
        ${tabBtn('guerra', 'Guerra', 'shield-halved')}
      </div>
      <div id="tabContainer">
        ${tabContent('puntos', renderRankingTable(rankings.puntos, 'Jugador', 'Puntos'), true)}
        ${tabContent('trofeos-semanal', renderRankingTable(rankings.trofeosSemanal, 'Jugador', 'Delta', 'Trofeos'))}
        ${tabContent('trofeos-mensual', renderRankingTable(rankings.trofeosMensual, 'Jugador', 'Delta', 'Trofeos'))}
        ${tabContent('donaciones', renderRankingTable(rankings.donaciones, 'Jugador', 'Donaciones'))}
        ${tabContent('guerra', renderRankingTable(rankings.guerra, 'Jugador', 'Fama'))}
      </div>
      <div class="refresh-indicator" id="refreshIndicator"><i class="fas fa-sync-alt"></i> Actualizando cada 30s</div>
    </div>

    <div class="section-title"><i class="fas fa-users"></i> Miembros</div>
    <div class="card">
      <table>
        <thead><tr><th>Nombre</th><th>Trofeos</th><th>Rol</th><th>Conexión</th></tr></thead>
        <tbody>
          ${players.map((p) => {
            const conn = p.idDiscord && p.idTelegram ? '<span class="badge badge-both"><i class="fas fa-check"></i> Ambos</span>'
              : p.idDiscord ? '<span class="badge badge-discord"><i class="fab fa-discord"></i> Discord</span>'
              : p.idTelegram ? '<span class="badge badge-telegram"><i class="fab fa-telegram"></i> Telegram</span>'
              : '<span class="badge badge-none"><i class="fas fa-times"></i> Sin conectar</span>';
            return `<tr><td class="name-cell">${p.nombre}</td><td>${p.trofeos?.toLocaleString() || 0}</td><td>${p.rol || '-'}</td><td>${conn}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="footer">Asistente Royale &mdash; Panel de administración</div>
  </div>
  <script>
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });
    // Auto-refresh cada 30s
    async function refreshRankings() {
      try {
        const res = await fetch('/dashboard/data');
        if (!res.ok) return;
        const data = await res.json();
        const updatePane = (id, rows, col2, col3) => {
          const pane = document.querySelector('#tab-' + id + ' .empty-state, #tab-' + id + ' table');
          if (!pane) return;
          const container = document.getElementById('tab-' + id);
          if (rows.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-trophy"></i>Sin datos</div>';
            return;
          }
          const col3th = col3 ? '<th>' + col3 + '</th>' : '';
          const col3td = col3 ? (r) => '<td>' + (r.extra || '') + '</td>' : () => '';
          container.innerHTML = '<table><thead><tr><th>#</th><th>Jugador</th><th>' + col2 + '</th>' + col3th + '</tr></thead><tbody>' +
            rows.map((r, i) => '<tr><td class="rank-cell rank-' + (i+1) + '">' + (i === 0 ? '<span class="medal">🥇</span>' : i === 1 ? '<span class="medal">🥈</span>' : i === 2 ? '<span class="medal">🥉</span>' : (i+1)) + '</td><td class="name-cell">' + r.nombre + '</td><td class="points-cell">' + r.valor + '</td>' + col3td(r) + '</tr>').join('') +
            '</tbody></table>';
        };
        updatePane('puntos', data.puntos, 'Puntos');
        updatePane('trofeos-semanal', data.trofeosSemanal, 'Delta', 'Trofeos');
        updatePane('trofeos-mensual', data.trofeosMensual, 'Delta', 'Trofeos');
        updatePane('donaciones', data.donaciones, 'Donaciones');
        updatePane('guerra', data.guerra, 'Fama');
      } catch {}
    }
    setInterval(refreshRankings, 30000);
  </script>
</body>
</html>`);
  } catch (err) {
    res.status(500).send('Error al cargar el dashboard');
  }
});
