import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';

dotenv.config();

const INSECURE_DEFAULT = 'dev_insecure_secret_change_me';

/**
 * Collect configured Treblo keys for the multi-key failover.
 *
 * Sources are merged (deduped, empties dropped), in priority order:
 *
 *  1) A NEWLINE-SEPARATED KEY FILE pointed to by TREBLO_KEYS_FILE
 *     (recommended for many keys — one per line, # comments allowed). This is
 *     how the 100-account pool is meant to be supplied in production: 100 keys
 *     in a single git-ignored file beats 100 env vars.
 *  2) Numbered env vars TREBLO_API_KEY_1 .. TREBLO_API_KEY_100 (one per Treblo
 *     account). Kept for backward compatibility / small deployments.
 *  3) The legacy single TREBLO_API_KEY (still respected if set).
 *
 * When more than one key is present, a generation that fails on one key
 * automatically falls through to the next (see src/providers/keys.js).
 */
function readKeyFile(path) {
  if (!path) return [];
  try {
    const text = readFileSync(path, 'utf8');
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch (err) {
    console.warn(`[config] TREBLO_KEYS_FILE "${path}" could not be read: ${err.message}`);
    return [];
  }
}

function readTreblKeys() {
  const seen = new Set();
  const add = (v) => {
    const k = v && v.trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  };
  const keys = [];

  // 1) Key file (preferred for large pools).
  for (const k of readKeyFile(process.env.TREBLO_KEYS_FILE)) add(k);
  // 2) Numbered env vars, in order. Supports up to 100 Treblo accounts.
  for (let i = 1; i <= 100; i++) {
    const v = process.env[`TREBLO_API_KEY_${i}`];
    if (v) add(v);
  }
  // 3) Legacy single-key fallback.
  if (process.env.TREBLO_API_KEY) add(process.env.TREBLO_API_KEY);
  return keys;
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/melodia',
  treblo: {
    // Multi-key failover list (may be empty in mock mode).
    apiKeys: readTreblKeys(),
    // Backwards-compat alias: the first configured key, or '' in mock mode.
    get apiKey() {
      return this.apiKeys[0] || '';
    },
    baseUrl: process.env.TREBLO_API_BASE_URL || 'https://api.treblo.com/v1',
  },
  jwtSecret: process.env.JWT_SECRET || INSECURE_DEFAULT,
  generateRate: {
    max: Number(process.env.GENERATE_RATE_MAX) || 10,
    windowMs: Number(process.env.GENERATE_RATE_WINDOW_MS) || 60_000,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    // In dev the redirect URI targets the FRONTEND origin (:5173) so the OAuth
    // state cookie + JWT cookie stay same-origin with the browser app; the Vite
    // dev proxy forwards /api/* to the backend on :4000. In production this is
    // the public callback URL on the same domain as the app.
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/api/auth/google/callback',
  },
  // ---- Pricing / plans ----
  // Hard cap on total registered users during this beta launch. Once reached,
  // new signups are refused (returns signup_blocked). Set to 0 to disable.
  maxUsers: Math.max(0, Number(process.env.MAX_USERS) || 100),
  plans: {
    // Monthly allowance per plan. 'credits' below is the on-demand top-up.
    free: { monthlyLimit: 2, priceEur: 0 },
    starter: { monthlyLimit: 10, priceEur: 4.99 },
    pro: { monthlyLimit: 30, priceEur: 10 },
  },
  // On-demand credit packs (bought separately, never expire, used after the
  // monthly allowance runs out). Bought in addition to any subscription.
  // The active plan's monthly allowance is consumed first, then credits.
  creditPacks: [
    { id: 'pack_5', generations: 5, priceEur: 2.99 },
    { id: 'pack_15', generations: 15, priceEur: 7.99 },
    { id: 'pack_50', generations: 50, priceEur: 22.99 },
  ],
  // Accepted manual payment methods. Orders are created as 'pending' and
  // confirmed by an admin once the bank transfer / Mvola is received.
  payment: {
    methods: ['mvola', 'bank_transfer'],
    // Short, human-readable display number for the merchant account.
    mvolaNumber: process.env.MVOLA_NUMBER || '038 43 622 16',
    // The merchant account number embedded in the USSD code (no spaces).
    mvolaMerchant: process.env.MVOLA_MERCHANT || '0384362216',
    // USSD dial string the user types on their phone to pay. Use {amount} as a
    // placeholder for the order price (in MGA); the frontend substitutes it.
    mvolaUssdTemplate: process.env.MVOLA_USSD || '#111*1*2*0384362216*{amount}#',
    // Prices are stored in EUR. Mvola settles in Ariary (MGA), so the user must
    // dial an Ariary amount. This rate converts EUR -> MGA for the USSD prompt.
    eurToMga: Math.max(1, Number(process.env.EUR_TO_MGA) || 4800),
    bankIban: process.env.BANK_IBAN || 'MG83 0000 7000 0123 4567 8901 234',
    bankHolder: process.env.BANK_HOLDER || 'Melodia Studio LLC',
  },
  // ---- Anti-abuse (account farming) ----
  abuse: {
    // Max NEW accounts per (device_id, ip) within the signup window.
    maxSignups: Math.max(0, Number(process.env.ABUSE_MAX_SIGNUPS) || 5),
    // Safety net: max accounts per ip alone (catches cleared localStorage).
    maxSignupsIp: Math.max(0, Number(process.env.ABUSE_MAX_SIGNUPS_IP) || 15),
    signupWindowMs: Math.max(1000, Number(process.env.ABUSE_SIGNUP_WINDOW_MS) || 600_000),
    // Cookie name carrying the device UUID (set by the frontend).
    deviceCookie: process.env.ABUSE_DEVICE_COOKIE || 'melodia_device',
  },
  // Backwards-compat: legacy single-limit read by older code paths.
  get freemium() {
    return { freeMonthlyLimit: this.plans.free.monthlyLimit };
  },
};

// Admin emails that may confirm/cancel pending orders and ban users.
// Comma-separated list in ADMIN_EMAILS, e.g. "you@example.com,boss@example.com".
export const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);
if (config.nodeEnv === 'development') {
  adminEmails.add('dev@melodia.local');
}

