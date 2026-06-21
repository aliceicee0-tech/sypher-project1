import { User } from '../models/User.js';
import { isDbReady } from '../db.js';

/**
 * Guard for banned accounts.
 *
 * Two layers:
 *  1) Fast path — read the `status` claim from the JWT. Banned users are
 *     rejected with no DB read. (A freshly-banned account's existing token
 *     stays valid until it expires, so this alone isn't enough — see below.)
 *  2) Refresh path — periodically re-check the user's status in MongoDB, so an
 *     admin ban takes effect within BAN_REFRESH_MS instead of waiting up to 7
 *     days for the JWT to expire. We cache the result per-user for a few seconds
 *     so this stays cheap under load.
 *
 * The signup gate (services/abuse.js) is still the primary anti-farming defense;
 * this middleware closes the gap on a manual ban actually taking effect.
 */

// How long a fetched status is trusted, in ms. Short enough that an admin ban
// is honored within seconds, long enough to avoid hammering Mongo per request.
const BAN_REFRESH_MS = 5_000;

// uid -> { status, exp }  (exp = epoch ms after which we re-fetch)
const statusCache = new Map();

async function fetchStatus(uid) {
  if (!isDbReady()) return 'active'; // fail-open when DB is down (consistent w/ rest)
  try {
    const user = await User.findById(uid).select('status').lean();
    return user?.status || 'active';
  } catch {
    return 'active'; // don't lock a user out on a transient DB error
  }
}

async function currentStatus(user) {
  const cached = statusCache.get(user.uid);
  const now = Date.now();
  if (cached && cached.exp > now) return cached.status;
  const status = await fetchStatus(user.uid);
  statusCache.set(user.uid, { status, exp: now + BAN_REFRESH_MS });
  return status;
}

export async function requireActive(req, res, next) {
  if (!req.user) return next(); // authRequired is the responsibility of the route

  // 1) Fast reject from the token claim.
  if (req.user.status === 'banned') {
    return res.status(403).json({ error: 'account_banned' });
  }
  // 2) Refresh from DB so a fresh ban is honored quickly.
  const status = await currentStatus(req.user);
  if (status === 'banned') {
    return res.status(403).json({ error: 'account_banned' });
  }
  next();
}
