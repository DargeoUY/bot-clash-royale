import { Router, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../database/prisma';
import { config } from '../config';
import { getClanInfo } from '../api/clan';
import { executeCommand, audit, CommandActor } from '../platform/commands';
import { equalSecret, hashPassword, verifyPassword, tokenHash, rateLimit } from './security';
import { whatsapp } from '../whatsapp';
import { formatPlayerTag, isValidPlayerTag } from '../utils/validators';
import logger from '../config/logger';

export const apiRouter = Router();
const credentials = z.object({ email: z.string().email().max(190).transform(v => v.toLowerCase()), password: z.string().min(12).max(128) });
const asyncRoute = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const saveSession = (req: Request) => new Promise<void>((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
async function login(req: Request, accountId: string) {
  await new Promise<void>((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
  req.session.accountId = accountId; req.session.csrf = randomBytes(32).toString('hex'); await saveSession(req);
}
apiRouter.get('/session', asyncRoute(async (req, res) => {
  req.session.csrf ||= randomBytes(32).toString('hex');
  const account = req.session.accountId ? await prisma.webAccount.findUnique({ where: { id: req.session.accountId }, select: { id: true, name: true } }) : null;
  const clans = account ? await prisma.clanAccess.findMany({ where: { accountId: account.id }, include: { clan: true } }) : [];
  if (req.session.user) {
    const clan = await prisma.clan.findUnique({ where: { tag: req.session.user.clanTag } });
    if (clan) clans.push({ id: 0, accountId: '', clanTag: clan.tag, role: 'admin', playerTag: null, clan });
  }
  await saveSession(req);
  res.json({ csrf: req.session.csrf, user: account || (req.session.user ? { name: req.session.user.username } : null),
    clans: clans.map(a => ({ tag: a.clanTag, name: a.clan.name, role: a.role, playerTag: a.playerTag })) });
}));
apiRouter.post('/login', rateLimit(10, 15 * 60 * 1000), asyncRoute(async (req, res) => {
  const body = credentials.parse(req.body);
  const account = await prisma.webAccount.findUnique({ where: { email: body.email } });
  const valid = await verifyPassword(body.password, account?.passwordHash || `${'0'.repeat(32)}:${'0'.repeat(128)}`);
  if (!account || !valid) { res.status(401).json({ error: 'Correo o contraseña incorrectos.' }); return; }
  await login(req, account.id); res.json({ ok: true });
}));
apiRouter.post('/register', rateLimit(6, 60 * 60 * 1000), asyncRoute(async (req, res) => {
  const body = credentials.extend({ name: z.string().trim().min(2).max(100), token: z.string().min(1).max(256), clanTag: z.string().max(30).optional() }).parse(req.body);
  const passwordHash = await hashPassword(body.password);
  let accountId: string;
  if (equalSecret(body.token, config.SIGNUP_TOKEN)) {
    if (!body.clanTag || !isValidPlayerTag(body.clanTag)) throw new Error('Indicá un tag de clan válido.');
    const info = await getClanInfo(formatPlayerTag(body.clanTag));
    accountId = await prisma.$transaction(async tx => {
      // The deployment operator's invitation is the authority to create administrators.
      await tx.clan.upsert({ where: { tag: info.tag }, create: { tag: info.tag, name: info.name, discordEnabled: false, telegramEnabled: false }, update: { name: info.name } });
      const account = await tx.webAccount.create({ data: { email: body.email, name: body.name, passwordHash } });
      await tx.clanAccess.create({ data: { accountId: account.id, clanTag: info.tag, role: 'admin' } });
      await tx.auditEvent.create({ data: { clanTag: info.tag, actor: account.id, action: 'register_admin', detail: 'Invitación del operador' } });
      return account.id;
    });
  } else {
    accountId = await prisma.$transaction(async tx => {
      const invite = await tx.webInvite.findUnique({ where: { tokenHash: tokenHash(body.token) } });
      if (!invite || !['member', 'admin'].includes(invite.role) || invite.expiresAt <= new Date()) throw new Error('Invitación inválida o vencida.');
      const claimed = await tx.webInvite.deleteMany({ where: { tokenHash: invite.tokenHash, expiresAt: { gt: new Date() } } });
      if (claimed.count !== 1) throw new Error('Invitación ya utilizada.');
      const account = await tx.webAccount.create({ data: { email: body.email, name: body.name, passwordHash } });
      await tx.clanAccess.create({ data: { accountId: account.id, clanTag: invite.clanTag, role: invite.role, playerTag: invite.playerTag } });
      return account.id;
    });
  }
  await login(req, accountId); res.status(201).json({ ok: true });
}));
apiRouter.post('/logout', (req, res) => req.session.destroy(() => { res.clearCookie('royale.sid'); res.json({ ok: true }); }));

export async function actorFor(req: Request, admin = false): Promise<CommandActor> {
  const clanTag = String(req.params.clanTag);
  if (req.session.user?.clanTag === clanTag) return { id: `discord:${req.session.user.id}`, clanTag, admin: true };
  const access = req.session.accountId ? await prisma.clanAccess.findUnique({ where: { accountId_clanTag: { accountId: req.session.accountId, clanTag } } }) : null;
  if (!access || (admin && access.role !== 'admin')) throw Object.assign(new Error('Acceso denegado.'), { status: 403 });
  return { id: access.accountId, clanTag, admin: access.role === 'admin', playerTag: access.playerTag };
}
apiRouter.post('/clans', asyncRoute(async (req, res) => {
  if (!req.session.accountId) throw Object.assign(new Error('Iniciá sesión con tu cuenta web.'), { status: 401 });
  const body = z.object({ token: z.string().max(256), tag: z.string().max(30) }).parse(req.body);
  if (!equalSecret(body.token, config.SIGNUP_TOKEN) || !isValidPlayerTag(body.tag)) throw new Error('Invitación o tag inválido.');
  const clan = await getClanInfo(formatPlayerTag(body.tag));
  await prisma.$transaction(async tx => {
    await tx.clan.upsert({ where: { tag: clan.tag }, update: { name: clan.name }, create: { tag: clan.tag, name: clan.name, discordEnabled: false, telegramEnabled: false } });
    await tx.clanAccess.create({ data: { accountId: req.session.accountId!, clanTag: clan.tag, role: 'admin' } });
  });
  res.status(201).json({ ok: true });
}));
apiRouter.get('/clans/:clanTag/overview', asyncRoute(async (req, res) => {
  const actor = await actorFor(req);
  const [clan, players, war] = await Promise.all([
    prisma.clan.findUniqueOrThrow({ where: { tag: actor.clanTag } }),
    prisma.jugador.findMany({ where: { clanTag: actor.clanTag, estado: 'active' }, select: { tag: true, nombre: true, rol: true, trofeos: true, ultimaActividad: true }, orderBy: { trofeos: 'desc' } }),
    prisma.registroGuerra.findFirst({ where: { clanTag: actor.clanTag }, orderBy: { createdAt: 'desc' }, include: { participaciones: true } }),
  ]);
  res.json({ clan: { tag: clan.tag, name: clan.name, description: clan.description,
    discordEnabled: clan.discordEnabled, telegramEnabled: clan.telegramEnabled, whatsappEnabled: clan.whatsappEnabled,
    whatsappGroup: actor.admin ? clan.whatsappGroup : undefined, guildId: actor.admin ? clan.idServidorDiscord : undefined }, players, war });
}));
apiRouter.post('/clans/:clanTag/command', rateLimit(60, 60000), asyncRoute(async (req, res) => {
  const actor = await actorFor(req);
  const body = z.object({ command: z.string().trim().min(1).max(600) }).parse(req.body);
  res.json({ text: await executeCommand(actor, body.command) });
}));
apiRouter.post('/clans/:clanTag/discord-code', asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true); const token = randomBytes(24).toString('hex');
  await prisma.webInvite.create({ data: { tokenHash: tokenHash(token), clanTag: actor.clanTag, role: 'discord-link', expiresAt: new Date(Date.now() + 600000) } });
  await audit(actor, 'discord_link_code', 'Vigencia 10 minutos'); res.json({ token });
}));
apiRouter.post('/clans/:clanTag/invite', asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true);
  const body = z.object({ role: z.enum(['admin', 'member']), playerTag: z.string().max(30).optional() }).parse(req.body);
  const playerTag = body.playerTag ? formatPlayerTag(body.playerTag) : null;
  if (playerTag) await prisma.jugador.findFirstOrThrow({ where: { tag: playerTag, clanTag: actor.clanTag, estado: 'active' } });
  const token = randomBytes(32).toString('hex');
  await prisma.webInvite.create({ data: { tokenHash: tokenHash(token), clanTag: actor.clanTag, playerTag, role: body.role, expiresAt: new Date(Date.now() + 86400000) } });
  await audit(actor, 'invite', body.role); res.status(201).json({ token, expiresInHours: 24 });
}));
apiRouter.post('/clans/:clanTag/link-player', asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true);
  const body = z.object({ tag: z.string().max(30), whatsappId: z.string().regex(/^\d{5,20}@(s\.whatsapp\.net|lid)$/) }).parse(req.body);
  const tag = formatPlayerTag(body.tag);
  const player = await prisma.jugador.findFirstOrThrow({ where: { tag, clanTag: actor.clanTag, estado: 'active' } });
  await prisma.$transaction(async tx => {
    await tx.jugador.updateMany({ where: { clanTag: actor.clanTag, idWhatsapp: body.whatsappId }, data: { idWhatsapp: null } });
    await tx.jugador.update({ where: { id: player.id }, data: { idWhatsapp: body.whatsappId } });
  });
  await audit(actor, 'link_player', tag); res.json({ ok: true });
}));
apiRouter.get('/clans/:clanTag/access', asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true);
  res.json(await prisma.clanAccess.findMany({ where: { clanTag: actor.clanTag }, select: { id: true, role: true, playerTag: true, account: { select: { name: true, email: true } } } }));
}));
apiRouter.delete('/clans/:clanTag/access/:id', asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true);
  // Keep one's own access, preventing accidental removal of the last administrator.
  await prisma.clanAccess.deleteMany({ where: { id: Number(req.params.id), clanTag: actor.clanTag, accountId: { not: actor.id } } });
  await audit(actor, 'revoke_access', String(req.params.id)); res.json({ ok: true });
}));
apiRouter.patch('/clans/:clanTag/channels', asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true);
  const body = z.object({ discordEnabled: z.boolean(), telegramEnabled: z.boolean(), whatsappEnabled: z.boolean(), whatsappGroup: z.string().regex(/^\d{5,30}@g\.us$/).or(z.literal('')).optional(), telegramCode: z.string().max(30).optional() }).parse(req.body);
  await prisma.$transaction(async tx => {
    let chatId: bigint | undefined;
    if (body.telegramCode) {
      const code = await tx.conexionTelegram.findUnique({ where: { codigo: body.telegramCode.toUpperCase() } });
      if (!code || code.usado || !code.chatId || code.expiraEn <= new Date()) throw new Error('Código Telegram inválido.');
      const used = await tx.conexionTelegram.updateMany({ where: { id: code.id, usado: false }, data: { usado: true } });
      if (used.count !== 1) throw new Error('Código Telegram ya utilizado.');
      const other = await tx.clan.findFirst({ where: { idChatTelegram: code.chatId, tag: { not: actor.clanTag } } });
      if (other) throw new Error('Ese grupo ya pertenece a otro clan.');
      chatId = code.chatId;
    }
    await tx.clan.update({ where: { tag: actor.clanTag }, data: { discordEnabled: body.discordEnabled, telegramEnabled: body.telegramEnabled,
      whatsappEnabled: body.whatsappEnabled, whatsappGroup: body.whatsappGroup || null, ...(chatId !== undefined ? { idChatTelegram: chatId } : {}) } });
  });
  if (!body.whatsappEnabled) await whatsapp.disconnect(actor.clanTag);
  await audit(actor, 'channels', JSON.stringify({ discord: body.discordEnabled, telegram: body.telegramEnabled, whatsapp: body.whatsappEnabled }));
  res.json({ ok: true });
}));
apiRouter.post('/clans/:clanTag/whatsapp/connect', rateLimit(6, 60000), asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true); await whatsapp.connect(actor.clanTag); await audit(actor, 'whatsapp_connect', 'QR solicitado'); res.json({ ok: true });
}));
apiRouter.get('/clans/:clanTag/whatsapp/groups', asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true); res.json(await whatsapp.groups(actor.clanTag));
}));
apiRouter.get('/clans/:clanTag/whatsapp', asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true); res.json(await whatsapp.status(actor.clanTag));
}));
apiRouter.delete('/clans/:clanTag/whatsapp', asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true); await whatsapp.disconnect(actor.clanTag, true); await audit(actor, 'whatsapp_logout', 'Sesión eliminada'); res.json({ ok: true });
}));
apiRouter.get('/clans/:clanTag/audit', asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true);
  res.json(await prisma.auditEvent.findMany({ where: { clanTag: actor.clanTag }, orderBy: { id: 'desc' }, take: 100 }));
}));
apiRouter.get('/clans/:clanTag/export', asyncRoute(async (req, res) => {
  const actor = await actorFor(req, true);
  const rows = await prisma.jugador.findMany({ where: { clanTag: actor.clanTag }, select: { tag: true, nombre: true, rol: true, trofeos: true, estado: true } });
  const cell = (v: unknown) => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
  res.attachment('miembros.csv').type('text/csv').send('\uFEFF' + ['tag,nombre,rol,trofeos,estado', ...rows.map(r => Object.values(r).map(cell).join(','))].join('\r\n'));
}));
apiRouter.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) { res.status(400).json({ error: error.issues.map(i => i.message).join('. ') }); return; }
  const e = error as { status?: number; code?: string; message?: string };
  if (e.code) { logger.warn('Operación de datos rechazada', { code: e.code }); res.status(400).json({ error: 'No se pudo guardar. Revisá los datos o si la cuenta ya existe.' }); return; }
  res.status(e.status || 400).json({ error: e.message || 'No se pudo completar la operación.' });
});
