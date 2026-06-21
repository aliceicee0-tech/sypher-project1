import mongoose from 'mongoose';

/**
 * A manual payment order for a plan upgrade or a credit-pack purchase.
 *
 * Because Stripe is unavailable in the operator's region, payment is manual:
 * the user creates an order (pending), pays via Mvola or bank transfer outside
 * the app, then an admin flips the order to 'paid' — which grants the plan or
 * credits atomically.
 *
 * Lifecycle:
 *   pending  -> paid      (admin confirms receipt)  -> plan/credits granted
 *   pending  -> cancelled (admin/user cancels)      -> nothing granted
 *
 * What was bought is captured in `item` so the grant step is deterministic and
 * the order remains an immutable audit record even if config.plans changes.
 */
const OrderSchema = new mongoose.Schema(
  {
    order_id: { type: String, required: true, unique: true, index: true },
    owner_uid: { type: String, required: true, index: true },
    owner_email: { type: String, default: '' },
    // The thing being bought: a plan upgrade or a credit pack.
    item: {
      type: { type: String, enum: ['plan', 'credits'], required: true },
      // For 'plan': the new plan name. For 'credits': number of generations.
      plan: { type: String, default: '' },
      generations: { type: Number, default: 0 },
    },
    price_eur: { type: Number, required: true },
    method: { type: String, enum: ['mvola', 'bank_transfer'], required: true },
    status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending', index: true },
    // Free-text note from the user to help the admin match the payment
    // (e.g. "transaction ref TXN-123456" for a bank transfer).
    payment_ref: { type: String, default: '' },
    // The phone number the user paid FROM (Mvola). Lets the admin cross-check
    // the incoming transaction on the merchant Mvola statement.
    payer_phone: { type: String, default: '' },
    // When the order was fulfilled (granted). null while pending.
    paid_at: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Order = mongoose.model('Order', OrderSchema);
