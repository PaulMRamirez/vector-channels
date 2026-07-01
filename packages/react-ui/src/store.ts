// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { RampId, RenderConfig } from '@vector-channels/core';

/** Append `id` if missing; return the same array when unchanged so Zustand's
 *  set() can compare references and skip a notify. */
const addToList = (arr: string[], id: string): string[] =>
  arr.includes(id) ? arr : [...arr, id];

/** Filter out `id`; return the same array when `id` wasn't present so
 *  Zustand's set() can compare references and skip a notify. */
const removeFromList = (arr: string[], id: string): string[] =>
  arr.includes(id) ? arr.filter((x) => x !== id) : arr;

export interface HoverState {
  sampleIdx: number | null;
  eventIdx: number | null;
  activityIdx: number | null;
}

export interface HoverPartial {
  sampleIdx?: number | null;
  eventIdx?: number | null;
  activityIdx?: number | null;
}

export interface VectorChannelsState {
  primaryVar: string | null;
  widthVar: string | null;
  widthInvert: boolean;
  channels: string[];
  alerts: string[];
  stateOverlay: boolean;
  showEvents: boolean;

  hover: HoverState;

  /**
   * Per-variable ramp overrides. Absent key = use the variable's default ramp
   * from its VariableDef. The host app is responsible for merging this into
   * the VARIABLES array it passes to the layer and to Sidebar/Readout.
   */
  rampBy: Record<string, RampId>;

  setPrimary: (id: string | null) => void;
  setWidth: (id: string | null) => void;
  setWidthInvert: (invert: boolean) => void;
  addChannel: (id: string) => void;
  removeChannel: (id: string) => void;
  moveChannel: (idx: number, dir: -1 | 1) => void;
  addAlert: (id: string) => void;
  removeAlert: (id: string) => void;
  clearAlerts: () => void;
  setStateOverlay: (on: boolean) => void;
  setShowEvents: (on: boolean) => void;
  setHover: (partial: HoverPartial) => void;
  setRamp: (varId: string, ramp: RampId) => void;
  clearRamp: (varId: string) => void;
}

export type VectorChannelsStore = UseBoundStore<StoreApi<VectorChannelsState>>;

export interface StoreInit {
  primaryVar?: string | null;
  widthVar?: string | null;
  widthInvert?: boolean;
  channels?: string[];
  alerts?: string[];
  stateOverlay?: boolean;
  showEvents?: boolean;
  rampBy?: Record<string, RampId>;
}

/**
 * Pulls the render-ready RenderConfig out of the store. Use with
 * `useStore(selectRenderConfig)` or with `useStore.subscribe` to push to
 * `VectorChannelsLayer.setConfig` from the host app.
 */
export const selectRenderConfig = (state: VectorChannelsState): RenderConfig => ({
  primaryVar: state.primaryVar,
  widthVar: state.widthVar,
  widthInvert: state.widthInvert,
  channels: state.channels,
  alerts: state.alerts,
  stateOverlay: state.stateOverlay,
  showEvents: state.showEvents,
});

/**
 * Build a Zustand store with the Vector Channels config + hover state.
 *
 * Exclusion rules:
 *   - Primary ⊥ Channels (mutually exclusive): selecting a Primary that's a
 *     Channel removes it from Channels; adding a Channel that matches Primary
 *     clears Primary.
 *   - Width, Alerts, and the rest are independent — any variable can fill
 *     those slots, including one that's already Primary or a Channel.
 */
export function createVectorChannelsStore(initial?: StoreInit): VectorChannelsStore {
  return create<VectorChannelsState>((set) => ({
    primaryVar: initial?.primaryVar ?? null,
    widthVar: initial?.widthVar ?? null,
    widthInvert: initial?.widthInvert ?? false,
    channels: initial?.channels ?? [],
    alerts: initial?.alerts ?? [],
    stateOverlay: initial?.stateOverlay ?? false,
    showEvents: initial?.showEvents ?? true,

    hover: { sampleIdx: null, eventIdx: null, activityIdx: null },
    rampBy: initial?.rampBy ?? {},

    setPrimary: (id) =>
      set((s) => {
        const channels =
          id != null && s.channels.includes(id)
            ? s.channels.filter((x) => x !== id)
            : s.channels;
        return { primaryVar: id, channels };
      }),

    setWidth: (id) => set({ widthVar: id }),
    setWidthInvert: (widthInvert) => set({ widthInvert }),

    addChannel: (id) =>
      set((s) => {
        const channels = addToList(s.channels, id);
        if (channels === s.channels) return {};
        const primaryVar = s.primaryVar === id ? null : s.primaryVar;
        return { channels, primaryVar };
      }),

    removeChannel: (id) =>
      set((s) => {
        const channels = removeFromList(s.channels, id);
        return channels === s.channels ? {} : { channels };
      }),

    moveChannel: (idx, dir) =>
      set((s) => {
        const target = idx + dir;
        if (target < 0 || target >= s.channels.length) return {};
        const channels = [...s.channels];
        const tmp = channels[idx];
        channels[idx] = channels[target];
        channels[target] = tmp;
        return { channels };
      }),

    addAlert: (id) =>
      set((s) => {
        const alerts = addToList(s.alerts, id);
        return alerts === s.alerts ? {} : { alerts };
      }),

    removeAlert: (id) =>
      set((s) => {
        const alerts = removeFromList(s.alerts, id);
        return alerts === s.alerts ? {} : { alerts };
      }),

    clearAlerts: () =>
      set((s) => (s.alerts.length === 0 ? {} : { alerts: [] })),

    setStateOverlay: (stateOverlay) => set({ stateOverlay }),
    setShowEvents: (showEvents) => set({ showEvents }),

    setHover: (partial) =>
      set((s) => ({
        hover: {
          sampleIdx:
            partial.sampleIdx !== undefined ? partial.sampleIdx : s.hover.sampleIdx,
          eventIdx:
            partial.eventIdx !== undefined ? partial.eventIdx : s.hover.eventIdx,
          activityIdx:
            partial.activityIdx !== undefined
              ? partial.activityIdx
              : s.hover.activityIdx,
        },
      })),

    setRamp: (varId, ramp) =>
      set((s) => ({ rampBy: { ...s.rampBy, [varId]: ramp } })),

    clearRamp: (varId) =>
      set((s) => {
        if (!(varId in s.rampBy)) return {};
        const next = { ...s.rampBy };
        delete next[varId];
        return { rampBy: next };
      }),
  }));
}
