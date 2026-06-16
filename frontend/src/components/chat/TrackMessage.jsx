import { useEffect, useRef, useState } from 'react';
import Waveform from '../Waveform.jsx';

// Renders an assistant message: a generating state, a live stream, or the final track.
export default function TrackMessage({ message }) {
  const { status, audioUrl, streamUrl, error } = message;
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  // Prefer the final file once ready; otherwise use the live stream.
  const src = audioUrl || streamUrl || '';

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnd = () => setPlaying(false);
    el.addEventListener('ended', onEnd);
    return () => el.removeEventListener('ended', onEnd);
  }, []);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  return (
    <div className="msg msg--bot fade-in">
      <div className="bubble bubble--bot">
        {status === 'generating' && <div className="pulse">generating…</div>}
        {status === 'streaming' && !audioUrl && (
          <div className="pulse small">streaming live · tap play</div>
        )}
        {status === 'error' && (
          <div className="muted">Something went wrong{error ? `: ${error}` : ''}. Try again.</div>
        )}

        {src && status !== 'error' && (
          <div className="track">
            <button className="play-btn" onClick={toggle} aria-label="Play">
              <span className={playing ? 'play-btn__pause' : 'play-btn__tri'} />
            </button>
            <Waveform bars={36} />
            <audio ref={audioRef} src={src} preload="none" />
          </div>
        )}

        {status === 'ready' && audioUrl && (
          <a className="track__dl" href={audioUrl} download>
            Download
          </a>
        )}
      </div>
    </div>
  );
}
