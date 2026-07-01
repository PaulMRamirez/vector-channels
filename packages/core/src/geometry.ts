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
 * Local curvature at each vertex, used to keep fixed perpendicular offsets from
 * folding back on themselves at tight turns (a fixed offset d self-intersects on
 * the concave side once d exceeds the radius of curvature r).
 */
export interface LocalCurvature {
  /** Radius of curvature in point (screen-pixel) units; Infinity on straight runs. */
  radius: number;
  /**
   * Which side is the inside of the bend: +1 if the left (+normal) side is
   * concave, -1 if the right side is, 0 if the run is effectively straight.
   * "Left" matches offsetPolyline's convention: the left-perpendicular of a
   * tangent (tx, ty) is (-ty, tx).
   */
  concaveSide: -1 | 0 | 1;
}

/**
 * Estimate per-vertex radius of curvature and concave side from the tangent
 * turn-rate over a one-vertex window. For a circle of radius R this returns
 * ~R; for a straight segment it returns Infinity. Pure and O(n).
 */
export function localCurvature(
  points: ScreenPoint[],
  tangents: Array<[number, number]>,
): LocalCurvature[] {
  const n = points.length;
  const out: LocalCurvature[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    // Change in the (unit) tangent over the window approximates dT; its
    // magnitude over the arc length ds gives curvature, and its direction
    // points toward the center of curvature (the concave side).
    const dtx = tangents[b][0] - tangents[a][0];
    const dty = tangents[b][1] - tangents[a][1];
    const dTmag = Math.hypot(dtx, dty);
    const ds = Math.hypot(points[b].x - points[a].x, points[b].y - points[a].y);
    if (dTmag < 1e-6 || ds < 1e-9) {
      out[i] = { radius: Infinity, concaveSide: 0 };
      continue;
    }
    const [tx, ty] = tangents[i];
    // Left normal (matches offsetPolyline). dT · n > 0 => the left side is inside.
    const dot = dtx * -ty + dty * tx;
    out[i] = {
      radius: ds / dTmag,
      concaveSide: dot > 0 ? 1 : dot < 0 ? -1 : 0,
    };
  }
  return out;
}

/**
 * Clamp an offset magnitude so a fixed perpendicular offset never folds at a
 * tight turn. `side` is +1 for the left (+normal) offset, -1 for the right. The
 * magnitude is only reduced when the offset sits on the concave (inside) side of
 * the bend, and only down to `safety` × radius; the convex side and straight
 * runs are returned unchanged.
 */
export function clampOffsetToCurvature(
  mag: number,
  side: -1 | 1,
  curv: LocalCurvature,
  safety = 0.65,
): number {
  if (curv.concaveSide !== side) return mag;
  if (!Number.isFinite(curv.radius)) return mag;
  return Math.min(mag, safety * curv.radius);
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
