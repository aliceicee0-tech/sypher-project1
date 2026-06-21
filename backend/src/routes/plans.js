import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

/**
 * GET /api/plans -> the public pricing catalog.
 *
 * Returns plans, credit packs and the accepted manual payment methods + their
 * instructions (Mvola number, bank details). No auth required — this drives
 * the pricing page shown before login.
 */
router.get('/', (_req, res) => {
  res.json({
    plans: Object.entries(config.plans).map(([id, p]) => ({
      id,
      monthlyLimit: p.monthlyLimit,
      priceEur: p.priceEur,
    })),
    creditPacks: config.creditPacks.map((p) => ({ ...p })),
    payment: {
      methods: config.payment.methods,
      mvolaNumber: config.payment.mvolaNumber,
      mvolaMerchant: config.payment.mvolaMerchant,
      mvolaUssdTemplate: config.payment.mvolaUssdTemplate,
      eurToMga: config.payment.eurToMga,
      bankIban: config.payment.bankIban,
      bankHolder: config.payment.bankHolder,
    },
  });
});

export { router as plansRouter };
