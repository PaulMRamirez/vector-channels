// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { useCallback, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import type { VariableDef } from '@vector-channels/core';
import { VectorChannelsLayer } from '@vector-channels/leaflet-layer';
import {
  Readout,
  Sidebar,
  createVectorChannelsStore,
  selectRenderConfig,
} from '@vector-channels/react-ui';
import { MODES, VARIABLES, buildJezeroTrajectory } from './sample-data.js';

// NOTE: CRS.Simple is a demo choice here — the app renders the traverse over
// a blank dark background rather than pulling real Mars imagery. A production
// deployment would swap in a tiled Mars basemap (e.g., via MMGIS) and would
// leave the Vector Channels layer logic unchanged.
const useStore = createVectorChannelsStore({
  primaryVar: 'battery',
  widthVar: 'slope',
  widthInvert: true,
  // Fade the strip where localization confidence drops, so untrusted stretches
  // of the traverse visibly recede. Independent of the color/width roles.
  uncertaintyVar: 'posunc',
  // Start with no channels so the initial view is uncluttered — the user adds
  // channels from the sidebar as they want to correlate more variables.
  channels: [],
  alerts: ['battery'],
  stateOverlay: false,
  showEvents: true,
});

export function App(): JSX.Element {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<VectorChannelsLayer | null>(null);

  const trajectory = useMemo(() => buildJezeroTrajectory(), []);

  // When the control panel collapses/expands, the map's flex container resizes
  // but Leaflet doesn't detect it on its own. Invalidate immediately and again
  // after the ~200ms width transition so the map fills the reclaimed space and
  // its hit-testing stays aligned. mapRef is read at call time so a late timer
  // is a safe no-op if the map has been torn down.
  const handleSidebarCollapse = useCallback((): void => {
    const invalidate = (): void => {
      mapRef.current?.invalidateSize({ pan: false });
    };
    requestAnimationFrame(invalidate);
    setTimeout(invalidate, 240);
  }, []);

  // Merge per-variable ramp overrides from the store into VARIABLES. Effects
  // below push the merged list to the layer and we pass it to Sidebar/Readout.
  const rampBy = useStore((s) => s.rampBy);
  const variables = useMemo<VariableDef[]>(
    () =>
      VARIABLES.map((v) =>
        rampBy[v.id] ? { ...v, ramp: rampBy[v.id] } : v,
      ),
    [rampBy],
  );

  useEffect(() => {
    const el = mapElRef.current;
    if (!el) return;

    const map = L.map(el, {
      crs: L.CRS.Simple,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      attributionControl: false,
    });

    const lats = trajectory.samples.map((s) => s.position[1]);
    const lngs = trajectory.samples.map((s) => s.position[0]);
    const bounds = L.latLngBounds(
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    );
    map.fitBounds(bounds, { padding: [48, 48] });

    // Initial variables use the store's current ramp overrides (typically
    // empty at mount). The separate sync effect below pushes any later
    // changes via layer.setVariables.
    const initialRampBy = useStore.getState().rampBy;
    const initialVariables = VARIABLES.map((v) =>
      initialRampBy[v.id] ? { ...v, ramp: initialRampBy[v.id] } : v,
    );
    const layer = new VectorChannelsLayer({
      variables: initialVariables,
      trajectory,
      modes: MODES,
      config: selectRenderConfig(useStore.getState()),
    });
    layer.addTo(map);

    mapRef.current = map;
    layerRef.current = layer;

    return () => {
      layer.remove();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [trajectory]);

  // Push ramp-override changes into the layer as merged variables.
  useEffect(() => {
    layerRef.current?.setVariables(variables);
  }, [variables]);

  // Push config changes into the layer without re-rendering React.
  useEffect(() => {
    return useStore.subscribe((state, prev) => {
      const layer = layerRef.current;
      if (!layer) return;
      if (
        state.primaryVar !== prev.primaryVar ||
        state.widthVar !== prev.widthVar ||
        state.widthInvert !== prev.widthInvert ||
        state.channels !== prev.channels ||
        state.alerts !== prev.alerts ||
        state.stateOverlay !== prev.stateOverlay ||
        state.showEvents !== prev.showEvents
      ) {
        layer.setConfig(selectRenderConfig(state));
      }
    });
  }, []);

  // Sidebar-driven activity hover flows back into the layer.
  useEffect(() => {
    return useStore.subscribe((state, prev) => {
      const layer = layerRef.current;
      if (!layer) return;
      if (state.hover.activityIdx !== prev.hover.activityIdx) {
        layer.setHover({ activityIdx: state.hover.activityIdx });
      }
    });
  }, []);

  // Pointer-driven sample/event hover flows from layer into the store.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const onHover = (e: unknown): void => {
      const h = e as { sampleIdx: number | null; eventIdx: number | null };
      useStore.getState().setHover({
        sampleIdx: h.sampleIdx,
        eventIdx: h.eventIdx,
      });
    };
    // Leaflet's typed `on` doesn't know about custom event names; cast once.
    (layer as unknown as L.Evented).on('vc:hover', onHover);
    return () => {
      (layer as unknown as L.Evented).off('vc:hover', onHover);
    };
  }, [trajectory]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 text-sm">
        <span className="font-semibold tracking-wide">Vector Channels</span>
      </header>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative">
          <div ref={mapElRef} className="absolute inset-0" />
        </div>
        <Sidebar
          store={useStore}
          variables={variables}
          modes={MODES}
          activities={trajectory.activities}
          events={trajectory.events}
          defaultCollapsed
          onCollapsedChange={handleSidebarCollapse}
        />
      </div>
      <Readout
        store={useStore}
        variables={variables}
        modes={MODES}
        trajectory={trajectory}
      />
    </div>
  );
}
