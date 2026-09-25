import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";

/**
 * The protocol diagram.
 *
 * Nostrom is a countdown that a heartbeat keeps resetting. So the hero visual is
 * a live ECG trace with a grace-period gauge beneath it, and it runs the actual
 * protocol lifecycle on a loop:
 *
 *   healthy  -> regular beats, gauge refills on each one
 *   silence  -> beats stop, trace flattens, gauge drains
 *   lapsed   -> gauge empties, the switch arms
 *   rescue   -> treasury flows to the recovery address
 *
 * Everything here is a direct depiction of contract behaviour. There are no
 * floating coins, no nodes, no chain links: the metaphor is a patient monitor,
 * because that is what the contract is.
 *
 * The animation is driven by a single rAF loop writing to a canvas rather than by
 * dozens of animated DOM nodes, so it stays cheap and does not thrash layout.
 * Under prefers-reduced-motion it draws one static frame of the healthy state
 * and stops.
 */

type Stage = "healthy" | "silence" | "lapsed" | "rescue";

const STAGE_COPY: Record<Stage, { label: string; detail: string; tone: string }> = {
  healthy: {
    label: "Agent alive",
    detail: "ping() every interval · countdown resets · funds stay in the vault",
    tone: "text-signal",
  },
  silence: {
    label: "Heartbeat missed",
    detail: "no ping · grace window draining · owner can still withdraw",
    tone: "text-warn",
  },
  lapsed: {
    label: "Timeout exceeded",
    detail: "isExecutable() == true · executeDeadManSwitch() callable by anyone",
    tone: "text-danger",
  },
  rescue: {
    label: "Treasury evacuated",
    detail: "all BOT + tracked ERC-20s transferred to recoveryAddress",
    tone: "text-danger",
  },
};

/** The lifecycle in order. Drives the stage track, so it is the single source of
 *  sequence — STAGE_COPY is keyed, not ordered. */
const STAGE_ORDER: Stage[] = ["healthy", "silence", "lapsed", "rescue"];

/**
 * Per-stage colour classes for the stage track.
 *
 * Spelled out per stage rather than composed from a template string because
 * Tailwind resolves class names statically — an interpolated `border-${tone}`
 * would be purged from the build and silently render uncoloured.
 */
const ACCENT: Record<
  Stage,
  { ring: string; ringPast: string; dot: string; dotPast: string; fill: string; text: string }
> = {
  healthy: {
    ring: "border-signal",
    ringPast: "border-signal-dim",
    dot: "bg-signal",
    dotPast: "bg-signal-dim",
    fill: "bg-signal-dim",
    text: "text-signal",
  },
  silence: {
    ring: "border-warn",
    ringPast: "border-warn-dim",
    dot: "bg-warn",
    dotPast: "bg-warn-dim",
    fill: "bg-warn-dim",
    text: "text-warn",
  },
  lapsed: {
    ring: "border-danger",
    ringPast: "border-danger-dim",
    dot: "bg-danger",
    dotPast: "bg-danger-dim",
    fill: "bg-danger-dim",
    text: "text-danger",
  },
  rescue: {
    ring: "border-danger",
    ringPast: "border-danger-dim",
    dot: "bg-danger",
    dotPast: "bg-danger-dim",
    fill: "bg-danger-dim",
    text: "text-danger",
  },
};

/** Stage durations in ms. One full cycle is ~13s. */
const TIMELINE: { stage: Stage; ms: number }[] = [
  { stage: "healthy", ms: 5200 },
  { stage: "silence", ms: 3400 },
  { stage: "lapsed", ms: 2000 },
  { stage: "rescue", ms: 2400 },
];

const CYCLE = TIMELINE.reduce((sum, s) => sum + s.ms, 0);

function stageAt(elapsed: number): { stage: Stage; localT: number; index: number } {
  let t = elapsed % CYCLE;
  for (let i = 0; i < TIMELINE.length; i++) {
    const entry = TIMELINE[i]!;
    if (t < entry.ms) return { stage: entry.stage, localT: t / entry.ms, index: i };
    t -= entry.ms;
  }
  return { stage: "healthy", localT: 0, index: 0 };
}

const COLORS = {
  signal: "#7dd3a0",
  warn: "#e3b341",
  danger: "#e5534b",
  line: "#1d2226",
  lineStrong: "#2b3238",
  faint: "#7d858c",
};

