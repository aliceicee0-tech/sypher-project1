import { describe, it, expect, vi, beforeEach } from 'vitest';

// The store falls back to an in-memory Map when MongoDB is unavailable
// (isDbReady() === false). Mock db.js so every test exercises the memory path
// deterministically. We also stub the Generation model — it's never reached on
// the memory path, but importing the real model would register it in Mongoose's
// global model registry, which then crashes on the per-test module re-import
// ("Cannot overwrite model once compiled"). Stubbing keeps the store isolated.
vi.mock('../db.js', () => ({ isDbReady: () => false }));
vi.mock('../models/Generation.js', () => ({ Generation: {} }));

async function freshStore() {
  vi.resetModules();
  return import('./generations.js');
}

describe('store/generations', () => {
  let store;
  const mk = (jobId, owner, createdAt, extra = {}) => ({
    jobId,
    owner,
    createdAt: new Date(createdAt).getTime(),
    ...extra,
  });

  beforeEach(async () => {
    store = await freshStore();
  });

  it('stores and retrieves a generation by jobId', async () => {
    const rec = mk('job_1', 'alice', '2024-01-01');
    await store.addGeneration(rec);
    expect(await store.getGenerationRecord('job_1')).toMatchObject({ jobId: 'job_1' });
    expect(await store.getGenerationRecord('missing')).toBeNull();
  });

  it('overwrites when the same jobId is added twice', async () => {
    await store.addGeneration(mk('job_1', 'alice', '2024-01-01', { prompt: 'old' }));
    await store.addGeneration(mk('job_1', 'alice', '2024-01-02', { prompt: 'new' }));
    expect((await store.getGenerationRecord('job_1')).prompt).toBe('new');
  });

  it('lists newest-first', async () => {
    await store.addGeneration(mk('old', 'alice', '2024-01-01'));
    await store.addGeneration(mk('new', 'alice', '2024-06-01'));
    const list = await store.listGenerations();
    expect(list[0].jobId).toBe('new');
    expect(list[1].jobId).toBe('old');
  });

  it('scopes by owner', async () => {
    await store.addGeneration(mk('a1', 'alice', '2024-01-01'));
    await store.addGeneration(mk('b1', 'bob', '2024-01-02'));
    expect((await store.listGenerationsByOwner('alice')).map((g) => g.jobId)).toEqual(['a1']);
    expect((await store.listGenerationsByOwner('bob')).map((g) => g.jobId)).toEqual(['b1']);
    expect(await store.listGenerationsByOwner('nobody')).toEqual([]);
  });

  it('evicts the oldest entries past the 200 cap', async () => {
    for (let i = 0; i < 205; i++) {
      await store.addGeneration(mk(`job_${i}`, 'alice', Date.UTC(2024, 0, 1, 0, 0, i)));
    }
    const list = await store.listGenerations();
    expect(list).toHaveLength(200);
    expect(await store.getGenerationRecord('job_0')).toBeNull();
    expect(await store.getGenerationRecord('job_4')).toBeNull();
    expect(await store.getGenerationRecord('job_204')).not.toBeNull();
  });

  it('updateGeneration patches fields without replacing the record', async () => {
    await store.addGeneration(mk('job_x', 'alice', '2024-01-01', { status: 'generating' }));
    await store.updateGeneration('job_x', { status: 'ready', audioUrl: 'https://cdn/x.mp3' });
    const rec = await store.getGenerationRecord('job_x');
    expect(rec.status).toBe('ready');
    expect(rec.audioUrl).toBe('https://cdn/x.mp3');
    expect(rec.owner).toBe('alice'); // untouched fields preserved
  });

  it('updateGeneration is a no-op on an unknown jobId', async () => {
    await store.updateGeneration('ghost', { status: 'ready' });
    expect(await store.getGenerationRecord('ghost')).toBeNull();
  });
});
