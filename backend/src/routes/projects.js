import { Router } from 'express';
import { nanoid } from 'nanoid';
import { Project } from '../models/Project.js';

const router = Router();

// In-memory fallback store used when MongoDB is unavailable, so the app still
// works in a quick demo without a database.
const memory = new Map();
function dbReady() {
  return Project.db?.readyState === 1;
}

// POST /api/projects -> create
router.post('/', async (req, res) => {
  const project = {
    project_id: nanoid(10),
    owner_id: req.body.owner_id || 'anonymous',
    title: req.body.title || 'Untitled',
    settings: req.body.settings || { bpm: 120, global_volume: 1.0 },
    nodes: req.body.nodes || [],
    edges: req.body.edges || [],
  };
  if (dbReady()) {
    const created = await Project.create(project);
    return res.status(201).json(created);
  }
  memory.set(project.project_id, project);
  res.status(201).json(project);
});

// GET /api/projects -> list
router.get('/', async (req, res) => {
  if (dbReady()) {
    const all = await Project.find().sort({ updatedAt: -1 }).lean();
    return res.json(all);
  }
  res.json([...memory.values()]);
});

// GET /api/projects/:id -> read one
router.get('/:id', async (req, res) => {
  const project = dbReady()
    ? await Project.findOne({ project_id: req.params.id }).lean()
    : memory.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });
  res.json(project);
});

// PUT /api/projects/:id -> update (save nodes/edges/settings)
router.put('/:id', async (req, res) => {
  const patch = {
    title: req.body.title,
    settings: req.body.settings,
    nodes: req.body.nodes,
    edges: req.body.edges,
  };
  if (dbReady()) {
    const updated = await Project.findOneAndUpdate(
      { project_id: req.params.id },
      { $set: patch },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'not found' });
    return res.json(updated);
  }
  const existing = memory.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const merged = { ...existing, ...patch };
  memory.set(req.params.id, merged);
  res.json(merged);
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res) => {
  if (dbReady()) {
    await Project.deleteOne({ project_id: req.params.id });
  } else {
    memory.delete(req.params.id);
  }
  res.status(204).end();
});

export { router as projectsRouter, memory as projectMemory, dbReady };
