import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";

/**
 * The protocol diagram.
 *
 * Nostrom is a countdown that a heartbeat keeps resetting. So the hero visual is
 * a live patient monitor — an ECG trace with a grace-period gauge beneath it —
 * running the actual contract lifecycle on a loop:
 *
 *   healthy  -> regular beats, gauge refills on each one
 *   silence  -> beats stop, trace flattens, gauge drains
 *   lapsed   -> gauge empties, the switch arms, the panel alarms
 *   rescue   -> treasury flows along the gauge to the recovery address
 *
 * Everything here depicts contract behaviour. There are no floating coins, no
 * nodes, no chain links: the metaphor is a vital-signs monitor, because that is
 * what the contract is.
 *
 * Three properties are worth knowing before editing:
 *
 *  1. The signal is a pure function of time, `sampleAt(t)`, sampled onto a fixed
 *     grid (one sample per SAMPLE_MS) by an accumulator. The waveform therefore
 *     has the same shape and scroll speed at 60Hz, 120Hz or after a dropped
 *     frame. Sampling once per rendered frame — the obvious approach — makes the
 *     wave stretch and compress with frame rate, and it is what made the trace
 *     look arbitrary.
 *  2. Each sample records the stage it was captured in, so history keeps the
 *     colour it happened in: green beats scroll left while the amber flatline
 *     enters from the right. The stroke is one gradient sampled across the
 *     buffer, which costs a single paint rather than one per segment.
 *  3. Beats are detected from the signal itself (a rising crossing of the R
 *     threshold), not scheduled alongside it. So the ping counter, the bloom and
 *     the ripple can never drift out of sync with the spike you can see, and the
 *     deliberately weak beat during `silence` correctly counts as no ping.
 *
 * The whole thing is one canvas driven by one rAF loop. It pauses when scrolled
 * out of view or when the tab is hidden, and under prefers-reduced-motion it
 * paints one static healthy frame and stops.
 */

type Stage = "healthy" | "silence" | "lapsed" | "rescue";

const STAGE_COPY: Record<Stage, { label: string; detail: string; tone: string }> = {
  healthy: {
    label: "Agent alive",
    detail: "Heartbeat received · countdown reset · funds stay in the vault",
    tone: "text-signal",
  },
  silence: {
    label: "Heartbeat missed",
    detail: "No signal · grace period draining · owner can still act",
    tone: "text-warn",
  },
  lapsed: {
    label: "Deadline passed",
    detail: "Grace period over · anyone may now fire the switch",
    tone: "text-danger",
  },
  rescue: {
    label: "Treasury evacuated",
    detail: "BOT and tracked tokens moved to the recovery wallet",
    tone: "text-danger",
  },
};

/** The lifecycle in order. Drives the stage track, so it is the single source of
 *  sequence — STAGE_COPY is keyed, not ordered. It is also the index written
 *  into the sample buffer, so the order must not change without rebuilding it. */
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

/* ===========================================================================
   Timing model
   =========================================================================== */

/** Beat interval of the depiction. Stage lengths are whole multiples of it where
 *  beats occur, so a beat never lands half-finished on a stage boundary. */
const BEAT_MS = 1150;
const HEALTHY_BEATS = 5;

const TIMELINE: { stage: Stage; ms: number }[] = [
  { stage: "healthy", ms: BEAT_MS * HEALTHY_BEATS },
  { stage: "silence", ms: 3600 },
  { stage: "lapsed", ms: 2100 },
  { stage: "rescue", ms: 2700 },
];

const CYCLE = TIMELINE.reduce((sum, s) => sum + s.ms, 0);

const STAGE_MS = TIMELINE.reduce(
  (acc, s) => {
    acc[s.stage] = s.ms;
    return acc;
  },
  {} as Record<Stage, number>,
);

type At = { stage: Stage; tInStage: number; localT: number; index: number };

function stageAt(elapsed: number): At {
  let t = ((elapsed % CYCLE) + CYCLE) % CYCLE;
  for (let i = 0; i < TIMELINE.length; i++) {
    const entry = TIMELINE[i]!;
    if (t < entry.ms) return { stage: entry.stage, tInStage: t, localT: t / entry.ms, index: i };
    t -= entry.ms;
  }
  return { stage: "healthy", tInStage: 0, localT: 0, index: 0 };
}

/* ===========================================================================
   Signal model
   =========================================================================== */

/** Sample grid. 16ms per sample × 272 samples ≈ 4.3s of visible history, which
 *  holds ~3.7 beats — enough to read as a rhythm rather than a single event. */
const SAMPLE_MS = 16;
const SAMPLES = 272;

/** Rising crossing of this amplitude counts as a delivered heartbeat. Set above
 *  the peak of the faltering beat in `silence` (~0.36) and well below a healthy
 *  R peak (~1.0). */
