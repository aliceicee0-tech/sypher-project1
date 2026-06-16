import { useState } from 'react';
import { Handle, Position } from 'reactflow';

export default function CombinerNode({ id, data }) {
  const [volume, setVolume] = useState(data.volume ?? 1);

  return (
    <div className="node node--combiner fade-in">
      <Handle type="target" position={Position.Left} className="node__handle" />
      <div className="node__label">Combiner</div>
      <input
        className="slider"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => {
          const v = Number(e.target.value);
          setVolume(v);
          data.onChange?.(id, { volume: v });
        }}
      />
      <Handle type="source" position={Position.Right} className="node__handle" />
    </div>
  );
}
