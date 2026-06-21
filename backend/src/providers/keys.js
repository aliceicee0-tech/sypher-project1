import { config } from '../config.js';

/**
 * Treblo key rotation / failover engine.
 *
 * The app may be configured with several Treblo API keys (one per Treblo
 * account, each with its own credit pool). The goal is CHAIN FAILOVER: when a
 * key can no longer generate (out of credits, auth revoked, …) we advance to
 * the NEXT key immediately and keep going down the chain until one succeeds.
 *
 * Two kinds of failure are distinguished, because they need opposite handling:
 *
 *   EXHAUSTED  — the key is out of credits or otherwise permanently unusable for
 *                this session (HTTP 401/402/403, a persistent 429, …). It is
 *                RETIRED from the rotation until the server restarts (Treblo
 *                credits do not refetch on their own) or an admin revives it via
 *                /api/admin/keys/:n/revive. Retiring is essential: with a 100-key
 *                pool, retrying every dead key on every request would make each
 *                generation crawl and burn through the remaining good credits
 *                much faster.
 *
 *   TRANSIENT  — a blip (timeout, 5xx, network error). The key is cooled down
 *                briefly (COOLDOWN_MS) and then returned to the rotation. To
 *                avoid a key that's "half-dead" polluting the pool, a key that
 *                racks up MAX_TRANSIENT consecutive transient failures is
 *                promoted to EXHAUSTED.
 *
 * State lives in memory only — it resets on server restart, which is fine
 * because we never write key material to disk, and Treblo credits don't move.
 */

const COOLDOWN_MS = 60_000; // skip a transiently-failed key for 1 minute
const MAX_TRANSIENT = 4; // transient failures before a key is retired

// Index, within config.treblo.apiKeys, of the key we'll try first next.
let activeIndex = 0;
// Map<key -> expiry timestamp>. Keys here are in a SHORT cooldown (transient).
const cooldown = new Map();
// Set of keys retired for the rest of the session (exhausted / revoked).
const exhausted = new Set();
// Map<key -> count> of recent consecutive transient failures (-> retire).
const transientCount = new Map();

/** The full list of configured keys (may be empty in mock mode). */
export function getKeys() {
  return config.treblo.apiKeys;
}

/**
 * Is the key currently usable? (not retired, and not in a transient cooldown)
 */
function isHealthy(key, now) {
  if (exhausted.has(key)) return false;
  const exp = cooldown.get(key);
  if (exp && exp > now) return false;
  return true;
}

/**
 * Pick a key to try next.
 *
 * Scans forward from activeIndex for the first HEALTHY key. If every key is
 * cooling down (transient) but none is retired, returns the soonest-to-recover
 * one so the request is still attempted. If every key is EXHAUSTED, returns
 * null — all credit pools are drained.
 *
 * Returns null as well when no keys are configured (mock mode).
 */
export function pickKey() {
  const keys = getKeys();
  if (keys.length === 0) return null;

  const now = Date.now();
  // Clear expired transient cooldowns so the map doesn't grow unbounded.
  for (const [k, exp] of cooldown) {
    if (exp <= now) cooldown.delete(k);
  }

  // If the entire pool is retired, there is nothing left to try.
  if (exhausted.size >= keys.length) return null;

  // First pass: find a healthy key starting from activeIndex.
  for (let i = 0; i < keys.length; i++) {
    const idx = (activeIndex + i) % keys.length;
    const key = keys[idx];
    if (isHealthy(key, now)) {
      activeIndex = idx;
      return key;
    }
  }

  // No healthy key, but some are only in transient cooldown — return the one
  // that recovers soonest so we still attempt the call.
  let soonest = null;
  let soonestExp = Infinity;
  for (const [k, exp] of cooldown) {
    if (exp < soonestExp) {
      soonestExp = exp;
      soonest = k;
    }
  }
  return soonest;
}

/**
 * Mark a key as TRANSIENTLY failed (timeout / 5xx / network). Short cooldown,
 * and if it keeps failing it gets promoted to exhausted.
 */
export function markKeyFailed(key) {
  const keys = getKeys();
  if (keys.length === 0 || !key) return;
  cooldown.set(key, Date.now() + COOLDOWN_MS);
  advancePast(key);

  const n = (transientCount.get(key) || 0) + 1;
  transientCount.set(key, n);
  if (n >= MAX_TRANSIENT) {
    retire(key, 'too many transient failures');
  }
}

/**
 * Mark a key as PERMANENTLY exhausted for this session (out of credits /
 * revoked / 401-402-403). It is removed from the rotation until restart or a
 * manual revive. This is the chain-failover step: the NEXT key becomes active.
 *
 * @param {string} key     the key to retire
 * @param {string} reason  short label surfaced in /api/admin/status + logs
 */
export function markKeyExhausted(key, reason = 'exhausted') {
  const keys = getKeys();
  if (keys.length === 0 || !key) return;
  retire(key, reason);
}

// Internal: retire a key, drop its transient state, advance to the next key.
function retire(key, reason) {
  exhausted.add(key);
  cooldown.delete(key);
  transientCount.delete(key);
  console.warn(`[keys] retired …${mask(key)} (${reason})`);
  advancePast(key);
}

// Move activeIndex past `key` so the next pickKey() lands on the following key.
function advancePast(key) {
  const keys = getKeys();
  const idx = keys.indexOf(key);
  if (idx !== -1) activeIndex = (idx + 1) % keys.length;
}

/** Manually return a retired key to the rotation (admin "revive"). */
export function reviveKey(key) {
  if (!key) return false;
  const had = exhausted.delete(key);
  cooldown.delete(key);
  transientCount.delete(key);
  return had;
}

/** A snapshot of rotation state — for /api/admin/status + logs. */
export function getStatus() {
  const keys = getKeys();
  const now = Date.now();
  const cooling = [...cooldown.entries()]
    .filter(([, exp]) => exp > now)
    .map(([key, exp]) => ({ key: mask(key), recoversInMs: exp - now }));
  return {
    total: keys.length,
    active: keys.length && exhausted.size < keys.length ? mask(keys[activeIndex]) : null,
    healthy: keys.filter((k) => isHealthy(k, now)).length,
    exhausted: exhausted.size,
    exhaustedKeys: [...exhausted].map(mask),
    cooldown: cooling,
    mockMode: keys.length === 0,
  };
}

// Show only the last 4 chars in logs/status — never leak full keys.
function mask(key) {
  if (!key) return null;
  return key.length > 8 ? `…${key.slice(-4)}` : '****';
}
