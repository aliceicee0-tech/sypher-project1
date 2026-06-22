import { config, isMockMode } from '../config.js';
import { pickKey, markKeyFailed, markKeyExhausted, getKeys } from '../providers/keys.js';

/*
 * Treblo client — wired to the official v2 / v3 docs (ASYNC flow).
 *
 *   Base URL : https://api.treblo.com/v1               (config.treblo.baseUrl)
 *   Auth     : Authorization: Bearer <key>
 *   Create   : POST /generations/v3 (or /v2)  -> { "task_id": "..." }
 *   Status   : GET  /generations/status/{task_id} -> a RAW STRING, e.g.
 *              "GENERATING" | "SUCCESS" | "FAILURE" | "GENERATING_STREAMING_READY"
 *   Result   : GET  /generations/{task_id} -> { song_paths: [url, ...], ... }
 *
 * Polling strategy: hit the lightweight status endpoint; once it reports
 * SUCCESS, fetch the full generation and return song_paths[0].
 *
 * Multi-key failover: startGeneration tries keys in rotation. On ANY failure
 * on a key (out of credits, 401, 5xx, timeout, network) it marks that key
 * failed and retries the next one, until one succeeds or every key is
 * exhausted. See src/providers/keys.js for the rotation/cooldown engine.
 */

const DEFAULT_MODEL = 'v3'; // 'v2' | 'v3'

/**
 * HTTP statuses that mean a key's credit pool is GONE (or the key itself is
 * revoked). Such a key is retired for the rest of the session — see keys.js.
 *
 *   401 Unauthorized  → bad/revoked key
 *   402 Payment Required → out of credits (Treblo's likely "no credits" signal)
 *   403 Forbidden     → key blocked / quota hard-capped
 *
 * Anything else (429 rate-limit, 5xx, network) is treated as transient.
 */
function isPermanentFailure(status) {
  return status === 401 || status === 402 || status === 403;
}

// Abort any upstream Treblo call after this many ms so a hung connection can't
// pin a request handler forever. Errors are surfaced as 502 by the routes.
const UPSTREAM_TIMEOUT_MS = 30_000;

function withTimeout(extra = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  return { signal: controller.signal, timer, ...extra };
}

// Treblo status strings -> our internal vocabulary.
const SUCCESS_STATUS = 'SUCCESS';
const FAILURE_STATUS = 'FAILURE';
// Treblo flips to this once the v3 live stream is actually serving audio.
// Until then, GET /stream/{taskId} returns HTTP 400 "Track not ready for
// streaming" (a JSON body the <audio> element cannot decode -> silence). We
// only surface the stream URL to the client once Treblo confirms this state.
const STREAMING_READY_STATUS = 'GENERATING_STREAMING_READY';

// Real-time streaming host for v3 generations.
const STREAM_HOST = 'https://api-stream.treblo.com';
export function streamUrl(taskId) {
  return `${STREAM_HOST}/stream/${taskId}`;
}

const MOCK_AUDIO_URL = 'https://cdn.treblo.com/outputs/mock_sample_track.mp3';

