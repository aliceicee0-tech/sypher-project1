import { Router } from 'express';
import { nanoid } from 'nanoid';
import { Share } from '../models/Share.js';
import { Project } from '../models/Project.js';
import { isDbReady } from '../db.js';
import { authRequired } from '../auth/jwt.js';

const router = Router();

// In-memory fallback so share creation still works without MongoDB.
const shareMemory = new Map();

// POST /api/share -> create a public share link for a track (auth required).
router.post('/', authRequired, async (req, res) => {
  try {
    const audioUrl = (req.body?.audio_url || '').toString().trim();
    if (!audioUrl) return res.status(400).json({ error: 'audio_url required' });

    const record = {
      share_id: nanoid(12), // longer than collection ids; harder to guess
      owner_id: req.user.uid,
      title: (req.body?.title || 'Untitled').toString().slice(0, 120),
      prompt: (req.body?.prompt || '').toString().slice(0, 1000),
      style_tags: Array.isArray(req.body?.style_tags)
        ? req.body.style_tags.filter((x) => typeof x === 'string').slice(0, 20)
        : [],
      duration: Number(req.body?.duration) || 30,
      audio_url: audioUrl,
    };

    if (isDbReady()) {
      const created = await Share.create(record);
      return res.status(201).json({ id: created.share_id });
    }
    record.updatedAt = Date.now();
    shareMemory.set(record.share_id, record);
    return res.status(201).json({ id: record.share_id });
  } catch (err) {
    console.error('[share] create failed:', err.message);
    res.status(500).json({ error: 'could not create share link' });
  }
});

// GET /api/share/:id -> public, read-only payload for the Player page.
// Reads the new Share model first, then falls back to a legacy Project.
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    // 1) New single-track shares.
    const share = isDbReady()
      ? await Share.findOne({ share_id: id }).lean()
      : shareMemory.get(id);
    if (share) {
      return res.json({
        kind: 'track',
        id: share.share_id,
        title: share.title,
        prompt: share.prompt,
        style_tags: share.style_tags,
        duration: share.duration,
        audio_url: share.audio_url,
      });
    }

    // 2) Legacy node-graph projects (backwards compatibility).
    const project = isDbReady() ? await Project.findOne({ project_id: id }).lean() : null;
    if (project) {
      return res.json({
        kind: 'project',
        project_id: project.project_id,
        title: project.title,
        settings: project.settings,
        nodes: project.nodes,
        edges: project.edges,
      });
    }

    return res.status(404).json({ error: 'not found' });
  } catch (err) {
    console.error('[share] failed:', err.message);
    res.status(500).json({ error: 'failed to load shared project' });
  }
});

export default router;
