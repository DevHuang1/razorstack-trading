# Remotion Video Prompt — Razorstack Trading

## Overview

Create a **60-90 second promotional/explainer video** for Razorstack Trading using
[Remotion](https://www.remotion.dev/). The video showcases an autonomous AI-powered
trading desk where a team of specialist AI agents research, debate, and execute trades.

The tone is **premium fintech** — think Bloomberg Terminal meets sci-fi command center.
Dark, moody, high-contrast with glowing accent colors. Every frame should feel alive.

---

## Tech Setup

- **Framework**: Remotion (React video renderer)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (matches the project's existing stack)
- **Fonts**: Geist Sans + Geist Mono from Google Fonts (`geist` package)
- **Resolution**: 1920×1080 (16:9), 60fps
- **Output**: MP4 (H.264)

---

## Color Palette

Use these exact hex values to stay consistent with the live app:

| Token | Hex | Usage |
|---|---|---|
| Background | `#080b13` | Page/card backgrounds |
| Panel | `#161b27` | Raised surfaces |
| Border | `#252e3f` | Subtle dividers |
| Text Primary | `#ededed` | Headings, body |
| Text Muted | `#787b86` | Labels, captions |
| Violet (Primary) | `#8b5cf6` | CTAs, highlights, logo |
| Cyan (Secondary) | `#06b6d4` | Gradient partner, data accents |
| Emerald (Bull) | `#34d399` | Buy signals, Atlas agent |
| Rose (Bear) | `#fb7185` | Risk warnings, Mara agent |
| Amber (Sage) | `#f59e0b` | News/alerts, Sage agent |
| Sky (Vector) | `#38bdf8` | Market data, Vector agent |
| Violet (North) | `#c084fc` | CIO synthesis, North agent |

---

## Scene Breakdown

### Scene 1 — Cold Open (0s–5s)

**Visual**: Pure black. A single violet dot appears center screen. It pulses once,
then explodes outward into the animated grid of dots from the landing page canvas
(purple dots in a grid pattern, pulsing from center). Two large blurred orbs drift
slowly — one violet (`#8b5cf6`), one cyan (`#06b6d4`).

**Text**: Fade in the logo mark — a circle with gradient `from-violet-600 to-cyan-500`
containing a white letter "R". Scale from 0.5 to 1.0 with a spring animation.

**Audio**: Low bass hit + subtle digital hum.

---

### Scene 2 — Title Card (5s–10s)

**Visual**: The grid continues animating in the background. The "R" logo shrinks and
moves to the left. Text slides in from the right:

```
RAZORSTACK TRADING
```

Below it, smaller muted text fades in:

```
Autonomous AI trading desk
```

Use Geist Sans. Title: `text-5xl font-bold text-[#ededed]`. Subtitle: `text-xl text-[#787b86]`.

**Transition**: Quick fade to Scene 3.

---

### Scene 3 — The Five Agents (10s–25s)

**Visual**: Show 5 agent "mascot" orbs arranged in a shallow arc across the screen.
Each orb is a **morphing blob** (use CSS `border-radius` animation like the live
`AgentMascot.tsx` — oscillating between organic shapes). Each has:

1. A colored **ambient glow** behind it (its accent color, blurred 20px)
2. A **shimmer** highlight rotating inside
3. The agent's **name** below in small caps

The orbs appear one by one from left to right with a staggered spring animation
(delay 0.3s between each):

| Order | Agent | Mascot | Color | Hex |
|---|---|---|---|---|
| 1 | **Sage** | Owl | Amber | `#f59e0b` |
| 2 | **Vector** | Hawk | Sky | `#38bdf8` |
| 3 | **Atlas** | Bull | Emerald | `#34d399` |
| 4 | **Mara** | Bear | Rose | `#fb7185` |
| 5 | **North** | Compass | Violet | `#c084fc` |

**Animation**: As each orb appears, briefly flash its mascot icon (owl, hawk, bull,
bear, compass) as a white silhouette inside the blob, then fade to the colored blob
state.

**Text**: After all 5 are visible, a subtitle fades in at the bottom:

```
5 Specialist agents trading as one
```

---

### Scene 4 — The Pipeline Flow (25s–40s)

**Visual**: This is the money shot — show the **research pipeline as a data flow
animation**.

Layout: A horizontal flowchart with 5 nodes connected by glowing animated lines.

```
[Sage] → [Vector] → [Atlas] ─┐
                               ├→ [North]
              [Mara] ─────────┘
```

**Step-by-step animation**:

1. **Sage** (amber) lights up. A small stream of particles flows right → **Vector**
   (sky) activates. Particles flow right → node splits into two paths.

2. **Atlas** (emerald) and **Mara** (rose) light up **simultaneously** (parallel).
   Show two streams of particles flowing toward the merge point. The Atlas stream is
   green-tinted, Mara stream is red-tinted. They visually "debate" — briefly flash
   opposing arrows or clashing particles at the merge.

3. Both streams merge → **North** (violet) activates with a brighter glow. North's
   blob pulses strongly once (the synthesis moment).

4. Below North, a card slides up showing:
   ```
   THESIS: BUY NVDA
   Confidence: 87%
   ```
   Green text for BUY, with a confidence bar filling to 87%.

**Style**: The connecting lines should be animated SVG paths with a `stroke-dashoffset`
animation (dashed line flowing in the direction of data). Each node is a small rounded
rectangle (`border-radius: 12px`) with the agent's color as border and a dark fill.

---

### Scene 5 — Risk Gate (40s–50s)

**Visual**: The thesis card from Scene 4 slides to the left. A **shield icon** (line
art, violet stroke) appears center-right. The thesis card passes *through* the shield.

As it passes through, a vertical checklist animates in:

```
✓ Daily loss check    ✓ Drawdown check
✓ Position cap        ✓ Sector cap
✓ Cash reserve        ✓ Correlation limit
```

Each checkmark draws itself (SVG stroke animation) with a brief green flash. All pass.

Below the shield, a green status bar animates in:

```
RISK STATUS: APPROVED
```

**Style**: The shield should have a subtle breathing glow (opacity oscillation on the
stroke). Checkmarks appear with 0.2s stagger. The "APPROVED" text uses a green
gradient (`from-emerald-400 to-emerald-500`).

---

### Scene 6 — Execution & Terminal (50s–60s)

**Visual**: Split into two panels (like the Quant Terminal layout):

**Left panel (60% width)**: An animated **SVG candlestick chart**.
- Generate ~30 synthetic candlesticks (mix of green `#26a69a` and red `#ef5350`).
- Candles draw in from left to right with a staggered animation (each candle grows
  from its open price to close, wick extends simultaneously).
- Volume bars appear below as semi-transparent bars.
- A thin SMA-20 line (cyan `#06b6d4`) draws itself across the chart.
- A subtle "LIVE" indicator pulses in the top-left corner (red dot + "LIVE" text).

**Right panel (40% width)**: An **order card** animates in:
```
BUY 100 NVDA
TYPE: LIMIT
PRICE: $124.50
STATUS: FILLED ✓
```
The "FILLED ✓" status appears with a green flash after a brief "SUBMITTED → FILLED"
animation.

Below the order, a mini P&L counter starts at `$0.00` and counts up to `+$1,247.30`
with the text turning green.

---

### Scene 7 — Stats Flash (60s–70s)

**Visual**: Quick-cut montage of 4 stat cards appearing one after another (0.5s
each), filling a 2×2 grid:

| Stat | Value | Color |
|---|---|---|
| Agents | `5` | Violet `#8b5cf6` |
| Signal Components | `5 weighted` | Sky `#38bdf8` |
| Risk Checks | `6 gates` | Emerald `#34d399` |
| Crisis Ready | `∞` | Rose `#fb7185` |

Each card is a dark panel (`#161b27`) with the number in large bold Geist Mono and
the label below in muted text. Cards appear with a scale-up spring animation.

---

### Scene 8 — Architecture Diagram (70s–80s)

**Visual**: A simplified version of the 3-layer architecture, rendered as glowing
stacked panels:

```
┌──────────────────────────┐
│    RESEARCH LAYER        │  ← Violet glow
│  Sage · Vector · Atlas   │
│  Mara · North            │
├──────────────────────────┤
│     QUANT LAYER          │  ← Cyan glow
│  Signals · Strategies    │
│  Regime · Risk Metrics   │
├──────────────────────────┤
│    EXECUTION LAYER       │  ← Emerald glow
│  Risk Gate · Orders      │
│  Alpaca Bridge           │
└──────────────────────────┘
```

**Animation**: Each layer slides in from the left with 0.3s stagger. A vertical
"data flow" line (animated dashes) connects them on the right side, flowing downward.
Each layer has a subtle colored glow matching its accent.

---

### Scene 9 — CTA & Closing (80s–90s)

**Visual**: All elements fade out. The background returns to the animated grid from
Scene 1 (purple dots, blurred orbs). The "R" logo circle scales up center screen.

Below it, text fades in:

```
Put the desk to work.
```

Geist Sans, `text-3xl font-semibold text-[#ededed]`.

After 1.5s, a second line fades in:

```
razorstack.ai
```

`text-lg text-[#787b86]`.

**Final frame**: Hold for 2s, then fade to black.

---

## Animation Principles

1. **Spring physics**: Use Remotion's `spring()` for all entrances (scale, position).
   Config: `{ damping: 12, stiffness: 120, mass: 0.8 }` for bouncy elements,
   `{ damping: 20, stiffness: 200 }` for snappy elements.

2. **Stagger**: All multi-element reveals use 0.2–0.3s stagger delays.

3. **Easing**: Use `Easing.bezier(0.25, 0.1, 0.25, 1)` for smooth linear transitions.

4. **Glow effects**: Use CSS `box-shadow` with large spread + blur in the accent color
   (e.g., `0 0 40px 10px rgba(139, 92, 246, 0.3)` for violet glow).

5. **Particles/data flow**: Small circles (3-5px) moving along SVG paths with
   `stroke-dashoffset` animation or absolute-positioned elements moving via
   `interpolate()`.

6. **Text reveals**: Use `clipPath` animation (`inset(0 100% 0 0)` → `inset(0 0% 0 0)`)
   for typewriter-like reveals without actual character-by-character rendering.

7. **Blob morphing**: Oscillate `border-radius` values between organic shapes using
   `Math.sin()` within `interpolate()`, matching the patterns in
   `src/components/AgentMascot.tsx`.

---

## File Structure

```
remotion/
├── src/
│   ├── Root.tsx                    # Remotion root, register composition
│   ├── RazorstackVideo.tsx         # Main composition component
│   ├── scenes/
│   │   ├── ColdOpen.tsx            # Scene 1
│   │   ├── TitleCard.tsx           # Scene 2
│   │   ├── AgentShowcase.tsx       # Scene 3
│   │   ├── PipelineFlow.tsx        # Scene 4
│   │   ├── RiskGate.tsx            # Scene 5
│   │   ├── ExecutionTerminal.tsx   # Scene 6
│   │   ├── StatsFlash.tsx          # Scene 7
│   │   ├── ArchitectureDiagram.tsx # Scene 8
│   │   └── ClosingCTA.tsx          # Scene 9
│   ├── components/
│   │   ├── AgentOrb.tsx            # Morphing blob mascot (reusable)
│   │   ├── GlowingCard.tsx         # Dark card with colored glow border
│   │   ├── AnimatedCheckmark.tsx   # SVG checkmark draw animation
│   │   ├── CandlestickChart.tsx    # SVG candlestick renderer
│   │   ├── DataFlowLine.tsx        # Animated dashed connecting line
│   │   ├── ParticleStream.tsx      # Moving dots along a path
│   │   ├── PulsingIndicator.tsx    # "LIVE" dot + text
│   │   └── AnimatedCounter.tsx     # Number counting up animation
│   ├── lib/
│   │   ├── colors.ts               # All color constants
│   │   ├── springs.ts              # Reusable spring configs
│   │   ├── agents.ts               # Agent metadata (name, color, mascot)
│   │   └── data.ts                 # Synthetic candlestick + signal data
│   └── styles/
│       └── globals.css             # Tailwind imports, font setup
├── public/
│   └── fonts/                      # Geist font files (if self-hosting)
├── tailwind.config.ts
├── remotion.config.ts
├── package.json
└── tsconfig.json
```

---

## Dependencies

```json
{
  "dependencies": {
    "@remotion/cli": "4.0.0",
    "@remotion/player": "4.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "remotion": "4.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "geist": "^1.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.0.0"
  }
}
```

---

## Key Implementation Notes

1. **No external assets needed**: Everything is generated via code (SVG, CSS, canvas).
   No images, audio files, or video clips required.

2. **Blob morphing reference**: See `src/components/AgentMascot.tsx` for the exact
   `border-radius` keyframe patterns. Replicate the same 5-state animation system
   (idle, thinking, speaking, success, error) for each agent orb.

3. **Candlestick data**: Generate procedurally using a seeded random walk in
   `lib/data.ts`. Start price ~124.50, drift +0.02/bar, vol 0.015. Green candle when
   close > open, red when close < open.

4. **Text styling**: Always use `font-family: var(--font-geist-sans)` for headings and
   `font-family: var(--font-geist-mono)` for numbers/data.

5. **Rendering**: Use `npx remotion render RazorstackTrading out.mp4` for final output.
   Use `npx remotion studio` for preview during development.

6. **Composition duration**: At 60fps, 90 seconds = 5400 frames. Define each scene's
   frame range in `Root.tsx` using `<Series>` or manual `<Sequence>` components.
