import { Router } from 'express';
import { authRequired } from '../auth/jwt.js';
import { getQuota } from '../services/usage.js';

const router = Router();

// All usage routes require authentication.
router.use(authRequired);

// GET /api/usage -> the caller's freemium quota for the current month.
router.get('/', async (req, res) => {
  try {
    const quota = await getQuota(req.user.uid);
    res.json(quota);
  } catch (err) {
    console.error('[usage] failed:', err.message);
    res.status(500).json({ error: 'could not load usage' });
  }
});

export default router;
