# @vector-channels/react-ui

Sidebar, readout, and Zustand store for Vector Channels. Data-agnostic — the host app supplies variables, modes, and trajectory; this package owns config + hover state and renders the controls.

## Install

```bash
pnpm add @vector-channels/react-ui @vector-channels/core zustand react react-dom
```

## Use

```tsx
import { useEffect } from 'react';
import {
  createVectorChannelsStore,
  selectRenderConfig,
  Sidebar,
  Readout,
} from '@vector-channels/react-ui';

const useStore = createVectorChannelsStore({
  primaryVar: 'battery',
  widthVar: 'slope',
  widthInvert: true,
  channels: ['cpu', 'wheel', 'databuf', 'solar'],
  alerts: ['battery'],
  showEvents: true,
});

function App({ layer, variables, modes, trajectory }) {
  // Push config changes to the Leaflet layer.
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        const next = selectRenderConfig(s);
        const old = selectRenderConfig(prev);
        // naive equality — replace with shallow-compare in real use
        if (JSON.stringify(next) !== JSON.stringify(old)) {
          layer.setConfig(next);
        }
      }),
    [layer],
  );

  // Push hover from the layer (pointer events) into the store.
  useEffect(() => {
    const onHover = (e) => useStore.getState().setHover(e);
    layer.on('vc:hover', onHover);
    return () => layer.off('vc:hover', onHover);
  }, [layer]);

  // Push activityIdx from the store back to the layer.
  useEffect(
    () =>
      useStore.subscribe((s) =>
        layer.setHover({ activityIdx: s.hover.activityIdx }),
      ),
    [layer],
  );

  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-1 min-h-0">
        {/* map container */}
        <div className="flex-1" />
        <Sidebar
          store={useStore}
          variables={variables}
          modes={modes}
          activities={trajectory.activities}
          events={trajectory.events}
        />
      </div>
      <Readout
        store={useStore}
        variables={variables}
        modes={modes}
        trajectory={trajectory}
      />
    </div>
  );
}
```

## Store

`createVectorChannelsStore(initial?)` returns a Zustand hook. It holds:

- **Config**: `primaryVar`, `widthVar`, `widthInvert`, `channels`, `alerts`, `stateOverlay`, `showEvents`
- **Hover**: `{ sampleIdx, eventIdx, activityIdx }` — `null` when not hovering
- **Actions**: `setPrimary`, `setWidth`, `setWidthInvert`, `addChannel`, `removeChannel`, `moveChannel`, `addAlert`, `removeAlert`, `clearAlerts`, `setStateOverlay`, `setShowEvents`, `setHover`

Exclusion rules baked into the actions:

- **Primary ⊥ Channels**: setting a Primary that's already a Channel removes it from Channels; adding a Channel that matches Primary clears Primary.
- **Width / Alerts are independent**: any variable is allowed in either slot, including one already Primary or a Channel. A variable being on the Alerts watchlist doesn't prevent it from also being Primary or a Channel.

`selectRenderConfig(state)` extracts the `RenderConfig` ready for `VectorChannelsLayer.setConfig`.

## Styling

Components use Tailwind utility classes directly. The host app is responsible for configuring Tailwind to scan this package's source — add `"../react-ui/src/**/*.{ts,tsx}"` to your `tailwind.config.js` `content` array.

Dark theme, sidebar background `#0a0f1a`, matching the prototype.
