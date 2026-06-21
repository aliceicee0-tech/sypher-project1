import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signToken, setAuthCookie, clearAuthCookie, authOptional, authRequired, COOKIE_NAME } from './jwt.js';

// Helpers to build fake Express req/res/next triples.
function makeReq({ headers = {}, cookies = {}, user } = {}) {
  return { headers, cookies, user };
}
function makeRes() {
  const res = { statusCode: 200, headers: {}, cookies: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.cookie = (name, value, _opts) => { res.cookies[name] = value; return res; };
  res.clearCookie = (name, _opts) => { delete res.cookies[name]; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('auth/jwt', () => {
  it('signToken produces a verifiable JWT carrying the payload', () => {
    const token = signToken({ uid: 'u1', email: 'a@b.c' });
    expect(typeof token).toBe('string');
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    // Payload is base64url JSON; uid should be present.
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(payload.uid).toBe('u1');
    expect(payload.email).toBe('a@b.c');
  });

  it('setAuthCookie / clearAuthCookie set/remove the cookie by COOKIE_NAME', () => {
    const res = makeRes();
    const token = signToken({ uid: 'u1' });
    setAuthCookie(res, token);
    expect(res.cookies[COOKIE_NAME]).toBe(token);

    clearAuthCookie(res);
    expect(res.cookies[COOKIE_NAME]).toBeUndefined();
  });

  describe('authOptional', () => {
    it('attaches req.user from a Bearer token', () => {
      const token = signToken({ uid: 'u9', email: 'x@y.z' });
      const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
      const res = makeRes();
      const next = vi.fn();
      authOptional(req, res, next);
      expect(req.user.uid).toBe('u9');
      expect(next).toHaveBeenCalled();
    });

    it('attaches req.user from the cookie when no Bearer header', () => {
      const token = signToken({ uid: 'u10' });
      const req = makeReq({ cookies: { [COOKIE_NAME]: token } });
      const res = makeRes();
      authOptional(req, res, vi.fn());
      expect(req.user.uid).toBe('u10');
    });

    it('sets req.user = null on a bad token but still calls next', () => {
      const req = makeReq({ headers: { authorization: 'Bearer not-a-jwt' } });
      const res = makeRes();
      const next = vi.fn();
      authOptional(req, res, next);
      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it('does nothing (no user) when no token is present', () => {
      const req = makeReq();
      const res = makeRes();
      const next = vi.fn();
      authOptional(req, res, next);
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('authRequired', () => {
    it('rejects with 401 when req.user is missing', () => {
      const req = makeReq();
      const res = makeRes();
      const next = vi.fn();
      authRequired(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('authentication required');
      expect(next).not.toHaveBeenCalled();
    });

    it('passes through when req.user is set', () => {
      const req = makeReq({ user: { uid: 'u1' } });
      const res = makeRes();
      const next = vi.fn();
      authRequired(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
