// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { describe, expect, it } from 'vitest';
import { createVectorChannelsStore, selectRenderConfig } from '../src/store.js';

describe('createVectorChannelsStore defaults', () => {
  it('returns sensible defaults when no init is provided', () => {
    const store = createVectorChannelsStore();
    const s = store.getState();
    expect(s.primaryVar).toBe(null);
    expect(s.widthVar).toBe(null);
    expect(s.widthInvert).toBe(false);
    expect(s.channels).toEqual([]);
    expect(s.alerts).toEqual([]);
    expect(s.stateOverlay).toBe(false);
    expect(s.showEvents).toBe(true);
    expect(s.hover).toEqual({
      sampleIdx: null,
      eventIdx: null,
      activityIdx: null,
    });
  });

  it('accepts initial config values', () => {
    const store = createVectorChannelsStore({
      primaryVar: 'battery',
      channels: ['cpu', 'solar'],
      alerts: ['battery', 'cpu'],
      widthInvert: true,
    });
    const s = store.getState();
    expect(s.primaryVar).toBe('battery');
    expect(s.channels).toEqual(['cpu', 'solar']);
    expect(s.alerts).toEqual(['battery', 'cpu']);
    expect(s.widthInvert).toBe(true);
  });
});

describe('Primary ⊥ Channels exclusion', () => {
  it('removes a var from Channels when it becomes Primary', () => {
    const store = createVectorChannelsStore({
      primaryVar: 'battery',
      channels: ['cpu', 'solar', 'wheel'],
    });
    store.getState().setPrimary('solar');
    const s = store.getState();
    expect(s.primaryVar).toBe('solar');
    expect(s.channels).toEqual(['cpu', 'wheel']);
  });

  it('clears Primary when a channel is added that matches Primary', () => {
    const store = createVectorChannelsStore({
      primaryVar: 'battery',
      channels: ['cpu'],
    });
    store.getState().addChannel('battery');
    const s = store.getState();
    expect(s.primaryVar).toBe(null);
    expect(s.channels).toEqual(['cpu', 'battery']);
  });
});

describe('Width and Alerts are independent', () => {
  it('allows Width to match Primary or a Channel', () => {
    const store = createVectorChannelsStore({
      primaryVar: 'battery',
      channels: ['cpu'],
    });
    store.getState().setWidth('battery');
    expect(store.getState().widthVar).toBe('battery');
    store.getState().setWidth('cpu');
    expect(store.getState().widthVar).toBe('cpu');
  });

  it('allows the same variable to be Primary, a Channel (cleared by exclusion), and watched', () => {
    const store = createVectorChannelsStore({
      primaryVar: 'battery',
      channels: ['cpu'],
    });
    store.getState().addAlert('battery');
    store.getState().addAlert('cpu');
    expect(store.getState().alerts).toEqual(['battery', 'cpu']);
    expect(store.getState().primaryVar).toBe('battery');
    expect(store.getState().channels).toEqual(['cpu']);
  });
});

describe('Channels list ops', () => {
  it('moveChannel moves a channel closer to / farther from primary', () => {
    const store = createVectorChannelsStore({ channels: ['a', 'b', 'c'] });
    store.getState().moveChannel(1, -1);
    expect(store.getState().channels).toEqual(['b', 'a', 'c']);
    store.getState().moveChannel(1, 1);
    expect(store.getState().channels).toEqual(['b', 'c', 'a']);
  });

  it('moveChannel is a no-op at the boundaries', () => {
    const store = createVectorChannelsStore({ channels: ['a', 'b'] });
    store.getState().moveChannel(0, -1);
    store.getState().moveChannel(1, 1);
    expect(store.getState().channels).toEqual(['a', 'b']);
  });

  it('removeChannel removes the matching id; no-op for unknown id', () => {
    const store = createVectorChannelsStore({ channels: ['a', 'b', 'c'] });
    store.getState().removeChannel('b');
    expect(store.getState().channels).toEqual(['a', 'c']);
    store.getState().removeChannel('z');
    expect(store.getState().channels).toEqual(['a', 'c']);
  });
});

