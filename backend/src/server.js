import express from 'express';
import cors from 'cors';
import { config, isMockMode } from './config.js';
import { connectDb } from './db.js';
import generateRouter from './routes/generate.js';
import { projectsRouter } from './routes/projects.js';
import shareRouter from './routes/share.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mockMode: isMockMode });
});

app.use('/api/generate', generateRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/share', shareRouter);

async function start() {
  await connectDb();
  app.listen(config.port, () => {
    console.log(`[server] MusiBlock API on http://localhost:${config.port}`);
    if (isMockMode) {
      console.log('[server] TREBLO_API_KEY not set — running in MOCK MODE.');
    }
  });
}

start();
