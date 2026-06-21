import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// config.js calls dotenv.config() on import, which re-reads the project's real
// .env into process.env and would pollute our per-test env setup. Stub dotenv to
// a no-op so we fully control the environment here.
vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

// config.js reads process.env at import time. To keep tests deterministic we
// snapshot the FULL set of env vars config cares about, blank them, then let
// each test set exactly the ones it needs, and restore on teardown.

const ENV_KEYS = [
  'PORT', 'CLIENT_URL', 'NODE_ENV', 'MONGODB_URI',
  'TREBLO_KEYS_FILE', 'TREBLO_API_KEY', 'TREBLO_EXPECTED_KEYS',
  'GENERATE_RATE_MAX', 'GENERATE_RATE_WINDOW_MS',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI',
  'JWT_SECRET', 'MAX_USERS',
  'MVOLA_NUMBER', 'MVOLA_MERCHANT', 'MVOLA_USSD', 'EUR_TO_MGA',
  'BANK_IBAN', 'BANK_HOLDER',
  'ABUSE_MAX_SIGNUPS', 'ABUSE_MAX_SIGNUPS_IP', 'ABUSE_SIGNUP_WINDOW_MS', 'ABUSE_DEVICE_COOKIE',
  'ADMIN_EMAILS',
];
// Also the numbered key slots read by the loop (1..100).
for (let i = 1; i <= 100; i++) ENV_KEYS.push(`TREBLO_API_KEY_${i}`);

let snapshot = {};

beforeEach(() => {
  snapshot = {};
  for (const k of ENV_KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

async function loadConfig(env = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
  return import('./config.js');
}

describe('config', () => {
  it('parses plans, credit packs, and payment defaults', async () => {
    const { config } = await loadConfig();
    expect(config.plans.free.monthlyLimit).toBe(2);
    expect(config.plans.starter.priceEur).toBe(4.99);
    expect(config.plans.pro.monthlyLimit).toBe(30);
    expect(config.creditPacks).toHaveLength(3);
    expect(config.payment.methods).toContain('mvola');
    expect(config.payment.eurToMga).toBeGreaterThan(0);
  });

  it('reads numbered Treblo keys TREBLO_API_KEY_1..N (deduped, ordered)', async () => {
    const { config } = await loadConfig({
      TREBLO_API_KEY_1: 'AAA',
      TREBLO_API_KEY_2: 'BBB',
      TREBLO_API_KEY_3: 'AAA', // duplicate of #1 -> dropped
    });
    expect(config.treblo.apiKeys).toEqual(['AAA', 'BBB']);
    expect(config.treblo.apiKey).toBe('AAA'); // backwards-compat single-key
  });

  it('isMockMode is true when no keys are configured', async () => {
    const mod = await loadConfig();
    expect(mod.config.treblo.apiKeys).toEqual([]);
    expect(mod.isMockMode).toBe(true);
  });

  it('overrides maxUsers and rate limits from env', async () => {
    const { config } = await loadConfig({
      MAX_USERS: '250',
      GENERATE_RATE_MAX: '5',
      GENERATE_RATE_WINDOW_MS: '30000',
    });
    expect(config.maxUsers).toBe(250);
    expect(config.generateRate.max).toBe(5);
    expect(config.generateRate.windowMs).toBe(30000);
  });

  it('clamps an out-of-range MAX_USERS to 0 (disabled)', async () => {
    const { config } = await loadConfig({ MAX_USERS: '-5' });
    expect(config.maxUsers).toBe(0);
  });

  it('falls back to the EUR_TO_MGA default when the value is missing/zero', async () => {
    // Number('0') is 0 (falsy) -> the `|| 4800` default kicks in, not Math.max(1,0)=1.
    const zero = await loadConfig({ EUR_TO_MGA: '0' });
    expect(zero.config.payment.eurToMga).toBe(4800);
    const unset = await loadConfig({});
    expect(unset.config.payment.eurToMga).toBe(4800);
  });

  it('freemium backwards-compat getter reflects the free plan limit', async () => {
    const { config } = await loadConfig();
    expect(config.freemium.freeMonthlyLimit).toBe(config.plans.free.monthlyLimit);
  });
});
