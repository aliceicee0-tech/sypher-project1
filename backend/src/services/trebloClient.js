import { config, isMockMode } from '../config.js';

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
 */

const DEFAULT_MODEL = 'v3'; // 'v2' | 'v3'

// Treblo status strings -> our internal vocabulary.
const SUCCESS_STATUS = 'SUCCESS';
const FAILURE_STATUS = 'FAILURE';

// Real-time streaming host for v3 generations.
const STREAM_HOST = 'https://api-stream.treblo.com';
export function streamUrl(taskId) {
  return `${STREAM_HOST}/stream/${taskId}`;
}

const MOCK_AUDIO_URL = 'https://cdn.treblo.com/outputs/mock_sample_track.mp3';

function authHeaders(json = true) {
  const h = { Authorization: `Bearer ${config.treblo.apiKey}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

// Build the request body from our generic inputs, per model.
function buildPayload(model, { prompt, style_tags = [], duration, lyrics, instrumental, enableStreaming }) {
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
 */
export async function startGeneration({
  prompt,
  style_tags = [],
  duration = 30,
  lyrics = '',
  instrumental,
  model = DEFAULT_MODEL,
  enableStreaming = false,
}) {
  if (isMockMode) {
    return { jobId: `mock_${Date.now()}`, status: 'generating', streamUrl: '' };
  }

  const res = await fetch(`${config.treblo.baseUrl}/generations/${model}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(
      buildPayload(model, { prompt, style_tags, duration, lyrics, instrumental, enableStreaming })
    ),
  });
  if (!res.ok) throw new Error(`Treblo generate failed: ${res.status}`);
  const data = await res.json();
  return {
    jobId: data.task_id,
    status: 'generating',
    // For v3 streaming, the client can start playing this immediately.
    streamUrl: model === 'v3' && enableStreaming ? streamUrl(data.task_id) : '',
  };
}

/**
 * Poll a generation by task id. Returns { status, audioUrl }.
 * status is one of: 'generating' | 'ready' | 'error'.
 */
export async function getGenerationStatus(taskId) {
  if (isMockMode) {
    const startedAt = Number(String(taskId).replace('mock_', '')) || 0;
    const ready = Date.now() - startedAt > 2500;
    return ready
      ? { status: 'ready', audioUrl: MOCK_AUDIO_URL }
      : { status: 'generating', audioUrl: '' };
  }

  // 1) Lightweight status check (returns a raw JSON string).
  const statusRes = await fetch(
    `${config.treblo.baseUrl}/generations/status/${taskId}`,
    { headers: authHeaders(false) }
  );
  if (!statusRes.ok) throw new Error(`Treblo status failed: ${statusRes.status}`);
  const rawStatus = (await statusRes.json()); // e.g. "GENERATING" | "SUCCESS"

  if (rawStatus === FAILURE_STATUS) {
    return { status: 'error', audioUrl: '' };
  }
  if (rawStatus !== SUCCESS_STATUS) {
    return { status: 'generating', audioUrl: '' };
  }

  // 2) Done — fetch the full generation to get the final audio URL(s).
  const res = await fetch(`${config.treblo.baseUrl}/generations/${taskId}`, {
    headers: authHeaders(false),
  });
  if (!res.ok) throw new Error(`Treblo fetch failed: ${res.status}`);
  const data = await res.json();
  const audioUrl = Array.isArray(data.song_paths) ? data.song_paths[0] || '' : '';
  return { status: 'ready', audioUrl };
}
