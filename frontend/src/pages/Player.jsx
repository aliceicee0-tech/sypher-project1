import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { audioEngine } from '../audio/engine.js';

export default function Player() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [playing, setPlaying] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    api.getShared(id).then((p) => {
      setProject(p);
      (p?.nodes || [])
        .filter((n) => n.type === 'treblo_generator' && n.data?.audio_url)
        .forEach((n) => audioEngine.load(n.id, n.data.audio_url, n.data.volume ?? 1));
      loaded.current = true;
    }).catch(() => setProject(null));
    return () => audioEngine.stopAll();
  }, [id]);

  function toggle() {
    if (!project) return;
    if (playing) {
      audioEngine.stopAll();
      setPlaying(false);
      return;
    }
    const ids = project.nodes
      .filter((n) => n.type === 'treblo_generator' && n.data?.audio_url)
      .map((n) => n.id);
    setPlaying(true);
    audioEngine.playSequence(ids).then(() => setPlaying(false));
  }

  if (!project) {
    return <div className="player"><p className="pulse">loading…</p></div>;
  }

  return (
    <div className="player">
      {/* Faint background structure at ~5% opacity */}
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
      <button className="player__play" onClick={toggle} aria-label="Play">
        <span className={playing ? 'player__pause-icon' : 'player__play-icon'} />
      </button>
    </div>
  );
}
