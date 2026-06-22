import { Generation } from '../models/Generation.js';
import { isDbReady } from '../db.js';

/**
 * Persistent store of generations, powering the History page and the Account
 * stats. Mirrors the quota / collections persistence story: backed by MongoDB
 * when available, with an in-memory fallback so the app still works without a
 * DB connection.
 *
 * Why persistence matters: Render's free tier recycles the process after ~15
 * min of idle, wiping module-level state. Keeping the quota in Mongo but the
 * history in memory meant every restart emptied the user's history (and reset
 * the Account stats to 0) while the usage counter survived — a confusing
 * mismatch. Persisting here fixes both.
 */

// In-memory fallback. Map<jobId, record>, capped to MAX entries.
const MAX = 200;
const memory = new Map();

// Normalize a Mongoose lean/plain doc into the record shape the frontend and
// tests expect (camelCase fields, numeric createdAt from Mongoose timestamps).
function toRecord(doc) {
  if (!doc) return null;
  const createdAt = doc.createdAt instanceof Date ? doc.createdAt.getTime() : doc.createdAt || Date.now();
  return {
    jobId: doc.jobId,
    owner: doc.owner,
    prompt: doc.prompt || '',
    style_tags: doc.style_tags || [],
    duration: doc.duration || 0,
    instrumental: Boolean(doc.instrumental),
    model: doc.model || 'v3',
    status: doc.status || 'generating',
    audioUrl: doc.audioUrl || '',
    streamUrl: doc.streamUrl || '',
    error: doc.error || '',
    createdAt,
  };
}

// Evict the oldest in-memory entry once we exceed the cap.
function evictOldest() {
  if (memory.size <= MAX) return;
  let oldestKey = null;
  let oldestTime = Infinity;
  for (const [k, v] of memory) {
    if (v.createdAt < oldestTime) {
      oldestTime = v.createdAt;
      oldestKey = k;
    }
  }
  if (oldestKey) memory.delete(oldestKey);
}

/**
 * Insert (or overwrite) a generation record. `rec.createdAt` is honored if
 * provided, otherwise set to now.
 */
export async function addGeneration(rec) {
  if (!rec || !rec.jobId) return;
  const record = {
    jobId: rec.jobId,
    owner: rec.owner,
    prompt: rec.prompt || '',
    style_tags: rec.style_tags || [],
    duration: rec.duration || 0,
    instrumental: Boolean(rec.instrumental),
    model: rec.model || 'v3',
    status: rec.status || 'generating',
    audioUrl: rec.audioUrl || '',
    streamUrl: rec.streamUrl || '',
    error: rec.error || '',
    createdAt: rec.createdAt || Date.now(),
  };
  if (isDbReady()) {
    try {
      await Generation.findOneAndUpdate(
        { jobId: record.jobId },
        { $set: record },
        { upsert: true, new: true }
      ).lean();
      return;
    } catch (err) {
      console.warn('[generations] DB write failed, using memory:', err.message);
    }
  }
  memory.set(record.jobId, record);
  evictOldest();
}

/**
 * Patch an existing generation by jobId with a partial update (e.g. status /
 * audioUrl changing as the job progresses). No-op if the record doesn't exist.
 */
export async function updateGeneration(jobId, patch) {
  if (!jobId || !patch) return;
  if (isDbReady()) {
    try {
      await Generation.findOneAndUpdate({ jobId }, { $set: patch }).lean();
      return;
    } catch (err) {
      console.warn('[generations] DB update failed, using memory:', err.message);
    }
  }
  const cur = memory.get(jobId);
  if (cur) memory.set(jobId, { ...cur, ...patch });
}

// A single record by jobId, or null. Owner scoping is the caller's job.
export async function getGenerationRecord(jobId) {
  if (!jobId) return null;
  if (isDbReady()) {
    try {
      const doc = await Generation.findOne({ jobId }).lean();
      return toRecord(doc);
    } catch (err) {
      console.warn('[generations] DB read failed, using memory:', err.message);
    }
  }
  return memory.get(jobId) || null;
}

// All generations (newest first). In-memory also respects the MAX cap.
export async function listGenerations() {
  if (isDbReady()) {
    try {
      const docs = await Generation.find().sort({ createdAt: -1 }).lean();
      return docs.map(toRecord);
    } catch (err) {
      console.warn('[generations] DB read failed, using memory:', err.message);
    }
  }
  return [...memory.values()].sort((a, b) => b.createdAt - a.createdAt);
}

// Only the generations owned by `owner`, newest first.
export async function listGenerationsByOwner(owner) {
  if (!owner) return [];
  if (isDbReady()) {
    try {
      const docs = await Generation.find({ owner }).sort({ createdAt: -1 }).lean();
      return docs.map(toRecord);
    } catch (err) {
      console.warn('[generations] DB read failed, using memory:', err.message);
    }
  }
  return (await listGenerations()).filter((g) => g.owner === owner);
}
