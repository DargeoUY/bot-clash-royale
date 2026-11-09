import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';
import { RequestHandler } from 'express';
const scrypt = promisify(scryptCallback);
export const tokenHash = (value: string): string => createHash('sha256').update(value).digest('hex');
export function equalSecret(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(tokenHash(a)), Buffer.from(tokenHash(b)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected || !/^[a-f0-9]{128}$/.test(expected)) return false;
  const hash = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(hash, Buffer.from(expected, 'hex'));
}
export function csrfProtection(baseUrl: string): RequestHandler {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
    const origin = req.get('origin');
    if ((origin && origin !== new URL(baseUrl).origin) || !req.session.csrf ||
        !equalSecret(req.get('x-csrf-token') || '', req.session.csrf) || !req.is('application/json')) {
      res.status(403).json({ error: 'Solicitud no autorizada. Recargá la página.' }); return;
    }
    next();
  };
}
// A bounded per-IP limiter. Deploy one app replica unless a shared limiter is configured.
export function rateLimit(limit: number, windowMs: number): RequestHandler {
  const entries = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of entries) if (value.until <= now) entries.delete(key);
    const key = req.ip || 'unknown';
    const entry = entries.get(key) || { count: 0, until: now + windowMs };
    if (entry.count >= limit || (!entries.has(key) && entries.size >= 10000)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - now) / 1000))));
      res.status(429).json({ error: 'Demasiados intentos. Intentá más tarde.' }); return;
    }
    entry.count++; entries.set(key, entry); next();
  };
}
declare module 'express-session' {
  interface SessionData {
    accountId?: string;
    csrf?: string;
    oauthState?: { value: string; expires: number };
    user?: { id: string; username: string; clanTag: string; guildId: string };
  }
}