const R_PEAK = 0.62;

/** One ECG complex as a function of position within the beat (0..1).
 *  P wave, PR segment, QRS complex, ST segment, T wave. The R limb is eased
 *  rather than linear so the spike reads as a discharge instead of a triangle. */
function complex(p: number): number {
  if (p < 0.09) return Math.sin((p / 0.09) * Math.PI) * 0.13; // P wave
  if (p < 0.135) return 0; // PR segment
  if (p < 0.16) return -0.2 * ((p - 0.135) / 0.025); // Q
  if (p < 0.205) {
    const k = (p - 0.16) / 0.045;
    return -0.2 + 1.22 * (k * k * (3 - 2 * k)); // R
  }
  if (p < 0.25) return 1.02 - 1.4 * ((p - 0.205) / 0.045); // S
  if (p < 0.3) return -0.38 + 0.38 * ((p - 0.25) / 0.05); // return to baseline
  if (p < 0.52) return Math.sin(((p - 0.3) / 0.22) * Math.PI) * 0.28; // T wave
  return 0;
}

/** Deterministic pseudo-noise. Math.random would make the flatline shimmer
 *  differently on every repaint, so a resize or a paused tab would visibly
 *  rewrite history that is supposed to be a recording. */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/** Slow baseline wander. A mathematically perfect flatline looks like a broken
 *  renderer; a drifting one looks like an instrument still listening. */
function wander(t: number): number {
  return Math.sin(t / 610) * 0.012 + Math.sin(t / 271) * 0.005;
}

/** The signal at an absolute time, plus the stage that produced it.
 *  Negative times are treated as healthy pre-history, which is what lets the
 *  buffer start pre-filled with a complete rhythm instead of the half-empty
 *  flat stretch a cold start produces. */
function sampleAt(t: number): { amp: number; index: number } {
  if (t < 0) {
    const p = (((t % BEAT_MS) + BEAT_MS) % BEAT_MS) / BEAT_MS;
    return { amp: complex(p) + wander(t), index: 0 };
  }

  const { stage, tInStage, localT, index } = stageAt(t);

  switch (stage) {
    case "healthy":
      return { amp: complex((tInStage % BEAT_MS) / BEAT_MS) + wander(t), index };

    case "silence": {
      // One weak, faltering complex where the next beat was due, then nothing.
      // Its peak stays under R_PEAK, so it reads as an attempt that did not land.
      const falter = BEAT_MS * 0.85;
      if (tInStage < falter) {
        const p = tInStage / falter;
        return { amp: complex(p) * 0.45 * (1 - p * 0.85) + wander(t), index };
      }
      return { amp: noise(t) * 0.02 + wander(t), index };
    }

    case "lapsed":
      return { amp: noise(t) * 0.014 + wander(t) * 0.6, index };

    case "rescue":
      // Asystole, settling further as the treasury leaves.
      return { amp: noise(t) * 0.01 * (1 - localT) + wander(t) * 0.3 * (1 - localT), index };
  }
}

/** Grace remaining, in percent, as a function of the cycle.
 *  Healthy sawtooths between beats — the countdown is always running, every
 *  heartbeat snaps it back to full. Silence drains it to zero. */
function graceAt(stage: Stage, tInStage: number): number {
  if (stage === "healthy") return 100 - ((tInStage % BEAT_MS) / BEAT_MS) * 17;
  if (stage === "silence") return Math.max(0, 100 - (tInStage / STAGE_MS.silence) * 100);
  return 0;
}

/* ===========================================================================
   Palette + geometry
   =========================================================================== */

const COLORS = {
  gridMinor: "rgba(29, 34, 38, 0.72)",
  gridMajor: "#232a2f",
  baseline: "rgba(43, 50, 56, 0.9)",
  bracket: "#2b3238",
  gaugeTrack: "#111417",
  gaugeSeam: "#08090a",
  edge: "#e8eaeb",
  deadline: "#2b3238",
  danger: "229, 83, 75",
};

const STAGE_RGB: Record<Stage, [number, number, number]> = {
  healthy: [125, 211, 160], // --color-signal
  silence: [227, 179, 65], // --color-warn
  lapsed: [229, 83, 75], // --color-danger
  rescue: [229, 83, 75],
};

type Geom = {
  plotW: number;
  plotTop: number;
  plotBottom: number;
  plotH: number;
  mid: number;
  step: number;
  amp: number;
  gaugeY: number;
  gaugeH: number;
};

/**
 * One layout function shared by the baked grid and the live frame, so the
 * lattice can never drift a pixel away from the trace it is measuring.
 *
 * The read head is inset from the right edge: the cursor halo and the beat
 * ripple are centred on it, and at the very edge they would be sliced in half.
 * The strip of bare grid to its right reads as the part of the recording that
 * has not happened yet. The gauge below still spans the full width, because its
 * right end IS the deadline.
 */
