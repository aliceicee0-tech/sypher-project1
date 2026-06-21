import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatTime } from '../audio/useAudioPlayer.js';
import { usePlayer } from '../audio/PlayerContext.jsx';
import Waveform from '../components/Waveform.jsx';
import Equalizer from '../components/Equalizer.jsx';

/**
 * History — the "recent generations" view.
 *
 * Lists every generation the backend has recorded for the current user (newest
 * first), each with an inline real waveform + play/seek. Playback routes
 * through the global PlayerContext so only one track plays at a time and the
 * MiniPlayer tracks it.
 *
 * Features: search/filter by prompt or tag, play all, copy prompt.
 */
function TrackRow({ track, onPlay }) {
  const { prompt, style_tags, audioUrl, status, createdAt, duration } = track;
  const player = usePlayer();

  const trackId = audioUrl || `job_${track.jobId}`;
  const isCurrent = player.current?.id === trackId;
  const playing = isCurrent && player.playing;
  const progress = isCurrent ? player.progress : 0;
  const currentTime = isCurrent ? player.currentTime : 0;
  const ready = status === 'ready' && audioUrl;

  const when = new Date(createdAt || Date.now());
  const dateLabel =
    when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' +
    when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const [copied, setCopied] = useState(false);

  function handlePlay() {
    if (!ready) return;
    onPlay();
  }

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard?.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard may not be available */ }
  }

  return (
    <div className={`history__row${ready ? '' : ' history__row--pending'}`}>
      <button
        className={`play-btn${playing ? ' play-btn--active' : ''}`}
        onClick={isCurrent ? player.toggle : handlePlay}
        disabled={!ready}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {ready ? (
          playing ? (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
              <path d="M1 1.5h2.5v9H1v-9zm5.5 0h2.5v9h-2.5v-9z" />
            </svg>
          ) : (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" style={{ marginLeft: '1px' }}>
              <path d="M1 1.5l7.5 4.5L1 10.5V1.5z" />
            </svg>
          )
        ) : (
          <Equalizer bars={3} />
        )}
      </button>

      <div className="history__info">
        <div className="history__prompt">
          {prompt || (style_tags?.length ? style_tags.join(', ') : 'Untitled')}
        </div>
        <div className="history__meta">
          {style_tags?.slice(0, 3).map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
          <span className="muted">{dateLabel}</span>
          {status === 'generating' && <span className="pulse small">generating…</span>}
        </div>
      </div>

      {ready ? (
        <div className="history__wave">
          <Waveform
            src={audioUrl}
            playing={playing}
            progress={progress}
            onSeek={player.seekToFraction}
            bars={48}
          />
          <div className="track__time">
            <span>{formatTime(currentTime)}</span>
            <span className="muted">{formatTime(duration || player.duration)}</span>
          </div>
        </div>
      ) : (
        <div className="history__placeholder" />
      )}

      {/* Copy prompt + download actions */}
      <div className="history__actions">
        {prompt && (
          <button
            className="card-action"
            onClick={copyPrompt}
            title="Copy prompt"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy prompt
              </>
            )}
          </button>
        )}
        {ready && (
          <a className="track__dl" href={audioUrl} download title="Download" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

export default function History() {
  const [tracks, setTracks] = useState(null);
  const [search, setSearch] = useState('');
  const player = usePlayer();

  useEffect(() => {
    api
      .listGenerations()
      .then(setTracks)
      .catch(() => setTracks([]));
  }, []);

  const filtered = (tracks || []).filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const haystack = [
      t.prompt || '',
      ...(t.style_tags || []),
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });

  const readyTracks = filtered.filter((t) => t.status === 'ready' && t.audioUrl);

  function playAllFrom(startJobId) {
    const startIdx = readyTracks.findIndex((r) => r.jobId === startJobId);
    player.playList(readyTracks, Math.max(0, startIdx));
  }

  return (
    <div className="history">
      <header className="page-head page-head--row">
        <div>
          <h1>History</h1>
          <p className="muted">Your recent generations.</p>
        </div>
        {readyTracks.length > 0 && (
          <button
            className="btn btn--ghost"
            onClick={() => player.playList(readyTracks)}
            title="Play all ready tracks"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px' }}>
              <path d="M8 5v14l11-7z" />
            </svg>
            Play all
          </button>
        )}
      </header>

      {/* Search / filter bar */}
      {tracks !== null && tracks.length > 0 && (
        <div className="history__search" style={{ padding: '0 32px 8px' }}>
          <input
            type="text"
            className="history__search-input"
            placeholder="Search by prompt or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <span className="muted small" style={{ marginLeft: 10 }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {tracks === null && (
        <div className="skeleton skeleton--row" style={{ margin: '0 32px' }} />
      )}
      {tracks !== null && tracks.length === 0 && (
        <div className="history__empty">
          <p className="muted">No generations yet.</p>
          <Link className="btn btn--ghost" to="/">
            Create your first track
          </Link>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="history__list">
          {filtered.map((t) => (
            <TrackRow
              key={t.jobId}
              track={t}
              onPlay={() => playAllFrom(t.jobId)}
            />
          ))}
        </div>
      )}
      {tracks !== null && tracks.length > 0 && filtered.length === 0 && (
        <p className="muted" style={{ padding: '16px 32px' }}>
          No tracks match "{search}".
        </p>
      )}
    </div>
  );
}
