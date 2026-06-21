import mongoose from 'mongoose';
import { config } from './config.js';

/**
 * Database connection + a shared "is Mongo reachable right now" helper.
 *
 * Routes historically each defined their own `dbReady()` by peeking at a
 * specific model's `db.readyState`. That worked but tightly coupled auth and
 * share to the projects route module. We centralise readiness here so any
 * module can ask `isDbReady()` without importing a router.
 */
export async function connectDb() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('[db] connected to MongoDB');
  } catch (err) {
    // Non-fatal: the API still boots so the frontend/mock flow can be demoed,
    // falling back to the per-route in-memory stores.
    console.warn('[db] MongoDB connection failed, persistence disabled:', err.message);
  }
}

// readyState 1 === "connected". Anything else (disconnected/connecting/...)
// means we should treat the DB as unavailable and use the in-memory fallbacks.
export function isDbReady() {
  return mongoose.connection.readyState === 1;
}

export const { connection } = mongoose;
