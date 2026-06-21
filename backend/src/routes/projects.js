import { Router } from 'express';
import { nanoid } from 'nanoid';
import { Project } from '../models/Project.js';
import { isDbReady } from '../db.js';
import { authRequired } from '../auth/jwt.js';

const router = Router();

// In-memory fallback store used when MongoDB is unavailable, so the app still
// works in a quick demo without a database.
const memory = new Map();

async function getOwnedProject(projectId, owner) {
  const project = isDbReady()
    ? await Project.findOne({ project_id: projectId }).lean()
    : memory.get(projectId);
  if (!project) return null;
  // Treat legacy 'anonymous' projects as unclaimed (editable by anyone) so
  // older demo data still works. Anything with a real owner is enforced.
  if (project.owner_id && project.owner_id !== 'anonymous' && project.owner_id !== owner) {
    return null;
  }
  return project;
}

// All project routes require authentication.
router.use(authRequired);

// POST /api/projects -> create
router.post('/', async (req, res) => {
  const project = {
    project_id: nanoid(10),
    owner_id: req.user.uid, // owner taken from the session, never from the body
    title: req.body.title || 'Untitled',
    settings: req.body.settings || { bpm: 120, global_volume: 1.0 },
    nodes: req.body.nodes || [],
    edges: req.body.edges || [],
  };
  if (isDbReady()) {
    const created = await Project.create(project);
    return res.status(201).json(created);
  }
  memory.set(project.project_id, project);
  res.status(201).json(project);
});

// GET /api/projects -> list the caller's projects only
router.get('/', async (req, res) => {
  if (isDbReady()) {
    const all = await Project.find({ owner_id: req.user.uid })
      .sort({ updatedAt: -1 })
      .lean();
    return res.json(all);
  }
  res.json(
    [...memory.values()].filter((p) => p.owner_id === req.user.uid)
  );
});

// GET /api/projects/:id -> read one (owner only)
router.get('/:id', async (req, res) => {
  const project = await getOwnedProject(req.params.id, req.user.uid);
  if (!project) return res.status(404).json({ error: 'not found' });
  res.json(project);
});

// PUT /api/projects/:id -> update (save nodes/edges/settings)
router.put('/:id', async (req, res) => {
  const existing = await getOwnedProject(req.params.id, req.user.uid);
  if (!existing) return res.status(404).json({ error: 'not found' });

  // Whitelisted patch fields only; owner_id is deliberately excluded.
  const patch = {
    title: req.body.title,
    settings: req.body.settings,
    nodes: req.body.nodes,
    edges: req.body.edges,
  };
  if (isDbReady()) {
    const updated = await Project.findOneAndUpdate(
      { project_id: req.params.id, owner_id: req.user.uid },
      { $set: patch },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'not found' });
    return res.json(updated);
  }
  const merged = { ...existing, ...patch };
  memory.set(req.params.id, merged);
  res.json(merged);
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  const existing = await getOwnedProject(req.params.id, req.user.uid);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (isDbReady()) {
    await Project.deleteOne({ project_id: req.params.id, owner_id: req.user.uid });
  } else {
    memory.delete(req.params.id);
  }
  res.status(204).end();
});

export { router as projectsRouter };
