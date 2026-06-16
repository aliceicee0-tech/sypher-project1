import { Router } from 'express';
import { Project } from '../models/Project.js';
import { projectMemory, dbReady } from './projects.js';

const router = Router();

// GET /api/share/:id -> public, read-only payload for the Player page.
// Returns only what the minimalist player needs.
router.get('/:id', async (req, res) => {
  const project = dbReady()
    ? await Project.findOne({ project_id: req.params.id }).lean()
    : projectMemory.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'not found' });

  res.json({
    project_id: project.project_id,
    title: project.title,
    settings: project.settings,
    nodes: project.nodes,
    edges: project.edges,
  });
});

export default router;
