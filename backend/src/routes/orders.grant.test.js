import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

/**
 * Payment-grant audit.
 *
 * Goal: PROVE that when an admin confirms a pending order, the buyer actually
 * receives the benefit — a plan upgrade changes their plan (+ resets usage so
 * the new allowance is immediately spendable), and a credit pack adds credits.
 * The existing orders.test.js only checks that status -> 'paid'; it never
 * verifies the grant. This does.
 *
 * Approach: the production grant path runs only when isDbReady() is true, so we
 * simulate MongoDB with a tiny in-memory User/Order store that implements the
 * exact Mongoose methods the routes call (findByIdAndUpdate, findOne, create,
 * updateOne, lean, save). This mirrors real behavior closely enough to prove
 * the grant logic, without needing a live Mongo connection.
 */

vi.mock('dotenv', () => ({ default: { config: () => {} }, config: () => {} }));

// Thenable chain helper: `.findById(...).lean()` resolves to the doc.
// Mongoose query objects are thenable; chaining .lean() returns another
// thenable that resolves to a plain object. We build the same shape so await
// works at every step the routes use.
function chain(value) {
  const c = {
    lean: () => chain(value),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
    catch: (reject) => Promise.resolve(value).catch(reject),
  };
  return c;
}

// --- In-memory Mongo simulation ---

// A "live document": mutations persist onto the stored object, and .save() is a
// no-op. Mirrors Mongoose documents returned by findById (as opposed to
// findByIdAndUpdate(...).lean() which returns a plain snapshot).
function liveDoc(store, id) {
  const target = store._raw(id);
  if (!target) return null;
  target.save = async () => target;
  // .lean() returns a plain snapshot (used by some callers).
  target.lean = () => ({ ...target });
  return target;
}

