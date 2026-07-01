# Architecture

How Vector Channels works technically. For why these choices were made, see `DECISIONS.md` (note: that doc still uses some pre-rename vocabulary).

## Overview

Vector Channels is a layered system. Each layer has one job, and the layers are intentionally decoupled so the rendering engine can be reused across different map hosts or embedded contexts (MMGIS, OpenLayers, a standalone canvas).

```
┌──────────────────────────────────────────────┐
│              standalone-app                  │   Vite + React + Leaflet
│  (wires everything together, demo data)      │
└──────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐            ┌─────────────────┐
│    react-ui     │            │  leaflet-layer  │
│ sidebar, store, │◄──────────►│  L.Layer wrap   │   imperative
│ readout, atoms  │  hover evt │  of renderer    │◄──────┐
└─────────────────┘            └─────────────────┘       │
         │                              │                │
         │ imports types & ramps        │ renders via    │
         ▼                              ▼                │
┌──────────────────────────────────────────────────────┐ │
│                      core                            │ │
│  types • color ramps • geometry • render functions   │ │
│  VectorChannelsRenderer (stateful orchestrator)      │◄┘
└──────────────────────────────────────────────────────┘
```

## The four packages

### `core`

Pure TypeScript rendering engine. No dependencies on React, Leaflet, or any DOM APIs beyond `CanvasRenderingContext2D`. Ships source only; bundlers in consuming packages transpile.

Modules:
- **`types.ts`** — the data model. `VariableDef`, `Limits`, `Sample`, `Trajectory`, `ModeDef`, `RenderConfig`, `RenderInput`. These are the contracts every other package depends on.
- **`color.ts`** — color ramps (sequential `viridis`/`magma`/`inferno`/`cividis`/`grayscale`/`terrain`, diverging `coolwarm`/`rdylgn`/`spectral`/`prgn`, categorical `bold5`/`set1`/`paired`/`moran`), `normalize`, `colorForValue`, `computeLimitStatus`, `OUTLINE_STYLES`.
- **`geometry.ts`** — tangent computation, channel offset schedule (`offsetForChannel`), Catmull-Rom spline smoothing, perpendicular polyline offsetting. All pure functions; no state.
- **`render.ts`** — Canvas drawing functions: `drawBackground`, `drawChannel`, `drawPrimaryChannel`, `drawGlyph`, `drawActivityHighlight`, `drawHoverIndicator`. Each takes a context and arguments, draws, returns nothing. Composable.
- **`renderer.ts`** — `VectorChannelsRenderer` class. Stateful orchestrator. Owns trajectory-derived caches (per-variable value arrays, mode array) so they aren't rebuilt every frame. Exposes `setTrajectory`, `setConfig`, `setVariables`, `setModes`, `draw`.

Why a class for the renderer: the value extraction is O(n × variables) and runs once per trajectory change, not once per frame. Keeping that in a class lets us cache it cleanly. Everything zoom-dependent stays stateless.

### `leaflet-layer`

A thin `L.Layer` subclass that wraps `VectorChannelsRenderer`. Handles three things:

1. **Canvas lifecycle.** Creates a `<canvas>` element on the map's overlay pane during `onAdd`. Removes it during `onRemove`. Handles DPR (backing store at `dpr × cssSize`, transform matrix applied to context).
2. **Projection.** On redraw, walks `trajectory.samples`, projects each `[lng, lat]` position through `map.latLngToContainerPoint`, produces the `screenPoints` array that the renderer expects. Redraws fire on `viewreset`, `zoom`, `zoomanim`, `move`, `moveend`, `resize`.
3. **Interaction events.** Pointer events on the canvas are hit-tested against the projected samples and emitted to subscribers (the React UI) via the `vc:hover` Leaflet event.

Why a class (imperative API): Leaflet's layer system is object-oriented. Wrapping the renderer in a class gives us the `L.Layer` contract for free.

### `react-ui`

Sidebar, readout, state store. Uses `core` for types and color ramps; does not depend on `leaflet-layer`.

- **`store.ts`** — Zustand store holding all config state plus ephemeral hover state. Actions: `setPrimary`, `setWidth`, `moveChannel`, `addChannel`, `removeChannel`, `addAlert`, `removeAlert`, `clearAlerts`, `setStateOverlay`, `setShowEvents`, plus hover and ramp-override setters. Exclusion rules enforced in actions (Primary ⊥ Channels; Width / Alerts independent).
- **`Sidebar.tsx`** — the right-hand panel. One React component that subscribes to the store and renders all sections.
- **`Readout.tsx`** — bottom strip showing active variable values at hover, with role labels (`primary`, `width`, `channel #N`, `alert`).
- **`atoms.tsx`** — reusable primitives: `Section`, `VarSelect`, `RampSwatch`, `RampPicker`, `StatusBadge`.

