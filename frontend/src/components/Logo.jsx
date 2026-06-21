/**
 * Melodia logo — an abstract mark combining an "M" with a sound wave / petals,
 * in the spirit of the Claude / ChatGPT emblems: a simple, recognizable glyph
 * rendered as crisp SVG so it scales from 16px (favicon) to 128px (auth page).
 *
 * Monochrome only — it inherits `currentColor` / fill so it adapts to any bg.
 *
 * Props:
 *   size   pixel size (default 32)
 *   title  accessible label (default "Melodia")
 */
export default function Logo({ size = 32, title = 'Melodia' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {/* Rounded square base, like Claude/GPT app icons */}
      <rect width="48" height="48" rx="12" fill="currentColor" />
      {/* The mark: an "M" drawn as two rising arcs + a central sound pulse,
          cut out of the base so the background shows through (knockout). */}
      <g fill="var(--mark-fill, #161616)">
        {/* Left arc */}
        <path d="M14 33V18.5c0-1 .6-1.6 1.4-1.6.6 0 1.1.3 1.5.9l5.6 8.6V18.5c0-.9.6-1.5 1.5-1.5s1.5.6 1.5 1.5V33c0 1-.6 1.6-1.4 1.6-.6 0-1.1-.3-1.5-.9l-5.6-8.6V33c0 .9-.6 1.5-1.5 1.5S14 33.9 14 33Z" />
        {/* Right arc (mirrored) */}
        <path d="M34 33V18.5c0-1-.6-1.6-1.4-1.6-.6 0-1.1.3-1.5.9l-5.6 8.6V18.5c0-.9-.6-1.5-1.5-1.5s-1.5.6-1.5 1.5V33c0 1 .6 1.6 1.4 1.6.6 0 1.1-.3 1.5-.9l5.6-8.6V33c0 .9.6 1.5 1.5 1.5S34 33.9 34 33Z" />
      </g>
    </svg>
  );
}
