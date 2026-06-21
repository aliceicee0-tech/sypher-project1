import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatTime } from '../audio/useAudioPlayer.js';
import { usePlayer } from '../audio/PlayerContext.jsx';
import Waveform from '../components/Waveform.jsx';
import { useConfirm, useToast } from '../components/ui/Overlay.jsx';

/**
 * Collection detail — the tracks saved inside one collection.
 *
 * Each row is playable through the global PlayerContext (one audio element, one
 * track at a time, reflected in the MiniPlayer). "Play all" plays the whole
 * collection as a queue with auto-advance. Tracks can be removed.
 */
function CollectionTrack({ track, onPlay, onRemove }) {
  const { title, prompt, style_tags, audio_url } = track;
  const player = usePlayer();

  const trackId = audio_url || `col_${track.track_id}`;
  const isCurrent = player.current?.id === trackId;
  const playing = isCurrent && player.playing;
  const progress = isCurrent ? player.progress : 0;
  const currentTime = isCurrent ? player.currentTime : 0;

  function handlePlay() {
    onPlay(track);
  }

  return (
    <div className="history__row">
      <button
        className={`play-btn${playing ? ' play-btn--active' : ''}`}
        onClick={isCurrent ? player.toggle : handlePlay}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
            <path d="M1 1.5h2.5v9H1v-9zm5.5 0h2.5v9h-2.5v-9z" />
          </svg>
        ) : (
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" style={{ marginLeft: '1px' }}>
            <path d="M1 1.5l7.5 4.5L1 10.5V1.5z" />
          </svg>
        )}
      </button>

      <div className="history__info">
        <div className="history__prompt">{title || prompt || 'Untitled'}</div>
        <div className="history__meta">
          {style_tags?.slice(0, 3).map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
      </div>

      <div className="history__wave">
        <Waveform
          src={audio_url}
          playing={playing}
          progress={progress}
          onSeek={player.seekToFraction}
          bars={48}
        />
        <div className="track__time">
          <span>{formatTime(currentTime)}</span>
          <span className="muted">{formatTime(player.duration)}</span>
        </div>
      </div>

      <a className="track__dl" href={audio_url} download title="Download" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
      </a>
      <button
        className="card-action card-action--danger"
        onClick={() => onRemove(track)}
        title="Remove from collection"
      >
        Remove
      </button>
    </div>
  );
}

export default function Collection() {
  const { id } = useParams();
  const [col, setCol] = useState(null);
  const player = usePlayer();
  const confirm = useConfirm();
  const toast = useToast();

  async function refresh() {
    try {
      setCol(await api.getCollection(id));
    } catch {
      setCol(null);
    }
  }
  useEffect(() => {
    refresh();
  }, [id]);

  async function removeTrack(track) {
    const ok = await confirm({
      title: `Remove “${track.title || 'this track'}”?`,
      message: 'It will be removed from this collection (the original file is not deleted).',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      const updated = await api.removeTrackFromCollection(id, track.track_id);
      setCol(updated);
      toast('Track removed', { type: 'success' });
    } catch {
      toast('Could not remove track', { type: 'error' });
    }
  }

  function playFrom(index) {
    const list = (col?.tracks || []).map((t) => ({
      id: t.audio_url || `col_${t.track_id}`,
      title: t.title,
      style_tags: t.style_tags,
      audio_url: t.audio_url,
    }));
    player.playList(list, index);
  }

  if (col === null)
    return (
      <div className="history">
        <p className="pulse" style={{ padding: '28px 32px' }}>loading…</p>
      </div>
    );
  if (!col)
    return (
      <div className="history">
        <p className="muted" style={{ padding: '28px 32px' }}>Collection not found.</p>
      </div>
    );

  return (
    <div className="history">
      <header className="page-head page-head--row">
        <div>
          <Link to="/collections" className="chat__link">← Collections</Link>
          <h1 style={{ marginTop: 10 }}>{col.title}</h1>
          <p className="muted">{(col.tracks || []).length} tracks</p>
        </div>
        {(col.tracks || []).length > 0 && (
          <button className="btn btn--ghost" onClick={() => playFrom(0)} title="Play the whole collection">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px' }}>
              <path d="M8 5v14l11-7z" />
            </svg>
            Play all
          </button>
        )}
      </header>

      {(col.tracks || []).length === 0 ? (
        <p className="muted" style={{ padding: '0 32px' }}>
          This collection is empty. Generate a track in the chat and save it here.
        </p>
      ) : (
        <div className="history__list">
          {col.tracks.map((t, i) => (
            <CollectionTrack
              key={t.track_id}
              track={t}
              onPlay={() => playFrom(i)}
              onRemove={removeTrack}
            />
          ))}
        </div>
      )}
    </div>
  );
}
