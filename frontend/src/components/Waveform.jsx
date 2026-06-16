// A thin static decorative waveform line (monochrome).
export default function Waveform({ bars = 28 }) {
  return (
    <div className="waveform" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="waveform__bar"
          style={{ height: `${20 + Math.abs(Math.sin(i * 0.9)) * 60}%` }}
        />
      ))}
    </div>
  );
}
