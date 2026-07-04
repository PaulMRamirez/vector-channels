// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import {
  smoothWaypoints,
  type Activity,
  type EventMarker,
  type ModeDef,
  type Sample,
  type ScreenPoint,
  type Trajectory,
  type VariableDef,
} from '@vector-channels/core';

export const VARIABLES: VariableDef[] = [
  {
    id: 'battery',
    name: 'Battery State of Charge',
    short: 'Batt',
    unit: '%',
    range: [10, 100],
    ramp: 'terrain',
    fmt: (v) => v.toFixed(1),
    limits: { warnLow: 25, criticalLow: 15 },
  },
  {
    id: 'slope',
    name: 'Slope Angle',
    short: 'Slope',
    unit: '°',
    range: [0, 22],
    ramp: 'inferno',
    fmt: (v) => v.toFixed(1),
    limits: { warnHigh: 15, criticalHigh: 18 },
  },
  {
    id: 'cpu',
    name: 'CPU Temperature',
    short: 'CPU',
    unit: '°C',
    range: [-20, 55],
    ramp: 'magma',
    fmt: (v) => v.toFixed(1),
    limits: { warnHigh: 45, criticalHigh: 50 },
  },
  {
    id: 'wheel',
    name: 'Wheel Current (total)',
    short: 'Wheel',
    unit: 'A',
    range: [0, 7],
    ramp: 'cividis',
    fmt: (v) => v.toFixed(2),
    limits: { warnHigh: 5, criticalHigh: 6 },
  },
  {
    id: 'databuf',
    name: 'Data Buffer Remaining',
    short: 'Buf',
    unit: 'GB',
    range: [0.5, 8],
    ramp: 'viridis',
    fmt: (v) => v.toFixed(2),
    limits: { warnLow: 1.5, criticalLow: 0.8 },
  },
  {
    id: 'solar',
    name: 'Solar Array Power',
    short: 'Solar',
    unit: 'W',
    range: [0, 450],
    ramp: 'grayscale',
    fmt: (v) => v.toFixed(0),
  },
  {
    id: 'posunc',
    name: 'Localization Uncertainty',
    short: 'PosUnc',
    unit: 'm',
    range: [0, 12],
    ramp: 'grayscale',
    fmt: (v) => v.toFixed(1),
  },
  {
    id: 'speed',
    name: 'Ground Speed',
    short: 'Speed',
    unit: 'cm/s',
    range: [0, 4.2],
    ramp: 'cividis',
    fmt: (v) => v.toFixed(2),
  },
];

export const MODES: Record<string, ModeDef> = {
  IDLE: { color: '#64748b', label: 'Idle' },
  DRIVE: { color: '#3b82f6', label: 'Drive' },
  IMAGE: { color: '#a855f7', label: 'Image' },
  DRILL: { color: '#f97316', label: 'Drill' },
  CHARGE: { color: '#10b981', label: 'Charge' },
  DOWNLINK: { color: '#14b8a6', label: 'Downlink' },
};

// Prototype waypoints in an abstract 2D space. We normalize them to [0, 1]
// and map the result to a ~1 km box anchored at Jezero Crater below.
const PROTOTYPE_WAYPOINTS: ScreenPoint[] = [
  { x: 140, y: 340 },
  { x: 220, y: 320 },
  { x: 315, y: 300 },
  { x: 390, y: 285 },
  { x: 420, y: 270 },
  { x: 475, y: 310 },
  { x: 555, y: 330 },
  { x: 635, y: 300 },
  { x: 705, y: 250 },
  { x: 765, y: 215 },
  { x: 790, y: 280 },
  { x: 735, y: 335 },
  { x: 645, y: 365 },
  { x: 545, y: 385 },
  { x: 465, y: 395 },
];

/** Jezero Crater rover landing region, roughly. */
export const JEZERO_CENTER = { lat: 18.44, lng: 77.45 };

// A 1 km traverse on Mars is ~0.017° of latitude and ~0.018° of longitude at
// this latitude — pick a slightly wider box so the path doesn't hug the edge.
const LNG_SPAN = 0.022;
const LAT_SPAN = 0.012;

/** Total sol duration in seconds (24 hours). */
export const SOL_SECONDS = 24 * 60 * 60;

