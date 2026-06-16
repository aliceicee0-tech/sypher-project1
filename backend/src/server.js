import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config, isMockMode } from './config.js';
import { connectDb } from './db.js';
import { authOptional } from './auth/jwt.js';
import authRouter from './routes/auth.js';
import generateRouter from './routes/generate.js';
import { projectsRouter } from './routes/projects.js';
import shareRouter from './routes/share.js';

const app = express();

// CORS must allow credentials so the auth cookie travels with API calls.
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Attach req.user (if any) to every request.
app.use(authOptional);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mockMode: isMockMode });
});

app.use('/api/auth', authRouter);
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
