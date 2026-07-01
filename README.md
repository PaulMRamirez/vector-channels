# Vector Channels

Spatial multivariate trajectory visualization for planetary mission operations. A 2D encoding that shows multiple telemetry variables along a trajectory as parallel offset *channels* tied to a *primary channel* — a spatial correlator between [MMGIS](https://github.com/NASA-AMMOS/MMGIS) and [PlanDev](https://github.com/NASA-AMMOS/plandev).

## The concept

MMGIS answers *where*. PlanDev answers *when*. Neither currently shows how multiple telemetry variables correlate spatially along a trajectory. Vector Channels fills that gap.

The *primary channel* is the trajectory itself (a lat/lng polyline), encoded with color (primary variable) and width (companion variable). Parallel *channels* sit offset perpendicular to it in screen space, each colored by a different variable. Outlines, event glyphs, activity highlights, and state overlays compose as orthogonal encodings.

> The visual concepts borrow standard telemetry vocabulary: the central path is the *primary channel* and the parallel offset lines are *channels*. Earlier drafts called these "main track" and "rails"; the historical docs in `docs/` may still use the old names.

For the design rationale, see `docs/DECISIONS.md`. For how it compares to existing tools, see `docs/COMPETITIVE.md`. For opportunities, adjacent pain points, and our own current gaps, see `docs/GAPS.md`.

## Quickstart

Prerequisites: Node.js 22.20.0+ and pnpm 9+.

```bash
pnpm install
pnpm dev
```

The standalone demo opens at `http://localhost:5173` with a synthetic Mars rover traverse in Jezero Crater.

## Repo layout

```
packages/
  core/            pure TypeScript rendering engine (no React, no Leaflet)
  leaflet-layer/   Leaflet custom layer wrapping core
  react-ui/        sidebar controls and state store
  standalone-app/  Vite dev harness + demo deliverable

docs/
  ARCHITECTURE.md  how it works (technical structure)
  DECISIONS.md     why it works this way (decision records)
  ROADMAP.md       what's next
  COMPETITIVE.md   what else exists in this space
  GAPS.md          pain points, opportunities, and our current gaps
  reference/       prototype artifacts
```

## MMGIS integration

A future `apps/mmgis-plugin` will wrap `core` + `react-ui` as an MMGIS plugin, installable under `/src/essence/*Plugin-Tools*/VectorChannels`. MMGIS already uses Leaflet, so the integration surface is minimal.

## License

MIT License. See `LICENSE`.

## Contributing

See `CONTRIBUTING.md` and `CLAUDE.md` (working conventions). New contributors should read `HANDOFF.md` for project orientation.
