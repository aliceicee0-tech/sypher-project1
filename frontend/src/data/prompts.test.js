import { describe, it, expect, vi } from 'vitest';
import { SUGGESTIONS, RANDOM, GENRES, randomPrompt } from './prompts.js';

describe('data/prompts', () => {
  it('exports non-empty arrays of strings', () => {
    expect(Array.isArray(SUGGESTIONS)).toBe(true);
    expect(SUGGESTIONS.length).toBeGreaterThan(0);
    expect(SUGGESTIONS.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
    expect(RANDOM.length).toBeGreaterThan(0);
    expect(GENRES.length).toBeGreaterThan(0);
  });

  it('randomPrompt returns a string from the RANDOM pool', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const pick = randomPrompt();
    expect(RANDOM).toContain(pick);
    Math.random.mockRestore();
  });

  it('randomPrompt avoids repeating the last pick (when the pool allows)', () => {
    const last = RANDOM[0];
    // First draw -> index 0 (== last); subsequent draws -> index 1 (different).
    // floor(0.06 * 20) = 1.
    let calls = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (calls++ === 0 ? 0 : 0.06));
    const pick = randomPrompt(last);
    expect(pick).not.toBe(last);
    expect(RANDOM).toContain(pick);
    Math.random.mockRestore();
  });
});
