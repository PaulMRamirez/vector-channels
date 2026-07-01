// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import {
  RAMPS,
  ALERT_STYLES,
  colorForValue,
  computeLimitStatus,
  normalize,
  toRgbStr,
} from './color.js';
import { offsetPolyline } from './geometry.js';
import type {
  EventGlyphType,
  ModeDef,
  ScreenPoint,
  Trajectory,
  VariableDef,
} from './types.js';

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Primary channel widths
// ---------------------------------------------------------------------------

/**
 * Compute per-sample stroke widths for the primary channel. If widthVar is set,
 * the width varies from 2.5px (at range min) to 14px (at range max). Optional
 * invert flips the mapping — useful when the variable being shown is a
 * "badness" indicator (e.g., slope high = thin track = less safe).
 */
export function computePrimaryWidths(
  sampleCount: number,
  widthValues: (number | null)[] | null,
  widthVar: VariableDef | null,
  widthInvert: boolean
): number[] {
  const widths = new Array<number>(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const v = widthValues?.[i];
    if (widthVar && v != null) {
      let t = normalize(v, widthVar.range);
      if (widthInvert) t = 1 - t;
      widths[i] = 2.5 + t * 11.5;
    } else {
      widths[i] = 7.5;
    }
  }
  return widths;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/**
 * Draw a single channel: a polyline offset perpendicular from the primary
 * channel in screen space, colored by the variable's ramp at each segment.
 *
 * Uses bucketed rendering — groups segments by color bucket to minimize
 * stroke-style changes. 256 buckets matches matplotlib's standard LUT size;
 * the per-bucket cost is dominated by stroke calls which stay cheap at this
 * scale (sub-millisecond per channel at typical sample counts).
 */
export function drawChannel(
  ctx: CanvasRenderingContext2D,
  points: ScreenPoint[],
  tangents: Array<[number, number]>,
  values: (number | null)[],
  varDef: VariableDef,
  offsetPx: number,
  strokeWidth: number
): void {
  const n = points.length;
  if (n < 2) return;

  const BUCKETS = 256;
  const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
  const offs = offsetPolyline(points, tangents, offsetPx);

  for (let i = 0; i < n - 1; i++) {
    const v = values[i];
    if (v == null) continue; // skip gaps
    const t = normalize(v, varDef.range);
    const b = Math.min(BUCKETS - 1, Math.floor(t * BUCKETS));
    buckets[b].push(i);
  }

  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let b = 0; b < BUCKETS; b++) {
    if (buckets[b].length === 0) continue;
    ctx.strokeStyle = toRgbStr(RAMPS[varDef.ramp]((b + 0.5) / BUCKETS));
    ctx.beginPath();
    for (const i of buckets[b]) {
      ctx.moveTo(offs[i].x, offs[i].y);
      ctx.lineTo(offs[i + 1].x, offs[i + 1].y);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Primary channel (filled polygon strip with optional alert band)
// ---------------------------------------------------------------------------

export interface AlertWatch {
  var: VariableDef;
  values: (number | null)[];
}

export interface PrimaryChannelArgs {
  points: ScreenPoint[];
  tangents: Array<[number, number]>;
  widths: number[];
  colorValues?: (number | null)[] | null;
  colorVar?: VariableDef | null;
  stateValues?: (string | undefined)[] | null;
  stateOverlay?: boolean;
  modes?: Record<string, ModeDef>;
  /**
   * Watched-variable definitions for the alert band. Each must have `limits`.
   * Order doesn't affect rendering — the band shows the worst status across
   * the watchlist at each segment.
   */
  alertWatches?: AlertWatch[];
  /** Gap in CSS pixels between the primary fill edge and the alert band. Default 1.5. */
  alertGapPx?: number;
  /** Multiplier applied to the baseline alert widths. Default 1. */
  alertWidthScale?: number;
  /**
   * Optional floor on the distance from the primary centerline to the alert
   * band centerline. The renderer uses this to ensure the band sits beyond
   * all channels regardless of channel count.
   */
  alertMinOffsetPx?: number;
}

// Baseline half-width used to place the alert band centerline outside the
// fill. Both warn and critical share one centerline so transitions don't
// shift the band geometrically.
export const ALERT_BASE_WIDTH = 3.5;

/**
 * Worst limit status across the watched variables at a given sample. Critical
 * short-circuits warn; warn beats nominal. Variables with null values at the
 * sample are skipped. Variables without limits are silently ignored.
 */
function worstAlertStatus(
  segIdx: number,
  watches: AlertWatch[],
): 'nominal' | 'warn' | 'critical' {
  let worst: 'nominal' | 'warn' | 'critical' = 'nominal';
  for (const w of watches) {
    if (!w.var.limits) continue;
    const val = w.values[segIdx];
    if (val == null) continue;
    const s = computeLimitStatus(val, w.var.limits).status;
    if (s === 'critical') return 'critical';
    if (s === 'warn') worst = 'warn';
  }
  return worst;
}

/**
 * Draw the primary channel as a filled polygon strip with per-segment color,
 * then stroke the alert band.
 *
 * Alert band rendering: when the watchlist is non-empty, each segment's
 * status is the worst across all watched variables. Warn and critical
 * segments are grouped into runs and stroked as continuous paths; nominal
 * segments are intentionally not drawn so the band reads as pure attention
 * signal. Empty watchlist = no band rendered at all.
 */
export function drawPrimaryChannel(
  ctx: CanvasRenderingContext2D,
  args: PrimaryChannelArgs
): void {
  const {
    points,
    tangents,
    widths,
    colorValues,
    colorVar,
    stateValues,
    stateOverlay,
    modes,
    alertWatches,
    alertGapPx,
    alertWidthScale,
    alertMinOffsetPx,
  } = args;

  const n = points.length;
  if (n < 2) return;

  const gap = alertGapPx ?? 1.5;
  const widthScale = alertWidthScale ?? 1;
  const alertPad = gap + ALERT_BASE_WIDTH / 2;
  const minAlertOffset = alertMinOffsetPx ?? 0;
  const watches = alertWatches ?? [];
  const hasAlerts = watches.length > 0;

  // Compute fill edges; only compute alert-band edges if we'll render them.
  const L: ScreenPoint[] = new Array(n);
  const R: ScreenPoint[] = new Array(n);
  const Lout: ScreenPoint[] | null = hasAlerts ? new Array(n) : null;
  const Rout: ScreenPoint[] | null = hasAlerts ? new Array(n) : null;
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tangents[i];
    const hw = widths[i] / 2;
    const px = points[i].x;
    const py = points[i].y;
    L[i] = { x: px + -ty * hw, y: py + tx * hw };
    R[i] = { x: px - -ty * hw, y: py - tx * hw };
    if (hasAlerts) {
      const ho = Math.max(hw + alertPad, minAlertOffset);
      Lout![i] = { x: px + -ty * ho, y: py + tx * ho };
      Rout![i] = { x: px - -ty * ho, y: py - tx * ho };
    }
  }

  // Fill quads
  for (let i = 0; i < n - 1; i++) {
    let color = '#64748b';
    if (stateOverlay && stateValues && modes) {
      const mode = stateValues[i];
      if (mode && modes[mode]) color = modes[mode].color;
    } else if (colorVar && colorValues) {
      const v1 = colorValues[i];
      const v2 = colorValues[i + 1];
      if (v1 != null && v2 != null) {
        color = colorForValue((v1 + v2) / 2, colorVar.range, colorVar.ramp);
      }
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(L[i].x, L[i].y);
    ctx.lineTo(L[i + 1].x, L[i + 1].y);
    ctx.lineTo(R[i + 1].x, R[i + 1].y);
    ctx.lineTo(R[i].x, R[i].y);
    ctx.closePath();
    ctx.fill();
  }

  if (!hasAlerts) return;

  // Per-segment worst status across the watchlist.
  const statuses: Array<'nominal' | 'warn' | 'critical'> = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    statuses[i] = worstAlertStatus(i, watches);
  }

  // Group consecutive same-status segments into runs; only warn/critical runs
  // get rendered (nominal runs are intentionally invisible).
  interface Run {
    status: 'warn' | 'critical';
    start: number;
    end: number;
  }
  const runs: Run[] = [];
  let curStatus = statuses[0];
  let runStart = 0;
  for (let i = 1; i < n - 1; i++) {
    if (statuses[i] !== curStatus) {
      if (curStatus !== 'nominal') {
        runs.push({ status: curStatus, start: runStart, end: i - 1 });
      }
      curStatus = statuses[i];
      runStart = i;
    }
  }
  if (curStatus !== 'nominal') {
    runs.push({ status: curStatus, start: runStart, end: n - 2 });
  }

  if (runs.length === 0) return;

  // Render warn before critical so critical sits on top at transitions.
  runs.sort((a, b) => (a.status === 'warn' ? 0 : 1) - (b.status === 'warn' ? 0 : 1));

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const run of runs) {
    const style = ALERT_STYLES[run.status];
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width * widthScale;
    // L edge
    ctx.beginPath();
    ctx.moveTo(Lout![run.start].x, Lout![run.start].y);
    for (let i = run.start; i <= run.end; i++) {
      ctx.lineTo(Lout![i + 1].x, Lout![i + 1].y);
    }
    ctx.stroke();
    // R edge
    ctx.beginPath();
    ctx.moveTo(Rout![run.start].x, Rout![run.start].y);
    for (let i = run.start; i <= run.end; i++) {
      ctx.lineTo(Rout![i + 1].x, Rout![i + 1].y);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Event glyphs
// ---------------------------------------------------------------------------

export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: EventGlyphType,
  color: string,
  size = 6.5
): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  if (type === 'circle') {
    ctx.arc(x, y, size, 0, Math.PI * 2);
  } else if (type === 'diamond') {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
  } else {
    // triangle
    const h = size * 1.05;
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + size * 0.9, y + h * 0.55);
    ctx.lineTo(x - size * 0.9, y + h * 0.55);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Activity hover highlight
// ---------------------------------------------------------------------------

export function drawActivityHighlight(
  ctx: CanvasRenderingContext2D,
  points: ScreenPoint[],
  startIdx: number,
  endIdx: number,
  color: string
): void {
  if (endIdx <= startIdx) return;
  const si = Math.max(0, startIdx);
  const ei = Math.min(points.length - 1, endIdx);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // White halo
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(points[si].x, points[si].y);
  for (let i = si + 1; i <= ei; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();

  // Activity color
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(points[si].x, points[si].y);
  for (let i = si + 1; i <= ei; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Hover indicator
// ---------------------------------------------------------------------------

export function drawHoverIndicator(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  tangent: [number, number]
): void {
  const [tx, ty] = tangent;
  const nx = -ty;
  const ny = tx;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(point.x + nx * 45, point.y + ny * 45);
  ctx.lineTo(point.x - nx * 45, point.y - ny * 45);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Utility — extract per-variable value array from trajectory samples
// ---------------------------------------------------------------------------

export function extractValues(
  trajectory: Trajectory,
  varId: string
): (number | null)[] {
  return trajectory.samples.map((s) => s.values[varId] ?? null);
}

export function extractModes(trajectory: Trajectory): (string | undefined)[] {
  return trajectory.samples.map((s) => s.mode);
}
