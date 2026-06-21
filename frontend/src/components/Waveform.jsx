import { useEffect, useRef, useState } from 'react';
import { getPeaks } from '../audio/peaks.js';

/**
 * Real, interactive waveform.
 *
 * - Bars are driven by the actual audio amplitude (Web Audio decode), with a
 *   graceful decorative fallback when CORS blocks ArrayBuffer access.
 * - Clicking/dragging on the waveform seeks the track.
 * - Bars left of the playhead are filled black; the rest are light gray.
 *   This keeps the monochrome "Black & White Chic" design language.
 *
 * Props:
 *   src        audio URL to analyze + bind
 *   playing    whether audio is currently playing
 *   progress   0..1 fraction of the track elapsed
 *   onSeek     (fraction) => void   called when the user clicks/drags
 *   bars       number of bars to draw (default 64)
 */
export default function Waveform({ src, playing, progress = 0, onSeek, bars = 64 }) {
  const [peaks, setPeaks] = useState(null);
  const [hover, setHover] = useState(null); // 0..1 while pointer is down
  const ref = useRef(null);
  const dragging = useRef(false);

  useEffect(() => {
    let alive = true;
    setPeaks(null);
    getPeaks(src, bars).then((p) => {
      if (alive) setPeaks(p);
    });
    return () => {
      alive = false;
    };
  }, [src, bars]);

  // Fraction at a given pointer event, relative to the bar container.
  const fractionAt = (clientX) => {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const onDown = (e) => {
    dragging.current = true;
    const f = fractionAt(e.clientX);
    setHover(f);
    onSeek?.(f);
  };
  const onMove = (e) => {
    if (!dragging.current) return;
    const f = fractionAt(e.clientX);
    setHover(f);
    onSeek?.(f);
  };
  const onUp = () => {
    dragging.current = false;
    setHover(null);
  };

  const shown = hover ?? progress;

  return (
    <div
      className="waveform"
      ref={ref}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((shown || 0) * 100)}
      tabIndex={0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onSeek?.(Math.min(1, (progress || 0) + 0.02));
        if (e.key === 'ArrowLeft') onSeek?.(Math.max(0, (progress || 0) - 0.02));
      }}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const h = peaks ? Math.max(8, (peaks[i] || 0) * 100) : 20 + Math.abs(Math.sin(i * 0.9)) * 60;
        const filled = i / bars <= shown;
        return (
          <span
            key={i}
            className={`waveform__bar${filled ? ' waveform__bar--filled' : ''}`}
            style={{ height: `${h}%`, transition: dragging.current ? 'none' : undefined }}
          />
        );
      })}
    </div>
  );
}
