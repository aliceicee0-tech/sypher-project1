import { config, isMockMode } from '../config.js';

/*
 * Treblo client.
 *
 * The official Treblo API spec was not available when this was written, so the
 * three assumptions below are isolated here and clearly flagged. Adjust them in
 * one place once the real spec is known — the rest of the app does not care.
 *
 *   ASSUMPTION 1 (base URL): config.treblo.baseUrl, default https://api.treblo.com/v1
 *   ASSUMPTION 2 (auth):     Authorization: Bearer <key>  header
 *   ASSUMPTION 3 (flow):     ASYNC — POST a prompt -> get { job_id }, then poll
 *                            GET /jobs/:id until { status: 'ready', audio_url }.
 */

const MOCK_AUDIO_URL =
  'https://cdn.treblo.com/outputs/mock_sample_track.mp3'; // placeholder sample

function authHeaders() {
  // ASSUMPTION 2: change here if Treblo uses a custom header (e.g. x-api-key).
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.treblo.apiKey}`,
  };
}

/**
 * Start a generation. Returns { jobId, status }.
 */
export async function startGeneration({ prompt, style_tags = [], duration = 30 }) {
  if (isMockMode) {
    // Mock: pretend a job was queued.
    return { jobId: `mock_${Date.now()}`, status: 'generating' };
  }

  // ASSUMPTION 1 + 3: POST the prompt to the generation endpoint.
  const res = await fetch(`${config.treblo.baseUrl}/generate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ prompt, style_tags, duration }),
  });
  if (!res.ok) throw new Error(`Treblo generate failed: ${res.status}`);
  const data = await res.json();
  // Expected shape: { job_id, status }
  return { jobId: data.job_id, status: data.status || 'generating' };
}

/**
 * Poll a generation job. Returns { status, audioUrl }.
 */
export async function getGenerationStatus(jobId) {
  if (isMockMode) {
    // Mock: a job created > 2.5s ago is considered ready.
    const startedAt = Number(String(jobId).replace('mock_', '')) || 0;
    const ready = Date.now() - startedAt > 2500;
    return ready
      ? { status: 'ready', audioUrl: MOCK_AUDIO_URL }
      : { status: 'generating', audioUrl: '' };
  }

  // ASSUMPTION 3: poll the job status endpoint.
  const res = await fetch(`${config.treblo.baseUrl}/jobs/${jobId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Treblo status failed: ${res.status}`);
  const data = await res.json();
  // Expected shape: { status, audio_url }
  return { status: data.status, audioUrl: data.audio_url || '' };
}
