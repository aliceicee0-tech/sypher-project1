import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// The real .env holds 100 Treblo keys; config.js's dotenv.config() would load
// them and turn mock mode OFF (startGeneration would call real fetch). Stub
// dotenv so the route tests run in mock mode deterministically. vi.mock is
// hoisted before imports.
vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

const { app } = await import('../server.js');
const { authHeader } = await import('./testHelpers.js');

describe('POST /api/generate', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/generate').send({ prompt: 'x' });
    expect(res.status).toBe(401);
  });

  it('rejects a body with no prompt/tags/lyrics', async () => {
    const res = await request(app)
      .post('/api/generate')
      .set(authHeader('gen_empty_body'))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/prompt|tags|lyrics/);
  });

  it('starts a generation in mock mode and counts it against the quota', async () => {
    const res = await request(app)
      .post('/api/generate')
      .set(authHeader('gen_ok_user'))
      .send({ prompt: 'cinematic orchestral' });
    expect(res.status).toBe(200);
    expect(res.body.jobId).toMatch(/^mock_/);
    expect(res.body.status).toBe('generating');
    expect(res.body.quota).toBeDefined();
    expect(res.body.quota.count).toBeGreaterThanOrEqual(1);
  });

  it('polling an unknown jobId returns 404 (owner-scoped)', async () => {
    const res = await request(app)
      .get('/api/generate/job_does_not_exist')
      .set(authHeader('gen_poll_user'));
    expect(res.status).toBe(404);
  });

  it('the owner can poll the job they started', async () => {
    const uid = 'gen_poll_owner';
    const start = await request(app)
      .post('/api/generate')
      .set(authHeader(uid))
      .send({ prompt: 'lofi' });
    const jobId = start.body.jobId;
    const poll = await request(app)
      .get(`/api/generate/${jobId}`)
      .set(authHeader(uid));
    expect(poll.status).toBe(200);
    expect(['generating', 'ready', 'error']).toContain(poll.body.status);
  });

  it('blocks a user at the monthly limit with 402', async () => {
    const uid = 'gen_limit_user';
    // free allowance is 2.
    await request(app).post('/api/generate').set(authHeader(uid)).send({ prompt: 'a' });
    await request(app).post('/api/generate').set(authHeader(uid)).send({ prompt: 'b' });
    const third = await request(app)
      .post('/api/generate')
      .set(authHeader(uid))
      .send({ prompt: 'c' });
    expect(third.status).toBe(402);
    expect(third.body.error).toBe('monthly_generation_limit_reached');
  });
});
