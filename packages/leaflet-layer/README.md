# @vector-channels/leaflet-layer

A thin `L.Layer` subclass that wraps `@vector-channels/core`'s `VectorChannelsRenderer`. Owns the canvas lifecycle, projects trajectory samples through Leaflet, and redraws on every map change.

## Install

```bash
pnpm add @vector-channels/leaflet-layer @vector-channels/core leaflet
```

`leaflet` and `@vector-channels/core` are peer dependencies — bring your own.

## Use

```ts
import L from 'leaflet';
import { VectorChannelsLayer } from '@vector-channels/leaflet-layer';

const layer = new VectorChannelsLayer({
  variables, // VariableDef[]
  trajectory, // Trajectory
  config, // RenderConfig
  modes, // optional Record<string, ModeDef>
});

layer.addTo(map);

layer.on('vc:hover', ({ sampleIdx, eventIdx, activityIdx }) => {
  // drive sidebar / readout from here
});

// Imperative updates — each schedules a redraw on the next animation frame.
layer.setConfig(nextConfig);
layer.setTrajectory(nextTrajectory);
layer.setHover({ activityIdx: 2 }); // undefined keys preserve current state
```

## Notes

- The canvas is appended to Leaflet's `overlayPane`. Only one `VectorChannelsLayer` per map is supported in v0.1.
- Projection uses `map.latLngToContainerPoint`. Channel offsets stay pixel-stable across zoom because tangents are computed from projected screen points (handled by `@vector-channels/core`).
- Device pixel ratio is applied on every redraw so the output stays crisp on retina displays.
- Pointer hit-test thresholds default to 80 px (samples) and 11 px (event glyphs) to match the prototype. Override via `sampleHitRadiusPx` / `eventHitRadiusPx`.
