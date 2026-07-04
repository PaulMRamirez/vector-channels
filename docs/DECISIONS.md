# Decisions

Why Vector Channels looks and works the way it does. Append new decisions here as they're made. For the current state of the code, see `ARCHITECTURE.md`.

> **Naming:** the project was originally "Vector Rails" with "main track" and "rails" as the central path and the parallel offset paths. It was later renamed to **Vector Channels** with *primary channel* and *channels* respectively, matching standard telemetry vocabulary. The History section below preserves the original terminology used during prototype iteration.

## Scope

### Vector Channels is a spatial correlator, not a full ops tool

The AMMOS ecosystem already has excellent tools: MMGIS for spatial context, PlanDev for temporal planning, OpenMCT for dashboarding, Yamcs for telemetry. Vector Channels doesn't try to replace any of them.

The specific gap: **how multiple telemetry variables correlate spatially along a trajectory.** That's the problem Vector Channels solves. Every feature decision is tested against this: *would this feature be better served by MMGIS or PlanDev?* If yes, link out instead of building.

This scope discipline enables tighter design, cleaner code, and honest coexistence with tools users already have. Deferred to MMGIS: per-variable graphs, timeline scrubbing, base maps. Deferred to PlanDev: activity editing, constraint authoring, simulation. See `COMPETITIVE.md` for the full landscape.

## Encoding design

### Why the channels metaphor

A central path with parallel offset paths is a legible way to show multi-channel data tied to a common axis. Properties that matter:

- All channels share the same spatial anchor (the primary channel is the reference).
- Time/position correspondence is preserved across channels — samples at position *p* on the primary channel line up with samples at position *p* on offset channels because the offset is perpendicular.
- Reading a single channel gives you one variable's story along the path.
- Reading across the width at a single position gives you the multivariate snapshot.

The vocabulary borrows from telemetry — operators already think of each measurement stream as a "channel," so calling the visual lanes "channels" matches their mental model.

### Pixel-stable perpendicular offset in screen space

Essential. If channels offset in world coordinates, they'd appear closer together at low zoom and farther apart at high zoom, breaking the "these are together" visual grouping. Screen-space offsetting keeps the 9-pixel gap at 9 pixels regardless of zoom.

The consequence: tangents must be computed from projected screen points, not lat/lng. This is enforced in the `core` renderer.

### Nine encoding channels, strictly orthogonal

| Encoding | Carries | Geometric role |
|---|---|---|
| Primary color | One continuous variable | Fill color of the centerline strip |
| Primary width | One continuous variable (typically quality) | Thickness of the strip |
| Primary opacity | One continuous variable (uncertainty) | Fades the strip fill; leaves the alert band opaque |
| Flow | One continuous variable (rate) | Animated chevrons on the path; speed and heading encode rate and direction |
| Channels (ordered) | N continuous variables | Polylines offset from the primary |
| Alerts (watchlist) | Worst-status across N watched variables | Stroke band beyond the channels, shown only on warn/critical segments |
| State overlay | One discrete state series (overrides primary color) | Replaces primary color with mode color |
| Event glyphs | Discrete events (point in time) | Markers on the primary channel |
| Activity highlight | Ranges (start/end pairs) | Hover-triggered bright overlay |

The non-competition rule: no two encodings occupy the same geometric territory for overlapping semantic purposes. Violating this makes the tool visually muddled.

### One ordered channels list, not tiered slots

Prototype v1.2–v2.3 had "flankers" (up to 2 close to the centerline) and "accents" (unlimited, further out). In practice they behaved identically — same stroke width, same rendering, same encoding. Only offset distance differed.

v2.4 collapsed them into a single ordered list. First two positions get the tight offset; subsequent positions step outward. Users reorder by promoting.

General pattern worth watching: when two features share most of their behavior and only differ in a parameter, the parameter should become configuration, not a separate feature.

### Outline, not glow band

The glow band (prototype v2.2–v2.4) was a halo around the centerline that expanded on warn/critical thresholds. Three problems:

