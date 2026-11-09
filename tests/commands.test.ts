import { describe, it, vi, expect, beforeEach } from 'vitest';
const db = vi.hoisted(() => ({ jugador: { findFirst: vi.fn(), findFirstOrThrow: vi.fn() }, auditEvent: { create: vi.fn() } }));
vi.mock('../src/database/prisma', () => ({ default: db }));
vi.mock('../src/api/clan', () => ({ getClanInfo: vi.fn(), getCurrentRiverRace: vi.fn() }));
vi.mock('../src/services/vacation.service', () => ({ activateVacation: vi.fn(), cancelVacation: vi.fn() }));
import { executeCommand } from '../src/platform/commands';
import { getCurrentRiverRace } from '../src/api/clan';
import { activateVacation } from '../src/services/vacation.service';
const actor = { id: 'test', clanTag: '#AAA', admin: false, playerTag: '#PPP' };
beforeEach(() => vi.resetAllMocks());
describe('shared commands', () => {
  it.each(['sync', 'inactivos', 'premiar #PPP 10 test'])('rejects privileged command %s for members', async command => {
    await expect(executeCommand(actor, command)).rejects.toThrow('administrador');
    expect(db.jugador.findFirst).not.toHaveBeenCalled();
  });
  it('uses river-race endpoint for war instead of nonexistent clan.currentWar', async () => {
    vi.mocked(getCurrentRiverRace).mockResolvedValue({ clan: { fame: 80, participants: [] } } as never);
    expect(await executeCommand(actor, '/guerra')).toContain('80'); expect(getCurrentRiverRace).toHaveBeenCalledWith('#AAA');
  });
  it('blocks profile lookup for another clan', async () => {
    db.jugador.findFirst.mockResolvedValue(null);
    await expect(executeCommand(actor, '/perfil #YYY')).rejects.toThrow('no pertenece');
    expect(db.jugador.findFirst.mock.calls[0][0].where.clanTag).toBe('#AAA');
  });
  it('applies absence only to the authenticated linked player', async () => {
    db.jugador.findFirstOrThrow.mockResolvedValue({ tag: '#PPP' });
    vi.mocked(activateVacation).mockResolvedValue({ success: true, message: 'Listo' });
    expect(await executeCommand(actor, '/ausencia 3 viaje')).toBe('Listo');
    expect(activateVacation).toHaveBeenCalledWith('#PPP', 3, 'viaje', 'test');
  });
  it('does not allow unlinked members to claim another player through absence', async () => {
    await expect(executeCommand({ ...actor, playerTag: null }, '/ausencia 3')).rejects.toThrow('vincular');
  });
});
