import { Router } from 'express';
import { nanoid } from 'nanoid';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { isDbReady } from '../db.js';
import { authRequired } from '../auth/jwt.js';
import { requireActive } from '../middleware/requireActive.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { config, adminEmails } from '../config.js';
import { addCredits } from '../services/usage.js';

const router = Router();

// In-memory fallback so the app works without MongoDB.
const memory = new Map(); // order_id -> order

function findOrder(orderId) {
  if (isDbReady()) return Order.findOne({ order_id: orderId }).lean();
  return Promise.resolve(memory.get(orderId) || null);
}

/**
 * Resolve the price + item description for what the user wants to buy, so the
 * server (not the client) is the source of truth on pricing.
 *
 *   { kind: 'plan', plan: 'starter' }      -> plan upgrade
 *   { kind: 'credits', packId: 'pack_5' }  -> credit pack
 */
function resolveItem({ kind, plan, packId }) {
  if (kind === 'plan' && config.plans[plan] && plan !== 'free') {
    const p = config.plans[plan];
    return { type: 'plan', plan, generations: 0, priceEur: p.priceEur };
  }
  if (kind === 'credits') {
    const pack = config.creditPacks.find((p) => p.id === packId);
    if (pack) {
      return { type: 'credits', plan: '', generations: pack.generations, priceEur: pack.priceEur };
    }
  }
  return null; // invalid
}

// POST /api/orders -> create a pending order.
//   body: { kind: 'plan'|'credits', plan?, packId?, method: 'mvola'|'bank_transfer', payment_ref? }
router.post('/', authRequired, requireActive, async (req, res) => {
  try {
    const item = resolveItem(req.body || {});
    if (!item) return res.status(400).json({ error: 'invalid order item' });

    const method = config.payment.methods.includes(req.body?.method)
      ? req.body.method
      : config.payment.methods[0];

    const order = {
      order_id: `ord_${nanoid(12)}`,
      owner_uid: req.user.uid,
      owner_email: req.user.email || '',
      item,
      price_eur: item.priceEur,
      method,
      status: 'pending',
      payment_ref: (req.body?.payment_ref || '').toString().slice(0, 300),
      payer_phone: (req.body?.payer_phone || '').toString().slice(0, 40),
      paid_at: null,
    };

    if (isDbReady()) {
      const created = await Order.create(order);
      return res.status(201).json(created);
    }
    order.createdAt = new Date().toISOString();
    memory.set(order.order_id, order);
    return res.status(201).json(order);
  } catch (err) {
    console.error('[orders] create failed:', err.message);
    res.status(500).json({ error: 'could not create order' });
  }
});

// GET /api/orders -> the caller's own orders (newest first).
router.get('/', authRequired, async (req, res) => {
  try {
    if (isDbReady()) {
      const all = await Order.find({ owner_uid: req.user.uid }).sort({ createdAt: -1 }).lean();
      return res.json(all);
    }
    const own = [...memory.values()]
      .filter((o) => o.owner_uid === req.user.uid)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(own);
  } catch (err) {
    console.error('[orders] list failed:', err.message);
    res.status(500).json({ error: 'could not list orders' });
  }
});

/**
 * Grant the order's item to its owner. Called once, atomically, on the
 * pending->paid transition. Idempotent: if item.type==='plan' we set the plan;
 * if 'credits' we add generations. Returns the updated user.
 */
async function grantOrder(order) {
  if (!isDbReady()) {
    // Memory fallback: nothing durable to grant, but record the paid state.
    const memOrder = memory.get(order.order_id);
    if (memOrder) {
      memOrder.status = 'paid';
      memOrder.paid_at = new Date();
    }
    return null;
  }
  if (order.item.type === 'plan') {
    const user = await User.findByIdAndUpdate(
      order.owner_uid,
      { $set: { plan: order.item.plan } },
      { new: true }
    ).lean();
    // Reset monthly usage so the new allowance is immediately usable.
    await User.updateOne({ _id: order.owner_uid }, { $set: { 'usage.count': 0 } });
    return user;
  }
  // credits
  await addCredits(order.owner_uid, order.item.generations);
  return null;
}

/**
 * POST /api/orders/:id/confirm -> admin marks an order paid + grants the item.
 * Idempotent: confirming an already-paid order is a no-op.
 */
router.post('/:id/confirm', authRequired, requireAdmin, async (req, res) => {
  try {
    if (isDbReady()) {
      const order = await Order.findOne({ order_id: req.params.id });
      if (!order) return res.status(404).json({ error: 'order not found' });
      if (order.status === 'paid') return res.json(order); // idempotent
      if (order.status === 'cancelled') {
        return res.status(409).json({ error: 'order was cancelled' });
      }
      await grantOrder(order);
      order.status = 'paid';
      order.paid_at = new Date();
      await order.save();
      return res.json(order);
    }
    const order = memory.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    if (order.status === 'paid') return res.json(order);
    await grantOrder(order);
    return res.json(order);
  } catch (err) {
    console.error('[orders] confirm failed:', err.message);
    res.status(500).json({ error: 'could not confirm order' });
  }
});

// POST /api/orders/:id/cancel -> admin (or owner) cancels a pending order.
router.post('/:id/cancel', authRequired, async (req, res) => {
  try {
    const isAdmin = adminEmails.has((req.user.email || '').toLowerCase());
    if (isDbReady()) {
      const order = await Order.findOne({ order_id: req.params.id });
      if (!order) return res.status(404).json({ error: 'order not found' });
      // Owner may cancel their own pending order; admins may cancel any.
      const isOwner = order.owner_uid === req.user.uid;
      if (!isOwner && !isAdmin) return res.status(403).json({ error: 'forbidden' });
      if (order.status !== 'pending') {
        return res.status(409).json({ error: `order already ${order.status}` });
      }
      order.status = 'cancelled';
      await order.save();
      return res.json(order);
    }
    const order = memory.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    const isOwner = order.owner_uid === req.user.uid;
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'forbidden' });
    if (order.status !== 'pending') return res.status(409).json({ error: `order already ${order.status}` });
    order.status = 'cancelled';
    return res.json(order);
  } catch (err) {
    console.error('[orders] cancel failed:', err.message);
    res.status(500).json({ error: 'could not cancel order' });
  }
});

// GET /api/orders/admin/all -> all orders (admin only), for manual confirmation.
router.get('/admin/all', authRequired, requireAdmin, async (req, res) => {
  try {
    if (isDbReady()) {
      const all = await Order.find({}).sort({ createdAt: -1 }).lean();
      return res.json(all);
    }
    const all = [...memory.values()].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    return res.json(all);
  } catch (err) {
    console.error('[orders] admin list failed:', err.message);
    res.status(500).json({ error: 'could not list orders' });
  }
});

export { router as ordersRouter };
