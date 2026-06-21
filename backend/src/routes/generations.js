import { Router } from 'express';
import { listGenerationsByOwner } from '../store/generations.js';
import { authRequired } from '../auth/jwt.js';

const router = Router();

// History is private: only the caller's own generations are returned.
router.use(authRequired);

// GET /api/generations -> list the caller's generation history (newest first)
router.get('/', async (req, res) => {
  try {
    res.json(await listGenerationsByOwner(req.user.uid));
  } catch (err) {
    console.error('[generations] list failed:', err.message);
    res.status(500).json({ error: 'could not load history' });
  }
});

export default router;
