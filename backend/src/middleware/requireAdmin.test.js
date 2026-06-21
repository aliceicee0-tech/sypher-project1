import { describe, it, expect, vi } from 'vitest';

// requireAdmin reads adminEmails from config.js. We mock config to control the
// admin set deterministically (config otherwise keys off NODE_ENV, which vitest
// may set to 'test').
vi.mock('../config.js', () => ({
  config: { isProduction: false, nodeEnv: 'development' },
  adminEmails: new Set(['dev@melodia.local', 'boss@example.com']),
}));

const { requireAdmin } = await import('./requireAdmin.js');

function makeRes() {
  const res = { statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

describe('middleware/requireAdmin', () => {
  it('rejects with 403 when no user', () => {
    const res = makeRes();
    const next = vi.fn();
    requireAdmin({ user: undefined }, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('admin_required');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the email is not an admin', () => {
    const res = makeRes();
    const next = vi.fn();
    requireAdmin({ user: { email: 'regular@melodia.local' } }, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through when the email is in adminEmails', () => {
    const res = makeRes();
    const next = vi.fn();
    requireAdmin({ user: { email: 'dev@melodia.local' } }, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('matches case-insensitively', () => {
    const res = makeRes();
    const next = vi.fn();
    requireAdmin({ user: { email: 'BOSS@EXAMPLE.COM' } }, res, next);
    expect(next).toHaveBeenCalled();
  });
});
