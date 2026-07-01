// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import type { ScreenPoint } from './types.js';

/**
 * Compute unit tangent vectors at each point along a polyline using a windowed
 * finite difference. Window size controls smoothing — larger windows give more
 * stable offsets but lag at sharp turns.
 *
 * Returned as [tx, ty] pairs matching the input point array length.
 */
export function computeTangents(
  points: ScreenPoint[],
  windowSize = 3
): Array<[number, number]> {
  const n = points.length;
  const tangents: Array<[number, number]> = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - windowSize);
    const b = Math.min(n - 1, i + windowSize);
    const dx = points[b].x - points[a].x;
    const dy = points[b].y - points[a].y;
    const m = Math.hypot(dx, dy) || 1;
    tangents[i] = [dx / m, dy / m];
  }
  return tangents;
}

/**
 * Channel offset schedule. First channel sits at +base on one side, second
 * at -base, third at +(base + step), fourth at -(base + step), etc.
 *
 * This produces a natural tight-pair-near-the-primary, outer-pairs-stepping-out
 * geometry that reads similarly to a multi-track strip chart.
 */
export function offsetForChannel(idx: number, base = 9, step = 7): number {
  const side = idx % 2 === 0 ? 1 : -1;
  const stepIdx = Math.floor(idx / 2);
  return side * (base + stepIdx * step);
}

/**
 * Centripetal Catmull-Rom spline interpolation. Used for smoothing synthetic
 * waypoint data during sample generation. Real telemetry is typically
 * pre-sampled at high density and does not need spline smoothing.
 */
export function catmullRom(
  p0: ScreenPoint,
  p1: ScreenPoint,
  p2: ScreenPoint,
  p3: ScreenPoint,
  t: number
): ScreenPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

/**
 * Smooth a waypoint sequence into a dense polyline via Catmull-Rom. Produces
 * `samplesPerSegment` points per input segment. Used by sample-data generators
 * for the demo; real telemetry pipelines should provide dense samples directly.
 */
export function smoothWaypoints(
  waypoints: ScreenPoint[],
  samplesPerSegment = 28
): ScreenPoint[] {
  if (waypoints.length < 2) return [...waypoints];
  const pts: ScreenPoint[] = [];
  const extended = [waypoints[0], ...waypoints, waypoints[waypoints.length - 1]];
  for (let i = 0; i < extended.length - 3; i++) {
    for (let j = 0; j < samplesPerSegment; j++) {
      pts.push(
        catmullRom(extended[i], extended[i + 1], extended[i + 2], extended[i + 3], j / samplesPerSegment)
      );
    }
  }
  pts.push({ ...waypoints[waypoints.length - 1] });
  return pts;
}

/**
 * Compute perpendicular offset points for a polyline at a given pixel offset.
 * Positive offset is to the left of the travel direction in screen space
 * (following canvas's y-down convention, the left-perpendicular of (tx, ty)
 * is (-ty, tx)).
 */
export function offsetPolyline(
  points: ScreenPoint[],
  tangents: Array<[number, number]>,
  offsetPx: number
): ScreenPoint[] {
  const n = points.length;
  const out: ScreenPoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tangents[i];
    out[i] = {
      x: points[i].x + -ty * offsetPx,
      y: points[i].y + tx * offsetPx,
    };
  }
  return out;
}
