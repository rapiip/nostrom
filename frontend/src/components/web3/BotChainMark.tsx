/**
 * Official BOT Chain symbol — the stacked-parallelogram "B" mark.
 *
 * Vectorised from botchain.ai/logo.png (scripts/trace-botchain.py) as a single
 * filled shape so it scales cleanly and can be tinted. It defaults to the BOT
 * Chain brand green (#10A37F); pass a `className` with a text colour to override
 * (e.g. `text-current` inside a coloured chip).
 *
 * This is a third-party trademark shown to attribute the network the protocol
 * runs on. Do not restyle the glyph itself — only its size and colour.
 */
export function BotChainMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 75 120"
      className={className}
      fill="none"
      role="img"
      aria-label="BOT Chain"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19 0 32 8 55 21 72 31 73 34 73 52 73 54 62 61 55 65 56 66 65 71 74 76 74 85 74 95 73 98 68 101 61 105 56 108 56 100 56 90 55 87 46 81 34 74 22 67 19 65 19 47 21 45 34 53 54 64 56 63 56 51 56 43 42 34 27 25 19 20 19 2Z M0 77 12 84 32 96 53 108 54 109 44 115 39 118 35 118 21 110 5 101 0 98 0 82Z"
      />
    </svg>
  );
}
