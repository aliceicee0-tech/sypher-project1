import { config, isMockMode } from '../config.js';

/*
 * Treblo client (ASYNC flow).
 *
 * Confirmed from the Treblo docs:
 *   - Base URL : https://api.treblo.com/v1            (config.treblo.baseUrl)
 *   - Auth     : Authorization: Bearer <key>          (authHeaders below)
 *   - Flow     : ASYNC — a "core parameter" POST starts generation, a
 *                "data fetching" GET retrieves the result.
 *
 * The only thing that may still differ from this implementation is the exact
 * FIELD NAMES in the JSON payloads/responses. They are all centralized in the
 * two maps below — adjust them in ONE place to match the real docs:
 *
 *   ENDPOINTS  : the POST and GET paths.
 *   FIELDS     : the request/response field names.
 */

// --- Adjust these to match the Treblo docs exactly -------------------------
const ENDPOINTS = {
  // POST endpoint that starts a generation.
  create: (baseUrl) => `${baseUrl}/generate`,
  // GET endpoint that fetches a generation by its id.
  fetch: (baseUrl, id) => `${baseUrl}/generate/${id}`,
};

const FIELDS = {
  // POST response: where the job/generation id lives.
  id: 'id', // e.g. 'id' | 'job_id' | 'task_id' | 'generation_id'
  // GET response: status field + the value that means "finished".
  status: 'status', // e.g. 'status'
  readyValue: 'completed', // e.g. 'completed' | 'ready' | 'succeeded'
  errorValue: 'failed', // e.g. 'failed' | 'error'
  // GET response: where the final audio URL lives.
  audioUrl: 'audio_url', // e.g. 'audio_url' | 'output' | 'url'
};
// ---------------------------------------------------------------------------

const MOCK_AUDIO_URL = 'https://cdn.treblo.com/outputs/mock_sample_track.mp3';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.treblo.apiKey}`,
  };
}

/**
 * Start a generation (the "core parameter" POST).
 * Returns { jobId, status }.
 */
export async function startGeneration({ prompt, style_tags = [], duration = 30 }) {
  if (isMockMode) {
    return { jobId: `mock_${Date.now()}`, status: 'generating' };
  }

  const res = await fetch(ENDPOINTS.create(config.treblo.baseUrl), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ prompt, style_tags, duration }),
  });
  if (!res.ok) throw new Error(`Treblo generate failed: ${res.status}`);
  const data = await res.json();
  return { jobId: data[FIELDS.id], status: 'generating' };
}

/**
 * Fetch / poll a generation (the "data fetching" GET).
 * Returns { status: 'generating' | 'ready' | 'error', audioUrl }.
 */
export async function getGenerationStatus(jobId) {
  if (isMockMode) {
    const startedAt = Number(String(jobId).replace('mock_', '')) || 0;
    const ready = Date.now() - startedAt > 2500;
    return ready
      ? { status: 'ready', audioUrl: MOCK_AUDIO_URL }
      : { status: 'generating', audioUrl: '' };
  }

  const res = await fetch(ENDPOINTS.fetch(config.treblo.baseUrl, jobId), {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Treblo fetch failed: ${res.status}`);
  const data = await res.json();

  const raw = data[FIELDS.status];
  // Normalize the provider status into our internal vocabulary.
  let status = 'generating';
  if (raw === FIELDS.readyValue) status = 'ready';
  else if (raw === FIELDS.errorValue) status = 'error';

  return { status, audioUrl: data[FIELDS.audioUrl] || '' };
}
