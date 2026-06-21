import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// Stub dotenv so the real .env (100 Treblo keys) doesn't load and force mock
// mode off. vi.mock is hoisted before the server import below.
vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

const { app } = await import('../server.js');
const { authHeader, adminAuthHeader } = await import('./testHelpers.js');

describe('/api/admin (admin-only)', () => {
  it('rejects a non-admin with 403', async () => {
    const res = await request(app).get('/api/admin/status').set(authHeader('not_admin'));
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated with 401', async () => {
    const res = await request(app).get('/api/admin/status');
    expect(res.status).toBe(401);
  });

  it('GET /status returns capacity + treblo + flags', async () => {
    const res = await request(app).get('/api/admin/status').set(adminAuthHeader());
    expect(res.status).toBe(200);
    expect(res.body.capacity).toBeDefined();
    expect(res.body.capacity.maxUsers).toBeGreaterThan(0);
    expect(res.body.treblo).toBeDefined();
    expect(res.body.treblo.mockMode).toBe(true); // no keys in test env
    expect(res.body.flags).toBeDefined();
    expect(typeof res.body.env).toBe('string'); // NODE_ENV (test in CI, dev locally)
  });

  it('GET /keys returns masked key slots (empty pool in tests)', async () => {
    const res = await request(app).get('/api/admin/keys').set(adminAuthHeader());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.mockMode).toBe(true);
    expect(Array.isArray(res.body.slots)).toBe(true);
  });

  it('POST /keys/:index/revive returns 404 for an out-of-range index (empty pool)', async () => {
    const res = await request(app)
      .post('/api/admin/keys/1/revive')
      .set(adminAuthHeader());
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('key index out of range');
  });

  it('GET /users returns an empty list (memory fallback, no DB)', async () => {
    const res = await request(app).get('/api/admin/users').set(adminAuthHeader());
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('GET /users clamps the limit to the allowed range', async () => {
    const res = await request(app)
      .get('/api/admin/users?limit=99999')
      .set(adminAuthHeader());
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });

  it('POST /users/:id/ban returns 503 when the DB is unavailable', async () => {
    const res = await request(app)
      .post('/api/admin/users/abc/ban')
      .set(adminAuthHeader());
    expect(res.status).toBe(503);
  });

  it('POST /users/:id/unban returns 503 when the DB is unavailable', async () => {
    const res = await request(app)
      .post('/api/admin/users/abc/unban')
      .set(adminAuthHeader());
    expect(res.status).toBe(503);
  });
});
