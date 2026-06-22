import { Router } from 'express';
import { startGeneration, getGenerationStatus } from '../services/trebloClient.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { addGeneration, getGenerationRecord, updateGeneration } from '../store/generations.js';
import { authRequired } from '../auth/jwt.js';
import { requireActive } from '../middleware/requireActive.js';
import { config } from '../config.js';
import { getQuota, incrementUsage } from '../services/usage.js';

const router = Router();

// Generation is a paid, authenticated action — protect both the start and the
// polling endpoints. authRequired runs before the limiter so anonymous callers
// are rejected with 401 instead of burning rate-limit budget. requireActive
// blocks banned accounts from spending quota.
router.use(authRequired, requireActive);

// Protect the paid generation endpoint against abuse: a tunable number of
// generations per minute per user. The server-wide limiter in server.js adds a
// second, broader guard.
const generateLimiter = rateLimit({
  max: config.generateRate.max,
  windowMs: config.generateRate.windowMs,
  message: 'Too many generations. Please slow down and try again shortly.',
});

const ALLOWED_MODELS = new Set(['v2', 'v3']);

// Coerce + clamp the request body so nothing invalid reaches Treblo.
function sanitizeInput(body = {}) {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : '';
  const lyrics = typeof body.lyrics === 'string' ? body.lyrics.trim().slice(0, 4000) : '';
  const style_tags = Array.isArray(body.style_tags)
    ? body.style_tags
        .filter((t) => typeof t === 'string' && t.trim())
        .map((t) => t.trim().slice(0, 60))
        .slice(0, 30)
    : [];
  const instrumental = Boolean(body.instrumental);
  let model = ALLOWED_MODELS.has(body.model) ? body.model : 'v3';
  // Duration: 5–300s, snapped to a sensible step. Invalid -> 30.
  let duration = Number(body.duration);
  if (!Number.isFinite(duration) || duration < 5 || duration > 300) duration = 30;
  duration = Math.round(duration);
  return { prompt, lyrics, style_tags, instrumental, model, duration, enableStreaming: body.enableStreaming !== false };
}

// POST /api/generate  -> start a generation (proxied, key stays server-side)
router.post('/', generateLimiter, async (req, res) => {
  try {
    const { prompt, style_tags, duration, lyrics, instrumental, model, enableStreaming } =
      sanitizeInput(req.body);

    // A request needs at least a prompt OR tags OR lyrics to be meaningful.
    if (!prompt && !style_tags.length && !lyrics) {
      return res.status(400).json({ error: 'provide a prompt, tags, or lyrics' });
    }

    // Freemium quota: free users are capped at FREE_MONTHLY_LIMIT per month.
    const quota = await getQuota(req.user.uid);
    if (!quota.canGenerate) {
      return res.status(402).json({
        error: 'monthly_generation_limit_reached',
        message: `You've used all ${quota.limit} free generations this month. Upgrade to keep creating.`,
        quota,
      });
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

    // Count this generation against the monthly quota only once it's accepted
    // by the upstream engine.
    await incrementUsage(req.user.uid);
    const updatedQuota = await getQuota(req.user.uid);

    // Record this generation in the history store so the history page can list
    // it immediately (status updates as the client polls).
    await addGeneration({
      jobId: job.jobId,
      prompt,
      style_tags,
      duration,
      instrumental,
      model,
      status: 'generating',
      audioUrl: '',
      owner: req.user.uid,
      createdAt: Date.now(),
    });

    res.json({ ...job, quota: updatedQuota });
  } catch (err) {
    console.error('[generate] failed:', err.message);
    res.status(502).json({ error: 'generation failed' });
  }
});

// GET /api/generate/:jobId -> poll generation status (owner-scoped)
router.get('/:jobId', async (req, res) => {
  try {
    // Only the owner may poll their own job.
    const rec = await getGenerationRecord(req.params.jobId);
    if (!rec || rec.owner !== req.user.uid) {
      return res.status(404).json({ error: 'not found' });
    }
    const status = await getGenerationStatus(req.params.jobId);
    if (status.status !== rec.status) {
      // Persist the transition (and the final audio URL) so the history page
      // reflects the up-to-date status across backend restarts.
      const patch = { status: status.status };
      if (status.audioUrl) patch.audioUrl = status.audioUrl;
      if (status.streamUrl) patch.streamUrl = status.streamUrl;
      await updateGeneration(req.params.jobId, patch);
    }
    res.json(status);
  } catch (err) {
    console.error('[generate] poll failed:', err.message);
    res.status(502).json({ error: 'generation status failed' });
  }
});

export default router;
