import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { api } from '../../api.js';
import { audioEngine } from '../../audio/engine.js';
import Waveform from '../Waveform.jsx';

const STYLES = ['ambient', 'piano', 'lo-fi', 'cinematic', 'electronic', 'jazz'];

export default function TrebloGeneratorNode({ id, data }) {
  const [prompt, setPrompt] = useState(data.prompt || '');
  const [style, setStyle] = useState(data.style_tags?.[0] || 'ambient');
  const [duration, setDuration] = useState(data.duration || 30);
  const [status, setStatus] = useState(data.status || 'idle');
  const [audioUrl, setAudioUrl] = useState(data.audio_url || '');
  const [playing, setPlaying] = useState(false);

  async function generate() {
    setStatus('generating');
    try {
      const { jobId } = await api.startGeneration({
        prompt,
        style_tags: [style],
        duration: Number(duration),
      });
      // Poll until ready.
      const poll = setInterval(async () => {
        const r = await api.getGeneration(jobId);
        if (r.status === 'ready') {
          clearInterval(poll);
          setAudioUrl(r.audioUrl);
          audioEngine.load(id, r.audioUrl, data.volume ?? 1);
          setStatus('ready');
          data.onChange?.(id, { prompt, style_tags: [style], duration: Number(duration), status: 'ready', audio_url: r.audioUrl });
        } else if (r.status === 'error') {
          clearInterval(poll);
          setStatus('error');
        }
      }, 1000);
    } catch {
      setStatus('error');
    }
  }

  function togglePlay() {
    setPlaying(audioEngine.toggle(id));
  }

  return (
    <div className="node node--generator fade-in">
      <Handle type="target" position={Position.Left} className="node__handle" />
      <div className="node__label">Treblo Generator</div>

      <textarea
        className="node__input"
        rows={2}
        placeholder="Describe the music…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div className="node__row">
        <select className="node__select" value={style} onChange={(e) => setStyle(e.target.value)}>
          {STYLES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          className="node__duration"
          type="number"
          min={5}
          max={300}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        />
        <span className="node__unit">s</span>
      </div>

      {status === 'idle' && (
        <button className="btn node__generate" onClick={generate} disabled={!prompt.trim()}>
          Generate
        </button>
      )}
      {status === 'generating' && <div className="pulse node__status">generating…</div>}
      {status === 'error' && <div className="node__status node__status--error">failed · retry</div>}

      {status === 'ready' && audioUrl && (
        <div className="node__player">
          <button className="play-btn" onClick={togglePlay} aria-label="Play">
            <span className={playing ? 'play-btn__pause' : 'play-btn__tri'} />
          </button>
          <Waveform />
        </div>
      )}

      <Handle type="source" position={Position.Right} className="node__handle" />
    </div>
  );
}
