import { useRef, useState } from 'react';
import { usePlayer } from '../audio/PlayerContext.jsx';
import { formatTime } from '../audio/useAudioPlayer.js';
import Waveform from './Waveform.jsx';

/**
 * MiniPlayer — the persistent now-playing bar pinned to the bottom of the app.
 *
 * Driven by the global PlayerContext (single audio element), so it reflects
 * whatever is currently playing across any page. Hidden entirely when nothing
 * is loaded. Shows prev / play-pause / next, the title, an interactive
 * progress waveform, elapsed / total time, volume slider, and loop toggle.
 */
export default function MiniPlayer() {
  const {
    current,
    playing,
    currentTime,
    duration,
    progress,
    toggle,
    seekToFraction,
    next,
    prev,
    canNext,
    canPrev,
    stop,
    volume,
    setVolume,
    loop,
    cycleLoop,
    playError,
  } = usePlayer();

  const [showVolume, setShowVolume] = useState(false);
  const volRef = useRef(null);

  if (!current) return null;

  const loopLabel = loop === 'off' ? 'Loop off' : loop === 'one' ? 'Loop track' : 'Loop all';
  const loopIcon = loop === 'one' ? '🔂' : '🔁';

  return (
    <div className="miniplayer miniplayer--open" role="region" aria-label="Now playing">
      <div className="miniplayer__info">
        <div className="miniplayer__title">{current.title || 'Untitled'}</div>
        {current.subtitle && <div className="miniplayer__meta">{current.subtitle}</div>}
        {/* Surface the real play() failure on mobile (e.g. autoplay blocked). */}
        {playError && (
          <div className="miniplayer__err">No audio: {playError}. Tap play again.</div>
        )}
      </div>

      <div className="miniplayer__center">
        <div className="miniplayer__controls">
          <button
            className="miniplayer__btn"
            onClick={prev}
            disabled={!canPrev}
            aria-label="Previous"
            title="Previous (P)"
          >
            <PrevIcon />
          </button>
          <button
            className="miniplayer__btn miniplayer__btn--main"
            onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            className="miniplayer__btn"
            onClick={next}
            disabled={!canNext}
            aria-label="Next"
            title="Next (N)"
          >
            <NextIcon />
          </button>
        </div>

        <div className="miniplayer__wave">
          <Waveform
            src={current.audio_url}
            playing={playing}
            progress={progress}
            onSeek={seekToFraction}
            bars={64}
          />
        </div>
      </div>

      <div className="miniplayer__right">
        <span className="miniplayer__time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Loop toggle */}
        <button
          className={`miniplayer__btn miniplayer__btn--sm${loop !== 'off' ? ' miniplayer__btn--loop-active' : ''}`}
          onClick={cycleLoop}
          aria-label={loopLabel}
          title={loopLabel}
        >
          <span style={{ fontSize: 13 }}>{loopIcon}</span>
        </button>

        {/* Volume. Uses hover on desktop (pointer:fine) and a tap toggle on
            touch devices — the hover reveal alone is unreachable on mobile. */}
        <div
          className="miniplayer__vol-wrap"
          onMouseEnter={() => setShowVolume(true)}
          onMouseLeave={() => setShowVolume(false)}
          ref={volRef}
        >
          <button
            className="miniplayer__btn miniplayer__btn--sm"
            aria-label="Volume"
            title={`Volume ${Math.round(volume * 100)}% (M to mute)`}
            onClick={() => {
              // Tap toggles the slider open/closed on touch; on desktop the
              // mute toggle still fires when the slider is already visible.
              setShowVolume((v) => !v);
              // Clicking the icon itself also toggles mute for a fast path.
              if (showVolume) setVolume(volume > 0 ? 0 : 0.8);
            }}
          >
            <VolumeIcon level={volume} />
          </button>
          {showVolume && (
            <div className="miniplayer__vol-slider fade-in">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="vol-range"
                aria-label="Volume"
              />
            </div>
          )}
        </div>

        <button
          className="miniplayer__btn miniplayer__btn--sm miniplayer__close"
          onClick={stop}
          aria-label="Close player"
          title="Close"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </svg>
);
const PrevIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
  </svg>
);
const NextIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" />
  </svg>
);
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

function VolumeIcon({ level }) {
  if (level <= 0) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }
  if (level < 0.5) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}
