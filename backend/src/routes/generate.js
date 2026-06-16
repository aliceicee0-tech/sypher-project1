import { Router } from 'express';
import { startGeneration, getGenerationStatus } from '../services/trebloClient.js';

const router = Router();

// POST /api/generate  -> start a Treblo generation (proxied, key stays server-side)
router.post('/', async (req, res) => {
  try {
    const { prompt, style_tags, duration } = req.body || {};
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }
    const job = await startGeneration({ prompt, style_tags, duration });
    res.json(job);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/generate/:jobId -> poll generation status
router.get('/:jobId', async (req, res) => {
  try {
    const status = await getGenerationStatus(req.params.jobId);
    res.json(status);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
