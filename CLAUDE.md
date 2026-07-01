# Working Conventions

This file is the persistent reference for anyone (human or Claude Code) working on this repo. It documents conventions that apply to all ongoing work. For one-time project orientation, see `HANDOFF.md`. For why decisions were made, see `docs/DECISIONS.md`.

## Stack

Fixed. Do not change without a corresponding entry in `docs/DECISIONS.md`.

| Layer | Choice | Notes |
|---|---|---|
| Package manager | pnpm 9+ | Workspace protocol `workspace:*` for internal deps |
| Language | TypeScript 5.6+ | Strict mode, `.js` extensions on internal imports (ESM + bundler resolution) |
| Node runtime | 22.20.0+ | Matches MMGIS 4.0.0 minimum |
| UI framework | React 18 | Function components + hooks |
| Build tool | Vite | Only for `standalone-app`; other packages ship source |
| Map library | Leaflet 1.9.x | Matches MMGIS's map component |
| Rendering | Canvas 2D | Not SVG, not WebGL — see DECISIONS.md |
| State | Zustand 4+ | Not Redux, not Context |
| Tests | Vitest | Colocated with packages |
| Styling | Tailwind CSS | Dark theme by default |
| License | MIT | Header on every source file |

## MIT header (copy verbatim into new source files)

```ts
// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License
```

Two-line short form is acceptable for source files. The full LICENSE text lives at the repo root.

## Code style

- **Strict TypeScript.** Explicit return types on exported functions. Prefer `interface` for data shapes, `type` for unions/aliases.
- **Internal imports use `.js` extensions.** Required for ESM with bundler resolution even when source files are `.ts`. Example: `import { foo } from './bar.js';` in a `.ts` file.
- **Prefer pure functions over classes** except where state caching justifies a class. `VectorChannelsRenderer` is the one class so far; it caches trajectory-derived value arrays between draws to avoid recomputation.
- **Comments explain *why*, not *what*.** The "what" is visible in the code.
- **No `any` types.** If a type is genuinely unknown, use `unknown` and narrow.
- **Tailwind utility classes, not CSS-in-JS.** Keep styling inspectable in devtools.
- **Canvas 2D, not SVG or WebGL.** Scale concerns are addressed via sample decimation, not rendering-technology swaps.
- **No emojis** in source comments, file names, or UI strings.

## Repository layout

```
vector-channels/
├── packages/
│   ├── core/              pure TS rendering engine; no React, no Leaflet
│   ├── leaflet-layer/     L.Layer subclass wrapping core
│   ├── react-ui/          sidebar, readout, Zustand store
│   └── standalone-app/    Vite dev harness + demo deliverable
├── docs/                  ARCHITECTURE, DECISIONS, ROADMAP, COMPETITIVE
└── apps/mmgis-plugin/     future integration target (empty)
```

Internal package names use `@vector-channels/*`. Example: `@vector-channels/core`.

## Design principles (invariants)

These emerged from 13 prototype iterations documented in `docs/DECISIONS.md`. They are not negotiable without a decision-record entry.

1. **Every encoding orthogonal, non-competing.** Primary color, primary width, channels, alerts, state overlay, event glyphs, activity highlights — none should fight another for the same geometric or cognitive space. New encodings must demonstrate they don't compete with existing ones.

2. **Primary ⊥ Channels** in color assignment (mutually exclusive). Width and Alerts are independent — any variable can drive them, including one already shown as a channel or as primary color.

3. **Channels are an ordered list**, not a tiered slot system. Position 0 is tightest to the primary; subsequent positions step outward by a constant. Users reorder by promoting/demoting.

4. **Vector Channels is a spatial correlator, not a full ops tool.** When a feature would be better served by MMGIS or PlanDev, link to them rather than replicate. The "dwell bubble" design pattern is the canonical example: show spatial aggregate, link out for temporal detail.

5. **Iterate on design before implementing.** Any non-trivial encoding change ships as a prototype first, gets reviewed, then moves to production code.

## Common pitfalls

Things worth remembering from the prototype port:

- **Projection and tangents.** Compute tangents from already-projected screen points, not from lat/lng. Otherwise perpendicular channel offsets skew at high latitudes and under non-conformal projections. The `core` renderer expects pre-projected screen points; this is the layer's responsibility.

- **Leaflet redraw triggers.** Register all of `viewreset`, `zoom`, `zoomanim`, `move`, `moveend`, `resize`. Missing `zoomanim` causes jitter during zoom animation. Use `L.DomUtil.setPosition` to keep the canvas aligned with the map during animation.

- **Canvas DPR.** Always set backing store size to `dpr × cssSize` and use `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`. Otherwise the rendering is blurry on retina displays.

- **Round line caps on segmented strokes.** Canvas puts a round cap at every `moveTo`. When drawing per-segment colored strokes, group consecutive same-color segments into runs and stroke each run as one continuous path. See `drawPrimaryChannel`'s alert-band rendering in `packages/core/src/render.ts` for the reference implementation.

- **State and Canvas.** Zustand subscribers must not trigger canvas redraws synchronously during render — batch via `requestAnimationFrame` if needed. Multiple rapid state changes should debounce to a single redraw per frame.

- **Zoom-dependent caching.** The renderer class caches trajectory-derived value arrays but does not cache anything zoom-dependent. Every zoom change redraws from scratch. Fine at current data sizes; will need LOD/decimation for production-scale data.

## Testing policy

- **Unit test pure functions.** Anything in `core` that doesn't touch `CanvasRenderingContext2D` gets tests. Prioritize: limit status, normalization, channel offset math, color ramp endpoints, tangent computation.
- **Smoke test the renderer.** Construct `VectorChannelsRenderer` with a mock canvas context and verify `draw()` doesn't throw across config combinations (no primary var, all channels, empty alerts watchlist, state overlay on, etc.).
- **Don't unit test the actual Canvas drawing.** Pixel-level output is better validated by visual inspection. If visual-regression testing becomes important, add it as a separate suite.
- **React UI tests** can come later. Controls are simple enough that manual testing suffices for v0.1.

## PR conventions

- One encoding change or one integration task per PR.
- Include a screenshot of before/after when the change is visual.
- For a new encoding, include a note explaining which existing encoding (if any) it replaces or competes with, and why it doesn't violate principle 1 above.
- Tests accompany the code change; don't backfill later.

## When you don't know something

1. `docs/ARCHITECTURE.md` for structural questions.
2. `docs/DECISIONS.md` for "why" questions.
3. The `packages/` source is authoritative for current behavior. `docs/reference/prototype-v2.5.jsx` is the pre-port prototype kept as historical reference only — useful for tracing the design rationale alongside `DECISIONS.md`, not for copying patterns (the production code has diverged: ramp catalog, alerts watchlist replacing outline, naming).
4. Ask before making architectural changes. Don't revisit stack decisions without cause.

## Commands

```bash
pnpm install         # resolve workspace deps
pnpm typecheck       # all packages
pnpm test            # all packages
pnpm dev             # run standalone-app
pnpm build           # build all packages (once build steps exist)
pnpm clean           # remove all node_modules and dist
```