export function ProtocolDiagram({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Readout state, updated at ~4Hz rather than once per frame. Text that changes
  // 60 times a second is unreadable anyway, and re-rendering the surrounding DOM
  // at frame rate would waste the saving the canvas exists to make.
  const [readout, setReadout] = useState<{
    stage: Stage;
    gracePct: number;
    beats: number;
    index: number;
    progress: number;
  }>({
    stage: "healthy",
    gracePct: 100,
    beats: 0,
    index: 0,
    progress: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let start = 0;
    let lastElapsed = 0;
    let lastReadoutAt = 0;
    const SAMPLES = 240;
    const trace: number[] = new Array(SAMPLES).fill(0);

    /**
     * Assigning canvas.width/height resets the drawing surface AND the transform,
     * so anything already painted is wiped. The animated path repaints every
     * frame and never notices, but the reduced-motion path paints exactly once,
     * and ResizeObserver fires asynchronously after that single paint, which left
     * the canvas permanently blank for anyone with reduced motion enabled.
     * Every resize therefore repaints immediately.
     */
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      repaint();
    };

    /** One ECG complex, as a function of position within the beat (0..1). */
    const complex = (p: number): number => {
      if (p < 0.08) return Math.sin((p / 0.08) * Math.PI) * 0.12; // P wave
      if (p < 0.12) return 0;
      if (p < 0.15) return -((p - 0.12) / 0.03) * 0.22; // Q
      if (p < 0.2) return -0.22 + ((p - 0.15) / 0.05) * 1.22; // R spike
      if (p < 0.25) return 1.0 - ((p - 0.2) / 0.05) * 1.35; // S
      if (p < 0.3) return -0.35 + ((p - 0.25) / 0.05) * 0.35;
      if (p < 0.5) return Math.sin(((p - 0.3) / 0.2) * Math.PI) * 0.26; // T wave
      return 0;
    };

    /** Paints one frame and returns the readout values, without touching state. */
    const draw = (
      elapsed: number,
    ): { stage: Stage; gracePct: number; beats: number; index: number; progress: number } | null => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === 0 || h === 0) return null;

      const { stage: s, localT, index } = stageAt(elapsed);

      // --- grace gauge -----------------------------------------------------
      let pct: number;
      if (s === "healthy") {
        // Sawtooth: drains between beats, snaps back to full on each one.
        const beatPhase = (localT * 3) % 1;
        pct = 100 - beatPhase * 22;
      } else if (s === "silence") {
        pct = 78 - localT * 78;
      } else {
        pct = 0;
      }

      // --- trace amplitude -------------------------------------------------
      const beatsPerHealthyStage = 3;
      let amp = 0;
      if (s === "healthy") {
        amp = complex((localT * beatsPerHealthyStage) % 1);
      } else if (s === "silence") {
        // One faltering beat early on, then flatline.
        if (localT < 0.22) amp = complex(localT / 0.22) * (1 - localT / 0.22) * 0.55;
        else amp = (Math.random() - 0.5) * 0.012; // sensor noise on a flat line
      } else {
        amp = (Math.random() - 0.5) * 0.008;
      }

      trace.push(amp);
      if (trace.length > SAMPLES) trace.shift();

      // --- paint -----------------------------------------------------------
      ctx.clearRect(0, 0, w, h);

      // Geometry: the trace occupies the upper ~80% and the grace gauge sits just
      // below it. Keeping them close reads as one instrument rather than two
      // unrelated graphics with a band of dead black between them.
      const traceH = h * 0.8;
      const traceMid = traceH * 0.5;
      const gaugeY = h - 22;

      // Baseline grid: sparse vertical ticks, one horizontal baseline.
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 48) {
        ctx.moveTo(Math.floor(x) + 0.5, 0);
        ctx.lineTo(Math.floor(x) + 0.5, traceH);
      }
      ctx.moveTo(0, Math.floor(traceMid) + 0.5);
      ctx.lineTo(w, Math.floor(traceMid) + 0.5);
      ctx.stroke();

      const color = s === "healthy" ? COLORS.signal : s === "silence" ? COLORS.warn : COLORS.danger;
      const rgb = s === "healthy" ? "125, 211, 160" : s === "silence" ? "227, 179, 65" : "229, 83, 75";

      const step = w / (SAMPLES - 1);
      const AMP = traceH * 0.42;
      const yAt = (v: number) => traceMid - v * AMP;

      // Trace path, built once and reused for the fill, the glow and the stroke.
      const tracePath = new Path2D();
      for (let i = 0; i < trace.length; i++) {
        const x = i * step;
        const y = yAt(trace[i] ?? 0);
        if (i === 0) tracePath.moveTo(x, y);
        else tracePath.lineTo(x, y);
      }

      // Area under the curve. A monitor trace reads as a signal with mass rather
      // than a hairline, and the gradient keeps the fill from competing with the
      // stroke for attention.
      const area = new Path2D(tracePath);
      area.lineTo((trace.length - 1) * step, traceMid);
      area.lineTo(0, traceMid);
      area.closePath();
      const grad = ctx.createLinearGradient(0, traceMid - AMP, 0, traceMid);
      grad.addColorStop(0, `rgba(${rgb}, 0.2)`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = grad;
      ctx.fill(area);

      // Phosphor glow. Drawn as a wide, low-alpha pass under the crisp stroke
      // because canvas shadowBlur is expensive enough to cost frames at 60fps.
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(${rgb}, 0.18)`;
      ctx.lineWidth = 5;
      ctx.stroke(tracePath);

      // The trace itself.
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke(tracePath);

      // Leading cursor dot: the "live" read head, with a halo so it stays
      // visible where it sits on top of the bright part of the trace.
      const lastY = yAt(trace[trace.length - 1] ?? 0);
      const lastX = (trace.length - 1) * step;
      ctx.fillStyle = `rgba(${rgb}, 0.22)`;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // --- grace gauge -----------------------------------------------------
      // Taller than a hairline so it reads as a gauge being consumed rather than
      // as a divider between two graphics, with an outlined track behind it so
      // the spent remainder stays legible.
      const gaugeH = 6;
      ctx.fillStyle = "#16191d";
      ctx.fillRect(0, gaugeY, w, gaugeH);
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, gaugeY + 0.5, w - 1, gaugeH - 1);

      const fillW = (w * Math.max(0, Math.min(100, pct))) / 100;
      const gaugeColor = pct > 20 ? (s === "healthy" ? COLORS.signal : COLORS.warn) : COLORS.danger;
      ctx.fillStyle = gaugeColor;
      ctx.fillRect(0, gaugeY, fillW, gaugeH);

      // Bright leading edge on the fill: the point the countdown has reached.
      if (fillW > 1 && pct > 0) {
        ctx.fillStyle = "#e8eaeb";
        ctx.fillRect(Math.max(0, fillW - 1), gaugeY, 1, gaugeH);
      }

      // Quartile ticks on the gauge.
      ctx.fillStyle = "#08090a";
      for (const q of [0.25, 0.5, 0.75]) {
        ctx.fillRect(Math.floor(w * q), gaugeY, 1, gaugeH);
      }

      // Deadline marker at the far right of the gauge.
      ctx.fillStyle = pct <= 0 ? COLORS.danger : COLORS.lineStrong;
      ctx.fillRect(w - 1, gaugeY - 5, 1, gaugeH + 10);

      // --- rescue flow -----------------------------------------------------
      // A packet travels the gauge to the deadline marker: the treasury leaving
      // for the recovery address.
      if (s === "rescue") {
        const p = Math.min(1, localT / 0.75);
        const eased = 1 - Math.pow(1 - p, 3);
        const x = eased * w;
        ctx.fillStyle = COLORS.danger;
        ctx.beginPath();
        ctx.arc(x, gaugeY + gaugeH / 2, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(229, 83, 75, ${0.45 * (1 - p)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, x - 56), gaugeY + gaugeH / 2);
        ctx.lineTo(x, gaugeY + gaugeH / 2);
        ctx.stroke();
      }

      return {
        stage: s,
        gracePct: Math.round(Math.max(0, pct)),
        beats:
          Math.floor(elapsed / CYCLE) * 3 + (s === "healthy" ? Math.floor(localT * 3) + 1 : 3),
        index,
        // Quantised to 5% steps. The stage track animates its connector fill with
        // a CSS transition, so it does not need frame-accurate values, and coarse
        // steps keep the surrounding DOM from re-rendering on every readout tick.
        progress: Math.round(localT * 20) / 20,
      };
    };

    /** Repaint the current frame. Under reduced motion that is a fixed healthy frame. */
    function repaint() {
      if (reduced) {
        for (let i = 0; i < SAMPLES; i++) {
          trace[i] = complex(((i / SAMPLES) * 3) % 1);
        }
        draw(0);
      } else {
        draw(lastElapsed);
      }
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    if (reduced) {
      // One static frame of the healthy state: two resting complexes across the
      // buffer. Re-filled on every repaint because draw() consumes the buffer.
      resize();
      return () => observer.disconnect();
    }

    const loop = (ts: number) => {
      if (start === 0) start = ts;
      lastElapsed = ts - start;
      const next = draw(lastElapsed);
      if (next && ts - lastReadoutAt > 250) {
        lastReadoutAt = ts;
        setReadout((prev) =>
          prev.stage === next.stage &&
          prev.gracePct === next.gracePct &&
          prev.beats === next.beats &&
          prev.progress === next.progress
            ? prev
            : next,
        );
      }
      raf = requestAnimationFrame(loop);
    };
    resize();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  const { stage, gracePct, beats, index, progress } = readout;
  const copy = STAGE_COPY[stage];

  return (
    <figure className={clsx("m-0", className)}>
      <div className="overflow-hidden rounded-md border border-line bg-ink-900">
        {/* Instrument header */}
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className={clsx("pulse-dot", copy.tone)} aria-hidden />
            <span className={clsx("text-[12px] font-medium", copy.tone)}>{copy.label}</span>
          </div>
          <div className="hidden items-center gap-5 sm:flex">
            <Readout label="Grace" value={`${gracePct}%`} tone={copy.tone} />
            <Readout label="Pings" value={String(beats)} />
          </div>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="block h-[190px] w-full sm:h-[248px]"
          role="img"
          aria-label="Animated diagram of the Nostrom protocol lifecycle: an agent's heartbeat keeps a countdown full; when the heartbeat stops the countdown drains and the treasury is evacuated to a recovery address."
        />

        {/* Caption strip: narrates the stage in protocol terms */}
        <div className="flex min-h-[44px] items-center border-t border-line px-4 py-2.5">
          <p className="tnum text-[11px] leading-relaxed text-text-dim" aria-live="off">
            {copy.detail}
          </p>
        </div>
      </div>

      {/* Sequential stage track.
          These four states are not unordered categories — they are one directed
          sequence, and the causality (silence is what CAUSES evacuation) is the
          whole point of the protocol. A 2x2 grid of dots hid that, so the legend
          is a track: markers connected in order, filling as the cycle advances.
          It doubles as the key, so the diagram is still comprehensible without
          watching it loop.

          Inactive steps are dimmed with explicit colour tokens rather than
          opacity, because opacity composites toward the background and silently
          drops small text under the 4.5:1 contrast floor. */}
      <figcaption className="mt-5">
        <ol className="grid gap-y-3 sm:grid-cols-4 sm:gap-x-2 sm:gap-y-0">
          {STAGE_ORDER.map((s, i) => {
            const state: "past" | "active" | "future" =
              i < index ? "past" : i === index ? "active" : "future";
            const isLast = i === STAGE_ORDER.length - 1;

            return (
              <li key={s} className="min-w-0">
                {/* Marker rail: dot plus the connector to the next stage. */}
                <div className="flex items-center gap-2" aria-hidden>
                  <span
                    className={clsx(
                      "grid size-3.5 shrink-0 place-items-center rounded-full border transition-colors duration-500",
                      state === "active" && ACCENT[s].ring,
                      state === "past" && ACCENT[s].ringPast,
                      state === "future" && "border-line-strong",
                    )}
                  >
                    <span
                      className={clsx(
                        "size-1.5 rounded-full transition-colors duration-500",
                        state === "active" && ACCENT[s].dot,
                        state === "past" && ACCENT[s].dotPast,
                        state === "future" && "bg-line-strong",
                      )}
                    />
                  </span>

                  {/* Connector. On the active step it fills with stage progress,
                      which turns the legend into a live countdown readout. */}
                  {!isLast && (
                    <span className="relative hidden h-px min-w-0 flex-1 bg-line-strong sm:block">
                      <span
                        className={clsx(
                          "absolute inset-y-0 left-0 transition-[width] duration-200 ease-linear",
                          ACCENT[s].fill,
                        )}
                        style={{
                          width:
                            state === "past" ? "100%" : state === "active" ? `${progress * 100}%` : "0%",
                        }}
                      />
                    </span>
                  )}
                </div>

                <p
                  className={clsx(
                    "mt-2 text-[12px] leading-snug transition-colors duration-500",
                    state === "active" ? ACCENT[s].text : "text-text-faint",
                  )}
                >
                  {STAGE_COPY[s].label}
                </p>
              </li>
            );
          })}
        </ol>
      </figcaption>
    </figure>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className={clsx("tnum text-[12px]", tone ?? "text-text")}>{value}</span>
    </div>
  );
}
