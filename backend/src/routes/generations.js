import { Router } from 'express';
import { listGenerationsByOwner } from '../store/generations.js';
import { authRequired } from '../auth/jwt.js';

const router = Router();

// History is private: only the caller's own generations are returned.
router.use(authRequired);

// GET /api/generations -> list the caller's generation history (newest first)
router.get('/', (req, res) => {
  res.json(listGenerationsByOwner(req.user.uid));
});

export default router;