const NORMALIZED_ACTIVITIES = [
  { start: 0.0, end: 0.05, label: 'Pre-flight check', mode: 'IDLE', color: '#64748b' },
  { start: 0.05, end: 0.25, label: 'Traverse A → Target 1', mode: 'DRIVE', color: '#3b82f6' },
  { start: 0.25, end: 0.35, label: 'Multispectral imaging', mode: 'IMAGE', color: '#a855f7' },
  { start: 0.35, end: 0.55, label: 'Traverse B → Target 2', mode: 'DRIVE', color: '#3b82f6' },
  { start: 0.55, end: 0.7, label: 'Drill & sample acquire', mode: 'DRILL', color: '#f97316' },
  { start: 0.7, end: 0.85, label: 'Solar charging', mode: 'CHARGE', color: '#10b981' },
  { start: 0.85, end: 0.95, label: 'Traverse home', mode: 'DRIVE', color: '#3b82f6' },
  { start: 0.95, end: 1.0, label: 'Evening downlink', mode: 'DOWNLINK', color: '#14b8a6' },
] as const;

const NORMALIZED_EVENTS = [
  { t: 0.03, type: 'circle', color: '#22c55e', label: 'Sol start / command uplink' },
  { t: 0.14, type: 'triangle', color: '#f97316', label: 'Wheel current elevated' },
  { t: 0.27, type: 'diamond', color: '#60a5fa', label: 'Imaging sequence start' },
  { t: 0.42, type: 'triangle', color: '#ef4444', label: 'Rough terrain detected' },
  { t: 0.57, type: 'diamond', color: '#60a5fa', label: 'Drill commencement' },
  { t: 0.72, type: 'circle', color: '#22c55e', label: 'Solar charging nominal' },
  { t: 0.96, type: 'circle', color: '#22c55e', label: 'DSN lock / downlink start' },
] as const;

function normalizedModeAt(tNorm: number): string {
  for (const a of NORMALIZED_ACTIVITIES) {
    if (tNorm >= a.start && tNorm < a.end) return a.mode;
  }
  return 'IDLE';
}

function computeSampleValues(tNorm: number, mode: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const v of VARIABLES) {
    let norm: number;
    switch (v.id) {
      case 'battery': {
        // Starts warm, discharges through morning drive + imaging + drive 2,
        // bottoms out into critical during drilling, solar charges aggressively,
        // gentle discharge through downlink to finish the sol well above half.
        let b: number;
        if (tNorm < 0.05) b = 0.7;
        else if (tNorm < 0.35) b = 0.7 - (tNorm - 0.05) * 0.8;     // 0.7 → 0.46
        else if (tNorm < 0.55) b = 0.46 - (tNorm - 0.35) * 1.25;   // 0.46 → 0.21 (warn)
        else if (tNorm < 0.7) b = 0.21 - (tNorm - 0.55) * 1.2;     // 0.21 → 0.03 (critical)
        else if (tNorm < 0.85) b = 0.03 + (tNorm - 0.7) * 6.0;     // 0.03 → 0.93
        else if (tNorm < 0.95) b = 0.93 - (tNorm - 0.85) * 0.45;   // 0.93 → 0.885
        else b = 0.885 - (tNorm - 0.95) * 0.8;                     // 0.885 → 0.845
        norm = b + 0.015 * Math.sin(tNorm * Math.PI * 20);
        break;
      }
      case 'slope':
        norm =
          0.12 +
          0.08 * Math.sin(tNorm * Math.PI * 6.3) +
          0.6 * Math.exp(-Math.pow((tNorm - 0.42) / 0.05, 2)) +
          0.3 * Math.exp(-Math.pow((tNorm - 0.13) / 0.04, 2)) +
          0.2 * Math.exp(-Math.pow((tNorm - 0.88) / 0.03, 2));
        break;
      case 'cpu': {
        // DRILL pushes hardware hard enough to hit critical; IMAGE holds
        // warn territory; DOWNLINK warms the radio appreciably.
        let base = 0.25;
        if (mode === 'IMAGE') base = 0.88;
        else if (mode === 'DRILL') base = 0.96;
        else if (mode === 'DOWNLINK') base = 0.7;
        else if (mode === 'DRIVE') base = 0.42;
        norm = base + 0.07 * Math.sin(tNorm * Math.PI * 17);
        break;
      }
      case 'wheel': {
        // Two visible spikes past warn (5 A): early traverse at t=0.13 and
        // the rough-terrain burst at t=0.42 which pushes into critical (>6 A).
        let w = 0;
        if (mode === 'DRIVE') w = 0.35;
        w += 0.6 * Math.exp(-Math.pow((tNorm - 0.42) / 0.06, 2));
        w += 0.4 * Math.exp(-Math.pow((tNorm - 0.13) / 0.04, 2));
        w += 0.2 * Math.exp(-Math.pow((tNorm - 0.88) / 0.03, 2));
        w += 0.04 * Math.sin(tNorm * Math.PI * 22);
        norm = w;
        break;
      }
      case 'databuf': {
        // Science activities burn through the buffer; it bottoms out in
        // critical (<0.8 GB) through the afternoon until evening downlink
        // clears the backlog and restores headroom.
        let rem: number;
        if (tNorm < 0.25) rem = 1.0;
        else if (tNorm < 0.35) rem = 1.0 - (tNorm - 0.25) * 2.0;     // 1.0 → 0.8
        else if (tNorm < 0.55) rem = 0.8 - (tNorm - 0.35) * 1.2;     // 0.8 → 0.56 (warn)
        else if (tNorm < 0.7) rem = 0.56 - (tNorm - 0.55) * 3.6;     // 0.56 → 0.02 (critical)
        else if (tNorm < 0.95) rem = 0.02;                           // held in critical
        else rem = 0.02 + (tNorm - 0.95) * 18;                       // downlink recovers
        norm = Math.max(0, Math.min(1, rem));
        break;
      }
      case 'solar':
        norm = Math.max(0, Math.sin(tNorm * Math.PI)) * 0.96;
        break;
      case 'posunc': {
        // Visual-odometry confidence degrades where the drive gets hard.
        // A sharp loss of lock coincides with the rough-terrain event
        // (t~0.42); a noisy stretch spans the stationary drill (0.55-0.7)
        // where VO has few fresh features to track. Elsewhere it is tight.
        let u = 0.06;
        u += 0.82 * Math.exp(-Math.pow((tNorm - 0.42) / 0.03, 2));
        if (tNorm > 0.55 && tNorm < 0.7) {
          u = Math.max(u, 0.34 + 0.14 * Math.sin(tNorm * Math.PI * 40));
        }
        norm = u;
        break;
      }
      case 'speed': {
        // The rover only rolls while driving; it holds station for imaging,
        // drilling, charging, and downlink. Flow chevrons march on the traverse
        // legs and stall at the stations.
        let s = 0;
        if (mode === 'DRIVE') s = 0.82 + 0.12 * Math.sin(tNorm * Math.PI * 26);
        norm = Math.max(0, s);
        break;
      }
      default:
        norm = 0.5;
    }
    norm = Math.max(0, Math.min(1, norm));
    values[v.id] = v.range[0] + norm * (v.range[1] - v.range[0]);
  }
  return values;
}

