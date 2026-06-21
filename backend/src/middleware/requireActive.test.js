import { describe, it, expect, vi } from 'vitest';

// requireActive refreshes status from Mongo, but fail-opens when the DB is down.
// We force isDbReady() false for the whole file, imported once (avoiding the
// OverwriteModelError that resetModules would cause by recompiling the User model).
vi.mock('../db.js', () => ({ isDbReady: () => false, connectDb: vi.fn() }));

const { requireActive } = await import('./requireActive.js');

function makeRes() {
  const res = { statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

describe('middleware/requireActive', () => {
  it('passes through when there is no user (auth is the route job)', async () => {
    const res = makeRes();
    const next = vi.fn();
    await requireActive({ user: undefined }, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('fast-rejects a banned user from the token claim', async () => {
    const res = makeRes();
    const next = vi.fn();
    await requireActive({ user: { uid: 'u1', status: 'banned' } }, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('account_banned');
    expect(next).not.toHaveBeenCalled();
  });

  it('passes an active user (DB fail-open -> active)', async () => {
    const res = makeRes();
    const next = vi.fn();
    await requireActive({ user: { uid: 'u2', status: 'active' } }, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('treats a missing status claim as active', async () => {
    const res = makeRes();
    const next = vi.fn();
    await requireActive({ user: { uid: 'u3' } }, res, next);
    expect(next).toHaveBeenCalled();
  });
});
