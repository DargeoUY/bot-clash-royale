import { Router, Request, Response } from 'express';
import axios from 'axios';
import prisma from '../database/prisma';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const REDIRECT_URI = `${process.env.BASE_URL || 'https://13.140.185.223:3000'}/auth/discord/callback`;

export const authRouter = Router();

authRouter.get('/discord', (_req: Request, res: Response) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify+guilds`;
  res.redirect(url);
});

authRouter.get('/discord/callback', async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code) {
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
    const guilds = guildsRes.data as { id: string; owner: boolean; permissions: number }[];
    const managedGuild = guilds.find((g) => {
      const perm = g.permissions;
      return (perm & 0x20) !== 0 || g.owner;
    });
    if (!managedGuild) {
      res.status(403).send('No tenés permisos para administrar ningún servidor.');
      return;
    }
    const clan = await prisma.clan.findFirst({
      where: { idServidorDiscord: managedGuild.id },
    });
    if (!clan) {
      res.status(404).send('No se encontró un clan vinculado a tu servidor.');
      return;
    }
    (req.session as any).user = { id: user.id, username: user.username, clanTag: clan.tag, guildId: managedGuild.id };
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).send('Error de autenticación');
  }
});

authRouter.get('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});
