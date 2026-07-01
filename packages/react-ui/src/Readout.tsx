// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import {
  computeLimitStatus,
  type ModeDef,
  type Trajectory,
  type VariableDef,
} from '@vector-channels/core';
import { RampSwatch, StatusBadge } from './atoms.js';
import type { VectorChannelsStore } from './store.js';

export interface ReadoutProps {
  store: VectorChannelsStore;
  variables: VariableDef[];
  modes: Record<string, ModeDef>;
  trajectory: Trajectory;
}

export function Readout({
  store,
  variables,
  modes,
  trajectory,
}: ReadoutProps): JSX.Element {
  const primaryVar = store((s) => s.primaryVar);
  const widthVar = store((s) => s.widthVar);
  const channels = store((s) => s.channels);
  const alerts = store((s) => s.alerts);
  const stateOverlay = store((s) => s.stateOverlay);
  const sampleIdx = store((s) => s.hover.sampleIdx);

  const varById = new Map(variables.map((v) => [v.id, v]));
  const hoverSample =
    sampleIdx != null &&
    sampleIdx >= 0 &&
    sampleIdx < trajectory.samples.length
      ? trajectory.samples[sampleIdx]
      : null;

  const activeIds: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | null): void => {
    if (id && !seen.has(id)) {
      activeIds.push(id);
      seen.add(id);
    }
  };
  if (!stateOverlay) push(primaryVar);
  push(widthVar);
  channels.forEach(push);
  alerts.forEach(push);

  const alertSet = new Set(alerts);
  const getRoles = (id: string): string[] => {
    const roles: string[] = [];
    if (id === primaryVar && !stateOverlay) roles.push('primary');
    if (id === widthVar) roles.push('width');
    const channelIdx = channels.indexOf(id);
    if (channelIdx >= 0) roles.push(`channel #${channelIdx + 1}`);
    if (alertSet.has(id)) roles.push('alert');
    return roles;
  };

  const hoverMode = hoverSample?.mode;
  const hoverModeDef = hoverMode ? modes[hoverMode] : undefined;

  const fmtValue = (v: VariableDef, value: number): string => {
    const body = v.fmt ? v.fmt(value) : value.toFixed(2);
    return v.unit ? `${body} ${v.unit}` : body;
  };

  return (
    <div className="border-t border-slate-800 px-4 py-3 bg-slate-950">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {activeIds.length === 0 && !(stateOverlay && hoverModeDef) ? (
          <div className="text-slate-600 italic">
            No active variables. Assign one as primary, width, channel, or alert.
          </div>
        ) : null}

        {activeIds.map((id) => {
          const v = varById.get(id);
          if (!v) return null;
          const rawVal = hoverSample?.values[id];
          const val = typeof rawVal === 'number' ? rawVal : null;
          const status =
            val != null && v.limits
              ? computeLimitStatus(val, v.limits).status
              : null;
          const roles = getRoles(id);
          return (
            <div key={id} className="flex items-center gap-2">
              <RampSwatch ramp={v.ramp} w={36} h={6} />
              <div>
                <div className="text-slate-300">
                  {v.short}
                  <span className="ml-1.5 text-slate-600">
                    {roles.join(' · ') || '—'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-100 text-sm tabular-nums">
                    {val != null ? fmtValue(v, val) : '—'}
                  </span>
                  {status && status !== 'nominal' ? (
                    <StatusBadge status={status} />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        {stateOverlay && hoverModeDef ? (
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-1.5 rounded"
              style={{ background: hoverModeDef.color }}
            />
            <div>
              <div className="text-slate-300">
                Mode <span className="ml-1.5 text-slate-600">primary</span>
              </div>
              <div
                className="text-sm"
                style={{ color: hoverModeDef.color }}
              >
                {hoverModeDef.label}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
