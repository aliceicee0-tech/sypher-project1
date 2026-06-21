import { describe, it, expect, vi, beforeEach } from 'vitest';

// keys.js reads config.treblo.apiKeys. We mock config with a fixed pool so the
// rotation/cooldown/exhaustion engine is fully deterministic. Keys must be
// longer than 8 chars so mask() returns the "…XXXX" form (length<=8 -> '****').
// Re-import fresh per test since rotation state lives in module-level maps.
function makeConfigMock(apiKeys) {
  return {
    config: { treblo: { apiKeys, get apiKey() { return apiKeys[0] || ''; } } },
    isMockMode: apiKeys.length === 0,
  };
}
async function freshKeys(keys = ['SECRET_KEY_AAAA', 'SECRET_KEY_BBBB', 'SECRET_KEY_CCCC']) {
  vi.resetModules();
  vi.doMock('../config.js', () => makeConfigMock(keys));
  return import('./keys.js');
}

describe('providers/keys', () => {
  let keys;
  beforeEach(async () => {
    keys = await freshKeys();
  });

  it('pickKey returns the first key from a fresh pool', () => {
    expect(keys.pickKey()).toBe('SECRET_KEY_AAAA');
  });

  it('retiring a key advances to the next one', () => {
    keys.markKeyExhausted('SECRET_KEY_AAAA', 'test');
    expect(keys.pickKey()).toBe('SECRET_KEY_BBBB');
  });

  it('returns null once every key is exhausted', () => {
    keys.markKeyExhausted('SECRET_KEY_AAAA', 'a');
    keys.markKeyExhausted('SECRET_KEY_BBBB', 'b');
    keys.markKeyExhausted('SECRET_KEY_CCCC', 'c');
    expect(keys.pickKey()).toBeNull();
  });

  it('markKeyFailed puts a key in transient cooldown, not retired', () => {
    keys.markKeyFailed('SECRET_KEY_AAAA');
    expect(keys.pickKey()).toBe('SECRET_KEY_BBBB');
  });

  it('a key with MAX_TRANSIENT (4) failures is promoted to exhausted', () => {
    for (let i = 0; i < 4; i++) keys.markKeyFailed('SECRET_KEY_AAAA');
    const st = keys.getStatus();
    expect(st.exhausted).toBeGreaterThanOrEqual(1);
    expect(st.exhaustedKeys.some((k) => k.endsWith('AAAA'))).toBe(true);
  });

  it('reviveKey returns a retired key to the rotation (no longer exhausted)', () => {
    keys.markKeyExhausted('SECRET_KEY_AAAA', 'gone');
    expect(keys.reviveKey('SECRET_KEY_AAAA')).toBe(true);
    // After revive, AAAA is healthy again. pickKey scans from the current index
    // (advanced to BBBB), so it may return BBBB first — that's fine; what matters
    // is AAAA is back in the pool and will be picked once others cycle.
    // Easiest deterministic check: exhaust BBBB+CCCC, then AAAA must be pickable.
    keys.markKeyExhausted('SECRET_KEY_BBBB');
    keys.markKeyExhausted('SECRET_KEY_CCCC');
    expect(keys.pickKey()).toBe('SECRET_KEY_AAAA');
    // Reviving an already-healthy (never-retired) key is a no-op -> false.
    expect(keys.reviveKey('SECRET_KEY_AAAA')).toBe(false);
  });

  it('getStatus reports pool shape and masks keys (>8 chars)', () => {
    const st = keys.getStatus();
    expect(st.total).toBe(3);
    expect(st.mockMode).toBe(false);
    expect(st.healthy).toBe(3);
    expect(st.active).toBe('…AAAA');
  });

  it('handles an empty pool (mock mode)', async () => {
    const empty = await freshKeys([]);
    expect(empty.pickKey()).toBeNull();
    const st = empty.getStatus();
    expect(st.total).toBe(0);
    expect(st.mockMode).toBe(true);
  });
});