1. Competed with the width encoding for the same geometric space.
2. Duplicated colors (amber ramp for slope variable, amber glow for warn — confusing).
3. Overemphasized severity as the only dimension; real alerts have types that a single intensity ramp can't differentiate.

v2.5 replaced it with a semantic outline on the primary channel's edges. Nominal: thin dark. Warn: thicker amber. Critical: thicker red. Reused an existing decorative channel, added no new geometry, solved the genuinely useful part (alert *extent* along the path).

### Alerts as a watchlist, not a single-variable outline

Post-port, the outline (single-variable, per-segment limit status) was generalized into a multi-variable **alerts** watchlist. Three reasons:

1. **Operator mental model.** Ops users don't think "show me where battery is low" — they think "show me anywhere anything's wrong." A single binding forces them to pick one variable to monitor and miss everything else.
2. **Naming honesty.** "Outline" describes geometry; "alerts" describes function. The new name makes the section's purpose obvious from the sidebar header.
3. **Calm = silence.** The old outline rendered nominal segments as a faint dark stroke that was mostly noise on a dark map. The watchlist model renders *nothing* on nominal segments — the band is pure attention signal.

Implementation: `RenderConfig.alerts: string[]` lists watched variable ids; the renderer computes the worst limit status across the list at each segment (critical short-circuits warn) and strokes only warn/critical runs. Geometric position unchanged from outline (still beyond the channels, with `alertGapPx` separating it from the outermost channel).

### Dwell bubbles for stationary time (v0.2)

Stationary time is common (drilling, imaging, station-keeping). The current path encoding collapses when position doesn't change but time does — all telemetry at the stationary point stacks on one pixel.

Four options considered:

1. Detection + badge (marker only) — gives up information.
2. **Dwell bubble** — size by duration, fill by primary variable average, ring by outline status. Clickable to open detail in PlanDev/MMGIS.
3. Time detour (synthetic loop) — preserves encodings but lies visually.
4. Dual view with separate time strip — doubles UI surface, duplicates PlanDev.

Option 2 chosen because it preserves the single-view concept, extends the channels metaphor (stations on a line), doesn't lie geometrically, and aligns with the spatial-correlator scope decision: bubble shows aggregate; click opens the proper temporal tool.

### Alert band at tight turns and low zoom

The alert band flanks the primary with two thin strokes offset a fixed pixel distance along the path normal. Two artifacts appear as you zoom out (the feature shrinks in pixels while the offset stays fixed): the band **self-intersects** on the concave side of a bend once the offset exceeds the local radius of curvature, and it **scatters into detached fragments** on tight/dense sections.

We prototyped a geometric fix for the self-intersection — a concave-side curvature clamp plus dropping the inside flank where it couldn't clear the fill (a `computeAlertFlanks` with per-side draw masks). **It was reverted.** Suppressing the inside flank replaced a *cosmetic* artifact (the overlap) with a *semantic* one: a gap in the flank reads as "no alert here" when the alert is actually continuous. For an attention signal that is a worse trade — the honest self-overlap at a genuinely tight turn is less misleading than an apparent gap. The continuous fixed-offset band is the more truthful encoding, so that is what ships.

**What we kept from that work: the adaptive tangent window** (`computeTangents` `minSpanPx`, default 6). The window expands until its endpoints span a minimum pixel distance. This was not cosmetic — when a path is densely sampled relative to screen scale (zoomed out), a fixed ±3-*sample* window spans a sub-pixel distance and the finite-difference direction is dominated by floating-point noise, which threw the perpendicular offset into detached fragments. Widening the window to a minimum screen span fixes the direction estimate at the root; high zoom is unchanged because the samples already span more than the minimum.

**Known limitation.** At extreme zoom-out a fixed-pixel band still self-overlaps at a sub-band-width hairpin. This is accepted as an honest artifact rather than papered over. The real fix, if it ever matters, is zoom-aware level-of-detail — fade or hide the band below a scale threshold, or indicate alerts on the primary itself — which is deferred (it also relates to the open question about Canvas performance and LOD at scale).

