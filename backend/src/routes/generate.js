import { Router } from 'express';
import { startGeneration, getGenerationStatus } from '../services/trebloClient.js';

const router = Router();

// POST /api/generate  -> start a Treblo generation (proxied, key stays server-side)
router.post('/', async (req, res) => {
  try {
    const { prompt, style_tags, duration, lyrics, instrumental, model, enableStreaming } =
      req.body || {};
    // A request needs at least a prompt OR tags OR lyrics to be meaningful.
    const hasPrompt = prompt && prompt.trim();
    const hasTags = Array.isArray(style_tags) && style_tags.filter(Boolean).length;
    const hasLyrics = lyrics && lyrics.trim();
    if (!hasPrompt && !hasTags && !hasLyrics) {
      return res.status(400).json({ error: 'provide a prompt, tags, or lyrics' });
    }
    const job = await startGeneration({
      prompt,
      style_tags,
      duration,
      lyrics,
      instrumental,
      model,
      enableStreaming,
    });
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
