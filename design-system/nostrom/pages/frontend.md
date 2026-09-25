# Nostrom — Protocol Design System

> **Scope:** This file overrides `design-system/nostrom/MASTER.md` for **all** Nostrom
> surfaces — the landing page and the vault console alike. Per the Master file's own
> rule ("if that file exists, its rules **override** this Master file"), the values
> below are authoritative. `MASTER.md` is left unmodified.

**Applies to:** `frontend/` (landing page + application)
**Implemented in:** `frontend/src/styles/index.css` (`@theme` block)
**Last verified:** 2026-09-25

---

## Why this overrides MASTER.md

`MASTER.md` was generated with `Category: General` and describes its palette as
*"AI purple + generation pink"* — `#7C3AED` primary, `#EC4899` accent, on a light
`#FAF5FF` background, with Outfit/Work Sans typography.

That is a generic SaaS/AI identity. It was not derived from Nostrom, and it conflicts
with the product in three concrete ways:

| MASTER.md | Problem for Nostrom |
|---|---|
| Purple/pink accent pair | Carries no meaning here. Nostrom's core states are *alive / expiring / lapsed*, which map naturally to green/amber/red. Spending the accent on brand colour would leave status to be encoded some other way. |
| Light `#FAF5FF` background | The product is a monitoring instrument that users leave open to watch a countdown. A bright lilac page is the wrong register and worse for long dwell. |
| Outfit + Work Sans | No monospace in the stack. Every primary value in this UI is an address, a wei amount, a timestamp or a countdown. Those need tabular figures, or digits jitter as they tick and hashes become unreadable. |

The replacement is derived from what the contracts actually do.

---

## Derivation: the protocol *is* the visual language

Nostrom is a countdown that a proof-of-life signal keeps resetting. Read
`contracts/NostromFactory.sol` and the whole interface follows:

| Contract fact | Design consequence |
|---|---|
| `ping()` resets `lastPingTime` | Heartbeat/ECG trace as the primary motif; a pulsing dot for the live state |
| `timeUntilTrigger()` drains toward a deadline | A **depleting** gauge, not a filling progress bar — it counts toward failure, not completion |
| Three mutually exclusive states + one terminal state | Colour is reserved entirely for status semantics |
| Every meaningful value is an address / amount / timestamp | Monospace with tabular figures for all on-chain data |
| `executeDeadManSwitch()` is permissionless | Execution surfaces are shown to everyone, styled as consequential (danger), never hidden |

**Metaphor: a patient monitor.** Deliberately *not* used: floating coins, chain links,
node graphs, glassmorphism, neon glow, gradient meshes.

---

## Colour

Near-black instrument base. **Colour is semantic, never decorative** — a hue on screen
always means something about vault state.

### Surfaces

| Token | Hex | Use |
|---|---|---|
| `--color-ink-950` | `#08090A` | Page |
| `--color-ink-900` | `#0C0E10` | Panel |
| `--color-ink-850` | `#111417` | Raised panel, secondary button |
| `--color-ink-800` | `#16191D` | Input, inset, disabled surface |
| `--color-ink-750` | `#1C2024` | Hover on raised |

### Hairlines

| Token | Hex | Use |
|---|---|---|
| `--color-line` | `#1D2226` | Default 1px border, dividers |
| `--color-line-strong` | `#2B3238` | Emphasised border, input border |

### Text

| Token | Hex | Contrast on ink-950 | Use |
|---|---|---|---|
| `--color-text` | `#E8EAEB` | 15.8:1 | Primary |
| `--color-text-dim` | `#949CA3` | 7.2:1 | Secondary, body copy |
| `--color-text-faint` | `#7D858C` | **5.3:1** | 11px labels, hints |

> `text-faint` was originally `#646C73`, which measured **3.74:1** and failed WCAG AA
> for 11px text. It was raised to `#7D858C` after measurement. It also clears AA on
> the lightest surface it lands on (`ink-800`, 4.7:1). **Do not darken it without
> re-measuring** — `frontend/scripts/verify-ui.cjs` computes real ratios for every
> text node on every route.

### Status (the only chromatic tokens)

| Token | Hex | Meaning — tied to contract state |
|---|---|---|
| `--color-signal` | `#7DD3A0` | **Alive.** `isExecutable() == false`, comfortable grace. Doubles as the single brand accent. |
| `--color-warn` | `#E3B341` | **Expiring.** UI-only band: grace below 20% of `timeoutPeriod`. |
| `--color-danger` | `#E5534B` | **Executable** or **Triggered**. The switch is live, or has fired. |