describe('Alerts watchlist', () => {
  it('addAlert appends a new variable', () => {
    const store = createVectorChannelsStore();
    store.getState().addAlert('battery');
    store.getState().addAlert('cpu');
    expect(store.getState().alerts).toEqual(['battery', 'cpu']);
  });

  it('addAlert is a no-op when the id is already in the watchlist', () => {
    const store = createVectorChannelsStore({ alerts: ['battery'] });
    store.getState().addAlert('battery');
    expect(store.getState().alerts).toEqual(['battery']);
  });

  it('removeAlert removes the matching id; no-op for unknown id', () => {
    const store = createVectorChannelsStore({ alerts: ['a', 'b', 'c'] });
    store.getState().removeAlert('b');
    expect(store.getState().alerts).toEqual(['a', 'c']);
    store.getState().removeAlert('z');
    expect(store.getState().alerts).toEqual(['a', 'c']);
  });

  it('clearAlerts empties the watchlist', () => {
    const store = createVectorChannelsStore({ alerts: ['a', 'b'] });
    store.getState().clearAlerts();
    expect(store.getState().alerts).toEqual([]);
  });

  it('a variable can be Primary AND watched simultaneously', () => {
    const store = createVectorChannelsStore({ primaryVar: 'battery' });
    store.getState().addAlert('battery');
    expect(store.getState().primaryVar).toBe('battery');
    expect(store.getState().alerts).toEqual(['battery']);
  });

  it('a variable can be a Channel AND watched simultaneously', () => {
    const store = createVectorChannelsStore({ channels: ['cpu'] });
    store.getState().addAlert('cpu');
    expect(store.getState().channels).toEqual(['cpu']);
    expect(store.getState().alerts).toEqual(['cpu']);
  });
});

describe('setHover merge semantics', () => {
  it('merges partial hover updates — undefined keys preserve existing state', () => {
    const store = createVectorChannelsStore();
    store.getState().setHover({ sampleIdx: 5, eventIdx: 2, activityIdx: 3 });
    store.getState().setHover({ sampleIdx: 7 });
    expect(store.getState().hover).toEqual({
      sampleIdx: 7,
      eventIdx: 2,
      activityIdx: 3,
    });
  });

  it('explicit null clears a hover dimension', () => {
    const store = createVectorChannelsStore();
    store.getState().setHover({ sampleIdx: 5, eventIdx: 2, activityIdx: 3 });
    store.getState().setHover({ eventIdx: null });
    expect(store.getState().hover).toEqual({
      sampleIdx: 5,
      eventIdx: null,
      activityIdx: 3,
    });
  });
});

describe('selectRenderConfig', () => {
  it('extracts a RenderConfig from the state', () => {
    const store = createVectorChannelsStore({
      primaryVar: 'battery',
      widthVar: 'slope',
      widthInvert: true,
      uncertaintyVar: 'databuf',
      uncertaintyInvert: true,
      channels: ['cpu', 'wheel'],
      alerts: ['battery', 'cpu'],
      stateOverlay: false,
      showEvents: true,
    });
    const cfg = selectRenderConfig(store.getState());
    expect(cfg).toEqual({
      primaryVar: 'battery',
      widthVar: 'slope',
      widthInvert: true,
      uncertaintyVar: 'databuf',
      uncertaintyInvert: true,
      channels: ['cpu', 'wheel'],
      alerts: ['battery', 'cpu'],
      stateOverlay: false,
      showEvents: true,
    });
  });

  it('defaults the uncertainty role to unset', () => {
    const store = createVectorChannelsStore();
    const cfg = selectRenderConfig(store.getState());
    expect(cfg.uncertaintyVar).toBeNull();
    expect(cfg.uncertaintyInvert).toBe(false);
  });

  it('setUncertainty / setUncertaintyInvert flow through to the config', () => {
    const store = createVectorChannelsStore();
    store.getState().setUncertainty('databuf');
    store.getState().setUncertaintyInvert(true);
    const cfg = selectRenderConfig(store.getState());
    expect(cfg.uncertaintyVar).toBe('databuf');
    expect(cfg.uncertaintyInvert).toBe(true);
  });
});
