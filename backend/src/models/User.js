import mongoose from 'mongoose';

/**
 * A registered user (Google OAuth only). Carries plan + quota state:
 *
 *   plan        'free' | 'starter' | 'pro'
 *   plan_expires_at   when a PAID plan lapses. null on free. A paid plan
 *                     (starter/pro) lasts 30 days from confirmation; once the
 *                     date passes the user is lazily downgraded to 'free' on
 *                     their next quota read. Free is perpetual (never expires).
 *   usage       { month: 'YYYY-MM', count: number }  (resets each calendar month)
 *   credits     on-demand generations bought separately; never expire; consumed
 *               only after the monthly allowance is exhausted.
 *
 * `usage.month` is the calendar month the counter belongs to. When it no longer
 * matches the current month, the counter is treated as reset to 0 (lazy reset,
 * no cron). `credits` is NOT monthly — it persists across months.
 *
 * Anti-abuse / attribution fields:
 *   status        'active' | 'banned' — checked by middleware/requireActive.js
 *   email_verified   mirrored from Google's id-token claim at signup
 *   signup_ip / signup_device   the device+ip that created the account
 */
const UserSchema = new mongoose.Schema(
  {
    google_id: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    name: { type: String, default: '' },
    avatar_url: { type: String, default: '' },
    plan: { type: String, enum: ['free', 'starter', 'pro', 'premium'], default: 'free' },
    // When the current paid plan lapses (30 days from admin confirmation).
    // null while on the free plan. Checked lazily by services/usage.js#getPlan;
    // when in the past, the user is downgraded to 'free' and this is cleared.
    plan_expires_at: { type: Date, default: null, index: true },
    usage: {
      month: { type: String, default: '' }, // 'YYYY-MM'
      count: { type: Number, default: 0 },
    },
    // On-demand credits (bought packs). Consumed after the monthly allowance.
    credits: { type: Number, default: 0 },
    // Anti-abuse / account-state fields.
    status: { type: String, enum: ['active', 'banned'], default: 'active' },
    email_verified: { type: Boolean, default: false },
    signup_ip: { type: String, default: '' },
    signup_device: { type: String, default: '' },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', UserSchema);
