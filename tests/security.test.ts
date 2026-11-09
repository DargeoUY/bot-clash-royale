import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, equalSecret } from '../src/web/security';
describe('passwords and secrets', () => {
  it('salts hashes and verifies only the right password', async () => {
    const a = await hashPassword('correct-password-123'); const b = await hashPassword('correct-password-123');
    expect(a).not.toEqual(b); expect(a).not.toContain('correct-password');
    expect(await verifyPassword('correct-password-123', a)).toBe(true);
    expect(await verifyPassword('wrong-password', a)).toBe(false);
  });
  it('rejects damaged stored hashes without crashing', async () => {
    expect(await verifyPassword('test', 'bad')).toBe(false);
    expect(await verifyPassword('test', 'a:zz')).toBe(false);
  });
  it('compares arbitrary length secrets safely', () => {
    expect(equalSecret('a', 'a')).toBe(true); expect(equalSecret('a', 'longer')).toBe(false);
  });
});