function authHeaders(apiKey, json = true) {
  const h = { Authorization: `Bearer ${apiKey}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

// Build the request body from our generic inputs, per model.
function buildPayload(model, opts = {}) {
  const { prompt, style_tags = [], duration, lyrics, instrumental, enableStreaming } = opts;
  const body = { output_format: 'mp3', stream_format: 'mp3' }; // mp3 for HTML5 <audio>
  if (prompt && prompt.trim()) body.prompt = prompt.trim();

  const tags = (style_tags || []).filter(Boolean);
  if (tags.length) body.tags = tags;

  if (lyrics && lyrics.trim()) body.lyrics = lyrics.trim();
  if (typeof instrumental === 'boolean') body.instrumental = instrumental;

  if (model === 'v3') {
    // Streaming is v3-only; enable it so playback can start almost instantly.
    if (enableStreaming) body.enable_streaming = true;
    if (duration) {
      // length_range expects [min, max] in seconds, both multiples of 30.
      const max = Math.min(300, Math.max(30, Math.round(duration / 30) * 30));
      const min = Math.max(0, max - 30);
      body.length_range = [min, max];
    }
  }
  return body;
}

/**
 * Start a generation. Returns { jobId, status }.
 * jobId maps to Treblo's task_id.
 *
 * Tries each configured key in turn. If a key fails for any reason (out of
 * credits, auth error, upstream 5xx, timeout) it is marked failed and the next
 * key is attempted. Throws only when every key has failed.
 *
 * @param {object} opts - generation inputs (passed straight to buildPayload)
 */
export async function startGeneration(opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  if (isMockMode) {
    return { jobId: `mock_${Date.now()}`, status: 'generating', streamUrl: '' };
  }

  const payload = buildPayload(model, opts);
  const total = getKeys().length;
  const errors = [];

  for (let attempt = 0; attempt < total; attempt++) {
    const apiKey = pickKey();
    if (!apiKey) break; // no keys left to try

    const ctx = withTimeout();
    let res;
    try {
      res = await fetch(`${config.treblo.baseUrl}/generations/${model}`, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(payload),
        signal: ctx.signal,
      });
    } catch (err) {
      clearTimeout(ctx.timer);
      // Network error / timeout — TRANSIENT. Cool it down and try the next key.
      const reason = err.name === 'AbortError' ? 'timeout' : 'network error';
      errors.push(`key …${apiKey.slice(-4)}: ${reason}`);
      markKeyFailed(apiKey);
      continue;
    }
    clearTimeout(ctx.timer);

    if (!res.ok) {
      // Non-2xx. Distinguish PERMANENT exhaustion (out of credits / revoked)
      // from a TRANSIENT upstream blip, so a drained key is retired for the
      // session and a 5xx just gets a short cooldown. This is what makes the
      // chain failover fast: a dead key is never retried.
      let detail = `${res.status}`;
      try {
        const body = await res.text();
        if (body) detail += ` ${body.slice(0, 120)}`;
      } catch { /* ignore body read errors */ }
      errors.push(`key …${apiKey.slice(-4)}: ${detail}`);

      if (isPermanentFailure(res.status)) {
        // 401/402/403 (auth/quota/forbidden) → credits gone or key revoked.
        markKeyExhausted(apiKey, `HTTP ${res.status}`);
      } else {
        // 429 (rate limit), 5xx, other 4xx → transient, cool down + retry.
        markKeyFailed(apiKey);
      }
      continue;
    }

    const data = await res.json();
    return {
      jobId: data.task_id,
      status: 'generating',
      // For v3 streaming, the client can start playing this immediately.
      streamUrl: model === 'v3' && opts.enableStreaming ? streamUrl(data.task_id) : '',
    };
  }

  // Every key failed (or the whole pool is retired) — surface one clear error.
  // 502 to the client; the route logs the per-key detail for the operator.
  throw new Error(`all Treblo keys exhausted (${total} tried): ${errors.join('; ')}`);
}

/**
 * Poll a generation by task id. Returns { status, audioUrl }.
 * status is one of: 'generating' | 'ready' | 'error'.
 *
 * Polling uses whichever key is currently active. A Treblo job is readable by
 * any valid token, so the key that *started* the job need not be the one that
 * polls it — and if that key later fails, the next active key can take over.
 */
export async function getGenerationStatus(taskId) {
  if (isMockMode) {
    const startedAt = Number(String(taskId).replace('mock_', '')) || 0;
    const ready = Date.now() - startedAt > 2500;
    return ready
      ? { status: 'ready', audioUrl: MOCK_AUDIO_URL }
      : { status: 'generating', audioUrl: '' };
  }

  const apiKey = pickKey();
  if (!apiKey) throw new Error('no Treblo key available');

  // 1) Lightweight status check (returns a raw JSON string).
  const statusCtx = withTimeout();
  let statusRes;
  try {
    statusRes = await fetch(`${config.treblo.baseUrl}/generations/status/${taskId}`, {
      headers: authHeaders(apiKey, false),
      signal: statusCtx.signal,
    });
  } finally {
    clearTimeout(statusCtx.timer);
  }
  if (!statusRes.ok) throw new Error(`Treblo status failed: ${statusRes.status}`);
  const rawStatus = (await statusRes.json()); // e.g. "GENERATING" | "SUCCESS"

  if (rawStatus === FAILURE_STATUS) {
    return { status: 'error', audioUrl: '' };
  }
  if (rawStatus === STREAMING_READY_STATUS) {
    // Treblo guarantees the live stream is now serving real MP3 bytes. Expose
    // it so the client can start playback early; the next poll resolves the
    // final, seekable file once status reaches SUCCESS.
    return { status: 'streaming', audioUrl: '', streamUrl: streamUrl(taskId) };
  }
  if (rawStatus !== SUCCESS_STATUS) {
    return { status: 'generating', audioUrl: '' };
  }

  // 2) Done — fetch the full generation to get the final audio URL(s).
  const resultCtx = withTimeout();
  let res;
  try {
    res = await fetch(`${config.treblo.baseUrl}/generations/${taskId}`, {
      headers: authHeaders(apiKey, false),
      signal: resultCtx.signal,
    });
  } finally {
    clearTimeout(resultCtx.timer);
  }
  if (!res.ok) throw new Error(`Treblo fetch failed: ${res.status}`);
  const data = await res.json();
  const audioUrl = Array.isArray(data.song_paths) ? data.song_paths[0] || '' : '';
  return { status: 'ready', audioUrl };
}
