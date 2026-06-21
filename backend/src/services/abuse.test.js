import { describe, it, expect, vi } from 'vitest';

// Force the in-memory path: isDbReady() always false. Imported ONCE so we don't
// re-run mongoose.model() (which throws OverwriteModelError on recompile).
vi.mock('../db.js', () => ({ isDbReady: () => false, connectDb: vi.fn() }));

const abuse = await import('./abuse.js');

describe('services/abuse (in-memory path)', () => {
  // Distinct device/ip per test to avoid cross-test state bleed.
  const ip = (t) => `10.${t}.0.1`;
  const dev = (t) => `device-${t}`;

  it('allows the first signup from a fresh device+ip', async () => {
    const d = await abuse.checkSignupAllowed(dev('fresh'), ip('fresh'));
    expect(d.allowed).toBe(true);
    expect(d.deviceIp).toBe(0);
    expect(d.ipOnly).toBe(0);
  });

  it('blocks once maxSignups is reached for a device+ip', async () => {
    for (let i = 0; i < 5; i++) {
      await abuse.recordSignup({ deviceId: dev('block'), ip: ip('block'), googleId: `g${i}` });
    }
    const d = await abuse.checkSignupAllowed(dev('block'), ip('block'));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('signup_blocked_device');
    expect(d.deviceIp).toBe(5);
  });

  it('falls back to ip-only when no device id is provided', async () => {
    const d = await abuse.checkSignupAllowed(null, ip('nodev'));
    expect(d.allowed).toBe(true);
  });

  it('blocks ip-only once maxSignupsIp is hit (clearing localStorage rotates device)', async () => {
    // Different device ids but same ip should trip the ip-only safety net
    // (default maxSignupsIp = 15) after enough signups.
    for (let i = 0; i < 15; i++) {
      await abuse.recordSignup({ deviceId: `dev-rot-${i}`, ip: ip('rotate'), googleId: `g${i}` });
    }
    const d = await abuse.checkSignupAllowed('dev-brand-new', ip('rotate'));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('signup_blocked_ip');
    expect(d.ipOnly).toBe(15);
  });
});
