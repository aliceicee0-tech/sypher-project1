/**
 * Equalizer — animated dancing bars, used as the "wow" loading indicator while
 * a track generates. Pure CSS animation, no canvas, no dependency.
 *
 *   <Equalizer bars={5} />   -> small inline set of bars
 *   <Equalizer size="lg" />  -> taller, for the hero/generating hero card
 *
 * Stays monochrome: bars are white-ish (foreground) at varying opacities.
 */
export default function Equalizer({ bars = 5, size = 'sm', className = '' }) {
  return (
    <div
      className={`eq eq--${size}${className ? ' ' + className : ''}`}
      role="status"
      aria-label="generating"
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} className="eq__bar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}
