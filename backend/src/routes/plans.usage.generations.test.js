import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

const { app } = await import('../server.js');
const { authHeader } = await import('./testHelpers.js');

describe('GET /api/plans (public pricing catalog)', () => {
  it('returns plans, credit packs and payment details', async () => {
    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.plans).toBeInstanceOf(Array);
    expect(res.body.plans.some((p) => p.id === 'free')).toBe(true);
    expect(res.body.plans.some((p) => p.id === 'pro')).toBe(true);
    expect(res.body.creditPacks.length).toBeGreaterThanOrEqual(1);
    expect(res.body.payment.methods).toContain('mvola');
    expect(res.body.payment).toHaveProperty('mvolaUssdTemplate');
  });
});

describe('GET /api/usage (auth required)', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/usage');
    expect(res.status).toBe(401);
  });

  it('returns the caller quota for an authenticated user', async () => {
    const res = await request(app)
      .get('/api/usage')
      .set(authHeader('usage_user_1'));
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('free');
    expect(res.body).toHaveProperty('count');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('canGenerate');
    expect(res.body).toHaveProperty('resetsAt');
  });
});

describe('GET /api/generations (auth required, owner-scoped)', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/generations');
    expect(res.status).toBe(401);
  });

  it('returns only the caller own generations (starts empty)', async () => {
    const res = await request(app)
      .get('/api/generations')
      .set(authHeader('gen_user_empty'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