Why Zustand: low overhead, imperative `get()` access from outside React (the Leaflet layer can read state directly without React-rerendering), and no boilerplate. Redux would over-formalize this; Context would cause excessive re-renders on hover state changes.

### `standalone-app`

Vite + React + Leaflet + Tailwind. Wires everything together.

- Creates a Leaflet map (`L.CRS.Simple` for the demo; production would use a Mars/Lunar tile layer).
- Creates a `VectorChannelsLayer` with the sample trajectory, adds it to the map.
- Mounts the React `Sidebar` and `Readout` into DOM elements.
- Wires the Zustand store to the layer: store changes → `layer.setConfig(selectRenderConfig(state))`; layer `vc:hover` events → `store.setHover(...)`.

The demo data comes from `sample-data.ts`, which generates a synthetic Mars rover sol with battery, slope, CPU, wheel current, data buffer, and solar power variables along a ~1 km traverse through Jezero Crater.

## Data flow

From user action to pixel:

```
user changes a dropdown (e.g. Primary = CPU)
    │
    ▼
Sidebar component dispatches store.setPrimary('cpu')
    │
    ▼
Zustand store updates state
    │
    ▼
standalone-app subscribes to store → calls layer.setConfig(newConfig)
    │
    ▼
layer.setConfig updates renderer.config, triggers this._redraw()
    │
    ▼
layer._redraw projects samples, calls renderer.draw(ctx, input)
    │
    ▼
renderer.draw orchestrates:
    drawChannel (each channel, outer→inner)
    drawPrimaryChannel (with alert band on warn/critical regions)
    drawActivityHighlight (if hovered)
    drawGlyph (per event)
    drawHoverIndicator (if hovered)
    │
    ▼
Canvas pixels update
```

From map interaction to readout:

```
user pans/zooms the map
    │
    ▼
Leaflet fires 'move' / 'zoom' / 'zoomanim' events
    │
    ▼
layer re-projects samples → renderer.draw
    │
    ▼
(no store changes, sidebar unaffected)
```

```
user hovers the map
    │
    ▼
layer captures mousemove, hit-tests against projected samples
    │
    ▼
layer fires 'vc:hover' with { sampleIdx, eventIdx, activityIdx }
    │
    ▼
standalone-app handler → store.setHover({...})
    │
    ▼
Sidebar / Readout re-render with new values
    │
    ▼
layer.setHover(...) → redraw with hover indicator
```

## Coordinate handling

The pixel-stable perpendicular channel offset requires care because perpendicular directions are well-defined only in screen space, not in geographic space.

The rule: **tangents are computed from projected screen points**, never from lat/lng. The `core` renderer receives pre-projected `screenPoints` and computes tangents from them via windowed finite difference. Channel offsets are then applied perpendicular to those screen-space tangents. This keeps the 9-pixel gap at 9 pixels regardless of zoom level or projection distortion.

The layer package is responsible for the projection step. Under Mercator-family projections this is straightforward. For polar projections (relevant to lunar missions) or Mars stereographic, the same pattern still works — the layer just projects via whatever CRS Leaflet is configured with, and the renderer's screen-space math is unaffected.

## Performance

Current design optimized for the prototype's ~400 samples. At production scale (tens of thousands of samples over a multi-sol mission), the following bottlenecks will matter:

1. **Per-frame projection cost.** Every redraw re-projects every sample. At 86,400 samples this becomes expensive. Mitigation: cache projected points per zoom level, invalidate only on zoom change.

2. **Canvas stroke volume.** Channels render in buckets (256 color buckets, matching matplotlib's default LUT size) to minimize stroke-style changes, but at scale we'd want screen-space decimation (Douglas-Peucker-style) before rendering. Samples that project to the same pixel don't need separate draw calls.

3. **Main thread blocking.** For very long trajectories, drawing is synchronous and blocks user input. Mitigation options (in priority order): sample decimation (cheap, big win), `requestIdleCallback` for non-critical redraws, OffscreenCanvas in a Worker for the primary channel (more complex, larger win).

See `ROADMAP.md` for the production-readiness checklist.

## Extension points

If you want to add a new encoding, add a new rendering function in `render.ts`, wire it into the renderer's draw orchestration, and add UI controls to `react-ui`. The `core` package's layering lets you add encodings without touching the Leaflet layer at all.

If you want to use Vector Channels with a different map library (OpenLayers, MapLibre, Mapbox GL), create a new package parallel to `leaflet-layer` that handles projection for that library and calls `renderer.draw` from its lifecycle hooks. The `core` package has no knowledge of which map library is in use.

If you want to embed Vector Channels in MMGIS, see the future `apps/mmgis-plugin` integration. The idea: register `VectorChannelsLayer` against MMGIS's existing Leaflet map instance, mount the React sidebar into MMGIS's tool panel, consume trajectory data from MMGIS's layer API.
