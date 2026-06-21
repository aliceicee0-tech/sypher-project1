import { Router } from 'express';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { DeviceSignup } from '../models/DeviceSignup.js';
import { isDbReady } from '../db.js';
import { config, isMockMode, isGoogleConfigured } from '../config.js';
import { authRequired } from '../auth/jwt.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { getStatus as getKeyStatus, reviveKey, getKeys } from '../providers/keys.js';

const router = Router();

// Everything here is admin-only: a valid JWT whose email is in ADMIN_EMAILS.
router.use(authRequired, requireAdmin);

/**
 * GET /api/admin/status -> an ops dashboard snapshot.
 *
 * Aggregates the things an operator needs at a glance in production:
 *   - beta capacity (users vs MAX_USERS)
 *   - Treblo key-pool health (active key, cooldowns, mock mode)
 *   - pending orders awaiting manual confirmation
 *   - whether Google OAuth / payments are wired
 *
 * Designed to be cheap: a few countDocuments + in-memory key state, no joins.
 */
router.get('/status', async (_req, res) => {
  let userCount = 0;
  let pendingOrders = 0;
  let recentSignups24h = 0;
  if (isDbReady()) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    [userCount, pendingOrders, recentSignups24h] = await Promise.all([
      User.countDocuments({}),
      Order.countDocuments({ status: 'pending' }),
      DeviceSignup.countDocuments({ createdAt: { $gte: since24h } }),
    ]);
  }
  res.json({
    capacity: {
      users: userCount,
      maxUsers: config.maxUsers,
      full: config.maxUsers > 0 && userCount >= config.maxUsers,
    },
    treblo: {
      ...getKeyStatus(),
      mockMode: isMockMode,
      expectedKeys: config.treblo.expectedKeys || null,
    },
    orders: { pending: pendingOrders },
    signups24h: recentSignups24h,
    flags: {
      googleConfigured: isGoogleConfigured,
      mockMode: isMockMode,
      paymentsConfigured: Boolean(
        config.payment.mvolaNumber || config.payment.bankIban
      ),
    },
    env: config.nodeEnv,
  });
});

/**
 * GET /api/admin/keys -> detailed key-pool health (the `treblo` slice of /status
 * plus per-index masking). Use this to see exactly which keys are retired.
 */
router.get('/keys', (_req, res) => {
  const keys = getKeys();
  res.json({
    ...getKeyStatus(),
    expected: config.treblo.expectedKeys || null,
    // Per-slot view: index, last-4, retired? — enough to identify a bad key
    // without ever exposing the full secret over the wire.
    slots: keys.map((k, i) => ({
      index: i + 1,
      key: k.length > 8 ? `…${k.slice(-4)}` : '****',
    })),
  });
});

/**
 * POST /api/admin/keys/:index/revive -> return a retired key to the rotation.
 *
 * Keys are auto-retired when Treblo signals exhaustion (HTTP 401/402/403) or
 * after repeated transient failures. If you topped up that account's credits
 * (or the failure was a false alarm), revive it by its 1-based index (matching
 * its position in the key file / TREBLO_API_KEY_n).
 *
 *   { revived: true }   the key was retired and is now back in the pool
 *   { revived: false }  the key was not retired (no-op)
 *   404                 index out of range
 */
router.post('/keys/:index/revive', (req, res) => {
  const idx = Number(req.params.index);
  const keys = getKeys();
  if (!Number.isInteger(idx) || idx < 1 || idx > keys.length) {
    return res.status(404).json({ error: 'key index out of range' });
  }
  const revived = reviveKey(keys[idx - 1]);
  res.json({ revived, index: idx });
});

/**
 * GET /api/admin/users -> list registered users (newest first), paginated.
 *   ?limit=50  (max 200)   ?status=active|banned   ?q=<email substring>
 */
router.get('/users', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const filter = {};
    if (req.query.status === 'active' || req.query.status === 'banned') {
      filter.status = req.query.status;
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      filter.email = { $regex: req.query.q.trim(), $options: 'i' };
    }

    if (isDbReady()) {
      const users = await User.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('-__v')
        .lean();
      const total = await User.countDocuments(filter);
      return res.json({ users, total });
    }
    return res.json({ users: [], total: 0 });
  } catch (err) {
    console.error('[admin] users list failed:', err.message);
    res.status(500).json({ error: 'could not list users' });
  }
});

/**
 * POST /api/admin/users/:id/ban   -> set status 'banned'.
 * POST /api/admin/users/:id/unban -> set status 'active'.
 *
 * Banning takes effect for NEW requests immediately once the user's JWT is
 * refreshed (requireActive middleware reads the token's status claim). To
 * revoke an active session right away, the operator should also rotate
 * JWT_SECRET — that invalidates every token at once.
 */
async function setUserStatus(req, res, status) {
  try {
    if (!isDbReady()) return res.status(503).json({ error: 'database unavailable' });
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    ).select('-__v').lean();
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json({ user });
  } catch (err) {
    console.error(`[admin] ${status} failed:`, err.message);
    res.status(500).json({ error: `could not ${status} user` });
  }
}

router.post('/users/:id/ban', (req, res) => setUserStatus(req, res, 'banned'));
router.post('/users/:id/unban', (req, res) => setUserStatus(req, res, 'active'));

export { router as adminRouter };
