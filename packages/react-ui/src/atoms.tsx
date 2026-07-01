// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RAMPS, toRgbStr, type LimitStatusLabel, type RampId, type VariableDef } from '@vector-channels/core';

interface RampGroup {
  label: string;
  ids: RampId[];
}

const RAMP_GROUPS: RampGroup[] = [
  {
    label: 'Sequential',
    ids: ['viridis', 'magma', 'inferno', 'cividis', 'grayscale', 'terrain'],
  },
  {
    label: 'Diverging',
    ids: ['coolwarm', 'rdylgn', 'spectral', 'prgn'],
  },
  {
    label: 'Categorical',
    ids: ['bold5', 'set1', 'paired', 'moran'],
  },
];

export interface SectionProps {
  title: string;
  hint?: string;
  children: ReactNode;
}

export function Section({ title, hint, children }: SectionProps): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
          {title}
        </div>
        {hint ? <div className="text-xs text-slate-600">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

export interface VarSelectProps {
  value: string | null;
  options: VariableDef[];
  onChange: (id: string | null) => void;
  includeNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
}

export function VarSelect({
  value,
  options,
  onChange,
  includeNone = false,
  noneLabel = '(none)',
  disabled = false,
}: VarSelectProps): JSX.Element {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      disabled={disabled}
      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {includeNone ? <option value="">{noneLabel}</option> : null}
      {options.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  );
}

export interface RampSwatchProps {
  ramp: RampId;
  w?: number;
  h?: number;
}

export function RampSwatch({ ramp, w = 64, h = 8 }: RampSwatchProps): JSX.Element {
  const fn = RAMPS[ramp];
  // 32 sample stops fed into a CSS linear-gradient — the browser interpolates
  // smoothly between them on the GPU, so the swatch reads as continuous even
  // for ramps with only a handful of control points.
  const SAMPLES = 32;
  const stopsCss = Array.from(
    { length: SAMPLES },
    (_, i) => `${toRgbStr(fn(i / (SAMPLES - 1)))} ${(i / (SAMPLES - 1)) * 100}%`,
  ).join(', ');
  return (
    <div
      className="shrink-0"
      style={{
        width: `${w}px`,
        height: `${h}px`,
        background: `linear-gradient(to right, ${stopsCss})`,
      }}
    />
  );
}

export interface RampPickerProps {
  value: RampId;
  onChange: (ramp: RampId) => void;
}

export function RampPicker({ value, onChange }: RampPickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (ev: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 hover:border-slate-500 focus:outline-none focus:border-slate-500"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <RampSwatch ramp={value} w={48} h={8} />
          <span className="capitalize truncate">{value}</span>
        </span>
        <span className="text-slate-500 text-xs" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-10 mt-1 max-h-80 overflow-y-auto bg-slate-900 border border-slate-700 rounded shadow-lg"
        >
          {RAMP_GROUPS.map((group) => (
            <li key={group.label} role="presentation">
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500">
                {group.label}
              </div>
              <ul>
                {group.ids.map((r) => {
                  const selected = r === value;
                  return (
                    <li key={r}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          onChange(r);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left ${
                          selected
                            ? 'bg-slate-800 text-slate-100'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <RampSwatch ramp={r} w={48} h={8} />
                        <span className="capitalize">{r}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export interface StatusBadgeProps {
  status: LimitStatusLabel | null;
}

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element | null {
  if (!status || status === 'nominal') return null;
  const cls =
    status === 'critical'
      ? 'bg-red-950 text-red-400 border-red-900'
      : 'bg-amber-950 text-amber-400 border-amber-900';
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded border uppercase tracking-wide tabular-nums ${cls}`}
    >
      {status}
    </span>
  );
}
