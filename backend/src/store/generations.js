/**
 * In-memory store of completed generations, used to power the "History"
 * sidebar and the /history page.
 *
 * We keep finished (ready/error) generations, capped to the last 200 to bound
 * memory. Each record carries its owner so listings can be scoped per user.
 * In production this would be MongoDB; for now memory keeps the app
 * dependency-free.
 */

const MAX = 200;
const generations = new Map(); // jobId -> record

export function addGeneration(rec) {
  generations.set(rec.jobId, rec);
  // Evict oldest entries once we exceed the cap.
  if (generations.size > MAX) {
    const oldest = generations.keys().next().value;
    generations.delete(oldest);
  }
}

// All generations (newest first). Callers scope by owner where appropriate.
export function listGenerations() {
  return [...generations.values()].sort((a, b) => b.createdAt - a.createdAt);
}

// Only the generations owned by `owner`, newest first.
export function listGenerationsByOwner(owner) {
  return listGenerations().filter((g) => g.owner === owner);
}

export function getGenerationRecord(jobId) {
  return generations.get(jobId) || null;
}
