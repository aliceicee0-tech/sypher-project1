import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { audioEngine } from '../../audio/engine.js';

export default function MasterNode({ data }) {
  const [bpm, setBpm] = useState(data.bpm || 120);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    if (playing) {
      audioEngine.stopAll();
      setPlaying(false);
    } else {
      // Play all generated tracks in sequence (chaining).
      const ids = data.getSequence?.() || [];
      audioEngine.playSequence(ids).then(() => setPlaying(false));
      setPlaying(true);
    }
  }

  return (
    <div className="node node--master fade-in">
      <Handle type="target" position={Position.Left} className="node__handle" />
      <div className="node__label">Master</div>
      <button className="master-play" onClick={toggle} aria-label="Play all">
        <span className={playing ? 'play-btn__pause' : 'play-btn__tri'} />
      </button>
      <div className="master-bpm">
        <input
          className="master-bpm__value"
          type="number"
          min={40}
          max={240}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
        />
        <span className="master-bpm__label">BPM</span>
      </div>
      <Handle type="source" position={Position.Right} className="node__handle" />
    </div>
  );
}
