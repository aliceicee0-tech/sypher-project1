import { User } from '../models/User.js';
import { isDbReady } from '../db.js';
import { config } from '../config.js';

/**
 * Plan-aware quota tracking.
 *
 * Each user belongs to a plan (free / starter / pro) with a monthly generation
 * allowance. The allowance resets each calendar month (lazy reset — no cron).
 * On top of the allowance, users may buy on-demand CREDIT PACKS that never
 * expire. A generation consumes the monthly allowance first; once that's gone,
 * credits are spent.
 *
 * Quota shape returned to the frontend:
 *   { plan, month, count, limit, remaining, canGenerate, credits, resetsAt }
 *
 * In-memory maps mirror usage + credits when MongoDB is unavailable.
 */

const memoryUsage = new Map(); // uid -> { month, count }
const memoryCredits = new Map(); // uid -> number

// Monthly allowance for a plan (from config.plans). Unknown -> free.
export function planLimit(plan) {
  return (config.plans[plan] || config.plans.free).monthlyLimit;
}

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function freshUsage() {
  return { month: currentMonth(), count: 0 };
}

// Read the (lazily reset) usage for a user, as a plain object.
async function getUsage(uid) {
  if (isDbReady()) {
    const user = await User.findById(uid).lean();
    if (!user) return freshUsage();
    const u = user.usage || {};
    return u.month === currentMonth() ? { month: u.month, count: u.count || 0 } : freshUsage();
  }
  const u = memoryUsage.get(uid);
  if (!u) return freshUsage();
  return u.month === currentMonth() ? { ...u } : freshUsage();
}

async function getCredits(uid) {
  if (isDbReady()) {
    const user = await User.findById(uid).lean();
    return user?.credits || 0;
  }
  return memoryCredits.get(uid) || 0;
}

// Load the user's plan (so the quota reflects the right allowance).
async function getPlan(uid) {
  if (isDbReady()) {
    const user = await User.findById(uid).lean();
    return user?.plan || 'free';
  }
  return 'free';
}

/**
 * Whether the user may still generate, and how many they have left.
 *
 * Generation order: monthly allowance FIRST, then on-demand credits. So a user
 * is blocked only when both the monthly count >= limit AND credits === 0.
 */
export async function getQuota(uid) {
  const [plan, { month, count }, credits] = await Promise.all([
    getPlan(uid),
    getUsage(uid),
    getCredits(uid),
  ]);
  const limit = planLimit(plan);
  const monthlyRemaining = Math.max(0, limit - count);
  const canGenerate = monthlyRemaining > 0 || credits > 0;
  return {
    plan,
    month,
    count,
    limit,
    remaining: monthlyRemaining,
    canGenerate,
    credits,
    resetsAt: nextMonthStart(),
  };
}

/**
 * Spend one generation. Deducts from the monthly allowance first; once that is
 * exhausted, decrements on-demand credits. Atomic-ish via findById + save.
 */
export async function incrementUsage(uid) {
  const month = currentMonth();
  if (isDbReady()) {
    const user = await User.findById(uid);
    if (!user) {
      memoryUsage.set(uid, { month, count: 1 });
      return { month, count: 1, source: 'monthly' };
    }
    // Lazy-reset the monthly counter if stale.
    if (!user.usage || user.usage.month !== month) {
      user.usage = { month, count: 0 };
    }
    const limit = planLimit(user.plan);
    if (user.usage.count < limit) {
      // Monthly allowance covers it.
      user.usage.count = (user.usage.count || 0) + 1;
      await user.save();
      return { month, count: user.usage.count, source: 'monthly' };
    }
    // Monthly exhausted — spend a credit.
    if ((user.credits || 0) > 0) {
      user.credits = (user.credits || 0) - 1;
      await user.save();
      return { month, count: user.usage.count, source: 'credits', creditsLeft: user.credits };
    }
    // Should have been blocked upstream; defensive.
    await user.save();
    return { month, count: user.usage.count, source: 'none' };
  }
  // Memory fallback.
  const u = memoryUsage.get(uid);
  const cur = u && u.month === month ? u : { month, count: 0 };
  cur.count += 1;
  memoryUsage.set(uid, cur);
  return { month, count: cur.count, source: 'monthly' };
}

/**
 * Add purchased credits to a user (after an order is confirmed by an admin).
 * Returns the new credit balance.
 */
export async function addCredits(uid, amount) {
  if (amount <= 0) return getCredits(uid);
  if (isDbReady()) {
    const user = await User.findById(uid);
    if (!user) {
      memoryCredits.set(uid, (memoryCredits.get(uid) || 0) + amount);
      return memoryCredits.get(uid);
    }
    user.credits = (user.credits || 0) + amount;
    await user.save();
    return user.credits;
  }
  memoryCredits.set(uid, (memoryCredits.get(uid) || 0) + amount);
  return memoryCredits.get(uid);
}

function nextMonthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
}
