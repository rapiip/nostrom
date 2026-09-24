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
 * floating coins, no nodes, no chain links — the metaphor is a patient monitor,
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
  faint: "#646c73",
};

export function ProtocolDiagram({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Readout state, updated at ~4Hz rather than once per frame. Text that changes
  // 60 times a second is unreadable anyway, and re-rendering the surrounding DOM
  // at frame rate would waste the saving the canvas exists to make.
  const [readout, setReadout] = useState<{ stage: Stage; gracePct: number; beats: number }>({
    stage: "healthy",
    gracePct: 100,
    beats: 0,
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
     * frame and never notices, but the reduced-motion path paints exactly once —
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
    const draw = (elapsed: number): { stage: Stage; gracePct: number; beats: number } | null => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === 0 || h === 0) return null;

      const { stage: s, localT } = stageAt(elapsed);

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

      // Geometry: the trace occupies the upper ~72% and the grace gauge sits just
      // below it. Keeping them close reads as one instrument rather than two
      // unrelated graphics with a gap between them.
      const traceH = h * 0.72;
      const traceMid = traceH * 0.5;
      const gaugeY = h - 20;

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

      // The trace itself.
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      const step = w / (SAMPLES - 1);
      for (let i = 0; i < trace.length; i++) {
        const x = i * step;
        const y = traceMid - (trace[i] ?? 0) * (traceH * 0.34);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Leading cursor dot — the "live" read head.
      const lastY = traceMid - (trace[trace.length - 1] ?? 0) * (traceH * 0.34);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((trace.length - 1) * step, lastY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // --- grace gauge -----------------------------------------------------
      const gaugeH = 3;
      ctx.fillStyle = "#16191d";
      ctx.fillRect(0, gaugeY, w, gaugeH);

      const fillW = (w * Math.max(0, Math.min(100, pct))) / 100;
      ctx.fillStyle = pct > 20 ? (s === "healthy" ? COLORS.signal : COLORS.warn) : COLORS.danger;
      ctx.fillRect(0, gaugeY, fillW, gaugeH);

      // Quartile ticks on the gauge.
      ctx.fillStyle = "#08090a";
      for (const q of [0.25, 0.5, 0.75]) {
        ctx.fillRect(Math.floor(w * q), gaugeY, 1, gaugeH);
      }

      // Deadline marker at the far right of the gauge.
      ctx.fillStyle = pct <= 0 ? COLORS.danger : COLORS.lineStrong;
      ctx.fillRect(w - 1, gaugeY - 4, 1, gaugeH + 8);

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
          prev.stage === next.stage && prev.gracePct === next.gracePct && prev.beats === next.beats
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

  const { stage, gracePct, beats } = readout;
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
          className="block h-[180px] w-full sm:h-[210px]"
          role="img"
          aria-label="Animated diagram of the Nostrom protocol lifecycle: an agent's heartbeat keeps a countdown full; when the heartbeat stops the countdown drains and the treasury is evacuated to a recovery address."
        />

        {/* Caption strip — narrates the stage in protocol terms */}
        <div className="flex min-h-[44px] items-center border-t border-line px-4 py-2.5">
          <p className="tnum text-[11px] leading-relaxed text-text-dim" aria-live="off">
            {copy.detail}
          </p>
        </div>
      </div>

      {/* Static legend so the diagram is comprehensible without watching it loop */}
      <figcaption className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {(Object.keys(STAGE_COPY) as Stage[]).map((s) => (
          <div
            key={s}
            className={clsx(
              "flex items-baseline gap-2.5 text-[12px] transition-opacity duration-500",
              s === stage ? "opacity-100" : "opacity-45",
            )}
          >
            <span
              className={clsx("mt-1.5 size-1.5 shrink-0 rounded-full", {
                "bg-signal": s === "healthy",
                "bg-warn": s === "silence",
                "bg-danger": s === "lapsed" || s === "rescue",
              })}
              aria-hidden
            />
            <span className="text-text">{STAGE_COPY[s].label}</span>
          </div>
        ))}
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
