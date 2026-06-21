import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pathToFileURL } from 'node:url';
import { config, isMockMode } from './config.js';
import { connectDb } from './db.js';
import { isDbReady } from './db.js';
import { authOptional } from './auth/jwt.js';
import { rateLimit } from './middleware/rateLimit.js';
import authRouter from './routes/auth.js';
import generateRouter from './routes/generate.js';
import generationsRouter from './routes/generations.js';
import { projectsRouter } from './routes/projects.js';
import { collectionsRouter } from './routes/collections.js';
import shareRouter from './routes/share.js';
import usageRouter from './routes/usage.js';
import { ordersRouter } from './routes/orders.js';
import { plansRouter } from './routes/plans.js';
import { adminRouter } from './routes/admin.js';

export const app = express();

// Behind a proxy (Render/Heroku/Nginx): trust the first hop so req.ip and the
// X-Forwarded-* headers (used by rate limiting and secure cookies) are honored.
app.set('trust proxy', 1);

// Security headers. Content-Security-Policy is disabled because this is a pure
// JSON API (the browser app is served separately by Vite) — we keep the rest of
// helmet's defaults (HSTS in prod, noSniff, frameguard, hidePoweredBy, …).
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS must allow credentials so the auth cookie travels with API calls.
// Origin is locked to the configured client URL (never "*").
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Attach req.user (if any) to every request. Individual routes decide whether
// authentication is required.
app.use(authOptional);

// A light global rate limit protects every endpoint from dumb flooding. The
// generation endpoint adds a stricter second limiter on top of this one.
const globalLimiter = rateLimit({
  max: 300,
  windowMs: 60_000,
  message: 'Too many requests. Please slow down.',
});

app.get('/api/health', (req, res) => {
  // Minimal, auth-free, dependency-light probe for load balancers / uptime
  // monitors. We avoid touching Mongo here so a DB hiccup never turns the API
  // "down" for orchestration purposes (the in-memory fallbacks keep it serving).
  res.json({
    ok: true,
    mockMode: isMockMode,
    uptime: Math.round(process.uptime()),
    keys: config.treblo.apiKeys.length,
    db: isDbReady(),
  });
});

app.use('/api/auth', globalLimiter, authRouter);
app.use('/api/generate', globalLimiter, generateRouter);
app.use('/api/generations', globalLimiter, generationsRouter);
app.use('/api/projects', globalLimiter, projectsRouter);
app.use('/api/collections', globalLimiter, collectionsRouter);
app.use('/api/share', globalLimiter, shareRouter);
app.use('/api/usage', globalLimiter, usageRouter);
app.use('/api/orders', globalLimiter, ordersRouter);
app.use('/api/plans', globalLimiter, plansRouter);
app.use('/api/admin', globalLimiter, adminRouter);

// 404 — nothing matched. Keep the response shape consistent with route errors.
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Central error handler. Never leak internal error messages to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] unhandled error:', err);
  res.status(err.status || 500).json({ error: 'internal server error' });
});

async function start() {
  await connectDb();
  app.listen(config.port, () => {
    console.log(`[server] Melodia API on http://localhost:${config.port}`);
    if (isMockMode) {
      console.log('[server] no Treblo keys set — running in MOCK MODE.');
    } else {
      const n = config.treblo.apiKeys.length;
      const exp = config.treblo.expectedKeys || 0;
      const tag = exp > 0 && n < exp ? ` (expected ${exp} — PARTIAL)` : '';
      console.log(
        `[server] Treblo: ${n} key${n === 1 ? '' : 's'} loaded${
          n > 1 ? ' (failover ON)' : ''
        }${exp ? `, pool target ${exp}` : ''}${tag}.`
      );
    }
    if (config.maxUsers > 0) {
      console.log(`[server] beta capacity: MAX_USERS=${config.maxUsers}.`);
    }
  });
}

export { start };

// Boot only when launched directly (`node src/server.js`), NOT when imported by
// tests. pathToFileURL keeps this working on Windows (drive letters / spaces).
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(import.meta.url).href;
if (isMain) {
  start();
}
