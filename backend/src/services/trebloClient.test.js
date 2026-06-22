import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// trebloClient calls the global `fetch` and the key-rotation engine. We run two
// modes:
//   - mock mode (isMockMode=true): no fetch, deterministic, exercises buildPayload
//     indirectly and the mock-status branch.
//   - real mode: mock `fetch` + a fake key pool to exercise failover.

// --- mock mode (no keys) ---
async function mockClient() {
  vi.resetModules();
  vi.doMock('../config.js', () => ({
    config: {
      treblo: { apiKeys: [], baseUrl: 'https://api.treblo.com/v1' },
      isProduction: false,
    },
    isMockMode: true,
  }));
  return import('./trebloClient.js');
}

describe('services/trebloClient (mock mode)', () => {
  let treblo;
  beforeEach(async () => {
    treblo = await mockClient();
  });

  it('startGeneration returns a mock job id + generating status', async () => {
    const r = await treblo.startGeneration({ prompt: 'lofi', model: 'v3' });
    expect(r.status).toBe('generating');
    expect(r.jobId).toMatch(/^mock_\d+$/);
  });

  it('getGenerationStatus reports ready after the mock delay', async () => {
    const old = Date.now() - 3000; // older than the 2500ms mock threshold
    const r = await treblo.getGenerationStatus(`mock_${old}`);
    expect(r.status).toBe('ready');
    expect(r.audioUrl).toMatch(/\.mp3$/);
  });

  it('getGenerationStatus reports generating before the mock delay', async () => {
    const now = Date.now();
    const r = await treblo.getGenerationStatus(`mock_${now}`);
    expect(r.status).toBe('generating');
    expect(r.audioUrl).toBe('');
  });

  it('streamUrl builds the streaming host URL', () => {
    expect(treblo.streamUrl('task-123')).toBe('https://api-stream.treblo.com/stream/task-123');
  });
});

// --- real mode (mocked fetch, fake key pool) ---
async function realClient(fetchImpl, apiKeys = ['K_AAAA', 'K_BBBB', 'K_CCCC']) {
  vi.resetModules();
  globalThis.fetch = fetchImpl;
  vi.doMock('../config.js', () => ({
    config: {
      treblo: { apiKeys, baseUrl: 'https://api.treblo.com/v1' },
      isProduction: false,
    },
    isMockMode: false,
  }));
  return import('./trebloClient.js');
}

describe('services/trebloClient (real mode, mocked fetch)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('starts a generation and returns the task_id on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task_id: 'task-xyz' }),
    });
    const treblo = await realClient(fetchMock);
    const r = await treblo.startGeneration({ prompt: 'cinematic', model: 'v3', enableStreaming: true });
    expect(r.jobId).toBe('task-xyz');
    expect(r.status).toBe('generating');
    expect(r.streamUrl).toContain('task-xyz');
    // Bearer header used the first key.
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe('Bearer K_AAAA');
  });

  it('fails over to the next key on a 402 (out of credits)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 402, text: async () => 'no credits' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ task_id: 'task-2' }) });
    const treblo = await realClient(fetchMock);
    const r = await treblo.startGeneration({ prompt: 'x' });
    expect(r.jobId).toBe('task-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second call should use the NEXT key in the pool.
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer K_BBBB');
  });

  it('throws when every key is exhausted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad' });
    const treblo = await realClient(fetchMock, ['K_ONE']);
    await expect(treblo.startGeneration({ prompt: 'x' })).rejects.toThrow(/exhausted/);
  });

  it('getGenerationStatus returns ready + audioUrl on SUCCESS', async () => {
    const fetchMock = vi
      .fn()
      // status endpoint
      .mockResolvedValueOnce({ ok: true, json: async () => 'SUCCESS' })
      // result endpoint
      .mockResolvedValueOnce({ ok: true, json: async () => ({ song_paths: ['https://cdn/x.mp3'] }) });
    const treblo = await realClient(fetchMock);
    const r = await treblo.getGenerationStatus('task-ok');
    expect(r).toEqual({ status: 'ready', audioUrl: 'https://cdn/x.mp3' });
  });

  it('getGenerationStatus returns error on FAILURE status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => 'FAILURE' });
    const treblo = await realClient(fetchMock);
    const r = await treblo.getGenerationStatus('task-bad');
    expect(r).toEqual({ status: 'error', audioUrl: '' });
  });

  it('getGenerationStatus returns generating for any non-SUCCESS status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => 'GENERATING' });
    const treblo = await realClient(fetchMock);
    const r = await treblo.getGenerationStatus('task-gen');
    expect(r).toEqual({ status: 'generating', audioUrl: '' });
  });

  it('getGenerationStatus exposes a confirmed streamUrl on GENERATING_STREAMING_READY', async () => {
    // Treblo flips to GENERATING_STREAMING_READY only once the live stream is
    // actually serving MP3 bytes; before that, /stream/{id} returns a JSON 400
    // error the <audio> element cannot decode (the "no sound after generation"
    // bug). Surfacing the stream URL here — never earlier — is what makes early
    // playback safe.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => 'GENERATING_STREAMING_READY' });
    const treblo = await realClient(fetchMock);
    const r = await treblo.getGenerationStatus('task-streaming');
    expect(r.status).toBe('streaming');
    expect(r.audioUrl).toBe('');
    expect(r.streamUrl).toBe('https://api-stream.treblo.com/stream/task-streaming');
  });
});