/**
 * Build the demo trajectory: a ~1 km Catmull-Rom traverse anchored at Jezero,
 * sampled over a 24-hour sol, with per-variable telemetry matching the
 * prototype's shapes.
 */
export function buildJezeroTrajectory(): Trajectory {
  // Normalize prototype waypoints to a [0, 1] box, then map onto a lng/lat
  // box centered at Jezero. y is inverted so the traverse reads north-up.
  const xs = PROTOTYPE_WAYPOINTS.map((p) => p.x);
  const ys = PROTOTYPE_WAYPOINTS.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);

  const geoWaypoints: ScreenPoint[] = PROTOTYPE_WAYPOINTS.map((p) => ({
    x: JEZERO_CENTER.lng + ((p.x - xMin) / (xMax - xMin) - 0.5) * LNG_SPAN,
    y: JEZERO_CENTER.lat + (0.5 - (p.y - yMin) / (yMax - yMin)) * LAT_SPAN,
  }));

  const dense = smoothWaypoints(geoWaypoints, 28);
  const n = dense.length;

  const samples: Sample[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const tNorm = i / (n - 1);
    const mode = normalizedModeAt(tNorm);
    const t = tNorm * SOL_SECONDS;
    samples[i] = {
      t,
      position: [dense[i].x, dense[i].y],
      values: computeSampleValues(tNorm, mode),
      mode,
    };
  }

  const activities: Activity[] = NORMALIZED_ACTIVITIES.map((a) => ({
    start: a.start * SOL_SECONDS,
    end: a.end * SOL_SECONDS,
    label: a.label,
    mode: a.mode,
    color: a.color,
  }));

  const events: EventMarker[] = NORMALIZED_EVENTS.map((e) => ({
    t: e.t * SOL_SECONDS,
    type: e.type,
    color: e.color,
    label: e.label,
  }));

  return {
    id: 'jezero-sol-1',
    samples,
    activities,
    events,
  };
}
