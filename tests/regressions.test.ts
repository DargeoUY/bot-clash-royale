import { describe, it, expect, vi, beforeEach } from 'vitest';
const db = vi.hoisted(() => ({
  jugador: { findMany: vi.fn(), update: vi.fn() }, historialClan: { create: vi.fn(), count: vi.fn() }, vacacion: { findMany: vi.fn() },
}));
vi.mock('../src/database/prisma', () => ({ default: db }));
import { detectMemberChanges, getClanStats } from '../src/services/member-tracking.service';
import { activateVacation, extendVacation } from '../src/services/vacation.service';
beforeEach(() => vi.resetAllMocks());
describe('regressions', () => {
  it.each([0, -1, 1.5, NaN])('rejects invalid vacation duration %s before querying storage', async days => {
    expect((await activateVacation('#P', days, null, 'test')).success).toBe(false);
    expect((await extendVacation('#P', days)).success).toBe(false);
    expect(db.vacacion.findMany).not.toHaveBeenCalled();
  });
  it('detects new and returning members from the previous snapshot', async () => {
    const previous = [{ tag: '#OLD', estado: 'left', nombre: 'Old' }];
    const current = [{ tag: '#NEW', name: 'New', role: 'member' }, { tag: '#OLD', name: 'Old', role: 'member' }];
    const result = await detectMemberChanges('#AAA', current as never, previous as never);
    expect(result.joined).toHaveLength(1); expect(result.rejoined).toHaveLength(1);
  });
  it('scopes every historical count to its clan', async () => {
    db.historialClan.count.mockResolvedValue(0); await getClanStats('#AAA');
    for (const [args] of db.historialClan.count.mock.calls) expect(args.where.clanTag).toBe('#AAA');
  });
});
