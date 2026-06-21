import { adminEmails } from '../config.js';

/**
 * Require an authenticated admin (email listed in ADMIN_EMAILS).
 *
 * Admins confirm/cancel pending payment orders (Mvola / bank transfer are
 * processed manually). Run AFTER authRequired so req.user is populated.
 */
export function requireAdmin(req, res, next) {
  const email = (req.user?.email || '').toLowerCase();
  if (!email || !adminEmails.has(email)) {
    return res.status(403).json({ error: 'admin_required' });
  }
  next();
}