function geometry(w: number, h: number): Geom {
  const gaugeH = 8;
  const gaugeY = Math.round(h - 20);
  const plotTop = 10;
  const plotBottom = gaugeY - 16;
  const plotH = plotBottom - plotTop;
  const plotW = Math.max(1, w - 22);

  return {
    plotW,
    plotTop,
    plotBottom,
    plotH,
    // Baseline sits just below centre: an R spike is far taller than an S dip,
    // so a centred baseline wastes room below and clips above.
    mid: Math.round(plotTop + plotH * 0.54),
    step: plotW / (SAMPLES - 1),
    amp: plotH * 0.34,
    gaugeY,
    gaugeH,
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Rounded rect with a square fallback: roundRect is unavailable on older
 *  Safari, and a blank hero is a worse outcome than square gauge ends. */
function trackPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  // typeof on the method, not `in ctx`: the latter narrows the else branch to
  // `never`, since the lib types insist roundRect is always there.
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export function ProtocolDiagram({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Readout state, updated at ~4Hz rather than once per frame. Text that changes
  // 60 times a second is unreadable anyway, and re-rendering the surrounding DOM
  // at frame rate would waste the saving the canvas exists to make.
  const [readout, setReadout] = useState<{
    stage: Stage;
    gracePct: number;
    pings: number;
    index: number;
    progress: number;
  }>({ stage: "healthy", gracePct: 100, pings: 0, index: 0, progress: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* --- signal buffers ---------------------------------------------------
       A ring buffer of typed arrays rather than push/shift on a plain array:
       no per-frame allocation, so the loop generates no garbage to collect
       mid-animation. `head` is the next write slot, which is also the oldest
       sample once the buffer has filled. */
    const amps = new Float32Array(SAMPLES);
    const stages = new Uint8Array(SAMPLES);
    let head = 0;

    let elapsed = 0; // animation clock, advanced by clamped frame deltas
    let sampleAcc = 0; // unsampled time carried between frames
    let lastTs = 0;
    let lastReadoutAt = 0;

    let prevAmp = 0;
    let pings = 0;
    const beatTimes: number[] = []; // R-peak times, for the scrolling ping ticks
    const ripples: number[] = []; // R-peak times, for the read-head rings
    let bloom = 0; // 1 on a beat, decays — drives glow and cursor size
    let flash = 0; // 1 on a stage change, decays — drives the transition wash
    let stageIndexSeen = 0;

    // Current trace colour, eased toward the stage colour rather than snapped,
    // so green→amber→red reads as a condition deteriorating instead of a theme
    // switch.
    const tint: [number, number, number] = [...STAGE_RGB.healthy];

    /* --- baked grid ------------------------------------------------------- */
    let grid: HTMLCanvasElement | null = null;
    let gridKey = "";

    const bakeGrid = (w: number, h: number, dpr: number, g: Geom) => {
      const key = `${w}x${h}@${dpr}`;
      if (gridKey === key && grid) return;

      const c = grid ?? document.createElement("canvas");
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      const gc = c.getContext("2d");
      if (!gc) return;
      gc.setTransform(dpr, 0, 0, dpr, 0, 0);
      gc.clearRect(0, 0, w, h);

      // Graph paper: one major division per second of sweep, five minor
      // divisions inside it. Derived from the sample rate, so the lattice is a
      // true measure of the trace rather than decoration at an arbitrary pitch.
      const major = (1000 / SAMPLE_MS) * g.step;
      const minor = major / 5;

      gc.strokeStyle = COLORS.gridMinor;
      gc.lineWidth = 1;
      gc.beginPath();
      for (let x = g.plotW; x >= 0; x -= minor) {
        const px = Math.floor(x) + 0.5;
        gc.moveTo(px, g.plotTop);
        gc.lineTo(px, g.plotBottom);
      }
      for (let i = 1; i < 6; i++) {
        const py = Math.floor(g.plotTop + (g.plotH * i) / 6) + 0.5;
        gc.moveTo(0, py);
        gc.lineTo(w, py);
      }
      gc.stroke();

      gc.strokeStyle = COLORS.gridMajor;
      gc.beginPath();
      for (let x = g.plotW; x >= 0; x -= major) {
        const px = Math.floor(x) + 0.5;
        gc.moveTo(px, g.plotTop);
        gc.lineTo(px, g.plotBottom);
      }
      gc.stroke();

      // Isoelectric baseline: dashed, so it reads as a reference level and not
      // as part of the signal when the trace is flat on top of it.
      gc.strokeStyle = COLORS.baseline;
      gc.setLineDash([2, 5]);
      gc.beginPath();
      gc.moveTo(0, Math.floor(g.mid) + 0.5);
      gc.lineTo(w, Math.floor(g.mid) + 0.5);
      gc.stroke();
      gc.setLineDash([]);

      // Corner brackets. Cheap, and they frame the plot as an instrument
      // viewport rather than a rectangle of black.
      gc.strokeStyle = COLORS.bracket;
      const arm = 9;
      gc.beginPath();
      for (const [cx, cy, sx, sy] of [
        [0, g.plotTop, 1, 1],
        [w, g.plotTop, -1, 1],
        [0, g.plotBottom, 1, -1],
        [w, g.plotBottom, -1, -1],
      ] as const) {
        const px = Math.floor(cx) + (sx > 0 ? 0.5 : -0.5);
        const py = Math.floor(cy) + (sy > 0 ? 0.5 : -0.5);
        gc.moveTo(px + sx * arm, py);
        gc.lineTo(px, py);
        gc.lineTo(px, py + sy * arm);
      }
      gc.stroke();

      grid = c;
      gridKey = key;
    };

    /* --- sampling --------------------------------------------------------- */
    const push = (t: number) => {
      const { amp, index } = sampleAt(t);
      amps[head] = amp;
      stages[head] = index;
      head = (head + 1) % SAMPLES;

      // Beat detection from the signal itself. Everything downstream (ping
      // count, bloom, ripple, tick) hangs off this one crossing, so nothing can
      // disagree with the spike on screen.
      if (prevAmp <= R_PEAK && amp > R_PEAK) {
        pings++;
        bloom = 1;
        beatTimes.push(t);
        if (beatTimes.length > 8) beatTimes.shift();
        ripples.push(t);
        if (ripples.length > 3) ripples.shift();
      }
      prevAmp = amp;
    };

    /** Fill the buffer with the 4.3s of rhythm that precede `t0`. */
    const prefill = (t0: number) => {
      head = 0;
      prevAmp = 0;
      pings = 0;
      beatTimes.length = 0;
      ripples.length = 0;
      for (let i = SAMPLES; i > 0; i--) push(t0 - i * SAMPLE_MS);
      // The newest pre-filled beat is up to a full interval old, so do not let
      // it flash the panel on the first frame.
      bloom = 0;
      ripples.length = 0;
    };

    const stageOf = (slot: number): Stage => STAGE_ORDER[stages[slot] ?? 0] ?? "healthy";

    /* --- paint ------------------------------------------------------------ */
    const draw = (
      t: number,
      dt: number,
    ): { stage: Stage; gracePct: number; pings: number; index: number; progress: number } | null => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === 0 || h === 0) return null;

      const g = geometry(w, h);
      const { stage, tInStage, localT, index } = stageAt(t);
      const pct = graceAt(stage, tInStage);
      const alarm = stage === "lapsed" || stage === "rescue";

      if (index !== stageIndexSeen) {
        stageIndexSeen = index;
        flash = 1;
      }

      // Exponential ease toward the stage colour: framerate-independent, and it
      // cannot overshoot the way a fixed per-frame step can.
      const target = STAGE_RGB[stage];
      const k = 1 - Math.exp(-dt / 150);
      tint[0] += (target[0] - tint[0]) * k;
      tint[1] += (target[1] - tint[1]) * k;
      tint[2] += (target[2] - tint[2]) * k;
      const rgb = `${Math.round(tint[0])}, ${Math.round(tint[1])}, ${Math.round(tint[2])}`;
      const solid = `rgb(${rgb})`;

      ctx.clearRect(0, 0, w, h);

      /* --- ambient wash ---
         A single soft radial in the stage colour. It is what makes the panel
         feel lit from behind by the signal rather than printed. */
      const wash = ctx.createRadialGradient(
        g.plotW * 0.62,
        g.mid,
        0,
        g.plotW * 0.62,
        g.mid,
        Math.max(g.plotW, g.plotH) * 0.9,
      );
      wash.addColorStop(0, `rgba(${rgb}, ${0.055 + bloom * 0.035})`);
      wash.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, g.plotBottom);

      bakeGrid(w, h, Math.min(window.devicePixelRatio || 1, 2), g);
      if (grid) ctx.drawImage(grid, 0, 0, w, h);

      /* --- sensor sweep ---
         A wide, very faint band crossing the plot. Sub-perceptual on a single
         frame; over time it keeps the empty regions of a flatline alive. */
      if (!reduced) {
        const sweepX = ((t / 5400) % 1) * (g.plotW + 260) - 130;
        const sweep = ctx.createLinearGradient(sweepX - 130, 0, sweepX + 130, 0);
        sweep.addColorStop(0, "rgba(0, 0, 0, 0)");
        sweep.addColorStop(0.5, `rgba(${rgb}, 0.05)`);
        sweep.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = sweep;
        ctx.fillRect(0, g.plotTop, w, g.plotH);
      }

      /* --- delivered-ping ticks ---
         Each landed heartbeat leaves a mark that scrolls away with the trace:
         the visual equivalent of the contract's pingCount. */
      for (const bt of beatTimes) {
        const x = g.plotW - ((t - bt) / SAMPLE_MS) * g.step;
        if (x < -4 || x > g.plotW + 4) continue;
        const age = clamp01((t - bt) / (SAMPLE_MS * SAMPLES));
        const a = 0.5 * (1 - age);
        ctx.strokeStyle = `rgba(125, 211, 160, ${a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.floor(x) + 0.5, g.plotBottom - 7);
        ctx.lineTo(Math.floor(x) + 0.5, g.plotBottom);
        ctx.stroke();
        ctx.fillStyle = `rgba(125, 211, 160, ${a * 1.3})`;
        ctx.fillRect(Math.floor(x) - 1, g.plotBottom - 10, 3, 2);
      }

      /* --- the trace ------------------------------------------------------- */
      const path = new Path2D();
      for (let i = 0; i < SAMPLES; i++) {
        const x = i * g.step;
        const y = g.mid - (amps[(head + i) % SAMPLES] ?? 0) * g.amp;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }

      // The monitor dims as the treasury leaves: by the end of the rescue the
      // trace is a ghost of itself.
      const traceAlpha = stage === "rescue" ? 1 - 0.5 * localT : 1;

      // Area under the curve, so the signal has mass instead of being a
      // hairline. Vertical fade only: at this alpha the wash is ambient light,
      // and paying for a second composite pass to colour it per stage would not
      // be visible.
      const area = new Path2D(path);
      area.lineTo(g.plotW, g.mid);
      area.lineTo(0, g.mid);
      area.closePath();
      const fill = ctx.createLinearGradient(0, g.mid - g.amp * 1.1, 0, g.mid);
      fill.addColorStop(0, `rgba(${rgb}, ${0.22 * traceAlpha})`);
      fill.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = fill;
      ctx.fill(area);

      // Stroke gradient: colour sampled from the buffer's own stage history,
      // alpha ramped so older signal has decayed like phosphor. Sixteen stops
      // are enough — the interpolation between two of them across ~40px is
      // exactly the soft handover a stage change should have.
      const line = ctx.createLinearGradient(0, 0, g.plotW, 0);
      const STOPS = 16;
      for (let s = 0; s <= STOPS; s++) {
        const f = s / STOPS;
        const slot = (head + Math.round(f * (SAMPLES - 1))) % SAMPLES;
        const c = STAGE_RGB[stageOf(slot)];
        const a = (0.5 + 0.5 * Math.pow(f, 0.7)) * traceAlpha;
        line.addColorStop(f, `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`);
      }

      // Phosphor bloom in three widening passes. Canvas shadowBlur would do this
      // in one call and cost several frames a second; layered strokes are
      // effectively free and read the same.
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const glow = (1 + bloom * 0.85) * traceAlpha;
      for (const [width, alpha] of [
        [11, 0.05],
        [6, 0.09],
        [3, 0.16],
      ] as const) {
        ctx.strokeStyle = `rgba(${rgb}, ${alpha * glow})`;
        ctx.lineWidth = width;
        ctx.stroke(path);
      }

      ctx.strokeStyle = line;
      ctx.lineWidth = 1.6;
      ctx.stroke(path);

      /* --- read head ------------------------------------------------------- */
      const lastY = g.mid - (amps[(head + SAMPLES - 1) % SAMPLES] ?? 0) * g.amp;

      // Vertical hairline: the "now" edge of the recording.
      const head1 = ctx.createLinearGradient(0, g.plotTop, 0, g.plotBottom);
      head1.addColorStop(0, `rgba(${rgb}, 0)`);
      head1.addColorStop(0.5, `rgba(${rgb}, ${0.22 * traceAlpha})`);
      head1.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.strokeStyle = head1;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.floor(g.plotW) + 0.5, g.plotTop);
      ctx.lineTo(Math.floor(g.plotW) + 0.5, g.plotBottom);
      ctx.stroke();

      // Ripples: the same expanding ring the design system uses for a live dot,
      // fired by a delivered heartbeat. Consistency with `.pulse-dot` is the
      // point — one motif for "proof of life" across the whole product.
      for (const rt of ripples) {
        const p = (t - rt) / 780;
        if (p < 0 || p > 1) continue;
        const eased = 1 - Math.pow(1 - p, 2.4);
        ctx.strokeStyle = `rgba(${rgb}, ${0.3 * (1 - p)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(g.plotW, lastY, 3 + eased * 17, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = `rgba(${rgb}, ${(0.16 + bloom * 0.2) * traceAlpha})`;
      ctx.beginPath();
      ctx.arc(g.plotW, lastY, 7 + bloom * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = solid;
      ctx.globalAlpha = traceAlpha;
      ctx.beginPath();
      ctx.arc(g.plotW, lastY, 2.6 + bloom * 1.2, 0, Math.PI * 2);
      ctx.fill();
      // White core on the spike itself: the one moment worth the brightest
      // pixel on the panel.
      if (bloom > 0.35) {
        ctx.fillStyle = `rgba(232, 234, 235, ${(bloom - 0.35) * 1.4})`;
        ctx.beginPath();
        ctx.arc(g.plotW, lastY, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* --- evacuation wipe --------------------------------------------------
         The rescue is the one irreversible moment in the protocol, and a
         flatline alone does not carry it. An edge sweeps the length of the plot
         and the recording is cleared behind it — the vault emptying, in the same
         direction as the packets travelling along the gauge below. */
      if (stage === "rescue") {
        const p = clamp01(localT / 0.62);
        const x = p * p * (3 - 2 * p) * w;

        ctx.fillStyle = `rgba(12, 14, 16, ${0.88 * clamp01(localT / 0.2)})`;
        ctx.fillRect(0, g.plotTop, x, g.plotH);

        if (x > 0 && x < w) {
          const lead = ctx.createLinearGradient(x - 30, 0, x, 0);
          lead.addColorStop(0, `rgba(${COLORS.danger}, 0)`);
          lead.addColorStop(1, `rgba(${COLORS.danger}, 0.4)`);
          ctx.fillStyle = lead;
          ctx.fillRect(Math.max(0, x - 30), g.plotTop, Math.min(30, x), g.plotH);
          ctx.fillStyle = `rgba(${COLORS.danger}, 0.85)`;
          ctx.fillRect(Math.floor(x), g.plotTop, 1, g.plotH);
        }
      }

      /* --- alarm + transition wash ----------------------------------------- */
      if (alarm) {
        const pulse = 0.5 + 0.5 * Math.sin(t / 190);
        ctx.fillStyle = `rgba(${COLORS.danger}, ${0.03 + 0.035 * pulse})`;
        ctx.fillRect(0, g.plotTop, w, g.plotH);
        ctx.strokeStyle = `rgba(${COLORS.danger}, ${0.2 + 0.28 * pulse})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, g.plotTop + 0.5, w - 1, g.plotH - 1);
      }

      if (flash > 0) {
        ctx.fillStyle = `rgba(${rgb}, ${0.07 * flash})`;
        ctx.fillRect(0, g.plotTop, w, g.plotH);
      }

      /* --- grace gauge ------------------------------------------------------
         Depleting, never filling: this measures how much silence is left, and a
         progress bar would imply the opposite. Tall enough to read as a gauge
         being consumed rather than as a divider between two graphics. */
      const gy = g.gaugeY;
      const gh = g.gaugeH;
      const gmid = gy + gh / 2;
      const fillW = w * clamp01(pct / 100);
      const critical = pct > 0 && pct <= 22;
      const gaugeRGB = critical || alarm ? COLORS.danger : rgb;

      trackPath(ctx, 0.5, gy + 0.5, w - 1, gh - 1, 4);
      ctx.fillStyle = COLORS.gaugeTrack;
      ctx.fill();

      ctx.save();
      trackPath(ctx, 0.5, gy + 0.5, w - 1, gh - 1, 4);
      ctx.clip();

      // Spent remainder: a dim continuation, so the gauge shows what is gone as
      // well as what is left.
      ctx.fillStyle = `rgba(${gaugeRGB}, 0.07)`;
      ctx.fillRect(fillW, gy, w - fillW, gh);

      if (fillW > 0.5) {
        const bar = ctx.createLinearGradient(0, 0, Math.max(fillW, 1), 0);
        bar.addColorStop(0, `rgba(${gaugeRGB}, 0.55)`);
        bar.addColorStop(1, `rgba(${gaugeRGB}, 1)`);
        ctx.fillStyle = bar;
        ctx.fillRect(0, gy, fillW, gh);

        // A highlight running along the healthy bar. The countdown is live even
        // when the number is not moving much, and this is what says so.
        if (!reduced && stage === "healthy" && fillW > 60) {
          const sx = ((t / 1900) % 1) * (fillW + 140) - 70;
          const sheen = ctx.createLinearGradient(sx - 70, 0, sx + 70, 0);
          sheen.addColorStop(0, "rgba(255, 255, 255, 0)");
          sheen.addColorStop(0.5, "rgba(255, 255, 255, 0.13)");
          sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = sheen;
          ctx.fillRect(0, gy, fillW, gh);
        }
      } else {
        // Empty and armed. Hatched, not filled: a flat red bar spanning the
        // whole track reads as "full", which is the exact opposite of what an
        // exhausted grace period means. The hatch drifts toward the deadline.
        ctx.fillStyle = `rgba(${COLORS.danger}, 0.07)`;
        ctx.fillRect(0, gy, w, gh);
        const drift = reduced ? 0 : (t / 130) % 13;
        ctx.strokeStyle = `rgba(${COLORS.danger}, ${0.4 + 0.18 * Math.sin(t / 240)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = -13 + drift; x < w + gh; x += 13) {
          ctx.moveTo(x, gy + gh);
          ctx.lineTo(x + gh, gy);
        }
        ctx.stroke();
      }

      // Quartile seams, cut through the fill so the bar reads as measured.
      ctx.fillStyle = COLORS.gaugeSeam;
      for (const q of [0.25, 0.5, 0.75]) ctx.fillRect(Math.floor(w * q), gy, 1, gh);
      ctx.restore();

      ctx.strokeStyle = `rgba(${gaugeRGB}, 0.22)`;
      ctx.lineWidth = 1;
      trackPath(ctx, 0.5, gy + 0.5, w - 1, gh - 1, 4);
      ctx.stroke();

      // Leading edge: exactly where the countdown has got to.
      if (fillW > 1.5 && pct > 0) {
        const ex = Math.min(w - 1.5, fillW);
        const halo = ctx.createRadialGradient(ex, gmid, 0, ex, gmid, 13);
        halo.addColorStop(0, `rgba(${gaugeRGB}, ${critical ? 0.5 : 0.34})`);
        halo.addColorStop(1, `rgba(${gaugeRGB}, 0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(ex - 13, gy - 8, 26, gh + 16);
        ctx.fillStyle = COLORS.edge;
        ctx.fillRect(ex - 1, gy, 2, gh);
      }

      // Deadline marker: the far right of the gauge is the moment the switch
      // becomes executable by anyone.
      const dead = pct <= 0;
      ctx.fillStyle = dead
        ? `rgba(${COLORS.danger}, ${0.65 + 0.35 * Math.sin(t / 170)})`
        : COLORS.deadline;
      ctx.fillRect(w - 1, gy - 6, 1, gh + 12);
      ctx.beginPath();
      ctx.moveTo(w - 4.5, gy - 7);
      ctx.lineTo(w, gy - 11);
      ctx.lineTo(w, gy - 3);
      ctx.closePath();
      ctx.fill();

      /* --- rescue flow -----------------------------------------------------
         Packets travel the length of the gauge to the deadline marker: the
         treasury leaving for the recovery address. Permissionless execution is
         the protocol's whole point, so it gets the most kinetic moment. */
      if (stage === "rescue") {
        let landed = 0;
        for (let i = 0; i < 4; i++) {
          const p = clamp01(localT * 1.55 - i * 0.15);
          if (p <= 0) continue;
          if (p >= 1) {
            landed++;
            continue;
          }
          const eased = 1 - Math.pow(1 - p, 2.2);
          const x = eased * w;
          const a = 0.9 - 0.35 * p;

          const trail = ctx.createLinearGradient(Math.max(0, x - 78), 0, x, 0);
          trail.addColorStop(0, `rgba(${COLORS.danger}, 0)`);
          trail.addColorStop(1, `rgba(${COLORS.danger}, ${0.5 * a})`);
          ctx.strokeStyle = trail;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(Math.max(0, x - 78), gmid);
          ctx.lineTo(x, gmid);
          ctx.stroke();

          ctx.fillStyle = `rgba(${COLORS.danger}, ${a})`;
          ctx.beginPath();
          ctx.arc(x, gmid, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(232, 234, 235, ${0.75 * a})`;
          ctx.beginPath();
          ctx.arc(x, gmid, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (landed > 0) {
          const burst = ctx.createRadialGradient(w, gmid, 0, w, gmid, 22);
          burst.addColorStop(0, `rgba(${COLORS.danger}, ${0.1 * landed})`);
          burst.addColorStop(1, `rgba(${COLORS.danger}, 0)`);
          ctx.fillStyle = burst;
          ctx.fillRect(w - 22, gmid - 22, 22, 44);
        }
      }

      return {
        stage,
        gracePct: Math.round(Math.max(0, pct)),
        pings,
        index,
        // Quantised to 5% steps. The stage track animates its connector fill
        // with a CSS transition, so it does not need frame-accurate values, and
        // coarse steps keep the surrounding DOM from re-rendering every tick.
        progress: Math.round(localT * 20) / 20,
      };
    };

    /* --- resize -----------------------------------------------------------
       Assigning canvas.width/height resets the drawing surface AND the
       transform, so anything already painted is wiped. The animated path
       repaints every frame and never notices, but the reduced-motion path
       paints exactly once, and ResizeObserver fires asynchronously after that
       single paint — which left the canvas permanently blank for anyone with
       reduced motion enabled. Every resize therefore repaints immediately. */
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gridKey = ""; // geometry moved, so the baked lattice is stale
      draw(elapsed, 16);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    if (reduced) {
      // One static frame: a full buffer of resting complexes, countdown near
      // full, no animation of any kind.
      prefill(BEAT_MS * 0.62);
      elapsed = BEAT_MS * 0.62;
      resize();
      const still = draw(elapsed, 16);
      if (still) setReadout(still);
      return () => observer.disconnect();
    }

    /* --- loop -------------------------------------------------------------
       Paused when the panel is off-screen or the tab is hidden. The hero
       scrolls away within one screen, and burning a rAF loop on a diagram
       nobody can see is the kind of thing that shows up as battery drain. */
    let raf = 0;
    let onScreen = true;
    let running = false;

    const frame = (ts: number) => {
      // Clamped delta: a long pause (tab switch, breakpoint) must not fast
      // forward the cycle or force a hundred catch-up samples.
      const dt = lastTs === 0 ? 16 : Math.min(50, ts - lastTs);
      lastTs = ts;
      elapsed += dt;

      sampleAcc += dt;
      let guard = 0;
      while (sampleAcc >= SAMPLE_MS && guard++ < 8) {
        sampleAcc -= SAMPLE_MS;
        push(elapsed - sampleAcc);
      }

      bloom = Math.max(0, bloom - dt / 420);
      flash = Math.max(0, flash - dt / 620);

      const next = draw(elapsed, dt);
      if (next && ts - lastReadoutAt > 250) {
        lastReadoutAt = ts;
        setReadout((prev) =>
          prev.stage === next.stage &&
          prev.gracePct === next.gracePct &&
          prev.pings === next.pings &&
          prev.progress === next.progress
            ? prev
            : next,
        );
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTs = 0; // resume without crediting the paused time
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };
    const sync = () => {
      if (onScreen && !document.hidden) start();
      else stop();
    };

    const seen = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        sync();
      },
      { rootMargin: "120px" },
    );
    seen.observe(canvas);
    document.addEventListener("visibilitychange", sync);

    prefill(0);
    resize();
    sync();

    return () => {
      stop();
      seen.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const { stage, gracePct, pings, index, progress } = readout;
  const copy = STAGE_COPY[stage];
  const rgb = STAGE_RGB[stage].join(", ");

  return (
    <figure className={clsx("m-0", className)}>
      {/* The panel is lit by the signal: border and outer glow follow the stage
          colour, eased over most of a second so the shift is felt rather than
          seen. Inline styles because the value is a live rgba(), which Tailwind
          cannot express as a static class. */}
      <div
        className="relative overflow-hidden rounded-md border bg-ink-900 transition-[border-color,box-shadow] duration-700"
        style={{
          borderColor: `rgba(${rgb}, 0.2)`,
          boxShadow: `0 24px 80px -48px rgba(${rgb}, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.02)`,
        }}
      >
        {/* Emission line along the top edge. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px transition-opacity duration-700"
          style={{
            background: `linear-gradient(90deg, transparent, rgba(${rgb}, 0.45) 25%, rgba(${rgb}, 0.45) 75%, transparent)`,
          }}
        />

        {/* Instrument header */}
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className={clsx("pulse-dot", copy.tone)} aria-hidden />
            <span className={clsx("text-[12px] font-medium", copy.tone)}>{copy.label}</span>
          </div>
          <div className="flex items-center gap-5">
            <Readout label="Grace" value={`${gracePct}%`} tone={copy.tone} />
            <Readout label="Pings" value={String(pings)} className="hidden sm:flex" />
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className="block h-[200px] w-full sm:h-[264px]"
          role="img"
          aria-label="Animated diagram of the Nostrom protocol lifecycle: an agent's heartbeat keeps a countdown full; when the heartbeat stops the countdown drains to zero and the treasury is evacuated to a recovery address."
        />

        {/* Caption strip: narrates the stage in protocol terms */}
        <div className="flex min-h-[44px] items-center justify-between gap-4 border-t border-line px-4 py-2.5">
          <p className="tnum text-[11px] leading-relaxed text-text-dim" aria-live="off">
            {copy.detail}
          </p>
          <span className="label hidden shrink-0 sm:block" aria-hidden>
            {index + 1}/{STAGE_ORDER.length}
          </span>
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
                            state === "past"
                              ? "100%"
                              : state === "active"
                                ? `${progress * 100}%`
                                : "0%",
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

function Readout({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-baseline gap-2", className)}>
      <span className="label">{label}</span>
      <span className={clsx("tnum text-[12px]", tone ?? "text-text")}>{value}</span>
    </div>
  );
}
