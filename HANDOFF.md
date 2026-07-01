# Handoff

This document orients someone picking up Vector Channels for the first time. It describes **the current state of the repo and what's meant to happen next**. Read it once, then refer to `CLAUDE.md` for ongoing conventions and `docs/` for deeper context.

## What Vector Channels is, in one paragraph

A 2D visualization that shows multiple telemetry variables along a trajectory as parallel offset *channels* tied to a *primary* channel (the central path that carries color, width, and outline encodings). Intended as a spatial correlator between [MMGIS](https://github.com/NASA-AMMOS/MMGIS) (which answers *where*) and [PlanDev](https://github.com/NASA-AMMOS/plandev) (which answers *when*). Neither currently shows how multiple telemetry variables correlate spatially along a trajectory.

> **Terminology:** earlier drafts called the project "Vector Rails" with "main track" and "rails" as the visual concepts. Those have been renamed to **Vector Channels** with a *primary channel* (the central path) and *channels* (the parallel offsets). Historical docs in `docs/` may still use the old vocabulary.

The full concept, decision history, and design principles live in `docs/DECISIONS.md`. The competitive landscape lives in `docs/COMPETITIVE.md`. The analysis of adjacent pain points, opportunities, and gaps in our own approach lives in `docs/GAPS.md`.

## State of the repo right now

Scaffolded as a pnpm monorepo. One of four packages is essentially complete.

```
vector-channels/
├── package.json, pnpm-workspace.yaml, tsconfig.base.json   ✓
├── LICENSE (MIT)                                          ✓
├── README.md, CLAUDE.md, HANDOFF.md                        ✓
├── docs/
│   ├── ARCHITECTURE.md, DECISIONS.md, ROADMAP.md, COMPETITIVE.md, GAPS.md  ✓
│   └── reference/prototype-v2.5.jsx   ← historical prototype (pre-port; production code has since diverged)
└── packages/
    ├── core/              ✓ COMPLETE — TS port of the v2.5 renderer
    │   ├── src/{types,color,geometry,render,renderer,index}.ts
    │   └── test/limits.test.ts
    ├── leaflet-layer/     ✗ NOT STARTED
    ├── react-ui/          ✗ NOT STARTED
    └── standalone-app/    ✗ NOT STARTED
```

The `core` package contains pure TypeScript: data model (`types.ts`), color ramps + limit status (`color.ts`), tangent/offset math (`geometry.ts`), Canvas drawing functions (`render.ts`), and a stateful `VectorChannelsRenderer` class (`renderer.ts`). It has no dependency on React or Leaflet. Initial unit tests cover limit-status computation.

## What to build next

Four tasks, in this order. Each should be reviewable as a self-contained unit before moving to the next.

### 1. `packages/leaflet-layer`

A thin `L.Layer` subclass that wraps `VectorChannelsRenderer`.

Responsibilities:
- Create a canvas on the map's overlay pane.
- On every redraw (triggered by `viewreset`, `zoom`, `zoomanim`, `move`, `moveend`, `resize`): project each `sample.position` (stored as `[lng, lat]`) through `map.latLngToContainerPoint(L.latLng(lat, lng))` to get screen-space points, then call `renderer.draw(ctx, { screenPoints, … })`.
- Handle device pixel ratio: backing store at `dpr × cssSize`, `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.
- Precompute `eventIndices` and `activityIndices` at trajectory-set time by matching each event/activity timestamp to the nearest sample index.
- Expose imperative methods: `setConfig(config)`, `setTrajectory(traj)`, `setHover({ sampleIdx, eventIdx, activityIdx })`. Each triggers a redraw.
- Emit pointer events so the React sidebar can coordinate hover readout.

Deliverables: `package.json` (peer deps: `leaflet ^1.9.4`, `@vector-channels/core workspace:*`), `tsconfig.json`, `src/VectorChannelsLayer.ts`, `src/index.ts`, `README.md`.

**Critical**: tangents must be computed from already-projected screen points, not from lat/lng. Otherwise rail offsets skew under Mercator-like distortion. The `core` renderer is already correct here — the layer just needs to pass the right thing in.

### 2. `packages/react-ui`

Port the sidebar from `docs/reference/prototype-v2.5.jsx` into TypeScript React components.

Structure:
- `store.ts` — Zustand store with all config state. Actions: `setPrimary`, `setWidth`, `moveChannel`, `addChannel`, `removeChannel`, toggles for `stateOverlay`/`showEvents`, hover setters. Exclusion rules from the prototype: Primary ⊥ Channels (mutually exclusive); Width and Outline both fully independent.
- `Sidebar.tsx` — the full right-hand panel. Sections: Main track, Outline, State overlay, Rails, Activities, Events. Sections may be inline or split into `sections/*.tsx` — preference is inline for the initial port since they're not large.
- `Readout.tsx` — bottom strip showing active variable values at hover, with role labels (`primary`, `width`, `channel #N`, `outline`).
- `atoms.tsx` — `Section`, `VarSelect`, `RampSwatch`, `StatusBadge`.
- Tailwind for styling, dark theme matching the prototype.

Deliverables: `package.json` (peer deps: `react ^18`, `@vector-channels/core workspace:*`, `zustand ^4`), `tsconfig.json`, `src/*`, `README.md`.

### 3. `packages/standalone-app`

Vite + React + Leaflet + Tailwind. Wires everything together with synthetic sample data.

Deliverables: `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/sample-data.ts`, `src/styles.css`, `README.md`.

- `sample-data.ts`: port `generateTelemetry`, `generateStateArray`, waypoints, activities, events from `docs/reference/prototype-v2.5.jsx`. Anchor the traverse at **Jezero Crater** (~77.45°E, 18.44°N), roughly 1 km spread over 24 hours. Produce a proper `Trajectory` object with real timestamps.
- `App.tsx`: Leaflet map with `L.CRS.Simple` (no tile server required; dark background). Add `VectorChannelsLayer` with the sample trajectory. Mount `Sidebar` and `Readout` as React components. Wire pointer events from the layer into the store.
- Note in `App.tsx` that `CRS.Simple` is a demo choice — production deployment will use a Mars/Lunar tileset matching MMGIS.

### 4. Tests, docs, polish

- Fill in more tests in `packages/core/test/` — geometry, color ramps, renderer smoke tests with a mocked canvas context.
- Verify `pnpm typecheck`, `pnpm test`, `pnpm dev` all run clean.
- If any architectural diagrams or examples need adding to `docs/ARCHITECTURE.md`, add them.

## Success criterion for v0.1

Running `pnpm dev` opens the standalone app at `http://localhost:5173`. The app shows a dark-background Leaflet map with a synthetic rover traverse through Jezero Crater. All encodings from the v2.5 prototype are working:

- Primary channel color (battery SOC), width (slope, inverted), outline (battery limit status)
- Four channels (CPU, wheel current, data buffer, solar)
- Activity highlights on hover from the sidebar
- Event glyphs on the primary channel
- State overlay (rover mode) togglable
- Reorderable channels via sidebar controls
- Hover readout showing all active variable values

Rails should stay at pixel-stable offsets during zoom (9 px, 16 px, 23 px from main).

## After v0.1

The next milestones are v0.2 (dwell bubbles with PlanDev/MMGIS deep-link stubs) and v0.3 (ghost path for plan vs. actual). See `docs/ROADMAP.md` for details. Don't implement those during the initial scaffolding work — ship v0.1 clean first.

## Where to look for what

| Question | File |
|---|---|
| How does the tool work technically? | `docs/ARCHITECTURE.md` |
| Why was decision X made? | `docs/DECISIONS.md` |
| What's coming next? | `docs/ROADMAP.md` |
| What else exists in this space? | `docs/COMPETITIVE.md` |
| Opportunities + our own gaps? | `docs/GAPS.md` |
| What conventions should I follow? | `CLAUDE.md` |
| What did the original prototype look like? (historical) | `docs/reference/prototype-v2.5.jsx` |
| How do I get started? | this file (you're done with it) |

Run:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev   # once standalone-app exists
```

Good luck.
