# @vector-channels/standalone-app

Vite-powered demo app that wires `@vector-channels/core`, `@vector-channels/leaflet-layer`, and `@vector-channels/react-ui` together with a synthetic trajectory through Jezero Crater. Used to validate v0.1 end-to-end.

## Run

From the repo root:

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173. The page shows a dark Leaflet map with the traverse, channels, events, and a sidebar of controls.

## What's in here

- `src/sample-data.ts` — `VARIABLES`, `MODES`, and `buildJezeroTrajectory()` producing a ~1 km Catmull-Rom traverse over a 24-hour sol with telemetry matching the prototype.
- `src/App.tsx` — builds the Leaflet map (`L.CRS.Simple`), mounts the Vector Channels layer, and wires config + hover between the layer and the Zustand store.
- `src/main.tsx` — React root.
- `src/styles.css` — Tailwind + `leaflet.css` + the dark-map overrides.

The map uses `L.CRS.Simple` so the app works with no tile server. A production deployment would swap in a Mars basemap (e.g., MMGIS tiles) without touching any Vector Channels code.

## v0.1 success checks

- Primary channel color (battery SOC) and width (slope, inverted) render. Alert band (driven by the default battery watchlist) lights up where battery dips into warn/critical.
- Four channels — CPU, wheel current, data buffer, solar — at pixel-stable offsets (9 px, 16 px, 23 px from the primary).
- Hovering an activity in the sidebar highlights its segment on the primary channel.
- Event glyphs render on the primary channel; the events section toggles them.
- State overlay (rover mode) can be toggled and the primary color swatches in the readout update accordingly.
- Channels can be reordered with ↑/↓ and removed; adding a channel that matches Primary clears Primary.
- Moving the cursor over the map populates the bottom readout with each active variable's value.