function makeUserStore() {
  const docs = new Map(); // _id -> live doc object (mutations persist)
  const store = {
    _raw: (id) => docs.get(String(id)) || null,
    // findById returns a thenable chain resolving to a LIVE document with
    // .save()/.lean(), because addCredits mutates + saves it.
    findById(id) {
      const doc = liveDoc(store, id);
      return chain(doc);
    },
    // findByIdAndUpdate applies $set and returns a thenable chain resolving to
    // a plain snapshot (the route calls .lean() on it).
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

function makeOrderStore() {
  const docs = new Map(); // order_id -> live doc (mutations persist, has .save())
  return {
    async findOne(cond) {
      const d = docs.get(cond.order_id);
      if (!d) return null;
      // Return the LIVE doc with a no-op .save() — mutations stick, matching
      // Mongoose where you mutate the fetched document then call .save().
      d.save = async () => {};
      return d;
    },
    async create(order) {
      const rec = { ...order };
      docs.set(rec.order_id, rec);
      return rec;
    },
  };
}

let userStore;
let orderStore;

vi.mock('../db.js', () => ({ isDbReady: () => true }));
vi.mock('../models/User.js', () => ({
  User: {
    // Dynamic proxy: forward to the current userStore for each test.
    findByIdAndUpdate: (...a) => userStore.findByIdAndUpdate(...a),
    findById: (...a) => userStore.findById(...a),
    updateOne: (...a) => userStore.updateOne(...a),
  },
}));
vi.mock('../models/Order.js', () => ({
  Order: {
    findOne: (cond) => orderStore.findOne(cond),
    create: (order) => orderStore.create(order),
  },
}));

const { app } = await import('../server.js');
const { authHeader, adminAuthHeader } = await import('./testHelpers.js');

beforeEach(() => {
  userStore = makeUserStore();
  orderStore = makeOrderStore();
});

describe('payment grant — admin confirm applies the benefit', () => {
  it('a confirmed plan order upgrades the buyer plan AND resets usage so they can spend the new allowance immediately', async () => {
    // Buyer exists as free, with their monthly quota already exhausted.
    const buyerUid = 'audit_plan_buyer';
    userStore.seed({
      _id: buyerUid,
      google_id: 'g_plan',
      email: 'buyer_plan@melodia.local',
      plan: 'free',
      usage: { month: currentMonth(), count: 2 }, // free allowance (2) already spent
      credits: 0,
      status: 'active',
    });

    // 1) Buyer creates a 'pro' plan order.
    const create = await request(app)
      .post('/api/orders')
      .set(authHeader(buyerUid, 'buyer_plan@melodia.local'))
      .send({ kind: 'plan', plan: 'pro', method: 'mvola' });
    expect(create.status).toBe(201);

    // 2) Admin confirms payment.
    const confirm = await request(app)
      .post(`/api/orders/${create.body.order_id}/confirm`)
      .set(adminAuthHeader());
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe('paid');

    // 3) Grant verified directly on the user doc.
    const buyer = userStore.peek(buyerUid);
    expect(buyer.plan).toBe('pro'); // upgraded
    expect(buyer.usage.count).toBe(0); // usage reset -> allowance immediately spendable

    // 4) The quota reflects the new plan: pro = 30/month, none spent yet.
    const usage = await request(app).get('/api/usage').set(authHeader(buyerUid, 'buyer_plan@melodia.local'));
    expect(usage.status).toBe(200);
    expect(usage.body.plan).toBe('pro');
    expect(usage.body.limit).toBe(30);
    expect(usage.body.remaining).toBe(30);
    expect(usage.body.canGenerate).toBe(true);
  });

  it('a confirmed credit-pack order adds spendable credits on top of the monthly allowance', async () => {
    const buyerUid = 'audit_credit_buyer';
    userStore.seed({
      _id: buyerUid,
      google_id: 'g_credit',
      email: 'buyer_credit@melodia.local',
      plan: 'free',
      usage: { month: currentMonth(), count: 2 }, // monthly allowance exhausted
      credits: 0,
      status: 'active',
    });

    // 1) Buy a pack of 5.
    const create = await request(app)
      .post('/api/orders')
      .set(authHeader(buyerUid, 'buyer_credit@melodia.local'))
      .send({ kind: 'credits', packId: 'pack_5', method: 'bank_transfer' });
    expect(create.status).toBe(201);
    expect(create.body.item.generations).toBe(5);

    // Before confirm: out of allowance, no credits -> blocked.
    let usage = await request(app).get('/api/usage').set(authHeader(buyerUid, 'buyer_credit@melodia.local'));
    expect(usage.body.canGenerate).toBe(false);

    // 2) Admin confirms.
    const confirm = await request(app)
      .post(`/api/orders/${create.body.order_id}/confirm`)
      .set(adminAuthHeader());
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe('paid');

    // 3) Credits granted: 5 on top of the exhausted monthly allowance.
    const buyer = userStore.peek(buyerUid);
    expect(buyer.credits).toBe(5);

    usage = await request(app).get('/api/usage').set(authHeader(buyerUid, 'buyer_credit@melodia.local'));
    expect(usage.body.credits).toBe(5);
    expect(usage.body.canGenerate).toBe(true); // monthly gone but credits allow more
  });

  it('confirming an already-paid order does NOT grant twice (idempotent)', async () => {
    const buyerUid = 'audit_idem_buyer';
    userStore.seed({
      _id: buyerUid,
      google_id: 'g_idem',
      email: 'buyer_idem@melodia.local',
      plan: 'free',
      usage: { month: currentMonth(), count: 0 },
      credits: 0,
      status: 'active',
    });

    const create = await request(app)
      .post('/api/orders')
      .set(authHeader(buyerUid, 'buyer_idem@melodia.local'))
      .send({ kind: 'credits', packId: 'pack_15', method: 'mvola' }); // 15 credits

    const c1 = await request(app).post(`/api/orders/${create.body.order_id}/confirm`).set(adminAuthHeader());
    const c2 = await request(app).post(`/api/orders/${create.body.order_id}/confirm`).set(adminAuthHeader());
    expect(c1.status).toBe(200);
    expect(c2.status).toBe(200); // idempotent -> still 200

    const buyer = userStore.peek(buyerUid);
    expect(buyer.credits).toBe(15); // NOT 30
  });
});

// helpers
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