### Primary opacity encodes uncertainty, not magnitude

The primary strip had two encodings (color, width). We evaluated opacity as a third, via an interactive prototype rendered over a deliberately uneven basemap (light dunes, dark craters). Two candidate meanings were tested:

- **Magnitude (rejected).** Fading the strip by the primary variable's own value fails on a map. Alpha blends the strip against whatever is underneath, so the *same* value reads darker over a crater than over a dune — the basemap bleeds into the reading. For a tool whose entire job is honest spatial correlation, an encoding that isn't background-independent is a hazard, not a feature. The prototype made this visible rather than hypothetical.
- **Uncertainty (chosen).** Low alpha universally reads as "less certain / not fully there." Rather than fight that connotation, we lean into it: opacity fades stretches where the reading is untrustworthy (stale, interpolated, low-SNR, poor localization). This carries a meaning no other encoding carries, and it is orthogonal to color and width by construction.

Rules that keep it non-competing (principle 1):

1. **The alert band never fades.** Doubt about a *reading* must not mute a *limit breach* on that reading. The fill's `globalAlpha` is reset before the band strokes.
2. **A floor, not zero** (`UNCERTAINTY_ALPHA_FLOOR = 0.12`). A maximally-uncertain segment ghosts but never vanishes: a faint strip reads as "here, but don't trust it," whereas a true gap reads as "no data." The two must stay distinguishable.
3. **Absent signal is not doubt.** Samples with no uncertainty variable, or a null reading, render fully opaque.

Implementation mirrors the width role: `RenderConfig.uncertaintyVar` / `uncertaintyInvert` (invert suits a variable framed as *confidence*, high = good), a pure `computeUncertaintyAlphas` cached per config, applied as per-quad fill alpha in `drawPrimaryChannel`. This is the first application of the "new visual variable as an independent role" pattern beyond width; **flow** (below) is the second.

### Flow: animated heading + rate, independent of every role

Motion is the fifth Bertin visual variable available on a line (after color, size/width, opacity, texture). We add it as **flow**: chevrons marching along the path. It carries two readings no other encoding does — **heading** (which way the rover is going) and **rate** (how fast), the latter through the *motion itself*.

Design calls, from the prototype review:

1. **Speed encodes rate, honestly.** Chevrons move at screen-speed proportional to the rate variable and **stall where it reads zero** — the rover holding station shows frozen chevrons, not a treadmill implying motion that isn't there. Uniform marching everywhere was rejected for exactly that dishonesty. Implemented as a rate-warped arc-length coordinate `u = integral(ds / rate)` (rate floored at `FLOW_RATE_FLOOR` so a true zero can't diverge); a chevron at constant `du/dt` covers `ds/dt = rate·c`.
2. **Stateless in time.** Chevron position is a pure function of `RenderInput.timeMs` — `u^-1(k·Δu + c·t)` — so `draw()` keeps no cross-frame particle state, consistent with the renderer's cache-only model, and is deterministic (testable, resume-safe).
3. **The animation loop lives in the host, not `core`.** The Leaflet layer runs a continuous `requestAnimationFrame` loop only while a flow variable is assigned, feeding elapsed time in; `_scheduleRedraw` yields to it so frames aren't double-painted. `core` stays a pure "draw one frame at time t" surface.
4. **Reduced motion is a first-class fallback.** Under `prefers-reduced-motion` the host does not start the loop and passes no time; chevrons render static, still showing heading. Motion is an enhancement, not the only carrier.
5. **Independent of the other roles (principle 1).** Chevrons ride the path centerline (no new geometry), draw above the strip and below event glyphs, and — deliberately — are *not* coupled to the uncertainty fade. The prototype briefly faded chevrons over uncertain data as a "cooperation" nicety; that was dropped to keep the roles orthogonal. Flow replaces nothing.

