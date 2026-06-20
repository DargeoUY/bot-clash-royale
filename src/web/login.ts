import { Router, Request, Response } from 'express';

export const loginRouter = Router();

const BG_IMAGE = 'https://images2.alphacoders.com/112/1124066.jpg';
const LOGO_URL = 'https://staticg.sportskeeda.com/editor/2025/09/c3b8c-17586187081987-1920.jpg';

function isAuthenticated(req: Request): boolean {
  return !!((req.session as any)?.user);
}

loginRouter.get('/', (req: Request, res: Response) => {
  if (isAuthenticated(req)) { res.redirect('/dashboard'); return; }
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Asistente Royale</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #0a0a12; min-height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; }
    body::before { content: ''; position: fixed; inset: 0; background: url('${BG_IMAGE}') center/cover no-repeat fixed; opacity: 0.12; z-index: 0; }
    .login-card { position: relative; z-index: 1; background: rgba(255,255,255,0.03); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 50px 40px; text-align: center; max-width: 400px; width: 90%; box-shadow: 0 25px 60px rgba(0,0,0,0.5); }
    .login-logo { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 3px solid rgba(255,215,0,0.3); box-shadow: 0 0 50px rgba(255,215,0,0.08); margin-bottom: 20px; }
    .login-card h1 { font-size: 26px; font-weight: 800; background: linear-gradient(135deg, #ffd700, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 6px; }
    .login-card p { color: #666; font-size: 14px; margin-bottom: 30px; }
    .btn-discord { display: inline-flex; align-items: center; gap: 10px; background: #5865F2; color: #fff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px; transition: all 0.2s; border: none; cursor: pointer; }
    .btn-discord:hover { background: #4752C4; transform: translateY(-1px); box-shadow: 0 8px 25px rgba(88,101,242,0.25); }
    .btn-discord i { font-size: 20px; }
    .login-footer { margin-top: 24px; font-size: 12px; color: #444; }
  </style>
</head>
<body>
  <div class="login-card">
    <img src="${LOGO_URL}" alt="Clash Royale" class="login-logo" onerror="this.style.display='none'">
    <h1>Asistente Royale</h1>
    <p>Panel de administración para líderes y co-líderes</p>
    <a href="/auth/discord" class="btn-discord"><i class="fab fa-discord"></i> Iniciar sesión con Discord</a>
    <div class="login-footer"><i class="fas fa-shield-halved"></i> Solo líderes y co-líderes del clan</div>
  </div>
</body>
</html>`);
});
