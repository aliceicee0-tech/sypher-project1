import { describe, it, expect, vi } from 'vitest';
import { rateLimit } from './rateLimit.js';

// Fake Express req/res/next.
function makeReq({ user, ip } = {}) {
  return { user, ip };
}
function makeRes() {
  const res = { statusCode: 200, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

describe('middleware/rateLimit', () => {
  it('allows up to `max` requests then rejects with 429 + Retry-After', () => {
    const limiter = rateLimit({ max: 3, windowMs: 60_000, message: 'slow down' });
    const req = makeReq({ ip: '1.1.1.1' });
    let allowed = 0;
    for (let i = 0; i < 3; i++) {
      const res = makeRes();
      const next = vi.fn();
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);
      allowed++;
    }
    expect(allowed).toBe(3);
    // 4th request -> rejected.
    const res = makeRes();
    const next = vi.fn();
    limiter(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBeDefined();
    expect(res.body.error).toBe('slow down');
    expect(res.body.retry_after).toBeGreaterThan(0);
  });

  it('keys by user id when authenticated, separate from IP keying', () => {
    const limiter = rateLimit({ max: 1, windowMs: 60_000 });
    // Authenticated user uses up their bucket.
    limiter({ user: { uid: 'u1' }, ip: '2.2.2.2' }, makeRes(), vi.fn());
    const res = makeRes();
    limiter({ user: { uid: 'u1' }, ip: '2.2.2.2' }, res, vi.fn());
    expect(res.statusCode).toBe(429);
    // A different anonymous IP is unaffected.
    const res2 = makeRes();
    const next2 = vi.fn();
    limiter({ ip: '3.3.3.3' }, res2, next2);
    expect(next2).toHaveBeenCalled();
    expect(res2.statusCode).toBe(200);
  });

  it('resets the bucket after the window elapses', async () => {
    vi.useFakeTimers();
    const limiter = rateLimit({ max: 1, windowMs: 1_000 });
    const req = makeReq({ ip: '9.9.9.9' });
    limiter(req, makeRes(), vi.fn());
    // First within window is allowed (above). Second within window -> 429.
    let blocked = makeRes();
    limiter(req, blocked, vi.fn());
    expect(blocked.statusCode).toBe(429);
    // Advance past the window.
    vi.advanceTimersByTime(1_001);
    let ok = makeRes();
    let next = vi.fn();
    limiter(req, ok, next);
    expect(next).toHaveBeenCalled();
    expect(ok.statusCode).toBe(200);
    vi.useRealTimers();
  });
});