**Known tradeoff.** Flow makes the canvas redraw every frame while active (the renderer has no partial-redraw path — see the caching note in CLAUDE.md). Fine at current data sizes; the future optimization is to cache the static encodings to an offscreen canvas and repaint only the flow layer per frame. Deferred, and related to the open question on Canvas performance at scale.

## Technical choices

### Why Leaflet (not Mapbox GL, OpenLayers, or deck.gl)

MMGIS uses Leaflet as its primary 2D map component. Building the custom layer directly against Leaflet means zero refactoring for the eventual MMGIS plugin integration. The trade-off: Leaflet is older, less GPU-accelerated, and has a smaller ecosystem than deck.gl. But the integration constraint dominates — an elegant deck.gl implementation that can't drop into MMGIS is worthless here.

Future: if MMGIS ever migrates its map component (unlikely near-term), the `core` package is framework-agnostic and a new layer wrapper can be written in parallel.

### Why Canvas 2D (not SVG, not WebGL)

Canvas gives us:
- Low overhead for thousands of short strokes.
- Easy batching via `beginPath / moveTo / lineTo / stroke` patterns.
- Trivial DPR handling via `setTransform`.
- No DOM tree bloat — one `<canvas>` per layer.

SVG would give hit-testing for free but at 10,000+ DOM nodes it tanks performance. WebGL gives speed at implementation complexity disproportionate to the visual demands. If rendering bottlenecks at scale, the escape hatch is OffscreenCanvas in a Worker, not a WebGL rewrite.

### Rendering backend abstraction: deferred

We considered introducing a `RenderBackend` interface so the draw layer could target Canvas 2D or WebGL interchangeably. Decision: **do not build it now.** Keep the concrete `CanvasRenderingContext2D` in the draw functions.

Rationale:
- **The valuable separation already exists.** `core` splits cleanly into a *compute* layer (pure, backend-agnostic: `geometry.ts`, `color.ts`, and the value/mode caching + orchestration in `renderer.ts`) and a *draw* layer (`render.ts`, tightly Canvas-coupled by design). A WebGL backend would reuse the entire compute layer unchanged. That split is the hard part, and it's done.
- **The draw layer is Canvas-idiomatic on purpose, not by accident.** The 256-bucket grouping in `drawChannel` and the same-status run-grouping in `drawPrimaryChannel` are optimizations against Canvas's cost model (state changes expensive, draw calls cheap; round cap at every `moveTo`). WebGL inverts that model — those routines would be *replaced* with vertex buffers / triangle strips, not adapted. So abstracting the current draw calls behind an interface would abstract the wrong layer.
- **Speculative generality.** Designing a backend interface without a real second implementation to validate it against almost guarantees getting the seam wrong. Contradicts principle 5 (iterate on design before implementing) — a backend interface is itself a non-trivial design change and should follow a demonstrated need, not precede it.
- **WebGL is two escape hatches away.** Order of response to a measured performance problem is: (1) sample decimation / LOD, (2) OffscreenCanvas in a Worker, (3) WebGL. Abstracting now optimizes for a branch we may never take.

**The seam we maintain instead:** the compute/draw boundary. Discipline to preserve — no color, geometry, or status math leaks into the `draw*` functions; they receive already-computed screen points, colors, widths, and statuses. As long as that holds, the pure layer stays reusable and a future WebGL backend is an additive parallel implementation, not a teardown.

**Revisit when** profiling at realistic data scale (the open v0.4 question in the Open questions section below) shows Canvas is GPU/geometry-throughput bound *after* decimation and a Worker, or when a fleet view (many trajectories at once) or smooth animated zoom over 100k+ primitives becomes a requirement. At that point, introduce the backend interface against the concrete needs of the WebGL implementation being written, not before.

### Why pnpm workspaces

Monorepo tooling with first-class support for local package linking, without the complexity of Nx or Turborepo for a project this size. AMMOS's SLIM-based best practices and Aerie-related repos use npm-style monorepos; pnpm is the modern equivalent with better disk usage and strict peer dependency resolution. Installation is fast. `workspace:*` protocol makes internal deps explicit.

