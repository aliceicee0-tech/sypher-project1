import { describe, it, expect, vi, beforeEach } from 'vitest';

// The store holds state in a module-level Map with no reset export, so we
// re-import a fresh module per test to start from an empty store.
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

  it('stores and retrieves a generation by jobId', () => {
    const rec = mk('job_1', 'alice', '2024-01-01');
    store.addGeneration(rec);
    expect(store.getGenerationRecord('job_1')).toEqual(rec);
    expect(store.getGenerationRecord('missing')).toBeNull();
  });

  it('overwrites when the same jobId is added twice', () => {
    store.addGeneration(mk('job_1', 'alice', '2024-01-01', { prompt: 'old' }));
    store.addGeneration(mk('job_1', 'alice', '2024-01-02', { prompt: 'new' }));
    expect(store.getGenerationRecord('job_1').prompt).toBe('new');
  });

  it('lists newest-first', () => {
    store.addGeneration(mk('old', 'alice', '2024-01-01'));
    store.addGeneration(mk('new', 'alice', '2024-06-01'));
    const list = store.listGenerations();
    expect(list[0].jobId).toBe('new');
    expect(list[1].jobId).toBe('old');
  });

  it('scopes by owner', () => {
    store.addGeneration(mk('a1', 'alice', '2024-01-01'));
    store.addGeneration(mk('b1', 'bob', '2024-01-02'));
    expect(store.listGenerationsByOwner('alice').map((g) => g.jobId)).toEqual(['a1']);
    expect(store.listGenerationsByOwner('bob').map((g) => g.jobId)).toEqual(['b1']);
    expect(store.listGenerationsByOwner('nobody')).toEqual([]);
  });

  it('evicts the oldest entries past the 200 cap', () => {
    for (let i = 0; i < 205; i++) {
      store.addGeneration(mk(`job_${i}`, 'alice', Date.UTC(2024, 0, 1, 0, 0, i)));
    }
    const list = store.listGenerations();
    expect(list).toHaveLength(200);
    expect(store.getGenerationRecord('job_0')).toBeNull();
    expect(store.getGenerationRecord('job_4')).toBeNull();
    expect(store.getGenerationRecord('job_204')).not.toBeNull();
  });
});
