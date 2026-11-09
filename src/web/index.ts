import express from 'express';
import session from 'express-session';
import path from 'path';
import { config } from '../config';
import logger from '../config/logger';
import prisma from '../database/prisma';
import { authRouter } from './auth';
import { apiRouter } from './api';
import { csrfProtection, rateLimit } from './security';
import { DatabaseSessionStore } from './session-store';

export function createApp(store: session.Store = new DatabaseSessionStore()) {
  const app = express();
  app.disable('x-powered-by');
  // Explicit opt-in: only trust exactly one reverse proxy in front of the container.
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    next();
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.use(express.json({ limit: '16kb' }));
  app.use(session({ name: 'royale.sid', store, secret: config.SESSION_SECRET, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE === 'true', maxAge: 86400000 } }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, rateLimit(300, 60000), csrfProtection(config.BASE_URL), apiRouter);
  app.use('/auth', rateLimit(60, 60000), authRouter);
  app.use(express.static(path.join(process.cwd(), 'public'), { index: 'index.html' }));
  app.get('/dashboard', (_req, res) => res.redirect('/'));
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = (err as { status?: number })?.status;
    res.status(status === 413 ? 413 : 400).json({ error: 'Solicitud inválida.' });
  });
  return app;
}
export function startWebServer() {
  return createApp().listen(config.HEALTHCHECK_PORT, '0.0.0.0', () => logger.info(`Web disponible en puerto ${config.HEALTHCHECK_PORT}`));
}