### Why Zustand (not Redux, not Context)

- **Low overhead.** Canvas redraws need to read state imperatively without triggering React re-renders. Zustand's `get()` API allows this; Context doesn't (every consumer re-renders on any change).
- **No boilerplate.** Redux would over-formalize this app.
- **External accessibility.** The Leaflet layer can subscribe to store changes without being a React component. This is important because the layer lifecycle is Leaflet-driven, not React-driven.

### Why TypeScript strict, `.js` extensions on imports

- Strict TS because the data model has many narrow types (variable ids, mode ids, status labels, config slots) and implicit typing is error-prone.
- `.js` extensions in source imports are required for ESM + bundler resolution when targeting modern Node and Vite simultaneously. It looks weird but avoids tsconfig ambiguity.

### Why MIT

Maximally permissive and universally recognized. Anyone can use, modify, and redistribute the code with no obligations beyond preserving the copyright notice. No friction for adoption.

### Why Vite for the demo

Fast dev HMR, minimal configuration, first-class TS support, standard React tooling. The demo is the dev harness, not a bundled library, so we don't need advanced bundling. Library packages (`core`, `leaflet-layer`, `react-ui`) ship source-only during development; production build steps can be added later if/when they're published to a registry.

## History

The prototype iterated through 13 versions before the port. *The historical names below ("rails", "main track", "flankers", "accents") are the terms used at the time of those iterations; they correspond to the current "channels" / "primary channel" terminology.*

| Version | Change |
|---|---|
| v0 | Wrong direction: stacked horizontal ribbons (essentially horizon charts). Abandoned. |
| v1 | Corrected: parallel rails offset perpendicular to 2D trajectory in screen space. |
| v1.2 | Three competing design options explored. |
| v1.3 | Hybrid design after academic lit review (Minard, Tominski, Russig). Dual encoding on main track as default. |
| v2 | Full implementation with dual-encoded main, flankers, accents, event glyphs. |
| v2.1 | Rover scenario adaptation. Activity halos + state overlay. |
| v2.2 | Glow band with per-variable limits. |
| v2.3 | Halos dropped (redundant); hover-only highlight. |
| v2.4 | Flankers and accents collapsed into single ordered rails list. |
| v2.5 | Glow band replaced with semantic outline on main track. ← **last prototype reference** |
| post-port | Project renamed Vector Rails → Vector Channels. "Main track" → "primary channel"; "rails" → "channels". Vocabulary aligned with standard telemetry conventions. |

The historical prototype — the last pre-port artifact — is `docs/reference/prototype-v2.5.jsx`. Production code has since diverged (ramp catalog, alerts watchlist replacing outline, Vector Rails → Vector Channels rename). The prototype is kept as the record of where the design landed before the port; consult it for context, not for current behavior.

The lessons from this journey, now codified as invariants:

1. Start with a wrong design, correct fast.
2. Literature review before implementation for non-trivial encoding decisions.
3. When two features behave similarly, make them one feature with a parameter.
4. When a new encoding fights an existing one for the same space, replace the weaker one rather than adding another layer.
5. Prototype first. Port later.

## Open questions

Things not yet resolved:

1. **Gap handling across variables with different gap patterns.** If battery has data from 0–500 s but CPU has data from 100–600 s, where does the primary channel draw? Current leaning: primary variable determines path extent; channels and outlines can have their own gap patterns.

2. **Decimation strategy.** Douglas-Peucker tuned to zoom level is obvious; ε calibration needs empirical tuning on real data.

3. **Ghost path variants (v0.3).** Plan vs. actual is clear. Multiple alternative plans (plan A, plan B, actual) introduces a legend/layer-toggle UI. Probably not worth it initially.

4. **Multi-sol missions.** One trajectory per sol with a sol picker, or one continuous trajectory with sol-boundary event markers? Leaning toward per-sol, but needs validation on real mission workflows.

5. **Canvas performance at 50,000+ samples.** Prototype maxes at 400. Profiling at realistic data scale is blocking for v0.4 integration work.
