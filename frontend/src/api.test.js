import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, getAuthToken, setAuthToken } from './api.js';

// api.js reads localStorage + fetch + import.meta.env.VITE_API_URL. jsdom
// provides localStorage; we stub fetch per test.

const TOKEN_KEY = 'melodia_token';

function mockFetch(impl) {
  globalThis.fetch = vi.fn(impl);
}

describe('api token helpers', () => {
  beforeEach(() => localStorage.clear());

  it('getAuthToken reads the stored token', () => {
    localStorage.setItem(TOKEN_KEY, 'abc');
    expect(getAuthToken()).toBe('abc');
  });

  it('setAuthToken stores / removes the token', () => {
    setAuthToken('xyz');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('xyz');
    setAuthToken(null);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    setAuthToken('');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe('api.googleLoginUrl', () => {
  it('builds the /auth/google URL off the configured base', () => {
    const url = api.googleLoginUrl();
    expect(url.endsWith('/auth/google')).toBe(true);
  });
});

describe('api http calls', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('listGenerations sends a GET and returns parsed JSON with the Bearer token', async () => {
    mockFetch(async (_url, opts) => ({
      ok: true,
      status: 200,
      json: async () => [{ jobId: 'j1' }],
      headers: opts,
    }));
    setAuthToken('tok-1');
    const data = await api.listGenerations();
    expect(data).toEqual([{ jobId: 'j1' }]);
    const callOpts = globalThis.fetch.mock.results[0].value ?? {};
    // The Authorization header must carry the stored token.
    const headers = (globalThis.fetch.mock.calls[0][1] || {}).headers || {};
    expect(headers.Authorization).toBe('Bearer tok-1');
  });

  it('startGeneration posts JSON to /generate', async () => {
    let receivedBody;
    mockFetch(async (_url, opts) => {
      receivedBody = opts.body;
      return { ok: true, status: 200, json: async () => ({ jobId: 'mock_1' }) };
    });
    const res = await api.startGeneration({ prompt: 'lofi' });
    expect(res.jobId).toBe('mock_1');
    expect(JSON.parse(receivedBody)).toEqual({ prompt: 'lofi' });
  });

  it('throws on a non-ok response with the server error message', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 402,
      statusText: 'Payment Required',
      json: async () => ({ error: 'monthly_generation_limit_reached' }),
    }));
    await expect(api.listGenerations()).rejects.toThrow('monthly_generation_limit_reached');
  });

  it('pollUntilReady resolves when status becomes ready', async () => {
    let n = 0;
    mockFetch(async () => {
      n++;
      const status = n < 2 ? 'generating' : 'ready';
      return { ok: true, status: 200, json: async () => ({ status, audioUrl: 'https://cdn/x.mp3' }) };
    });
    const url = await api.pollUntilReady('job1', { interval: 1 });
    expect(url).toBe('https://cdn/x.mp3');
  });

  it('pollUntilReady rejects when status becomes error', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'error' }),
    }));
    await expect(api.pollUntilReady('job1', { interval: 1 })).rejects.toThrow('generation failed');
  });
});