`--color-signal-dim` / `-warn-dim` / `-danger-dim` are border-only companions.

**Accessibility rule:** colour is never the sole channel. Every status badge carries its
text label (`Alive`, `Expiring`, `Executable`, `Triggered`), and the alive state adds
motion (pulsing ring) on top of hue.

---

## Typography

Two families. Both on Google Fonts.

| Role | Family | Notes |
|---|---|---|
| Display & UI | **Inter** | `.display` applies `-0.028em` tracking and `text-wrap: balance`. Tight tracking at large sizes reads engineered rather than friendly. |
| All on-chain data | **IBM Plex Mono** | `.tnum` enables `font-variant-numeric: tabular-nums` so countdowns do not jitter and columns of balances align. |

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
```

### Utility classes

| Class | Definition |
|---|---|
| `.display` | 600 weight, `-0.028em` tracking, 1.04 line-height, balanced wrap |
| `.label` | IBM Plex Mono, **11px**, 500, `0.11em` tracking, uppercase, `text-faint` |
| `.tnum` | IBM Plex Mono + tabular figures |

> `.label` was 10px. Raised to 11px: it carries real information (field names, units,
> column headers), so legibility beats compactness.

---

## Shape, spacing, motion

**Radii are tight** — infrastructure, not consumer app: `3px / 4px / 6px / 8px`.
Nothing is pill-shaped except status dots and the grace track.

**Spacing** follows Tailwind's 4px base (density 6/10, matching MASTER.md's standard).

**Hierarchy comes from type and space, not from stacked containers.** A `Panel` exists
to *group* related facts; individual readings are label/value rows inside one panel,
never a card each.

**No shadows** except on overlays (dialog, dropdown), where they establish the top layer.
MASTER.md's four-level shadow scale is unused — on a near-black surface, shadows read as
smudges. Elevation is expressed by surface lightness instead.

### Motion

Purposeful only. Three sanctioned animations:

| Animation | Purpose |
|---|---|
| `.pulse-dot` ring | The live heartbeat. The one justified *repeating* animation — it is the protocol's core signal. |
| `.indeterminate` bar | Transaction in the mempool. Indeterminate on purpose: confirmation time is unknown and must not be implied. |
| `.reveal` | One-shot scroll reveal, unobserved after firing. A reveal that replays is a distraction. |

The hero diagram is a single `requestAnimationFrame` canvas loop, not animated DOM.
Its readout state updates at ~4Hz, not per frame.

**`prefers-reduced-motion: reduce`** disables the pulse ring, the trace sweep and all
transitions, and renders the final state of every reveal. The hero canvas paints one
static healthy frame and stops its loop entirely.

---

## Component notes that differ from MASTER.md

| MASTER.md spec | Nostrom | Reason |
|---|---|---|
| `.btn-primary` background `#EC4899` | `--color-signal` with `--color-ink-950` text | Pink has no protocol meaning; the primary action should read as "healthy path" |
| `border-radius: 8px` buttons | `4px` | Tighter register |
| `.card` with `translateY(-2px)` hover | No lift | MASTER.md's own anti-pattern list forbids layout-shifting hovers; panels are not clickable |
| `.card` `cursor: pointer` | Only on genuinely clickable elements | A pointer cursor on a static panel is a false affordance |
| Disabled = reduced opacity | Explicit disabled surface per variant | Fading a filled button while keeping dark text measured **1.03:1** — effectively invisible. Each variant now defines a legible disabled state. |

---

## Verification

Both harnesses run real Chrome against the production build:

```bash
# Layout, tap targets, text size, and measured WCAG contrast
# across 13 routes x 3 viewports (1440 / 768 / 375)
node frontend/scripts/verify-ui.cjs

# Six end-to-end wallet + transaction flows against a live chain
node frontend/scripts/verify-flows.cjs
```

Current status: **21 page loads, 0 findings** · **42 flow assertions, 0 failures**.

### Checks enforced

- No horizontal scroll at 375px; no element escaping the viewport outside an
  intentional scroll container
- Every standalone interactive target ≥ 24×24px (WCAG 2.2 AA 2.5.8), with inline
  prose links exempted per the standard
- No visible text below 10.5px
- Computed contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text, resolving alpha
  backgrounds up the ancestor chain
- Zero console errors, page errors, or failed requests
- Transaction UI never shows success before a mined receipt with
  `status === "success"` — verified against a real 4-second-block mempool
