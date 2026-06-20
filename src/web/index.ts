import express from 'express';
import session from 'express-session';
import { config } from '../config';
import logger from '../config/logger';
import { authRouter } from './auth';
import { dashboardRouter } from './dashboard';
import { loginRouter } from './login';

const app = express();

app.use(session({
  secret: process.env.SESSION_SECRET || 'clash-royale-bot-secret',
  resave: false,
  saveUninitialized: false,
}));

app.use(express.json());
app.use('/auth', authRouter);
app.use('/', loginRouter);
app.use('/', dashboardRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

export function startWebServer(): void {
  app.listen(config.HEALTHCHECK_PORT, () => {
    logger.info(`Web server en puerto ${config.HEALTHCHECK_PORT}`);
  });
}
