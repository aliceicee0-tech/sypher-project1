import { describe, it, expect, vi, beforeAll } from 'vitest';

// Force the in-memory path for the whole test file: isDbReady() always false,
// so usage.js never touches Mongo. The module is imported ONCE (no resetModules),
// because resetModules would re-run mongoose.model() -> OverwriteModelError.
vi.mock('../db.js', () => ({ isDbReady: () => false, connectDb: vi.fn() }));

const usage = await import('./usage.js');

describe('services/usage (in-memory path)', () => {
  // Use distinct uids per test so in-memory state can't bleed between them.
  const uid = (t) => `usage_test_${t}`;

  it('planLimit returns the configured monthly allowance, defaulting to free', () => {
    expect(usage.planLimit('free')).toBe(2);
    expect(usage.planLimit('starter')).toBe(10);
    expect(usage.planLimit('pro')).toBe(30);
    expect(usage.planLimit('unknown-plan')).toBe(2); // fallback to free
  });

  it('currentMonth is a YYYY-MM string for the current month', () => {
    const m = usage.currentMonth();
    expect(m).toMatch(/^\d{4}-\d{2}$/);
    const now = new Date();
    expect(m).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  });

  it('getQuota starts at full allowance for a fresh user', async () => {
    const q = await usage.getQuota(uid('fresh'));
    expect(q.plan).toBe('free');
    expect(q.count).toBe(0);
    expect(q.limit).toBe(2);
    expect(q.remaining).toBe(2);
    expect(q.canGenerate).toBe(true);
    expect(q.credits).toBe(0);
    expect(typeof q.resetsAt).toBe('string');
  });

  it('incrementUsage counts monthly generations until the allowance, then blocks', async () => {
    const u = uid('block');
    expect(await usage.incrementUsage(u)).toMatchObject({ count: 1, source: 'monthly' });
    expect(await usage.incrementUsage(u)).toMatchObject({ count: 2, source: 'monthly' });
    const q = await usage.getQuota(u);
    expect(q.remaining).toBe(0);
    expect(q.canGenerate).toBe(false); // no credits either
  });

  it('addCredits grants spendable credits that unblock generation', async () => {
    const u = uid('credits');
    await usage.incrementUsage(u);
    await usage.incrementUsage(u);
    expect((await usage.getQuota(u)).canGenerate).toBe(false);

    const bal = await usage.addCredits(u, 5);
    expect(bal).toBe(5);
    const after = await usage.getQuota(u);
    expect(after.credits).toBe(5);
    expect(after.canGenerate).toBe(true);
  });

  it('addCredits with a non-positive amount is a no-op', async () => {
    const u = uid('noop');
    await usage.addCredits(u, 5);
    await usage.addCredits(u, 0);
    await usage.addCredits(u, -3);
    expect((await usage.getQuota(u)).credits).toBe(5);
  });
});
