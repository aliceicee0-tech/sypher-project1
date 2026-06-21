import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

const { app } = await import('./server.js');

// server.js no longer boots on import (the start() call is guarded behind a
// "is main module" check), so importing `app` here is safe and fast.
describe('server (supertest)', () => {
  it('GET /api/health returns ok + boot diagnostics, no auth required', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.db).toBe('boolean');
    // mockMode reflects whether Treblo keys are configured.
    expect(typeof res.body.mockMode).toBe('boolean');
  });

  it('unknown routes return a 404 with the consistent error shape', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not found');
  });
});
