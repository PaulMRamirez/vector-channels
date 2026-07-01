# Roadmap

From the current scaffold toward a production tool integrated with MMGIS and PlanDev. Ordered roughly by priority. For why the scope looks this way, see `DECISIONS.md`.

## Current state — v0.1 (scaffold)

- Monorepo structure with four packages.
- `core` package complete: TypeScript port of the v2.5 prototype renderer, with unit tests for limit-status math.
- `leaflet-layer`, `react-ui`, `standalone-app` not yet built — see `HANDOFF.md` for the initial task breakdown.

Not yet real in v0.1: timestamps (still parametric `t ∈ [0,1]` internally), gap handling, decimation, coordinate system support beyond WGS84-ish, persistence, theming.

## Near-term feature work

### v0.2 — Dwell bubbles

Detect stationary segments from velocity threshold. Replace primary-channel rendering at dwells with a bubble: size proportional to duration, fill by primary-variable average, ring by worst outline status during dwell. Hover shows aggregate stats plus placeholder "Open in PlanDev" / "Open in MMGIS" buttons (deep-link targets logged for now, wired in v0.4).

The purpose is spatial hooks into temporal tools, not in-map timeline replication. Keep the dwell primitive small and non-intrusive. Full rationale in `DECISIONS.md` under "Dwell bubbles for stationary time."

### v0.3 — Ghost path (plan vs. actual)

Consume a second trajectory (the planned traverse) and render it as a faint gray dashed line beneath the actual. Spatial divergence becomes visible at a glance. This is probably the single most operationally distinctive capability Vector Channels could offer — neither MMGIS nor PlanDev currently shows spatial plan-vs-actual divergence at a glance.

Open question (tracked in `DECISIONS.md`): support multiple alternative plans, or just plan vs. actual? Leaning toward just plan vs. actual for simplicity.

### v0.4 — Real integration wiring

- GraphQL client for PlanDev: pull profiles, activities, constraints, events from Aerie-era Hasura endpoints.
- MMGIS plugin embedding: register as `/src/essence/*Plugin-Tools*/VectorChannels`, mount sidebar into MMGIS tool panel.
- Deep links:
  - Click a channel sample → open MMGIS graph view for that variable at that time.
  - Click an activity → open in PlanDev editor.
  - Click a dwell bubble → bring up the relevant PlanDev activity view or MMGIS InfoTool panel.
- Bidirectional selection sync: hover in Vector Channels highlights in MMGIS and PlanDev; hover in either highlights back in Vector Channels.

## Production concerns

Not features but things the tool needs before real mission use.

### Data model

- Real timestamps (ISO 8601 or epoch seconds), not parametric `t`.
- Variable sample rate handling: per-variable sample arrays with interpolation at render time.
- Gap handling: represent `null`/`NaN` in `Sample.values`, break the track visually at gaps rather than interpolating across dropouts.
- Multi-sol spans with zoom/pan over time.

### Performance

- Douglas-Peucker or similar decimation on the spatial path. A 24 h rover sol at 1 Hz is 86,400 samples; rendering needs to stay under a few thousand visible points after decimation.
- Bucketed aggregation on per-variable values at coarser zoom levels.
- Progressive rendering for very long trajectories (don't block main thread).
- Visual-regression tests at varying data scales.

### Coordinate systems

- Mars stereographic / equirectangular projection support.
- Lunar north/south polar projections (matching MMGIS's IAU2000 support).
- Earth WGS84 for airborne cases.
- Verify the screen-space perpendicular channel offset under projections with significant distortion — may need tangents computed from a local-projected frame rather than the full projection.

### Data ingest

- CSV loader (explicit schema).
- GraphQL client for PlanDev (formerly Aerie).
- Yamcs archive query loader (later).
- Common intermediate `Trajectory` format documented and validated.

### UX polish

- Persist user configuration via URL state or a saved-view concept.
- Theming: CSS variables so MMGIS-hosted deployment inherits host theme.
- Accessibility: keyboard navigation along the path, ARIA descriptions of encoded channels, color-blind-safe ramps (the perceptually-uniform sequential set — `viridis`, `magma`, `inferno`, `cividis` — is safe; audit the diverging and categorical ramps).
- Error boundaries around each encoding so one bad variable doesn't crash the whole view.
- Touch input (hover replaced by tap on mobile/tablet).

### Project hygiene

- Per-package build steps (currently source-only during dev; production consumers need built `dist/`).
- TypeDoc-generated API reference for `core` and `leaflet-layer`.
- Sample data bundle (SLIM mission archive format or similar) for the demo to work out of the box with realistic data.
- Visual-regression test harness.
- CI pipeline (lint + typecheck + test + build) matching AMMOS/SLIM practices.

## Deferred encoding ideas

Considered but not planned. Listed so we don't re-litigate them without new reason.

- **Time ticks along the primary channel.** Small perpendicular marks every N minutes. Partly duplicates MMGIS's timeline; adds visual noise.
- **Directional arrowheads.** Periodic chevrons indicating travel direction. Useful for airborne cases; less useful for rovers. Candidate if an airborne mission adopts the tool.
- **Dashed segments for data authority.** Mark sections where telemetry is interpolated or low-confidence. Candidate for v0.5 once gap handling is in.
- **Desaturation for quality.** Alternative to width-for-quality. Cheaper visual cost but harder to read than width.
- **Sampling density stippling.** Show where samples are sparse as dot density. Interesting but niche.

## Design discipline for new proposals

When someone proposes a new encoding:

1. Which existing channel (if any) does it replace or compete with?
2. If it adds a new channel, does it violate the orthogonality principle in `CLAUDE.md`?
3. Does it solve something MMGIS or PlanDev already solve? If so, link instead.
4. Ship a prototype before touching production code.

See `DECISIONS.md` for the historical record of how past proposals fared.
