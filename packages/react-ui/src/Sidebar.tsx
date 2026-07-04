// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { useEffect, useState } from 'react';
import {
  ALERT_STYLES,
  type Activity,
  type EventMarker,
  type ModeDef,
  type VariableDef,
} from '@vector-channels/core';
import { RampPicker, Section, VarSelect } from './atoms.js';
import type { VectorChannelsStore } from './store.js';

export interface SidebarProps {
  store: VectorChannelsStore;
  variables: VariableDef[];
  modes: Record<string, ModeDef>;
  activities: Activity[];
  events: EventMarker[];
  /** Initial collapsed state. Defaults to false (expanded). */
  defaultCollapsed?: boolean;
  /**
   * Called whenever the collapsed state changes (and once on mount with the
   * initial value). Hosts embedding a resizable map should use this to call
   * the map's resize hook — e.g. Leaflet's `map.invalidateSize()` — since the
   * panel collapse reclaims horizontal space the map won't otherwise notice.
   */
  onCollapsedChange?: (collapsed: boolean) => void;
}

const RANGE_FMT = (v: number): string =>
  Number.isInteger(v) ? v.toString() : v.toFixed(1);

export function Sidebar({
  store,
  variables,
  modes,
  activities,
  events,
  defaultCollapsed = false,
  onCollapsedChange,
}: SidebarProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Notify the host on mount and on every toggle so it can resize the map.
  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

  const primaryVar = store((s) => s.primaryVar);
  const widthVar = store((s) => s.widthVar);
  const widthInvert = store((s) => s.widthInvert);
  const uncertaintyVar = store((s) => s.uncertaintyVar);
  const uncertaintyInvert = store((s) => s.uncertaintyInvert);
  const channels = store((s) => s.channels);
  const alerts = store((s) => s.alerts);
  const stateOverlay = store((s) => s.stateOverlay);
  const showEvents = store((s) => s.showEvents);
  const hoveredActivityIdx = store((s) => s.hover.activityIdx);

  const setPrimary = store((s) => s.setPrimary);
  const setWidth = store((s) => s.setWidth);
  const setWidthInvert = store((s) => s.setWidthInvert);
  const setUncertainty = store((s) => s.setUncertainty);
  const setUncertaintyInvert = store((s) => s.setUncertaintyInvert);
  const addChannel = store((s) => s.addChannel);
  const removeChannel = store((s) => s.removeChannel);
  const moveChannel = store((s) => s.moveChannel);
  const addAlert = store((s) => s.addAlert);
  const removeAlert = store((s) => s.removeAlert);
  const setStateOverlay = store((s) => s.setStateOverlay);
  const setShowEvents = store((s) => s.setShowEvents);
  const setHover = store((s) => s.setHover);
  const setRamp = store((s) => s.setRamp);

  const varById = new Map(variables.map((v) => [v.id, v]));
  const primaryVarDef = primaryVar ? varById.get(primaryVar) ?? null : null;
  const widthVarDef = widthVar ? varById.get(widthVar) ?? null : null;
  const uncertaintyVarDef = uncertaintyVar
    ? varById.get(uncertaintyVar) ?? null
    : null;

  const addChannelOptions = variables.filter(
    (v) => v.id !== primaryVar && !channels.includes(v.id),
  );
  const addAlertOptions = variables.filter(
    (v) => !!v.limits && !alerts.includes(v.id),
  );
  const modeEntries = Object.entries(modes);

  if (collapsed) {
    return (
      <div
        className="w-9 shrink-0 border-l border-slate-800 flex flex-col transition-[width] duration-200 ease-in-out"
        style={{ backgroundColor: '#0a0f1a' }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expand controls"
          aria-label="Expand controls"
          aria-expanded={false}
          className="flex-1 w-full flex flex-col items-center gap-3 pt-3 text-slate-500 hover:text-slate-200 hover:bg-slate-900/60 focus:outline-none focus-visible:text-slate-200"
        >
          <span className="text-lg leading-none">&lsaquo;</span>
          <span className="text-[10px] uppercase tracking-widest select-none [writing-mode:vertical-rl] rotate-180">
            Controls
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="w-80 shrink-0 border-l border-slate-800 flex flex-col transition-[width] duration-200 ease-in-out"
      style={{ backgroundColor: '#0a0f1a' }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Controls
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse controls"
          aria-label="Collapse controls"
          aria-expanded
          className="text-slate-500 hover:text-slate-200 px-1 text-lg leading-none focus:outline-none focus-visible:text-slate-200"
        >
          &rsaquo;
        </button>
      </div>
      <div className="overflow-y-auto p-4 space-y-5">
      <Section title="Primary channel" hint="color · width · fade">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">Color</div>
            {stateOverlay ? (
              <div className="text-xs text-slate-600">(overridden)</div>
            ) : null}
          </div>
          <VarSelect
            value={primaryVar}
            options={variables}
            onChange={setPrimary}
            includeNone
            noneLabel="(none)"
            disabled={stateOverlay}
          />
          {primaryVarDef ? (
            <>
              <div className="text-xs text-slate-500 tabular-nums">
                {RANGE_FMT(primaryVarDef.range[0])}
                {primaryVarDef.unit ? ` ${primaryVarDef.unit}` : ''}
                {' → '}
                {RANGE_FMT(primaryVarDef.range[1])}
                {primaryVarDef.unit ? ` ${primaryVarDef.unit}` : ''}
              </div>
              <RampPicker
                value={primaryVarDef.ramp}
                onChange={(r) => setRamp(primaryVarDef.id, r)}
              />
            </>
          ) : null}
        </div>

        <div className="space-y-2 pt-3">
          <div className="text-xs text-slate-500">Width</div>
          <VarSelect
            value={widthVar}
            options={variables}
            onChange={setWidth}
            includeNone
            noneLabel="(constant)"
          />
          {widthVarDef ? (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>3 px → 10 px</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-slate-400"
                  checked={widthInvert}
                  onChange={(e) => setWidthInvert(e.target.checked)}
                />
                invert
              </label>
            </div>
          ) : null}
        </div>

        <div className="space-y-2 pt-3">
          <div className="text-xs text-slate-500">Fade by uncertainty</div>
          <VarSelect
            value={uncertaintyVar}
            options={variables}
            onChange={setUncertainty}
            includeNone
            noneLabel="(none)"
          />
          {uncertaintyVarDef ? (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>certain → faded</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-slate-400"
                  checked={uncertaintyInvert}
                  onChange={(e) => setUncertaintyInvert(e.target.checked)}
                />
                confidence
              </label>
            </div>
          ) : (
            <div className="text-xs text-slate-600 italic">
              Dims low-confidence stretches so untrusted data recedes. Alerts
              stay full-strength.
            </div>
          )}
        </div>
      </Section>

      <Section title="Alerts" hint="worst-status wins">
        {alerts.length === 0 ? (
          <div className="text-xs text-slate-600 italic">
            No variables watched. Add one with limits to see where readings
            cross warn or critical.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {alerts.map((id) => {
              const v = varById.get(id);
              if (!v) return null;
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 px-1 py-1 rounded text-sm text-slate-300 hover:bg-slate-900"
                >
                  <span className="flex-1 truncate">{v.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAlert(id)}
                    className="hover:text-red-400 px-1 text-xs"
                    title="Remove from watchlist"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addAlert(e.target.value);
          }}
          disabled={addAlertOptions.length === 0}
          className="w-full bg-slate-900 border border-dashed border-slate-700 rounded px-2 py-1.5 text-sm text-slate-400 focus:outline-none focus:border-slate-500 disabled:opacity-40"
        >
          <option value="">+ Add variable to watch…</option>
          {addAlertOptions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
          <div
            className="h-1 w-6 rounded"
            style={{ background: ALERT_STYLES.warn.color }}
          />
          <span>warn</span>
          <div
            className="h-1 w-6 rounded ml-2"
            style={{ background: ALERT_STYLES.critical.color }}
          />
          <span>critical</span>
        </div>
      </Section>

      <Section title="State overlay" hint="discrete mode">
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            className="accent-slate-400"
            checked={stateOverlay}
            onChange={(e) => setStateOverlay(e.target.checked)}
          />
          Color primary channel by rover mode
        </label>
        {stateOverlay && modeEntries.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 text-xs text-slate-400">
            {modeEntries.map(([id, mode]) => (
              <div key={id} className="flex items-center gap-2">
                <div
                  className="h-2 w-5 rounded"
                  style={{ background: mode.color }}
                />
                <span>{mode.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Channels" hint="tight → outer, ordered">
        {channels.length === 0 ? (
          <div className="text-xs text-slate-600 italic">
            No channels. Use dropdown below to add one.
          </div>
        ) : (
          <ul className="space-y-1">
            {channels.map((id, idx) => {
              const v = varById.get(id);
              if (!v) return null;
              return (
                <li
                  key={id}
                  className="px-1 py-1 rounded hover:bg-slate-900 text-sm text-slate-300"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 tabular-nums w-4 text-right">
                      {idx + 1}
                    </span>
                    <span className="flex-1 truncate">{v.short}</span>
                    <button
                      type="button"
                      onClick={() => moveChannel(idx, -1)}
                      disabled={idx === 0}
                      className="hover:text-slate-100 disabled:opacity-20 disabled:cursor-not-allowed px-1 text-xs"
                      title="Move closer to primary"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveChannel(idx, 1)}
                      disabled={idx === channels.length - 1}
                      className="hover:text-slate-100 disabled:opacity-20 disabled:cursor-not-allowed px-1 text-xs"
                      title="Move farther from primary"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeChannel(id)}
                      className="hover:text-red-400 px-1 text-xs"
                      title="Remove channel"
                    >
                      ×
                    </button>
                  </div>
                  <div className="pl-6 pt-1">
                    <RampPicker
                      value={v.ramp}
                      onChange={(r) => setRamp(v.id, r)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addChannel(e.target.value);
          }}
          className="w-full bg-slate-900 border border-dashed border-slate-700 rounded px-2 py-1.5 text-sm text-slate-400 focus:outline-none focus:border-slate-500"
        >
          <option value="">+ Add channel…</option>
          {addChannelOptions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Activities" hint="hover to highlight">
        {activities.length === 0 ? (
          <div className="text-xs text-slate-600 italic">No activities.</div>
        ) : (
          <ul className="space-y-0.5">
            {activities.map((a, idx) => (
              <li
                key={`${idx}-${a.label}`}
                onMouseEnter={() => setHover({ activityIdx: idx })}
                onMouseLeave={() => setHover({ activityIdx: null })}
                className={`flex items-center gap-2 px-1 py-1 rounded cursor-default text-sm ${
                  hoveredActivityIdx === idx
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <div
                  className="h-2 w-3 rounded shrink-0"
                  style={{ background: a.color }}
                />
                <span className="flex-1 truncate">{a.label}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Events" hint="glyphs on primary channel">
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            className="accent-slate-400"
            checked={showEvents}
            onChange={(e) => setShowEvents(e.target.checked)}
          />
          Show event glyphs
        </label>
        {showEvents && events.length > 0 ? (
          <div className="pt-2 text-xs text-slate-500 space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
              circle — info / checkpoint
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 bg-slate-400"
                style={{ transform: 'rotate(45deg)' }}
              />
              diamond — state transition
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-0 w-0"
                style={{
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderBottom: '6px solid rgb(148 163 184)',
                }}
              />
              triangle — anomaly / alert
            </div>
          </div>
        ) : null}
      </Section>
      </div>
    </div>
  );
}
