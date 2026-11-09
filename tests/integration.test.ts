import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
// Only the external CR API is mocked. Auth, session, membership and invites use MariaDB.
vi.mock('../src/api/clan', () => ({ getClanInfo: vi.fn(async (tag: string) => ({ tag, name: 'Integration Clan', members: 0 })) }));
import prisma from '../src/database/prisma';
import { createApp } from '../src/web';
const integration = process.env.INTEGRATION_TESTS === '1' ? describe : describe.skip;
integration('MariaDB-backed account and invitation flow', () => {
  it('registers admins, persists session, consumes invites once and denies cross-clan access', async () => {
    const email = `test-${Date.now()}@example.com`;
    const app = createApp(); const admin = request.agent(app); const member = request.agent(app); const other = request.agent(app);
    let s = (await admin.get('/api/session')).body;
    await admin.post('/api/register').set('x-csrf-token', s.csrf).send({ email, password: 'integration-password-123', name: 'Admin', token: process.env.SIGNUP_TOKEN, clanTag: '#PYY' }).expect(201);
    s = (await admin.get('/api/session')).body;
    expect(s.clans[0].role).toBe('admin');
    const invitation = await admin.post('/api/clans/%23PYY/invite').set('x-csrf-token', s.csrf).send({ role: 'member' }).expect(201);
    let m = (await member.get('/api/session')).body;
    await member.post('/api/register').set('x-csrf-token', m.csrf).send({ email: 'member-' + email, password: 'integration-password-123', name: 'Player', token: invitation.body.token }).expect(201);
    m = (await member.get('/api/session')).body;
    expect(m.clans[0].tag).toBe('#PYY');
    await member.get('/api/clans/%23PYY/overview').expect(200);
    await member.get('/api/clans/%23PYY/audit').expect(403);
    await member.get('/api/clans/%23QQQ/overview').expect(403);
    const o = (await other.get('/api/session')).body;
    await other.post('/api/register').set('x-csrf-token', o.csrf).send({ email: 'other-' + email, password: 'integration-password-123', name: 'Other', token: invitation.body.token }).expect(400);
    const access = await prisma.clanAccess.findFirstOrThrow({ where: { accountId: m.user.id } });
    await admin.delete(`/api/clans/%23PYY/access/${access.id}`).set('x-csrf-token', s.csrf).send({}).expect(200);
    await member.get('/api/clans/%23PYY/overview').expect(403);
    await prisma.$disconnect();
  });
});
