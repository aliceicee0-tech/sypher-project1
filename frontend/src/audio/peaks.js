/**
 * Extract a downsampled list of amplitude peaks from an audio file using the
 * Web Audio API. This powers a *real* waveform (faithful to the actual audio)
 * instead of the previous purely decorative Math.sin() bars.
 *
 * Returns a Float32Array of length `buckets`, each value in [0..1], or null
 * if decoding failed (e.g. CORS blocks the ArrayBuffer fetch).
 *
 * Peaks are cached per-URL so seeking/re-rendering is instant.
 *
 * Uses a singleton AudioContext to avoid hitting the browser's limit (~6
 * concurrent contexts in Chrome).
 */
const cache = new Map();

let _ctx = null;
function getAudioContext() {
  if (_ctx && _ctx.state !== 'closed') return _ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  _ctx = new Ctor();
  return _ctx;
}

export async function getPeaks(url, buckets = 96) {
  if (!url) return null;
  const key = `${url}#${buckets}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const ctx = getAudioContext();
    if (!ctx) return null;

    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();

    // decodeAudioData consumes the buffer — pass a copy so the original stays
    // available if anything else needs it.
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

    const channel = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channel.length / buckets) || 1;
    const peaks = new Float32Array(buckets);

    let max = 0.0001;
    for (let i = 0; i < buckets; i++) {
      const start = i * blockSize;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channel[start + j] || 0);
      }
      const v = sum / blockSize;
      peaks[i] = v;
      if (v > max) max = v;
    }
    // Normalize to [0..1] so the waveform uses the full height.
    for (let i = 0; i < buckets; i++) peaks[i] = peaks[i] / max;

    cache.set(key, peaks);
    return peaks;
  } catch (err) {
    // Most common cause: the audio host doesn't send CORS headers, so the
    // browser refuses to expose the ArrayBuffer. Fall back gracefully.
    cache.set(key, null);
    return null;
  }
}
