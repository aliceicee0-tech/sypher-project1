import { Router } from 'express';
import { nanoid } from 'nanoid';
import { Collection } from '../models/Collection.js';
import { isDbReady } from '../db.js';
import { authRequired } from '../auth/jwt.js';

const router = Router();

// In-memory fallback so the app works without MongoDB. Keyed by collection_id.
const memory = new Map();

// All collection routes require authentication. Collections are private to
// their owner (creation, listing, reading, mutating, deleting).
router.use(authRequired);

async function getOwnedCollection(collectionId, owner) {
  const col = isDbReady()
    ? await Collection.findOne({ collection_id: collectionId }).lean()
    : memory.get(collectionId);
  if (!col) return null;
  if (col.owner_id && col.owner_id !== owner) return null;
  return col;
}

// GET /api/collections -> list the caller's collections (newest first)
router.get('/', async (req, res) => {
  if (isDbReady()) {
    const all = await Collection.find({ owner_id: req.user.uid })
      .sort({ updatedAt: -1 })
      .lean();
    return res.json(all);
  }
  res.json(
    [...memory.values()]
      .filter((c) => c.owner_id === req.user.uid)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  );
});

// POST /api/collections -> create { title }
router.post('/', async (req, res) => {
  const title = (req.body?.title || '').toString().trim().slice(0, 100) || 'Untitled collection';
  const col = {
    collection_id: nanoid(10),
    owner_id: req.user.uid,
    title,
    tracks: [],
  };
  if (isDbReady()) {
    const created = await Collection.create(col);
    return res.status(201).json(created);
  }
  col.updatedAt = Date.now();
  memory.set(col.collection_id, col);
  res.status(201).json(col);
});

// GET /api/collections/:id -> read one (owner only)
router.get('/:id', async (req, res) => {
  const col = await getOwnedCollection(req.params.id, req.user.uid);
  if (!col) return res.status(404).json({ error: 'not found' });
  res.json(col);
});

// PUT /api/collections/:id -> rename { title }
router.put('/:id', async (req, res) => {
  const title = (req.body?.title || '').toString().trim().slice(0, 100);
  if (!title) return res.status(400).json({ error: 'title required' });

  const existing = await getOwnedCollection(req.params.id, req.user.uid);
  if (!existing) return res.status(404).json({ error: 'not found' });

  if (isDbReady()) {
    const updated = await Collection.findOneAndUpdate(
      { collection_id: req.params.id, owner_id: req.user.uid },
      { $set: { title } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'not found' });
    return res.json(updated);
  }
  existing.title = title;
  existing.updatedAt = Date.now();
  res.json(existing);
});

// POST /api/collections/:id/tracks -> add a track to the collection
router.post('/:id/tracks', async (req, res) => {
  const existing = await getOwnedCollection(req.params.id, req.user.uid);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const audioUrl = (req.body?.audio_url || '').toString().trim();
  if (!audioUrl) return res.status(400).json({ error: 'audio_url required' });

  const t = {
    track_id: nanoid(8),
    title: (req.body?.title || req.body?.prompt || 'Untitled').toString().slice(0, 120),
    prompt: (req.body?.prompt || '').toString().slice(0, 1000),
    style_tags: Array.isArray(req.body?.style_tags)
      ? req.body.style_tags.filter((x) => typeof x === 'string').slice(0, 20)
      : [],
    duration: Number(req.body?.duration) || 30,
    audio_url: audioUrl,
  };

  if (isDbReady()) {
    const updated = await Collection.findOneAndUpdate(
      { collection_id: req.params.id, owner_id: req.user.uid },
      { $push: { tracks: t } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'not found' });
    return res.status(201).json(updated);
  }
  existing.tracks.push(t);
  existing.updatedAt = Date.now();
  res.status(201).json(existing);
});

// DELETE /api/collections/:id/tracks/:trackId -> remove a track
router.delete('/:id/tracks/:trackId', async (req, res) => {
  const existing = await getOwnedCollection(req.params.id, req.user.uid);
  if (!existing) return res.status(404).json({ error: 'not found' });

  if (isDbReady()) {
    const updated = await Collection.findOneAndUpdate(
      { collection_id: req.params.id, owner_id: req.user.uid },
      { $pull: { tracks: { track_id: req.params.trackId } } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'not found' });
    return res.json(updated);
  }
  existing.tracks = existing.tracks.filter((tr) => tr.track_id !== req.params.trackId);
  existing.updatedAt = Date.now();
  res.json(existing);
});

// DELETE /api/collections/:id -> delete the whole collection
router.delete('/:id', async (req, res) => {
  const existing = await getOwnedCollection(req.params.id, req.user.uid);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (isDbReady()) {
    await Collection.deleteOne({ collection_id: req.params.id, owner_id: req.user.uid });
  } else {
    memory.delete(req.params.id);
  }
  res.status(204).end();
});

export { router as collectionsRouter };