export const isGoogleConfigured = Boolean(config.google.clientId && config.google.clientSecret);

// When no key is set, the Treblo client runs in mock mode so the whole app
// works end-to-end before the real API is wired up.
export const isMockMode = config.treblo.apiKeys.length === 0;

// How many Treblo keys we EXPECT to have wired up. Purely informational — used
// by the /api/admin/status endpoint + boot log to flag a partially-loaded pool.
// Set to 0 (default) to skip the expectation check.
config.treblo.expectedKeys = Math.max(0, Number(process.env.TREBLO_EXPECTED_KEYS) || 0);

// Hard fail in production if the JWT secret is missing or the insecure default.
// In dev we allow the default so first-run still works locally, but we warn.
if (config.isProduction && (config.jwtSecret === INSECURE_DEFAULT || config.jwtSecret.length < 32)) {
  console.error(
    '[config] FATAL: JWT_SECRET must be set to a long random string (>=32 chars) in production.'
  );
  process.exit(1);
}
if (!config.isProduction && config.jwtSecret === INSECURE_DEFAULT) {
  console.warn('[config] WARNING: using the insecure default JWT_SECRET. Set a real one in .env.');
}

// Production-readiness checks (warn only — never block boot, so an operator can
// still bring the API up in an emergency). Surface anything that would bite us
// once traffic is real.
if (config.isProduction) {
  if (isMockMode) {
    console.error(
      '[config] WARNING: running in PRODUCTION with no Treblo keys — generations will be mocked.'
    );
  }
  if (config.treblo.expectedKeys > 0 && config.treblo.apiKeys.length < config.treblo.expectedKeys) {
    console.warn(
      `[config] key pool partial: ${config.treblo.apiKeys.length}/${config.treblo.expectedKeys} Treblo keys loaded.`
    );
  }
  if (!isGoogleConfigured) {
    console.error('[config] WARNING: PRODUCTION without Google OAuth — nobody can sign in.');
  }
  if (adminEmails.size === 0) {
    console.warn('[config] WARNING: no ADMIN_EMAILS set — orders cannot be confirmed.');
  }
  if (!config.payment.mvolaNumber && !config.payment.bankIban) {
    console.warn('[config] WARNING: no payment details (MVOLA_NUMBER / BANK_IBAN) configured.');
  }
}
