/**
 * Nostrom mark: the letter "N" traced by a single proof-of-life pulse.
 *
 * A flat baseline enters, spikes into the peak and left stem of the N, drops
 * through the diagonal into the right stem, then flatlines out the other side;
 * the glyph *is* the protocol: a heartbeat that resolves into a name and then
 * goes quiet.
 *
 * The path is vectorised from the brand artwork (scripts/make-icons.py) as a
 * single filled shape, so it stays crisp from a 16px favicon up to a hero mark
 * and inherits `currentColor` for the green/amber/red status theming. The
 * matching raster icons live in `public/` and are wired up in `index.html`.
 * Do not hand-edit: re-run the script if the artwork changes.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="11 21 42 21"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M26.56 22.08 L27.20 22.40 L27.52 22.72 L27.84 23.36 L28.16 23.68 L28.48 24.00 L28.80 24.64 L29.12 24.96 L29.44 25.28 L29.76 25.92 L30.08 26.24 L30.40 26.56 L30.72 27.20 L31.04 27.52 L31.36 27.84 L31.68 28.48 L32.00 28.80 L32.32 29.12 L32.64 29.76 L32.96 30.08 L33.28 30.40 L33.60 31.04 L33.92 31.36 L34.24 31.68 L34.56 32.32 L34.88 32.64 L35.20 32.96 L35.52 33.28 L35.84 33.92 L36.16 34.24 L36.48 34.56 L36.80 35.20 L37.12 34.88 L37.12 24.00 L37.12 23.36 L37.44 23.04 L40.00 23.04 L40.32 23.36 L40.32 33.60 L40.64 33.92 L40.96 33.60 L42.24 32.00 L42.56 31.68 L42.88 31.36 L51.84 31.36 L52.16 31.68 L51.20 32.96 L50.88 33.60 L44.48 33.60 L43.84 33.92 L43.20 34.56 L42.56 35.52 L41.92 36.16 L41.28 37.12 L40.64 38.08 L40.00 38.72 L39.04 40.00 L38.40 40.96 L38.08 41.60 L37.44 41.28 L36.80 40.64 L36.16 39.68 L35.52 38.72 L34.88 38.08 L34.24 37.12 L33.60 36.16 L32.96 35.52 L32.32 34.56 L31.68 33.60 L31.04 32.96 L30.40 32.00 L29.76 31.04 L29.12 30.40 L28.48 29.44 L27.84 28.80 L27.20 27.84 L26.88 27.52 L26.24 27.84 L25.60 28.80 L24.96 29.44 L24.32 30.40 L23.68 31.36 L23.04 32.32 L22.40 32.96 L11.52 32.96 L11.52 31.04 L11.84 30.72 L20.16 30.72 L20.80 30.40 L21.44 29.44 L22.08 28.48 L22.72 27.52 L23.36 26.88 L24.00 25.92 L24.64 24.96 L25.28 24.00 L25.92 23.04 L26.24 22.40 Z M27.52 31.68 L28.16 32.32 L28.80 33.28 L29.44 33.92 L30.08 34.88 L30.72 35.52 L30.72 41.28 L30.40 41.60 L27.84 41.60 L27.52 41.28 L27.52 32.32 Z"
      />
    </svg>
  );
}
