import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { MemoryStore } from 'express-session';
const db = vi.hoisted(() => ({
  webAccount: { findUnique: vi.fn() }, clanAccess: { findMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
  clan: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() }, jugador: { findMany: vi.fn() },
  registroGuerra: { findFirst: vi.fn() }, auditEvent: { create: vi.fn(), findMany: vi.fn() },
}));
vi.mock('../src/database/prisma', () => ({ default: db }));
vi.mock('../src/whatsapp', () => ({ whatsapp: { status: vi.fn(), connect: vi.fn() } }));
import { createApp } from '../src/web';
import { hashPassword } from '../src/web/security';

async function authenticated(role = 'member') {
  const app = createApp(new MemoryStore()); const agent = request.agent(app);
  db.webAccount.findUnique.mockResolvedValue({ id: 'account-a', name: 'A', passwordHash: await hashPassword('long-password-123') });
  db.clanAccess.findMany.mockResolvedValue([]);
  let session = (await agent.get('/api/session')).body;
  await agent.post('/api/login').set('x-csrf-token', session.csrf).send({ email: 'a@example.com', password: 'long-password-123' }).expect(200);
  session = (await agent.get('/api/session')).body;
  db.clanAccess.findUnique.mockImplementation(({ where }) => Promise.resolve(where.accountId_clanTag.clanTag === '#AAA' ? { accountId: 'account-a', clanTag: '#AAA', role } : null));
  return { agent, csrf: session.csrf };
}
beforeEach(() => vi.resetAllMocks());
describe('web boundaries', () => {
  it('serves public page with strict browser policy and health', async () => {
    const app = createApp(new MemoryStore());
    const page = await request(app).get('/').expect(200); expect(page.text).toContain('NEXUS ARENA');
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect(page.headers['x-powered-by']).toBeUndefined(); await request(app).get('/health').expect(200);
  });
  it('blocks unauthenticated clan exports', async () => {
    await request(createApp(new MemoryStore())).get('/api/clans/%23AAA/export').expect(403);
    expect(db.jugador.findMany).not.toHaveBeenCalled();
  });
  it('requires CSRF tokens even for login', async () => {
    await request(createApp(new MemoryStore())).post('/api/login').send({ email: 'a@example.com', password: 'long-password-123' }).expect(403);
    expect(db.webAccount.findUnique).not.toHaveBeenCalled();
  });
  it('blocks cross-site origins with a valid CSRF token', async () => {
    const app = createApp(new MemoryStore()); const agent = request.agent(app);
    const session = (await agent.get('/api/session')).body;
    await agent.post('/api/login').set('Origin', 'https://evil.example').set('x-csrf-token', session.csrf).send({}).expect(403);
  });
  it('isolates clan B from an authenticated member of clan A', async () => {
    const { agent } = await authenticated();
    await agent.get('/api/clans/%23BBB/overview').expect(403);
    expect(db.clan.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it('blocks member channel changes and WhatsApp QR access', async () => {
    const { agent, csrf } = await authenticated();
    await agent.patch('/api/clans/%23AAA/channels').set('x-csrf-token', csrf).send({}).expect(403);
    await agent.get('/api/clans/%23AAA/whatsapp').expect(403);
    await agent.get('/api/clans/%23AAA/audit').expect(403);
    await agent.get('/api/clans/%23AAA/export').expect(403);
  });
  it('allows an administrator export, scopes query and neutralizes spreadsheet formulas', async () => {
    const { agent } = await authenticated('admin');
    db.jugador.findMany.mockResolvedValue([{ tag: '#A', nombre: '=1+1', rol: 'member', trofeos: 5, estado: 'active' }]);
    const res = await agent.get('/api/clans/%23AAA/export').expect(200);
    expect(res.text).toContain("'=1+1"); expect(db.jugador.findMany.mock.calls[0][0].where.clanTag).toBe('#AAA');
  });
  it('invalidates session on logout', async () => {
    const { agent, csrf } = await authenticated('admin');
    await agent.post('/api/logout').set('x-csrf-token', csrf).send({}).expect(200);
    await agent.get('/api/clans/%23AAA/export').expect(403);
  });
  it('rejects oversized JSON', async () => {
    await request(createApp(new MemoryStore())).post('/api/login').send({ field: 'x'.repeat(18000) }).expect(413);
  });
});
