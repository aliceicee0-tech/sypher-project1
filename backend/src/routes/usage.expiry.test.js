import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

/**
 * Subscription expiry audit.
 *
 * Proves that a paid plan lapses after 30 days: when the user next reads their
 * quota (lazy check), they are downgraded to 'free' and lose the paid monthly
 * allowance. Bought credits survive the downgrade (they never expire).
 *
 * Uses the same in-memory Mongo simulation pattern as orders.grant.test.js so
 * the expiry logic runs against the production getPlan() path (isDbReady=true).
 */

vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

// Thenable chain helper so `Model.findById(...).lean()` resolves to the doc.
function chain(value) {
  return {
    lean: () => chain(value),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch: (reject) => Promise.resolve(value).catch(reject),
  };
}

function makeUserStore() {
  const docs = new Map(); // _id -> live doc
  const store = {
    _raw: (id) => docs.get(String(id)) || null,
    findById(id) {
      const doc = docs.get(String(id)) || null;
      if (!doc) return chain(null);
      // addCredits mutates + .save()s the fetched doc, so return a live doc.
      doc.save = async () => doc;
      doc.lean = () => ({ ...doc });
      return chain(doc);
    },
    findByIdAndUpdate(id, update) {
      const doc = docs.get(String(id)) || null;
      if (doc) Object.assign(doc, update.$set || {});
      return chain(doc ? { ...doc } : null);
    },
    async updateOne(cond, update) {
      const doc = docs.get(String(cond._id));
      if (!doc) return;
      const set = update.$set || {};
      for (const [k, v] of Object.entries(set)) {
        if (k.includes('.')) {
          const [a, b] = k.split('.');
          doc[a] = doc[a] || {};
          doc[a][b] = v;
        } else {
          doc[k] = v;
        }
      }
    },
    seed(doc) {
      docs.set(String(doc._id), { ...doc });
    },
    peek(id) {
      const d = docs.get(String(id));
      return d ? { ...d } : null;
    },
  };
  return store;
}

let userStore;

vi.mock('../db.js', () => ({ isDbReady: () => true }));
vi.mock('../models/User.js', () => ({
  User: {
    findByIdAndUpdate: (...a) => userStore.findByIdAndUpdate(...a),
    findById: (...a) => userStore.findById(...a),
    updateOne: (...a) => userStore.updateOne(...a),
  },
}));

const { app } = await import('../server.js');
const { authHeader } = await import('./testHelpers.js');

beforeEach(() => {
  userStore = makeUserStore();
});

describe('subscription expiry — lazy downgrade to free when plan lapses', () => {
  it('a paid plan within its 30-day window keeps its allowance', async () => {
    const uid = 'expiry_active_user';
    userStore.seed({
      _id: uid,
      google_id: 'g_active',
      email: 'active@melodia.local',
      plan: 'pro',
      plan_expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days left
      usage: { month: currentMonth(), count: 0 },
      credits: 0,
      status: 'active',
    });

    const usage = await request(app).get('/api/usage').set(authHeader(uid, 'active@melodia.local'));
    expect(usage.status).toBe(200);
    expect(usage.body.plan).toBe('pro');
    expect(usage.body.limit).toBe(30);
    expect(usage.body.canGenerate).toBe(true);
    expect(usage.body.planExpiresAt).toBeTruthy();

    // The user record was NOT mutated (still pro, expiry unchanged).
    const u = userStore.peek(uid);
    expect(u.plan).toBe('pro');
  });

  it('a paid plan PAST its expiry date is downgraded to free on the next quota read', async () => {
    const uid = 'expiry_lapsed_user';
    userStore.seed({
      _id: uid,
      google_id: 'g_lapsed',
      email: 'lapsed@melodia.local',
      plan: 'pro',
      plan_expires_at: new Date(Date.now() - 60 * 60 * 1000), // expired 1 hour ago
      usage: { month: currentMonth(), count: 0 },
      credits: 0,
      status: 'active',
    });

    const usage = await request(app).get('/api/usage').set(authHeader(uid, 'lapsed@melodia.local'));
    expect(usage.status).toBe(200);
    // Downgraded on the spot.
    expect(usage.body.plan).toBe('free');
    expect(usage.body.limit).toBe(2); // free allowance
    expect(usage.body.planExpiresAt).toBeNull();

    // Persisted: the user record now reflects the downgrade.
    const u = userStore.peek(uid);
    expect(u.plan).toBe('free');
    expect(u.plan_expires_at).toBeNull();
  });

  it('a lapsed user is BLOCKED from generation once their free allowance is also spent', async () => {
    const uid = 'expiry_blocked_user';
    userStore.seed({
      _id: uid,
      google_id: 'g_blocked',
      email: 'blocked@melodia.local',
      plan: 'pro',
      plan_expires_at: new Date(Date.now() - 1000), // just expired
      usage: { month: currentMonth(), count: 2 }, // free allowance already spent too
      credits: 0,
      status: 'active',
    });

    // First read: downgrade happens. Free allowance (2) is already exhausted.
    let usage = await request(app).get('/api/usage').set(authHeader(uid, 'blocked@melodia.local'));
    expect(usage.body.plan).toBe('free');
    expect(usage.body.remaining).toBe(0);
    expect(usage.body.canGenerate).toBe(false);

    // Generation is refused with 402.
    const gen = await request(app)
      .post('/api/generate')
      .set(authHeader(uid, 'blocked@melodia.local'))
      .send({ prompt: 'should be blocked' });
    expect(gen.status).toBe(402);
    expect(gen.body.error).toBe('monthly_generation_limit_reached');
  });

  it('bought credits SURVIVE the downgrade and remain spendable', async () => {
    const uid = 'expiry_credits_user';
    userStore.seed({
      _id: uid,
      google_id: 'g_credits',
      email: 'survive@melodia.local',
      plan: 'pro',
      plan_expires_at: new Date(Date.now() - 1000), // plan expired
      usage: { month: currentMonth(), count: 2 }, // free allowance spent
      credits: 5, // but has credits
      status: 'active',
    });

    const usage = await request(app).get('/api/usage').set(authHeader(uid, 'survive@melodia.local'));
    expect(usage.body.plan).toBe('free'); // downgraded
    expect(usage.body.credits).toBe(5); // credits untouched
    expect(usage.body.canGenerate).toBe(true); // credits still allow generation

    const u = userStore.peek(uid);
    expect(u.credits).toBe(5); // not wiped by the downgrade
  });
});

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
