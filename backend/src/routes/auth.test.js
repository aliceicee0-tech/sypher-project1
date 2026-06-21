import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

const { app } = await import('../server.js');
const { authHeader, adminAuthHeader } = await import('./testHelpers.js');

// The Google OAuth callback makes outbound calls to Google, so we test the
// cheap, side-effect-free endpoints here: /me, /logout, and the redirect /
// state-mismatch guards on /google/callback.

describe('/api/auth', () => {
  it('GET /me returns the current user + admin flag when authenticated', async () => {
    const res = await request(app).get('/api/auth/me').set(adminAuthHeader('me_admin'));
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.isAdmin).toBe(true);
    expect(res.body).toHaveProperty('googleConfigured');
  });

  it('GET /me returns null user when unauthenticated (does not throw)', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(res.body.isAdmin).toBe(false);
  });

  it('POST /logout clears the auth cookie and returns ok', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // The Set-Cookie header should clear the melodia_token cookie.
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('GET /google/callback without a state cookie redirects with oauth_state_mismatch', async () => {
    const res = await request(app)
      .get('/api/auth/google/callback')
      .query({ code: 'abc', state: 'xyz' })
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('oauth_state_mismatch');
  });

  it('GET /google/callback without a code redirects with oauth_missing_code', async () => {
    // Set a matching state cookie + matching query state to pass the first guard,
    // then omit the code to hit the missing-code guard.
    const res = await request(app)
      .get('/api/auth/google/callback')
      .query({ state: 'mystatefulstate' })
      .set('Cookie', ['melodia_oauth_state=mystatefulstate'])
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('oauth_missing_code');
  });
});
