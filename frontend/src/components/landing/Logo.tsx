/**
 * Nostrom mark: a single ECG complex that flatlines.
 *
 * The glyph is the protocol — a heartbeat that stops. It reads at 16px, works in
 * one colour, and needs no wordmark to make sense next to one.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 16"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M1 9h5.5l2.2-6.5L12.4 14l2.8-7.2L17.6 11h3.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The flatline: same stroke, reduced opacity — silence, not absence. */}
      <path
        d="M21 9h18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}
