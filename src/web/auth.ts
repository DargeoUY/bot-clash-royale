import { randomBytes } from 'crypto';
import { config } from '../config';
import { equalSecret } from './security';
import { Router, Request, Response } from 'express';
import axios from 'axios';
import prisma from '../database/prisma';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const REDIRECT_URI = `${config.BASE_URL}/auth/discord/callback`;

export const authRouter = Router();

authRouter.get('/discord', (req: Request, res: Response) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) { res.status(503).send('Discord no está configurado. Usá tu cuenta web.'); return; }
  const state = randomBytes(32).toString('hex');
  req.session.oauthState = { value: state, expires: Date.now() + 600000 };
  const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify+guilds&state=${state}`;
  req.session.save(error => { if (error) res.sendStatus(500); else res.redirect(url); });
});

authRouter.get('/discord/callback', async (req: Request, res: Response) => {
  const { code } = req.query;
  const state = req.session.oauthState;
  delete req.session.oauthState;
  if (typeof code !== 'string' || typeof req.query.state !== 'string' || !state || state.expires < Date.now() || !equalSecret(req.query.state, state.value)) {
    res.status(400).send('Código de autorización faltante');
    return;
  }
  try {
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: REDIRECT_URI,
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const { access_token } = tokenRes.data;
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const user = userRes.data;
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const guilds = guildsRes.data as { id: string; owner: boolean; permissions: string }[];
    const clanServerIds = (await prisma.clan.findMany({ select: { idServidorDiscord: true } }))
      .map((c) => c.idServidorDiscord)
      .filter(Boolean);

    const managedGuild = guilds.find((g) => {
      if (!clanServerIds.includes(g.id)) return false;
      if (g.owner) return true;
      try {
        const perms = BigInt(g.permissions);
        return (perms & BigInt(0x20)) !== BigInt(0);
      } catch {
        return false;
      }
    });
    if (!managedGuild) {
      res.status(403).send('No tenés permisos para administrar el servidor vinculado al clan.');
      return;
    }
    const clan = await prisma.clan.findFirst({
      where: { idServidorDiscord: managedGuild.id },
    });
    if (!clan) {
      res.status(404).send('No se encontró un clan vinculado a tu servidor.');
      return;
    }
    await new Promise<void>((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
    req.session.user = { id: user.id, username: user.username, clanTag: clan.tag, guildId: managedGuild.id };
    req.session.save(error => { if (error) res.sendStatus(500); else res.redirect('/'); });
  } catch (err) {
    console.error('Falló autenticación Discord');
    res.status(500).send('Error de autenticación');
  }
});

authRouter.get('/logout', (_req, res) => res.redirect('/'));
