import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { usePlayer } from '../audio/PlayerContext.jsx';
import { formatTime } from '../audio/useAudioPlayer.js';
import Waveform from '../components/Waveform.jsx';
import Logo from '../components/Logo.jsx';

/**
 * Public share Player page.
 *
 * Supports two share formats returned by GET /api/share/:id:
 *   - kind: 'track'   — a single audio file (modern flow)
 *   - kind: 'project'  — a legacy node-graph project
 *
 * For single-track shares, renders a premium centered player with a real
 * waveform. For legacy projects, falls back to sequential playback of node
 * audio files.
 */
export default function Player() {
  const { id } = useParams();
  const [data, setData] = useState(undefined); // undefined=loading, null=error
  const player = usePlayer();

  useEffect(() => {
    api
      .getShared(id)
      .then((p) => setData(p))
      .catch(() => setData(null));
    return () => player.stop();
  }, [id]);

  // Loading
  if (data === undefined) {
    return (
      <div className="player">
        <p className="pulse">loading…</p>
      </div>
    );
  }
  // Not found / error
  if (!data) {
    return (
      <div className="player">
        <Logo size={48} />
        <h1 className="player__title fade-in" style={{ fontSize: 22 }}>
          Track not found
        </h1>
        <p className="muted">This share link may have expired or been removed.</p>
      </div>
    );
  }

  // Modern single-track share
  if (data.kind === 'track') {
    return <TrackPlayer track={data} />;
  }

  // Legacy project share (nodes/edges)
  return <LegacyProjectPlayer project={data} />;
}

/** Premium single-track player (modern shares). */
function TrackPlayer({ track }) {
  const player = usePlayer();

  const trackId = track.audio_url || `share_${track.id}`;
  const isCurrent = player.current?.id === trackId;
  const playing = isCurrent && player.playing;
  const progress = isCurrent ? player.progress : 0;
  const currentTime = isCurrent ? player.currentTime : 0;
  const dur = isCurrent ? player.duration || track.duration : track.duration;

  function handlePlay() {
    player.play({
      id: trackId,
      title: track.title,
      style_tags: track.style_tags,
      audio_url: track.audio_url,
    });
  }

  return (
    <div className="player">
      <div className="player__ghost" aria-hidden="true">
        <div className="player__ghost-glow" />
      </div>

      <Logo size={48} />
      <h1 className="player__title fade-in">{track.title || 'Untitled'}</h1>

      {track.style_tags?.length > 0 && (
        <div className="player__tags fade-in">
          {track.style_tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <button
        className="player__play glow"
        onClick={isCurrent ? player.toggle : handlePlay}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        <span className={playing ? 'player__pause-icon' : 'player__play-icon'} />
      </button>

      {track.audio_url && (
        <div className="player__wave-wrap fade-in">
          <Waveform
            src={track.audio_url}
            playing={playing}
            progress={progress}
            onSeek={player.seekToFraction}
            bars={80}
          />
          <div className="track__time" style={{ marginTop: 6 }}>
            <span>{formatTime(currentTime)}</span>
            <span className="muted">{formatTime(dur)}</span>
          </div>
        </div>
      )}

      {track.audio_url && (
        <a className="btn btn--ghost" href={track.audio_url} download style={{ marginTop: 12 }}>
          ↓ Download
        </a>
      )}

      <div className="player__brand muted small fade-in">
        Made with Melodia
      </div>
    </div>
  );
}

/** Legacy project player (backwards compatibility). */
function LegacyProjectPlayer({ project }) {
  const player = usePlayer();

  const audioNodes = (project.nodes || []).filter(
    (n) => n.type === 'treblo_generator' && n.data?.audio_url
  );

  function playAll() {
    const list = audioNodes.map((n) => ({
      id: n.id,
      title: n.data.prompt || project.title,
      audio_url: n.data.audio_url,
    }));
    player.playList(list, 0);
  }

  const playing = player.playing;

  return (
    <div className="player">
      <div className="player__ghost" aria-hidden="true">
        {project.nodes.map((n) => (
          <span
            key={n.id}
            className="player__ghost-node"
            style={{ left: n.position?.x, top: n.position?.y }}
          />
        ))}
      </div>

      <h1 className="player__title fade-in">{project.title}</h1>
      <button
        className="player__play"
        onClick={playing ? player.toggle : playAll}
        aria-label="Play"
      >
        <span className={playing ? 'player__pause-icon' : 'player__play-icon'} />
      </button>
    </div>
  );
}
