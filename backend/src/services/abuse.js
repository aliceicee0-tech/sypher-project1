import { DeviceSignup } from '../models/DeviceSignup.js';
import { isDbReady } from '../db.js';
import { config } from '../config.js';

/**
 * Anti-account-farming: limit how many Melodia accounts can be created from the
 * same device + IP within a time window.
 *
 * The freemium quota is per-account (each Google account gets its own free
 * generations), so the only way to farm free generation credit is to create
 * many Google accounts. We cap signups per (device_id, ip) pair; clearing the
 * browser localStorage rotates the device_id, so a second, looser IP-only cap
 * acts as a safety net.
 *
 * STATE: persists to MongoDB (DeviceSignup collection) with an in-memory
 * fallback when the DB is unavailable. This is FAIL-OPEN, consistent with the
 * rest of the codebase (usage, collections): if Mongo is down, signups are
 * allowed so a DB outage does not lock everyone out. If you want fail-closed,
 * flip the DB-down branch to return { allowed: false }.
 */

// In-memory fallback: array of { device_id, ip, google_id, at } since process start.
const memorySignups = [];

function windowStart() {
  return new Date(Date.now() - config.abuse.signupWindowMs);
}

/**
 * How many signups are attributed to a device+ip (and, separately, ip-only)
 * within the rolling window. Returns { deviceIp, ipOnly }.
 */
async function recentCounts(deviceId, ip) {
  const since = windowStart();
  if (isDbReady()) {
    const [deviceIp, ipOnly] = await Promise.all([
      DeviceSignup.countDocuments({ device_id: deviceId, ip, createdAt: { $gte: since } }),
      DeviceSignup.countDocuments({ ip, createdAt: { $gte: since } }),
    ]);
    return { deviceIp, ipOnly };
  }
  // Memory fallback.
  const mem = memorySignups.filter((s) => s.at >= since.getTime());
  return {
    deviceIp: mem.filter((s) => s.device_id === deviceId && s.ip === ip).length,
    ipOnly: mem.filter((s) => s.ip === ip).length,
  };
}

/**
 * Decide whether a new signup is allowed from this device+ip.
 *
 * Primary cap: at most `maxSignups` accounts per (device_id, ip) in the window.
 * Safety net: at most `maxSignupsIp` per ip alone (catches cleared localStorage).
 *
 * @returns {{ allowed: boolean, reason?: string, deviceIp: number, ipOnly: number }}
 */
export async function checkSignupAllowed(deviceId, ip) {
  // No device id (browser blocked cookies / old client) → fall back to ip-only.
  const effDevice = deviceId || ip;
  const { deviceIp, ipOnly } = await recentCounts(effDevice, ip);

  if (deviceIp >= config.abuse.maxSignups) {
    return { allowed: false, reason: 'signup_blocked_device', deviceIp, ipOnly };
  }
  if (ipOnly >= config.abuse.maxSignupsIp) {
    return { allowed: false, reason: 'signup_blocked_ip', deviceIp, ipOnly };
  }
  return { allowed: true, deviceIp, ipOnly };
}

/**
 * Record a successful signup so future checks count it. Called AFTER the user
 * has been upserted, so we never log a blocked attempt as a real signup.
 */
export async function recordSignup({ deviceId, ip, googleId, email = '' }) {
  const effDevice = deviceId || ip;
  if (isDbReady()) {
    try {
      await DeviceSignup.create({ device_id: effDevice, ip, google_id: googleId, email });
    } catch (err) {
      // Non-fatal: a missing log row only means one less counted signup.
      console.warn('[abuse] could not record signup:', err.message);
    }
    return;
  }
  memorySignups.push({ device_id: effDevice, ip, google_id: googleId, at: Date.now() });
  // Bound the in-memory log.
  if (memorySignups.length > 1000) memorySignups.splice(0, memorySignups.length - 1000);
}
