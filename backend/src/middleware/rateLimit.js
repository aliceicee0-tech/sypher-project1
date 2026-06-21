/**
 * Lightweight in-memory rate limiter.
 *
 * Why custom instead of express-rate-limit? Melodia only needs to protect the
 * paid generation endpoint, and we want zero new dependencies for now. The
 * limiter is keyed by user id when authenticated, otherwise by IP address.
 *
 * Limit: at most `max` requests per `windowMs`. Callers receive a 429 with a
 * Retry-After header when the bucket is exhausted.
 *
 * NOTE: this lives in process memory, so each backend instance has its own
 * counter. That's fine for a single-instance deployment; switch to Redis for
 * multi-instance.
 */
export function rateLimit({ max = 10, windowMs = 60_000, message = 'Too many requests' }) {
  const buckets = new Map(); // key -> { count, resetAt }

  // Prune expired buckets occasionally so memory doesn't grow unbounded.
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }, windowMs).unref?.();

  return function rateLimitMiddleware(req, res, next) {
    const key = req.user?.uid ? `u:${req.user.uid}` : `ip:${req.ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: message,
        retry_after: retryAfterSec,
      });
    }

    next();
  };
}
