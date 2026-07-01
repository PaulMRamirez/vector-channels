// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { describe, expect, it } from 'vitest';
import {
  clampOffsetToCurvature,
  computeTangents,
  localCurvature,
  type LocalCurvature,
  type ScreenPoint,
} from '../src/index.js';

/** Sample a circle of radius R centered at the origin, CCW, with `n` points. */
function circle(R: number, n: number): ScreenPoint[] {
  const pts: ScreenPoint[] = [];
  for (let i = 0; i < n; i++) {
    const phi = (2 * Math.PI * i) / n;
    pts.push({ x: R * Math.cos(phi), y: R * Math.sin(phi) });
  }
  return pts;
}

describe('localCurvature', () => {
  it('returns Infinity radius and no concavity on a straight line', () => {
    const points: ScreenPoint[] = Array.from({ length: 10 }, (_, i) => ({
      x: i * 5,
      y: 0,
    }));
    const curv = localCurvature(points, computeTangents(points));
    for (const c of curv) {
      expect(c.radius).toBe(Infinity);
      expect(c.concaveSide).toBe(0);
    }
  });

  it('estimates the radius of a densely sampled circle', () => {
    const R = 100;
    const points = circle(R, 240);
    const curv = localCurvature(points, computeTangents(points));
    // Check interior samples (endpoints use a one-sided window and are noisier).
    const interior = curv.slice(20, 220);
    for (const c of interior) {
      expect(c.radius).toBeGreaterThan(R * 0.85);
      expect(c.radius).toBeLessThan(R * 1.15);
    }
  });

  it('adaptive window stabilizes tangents on a densely sampled noisy path', () => {
    // Dense samples (0.3px apart) with high-frequency sub-pixel y jitter — the
    // "zoomed out" regime where a fixed sample window sees mostly noise. The
    // path is essentially +x, so a stable tangent has near-zero ty.
    const points: ScreenPoint[] = Array.from({ length: 80 }, (_, i) => ({
      x: i * 0.3,
      y: Math.sin(i * 2.3) * 0.5,
    }));
    const maxTy = (t: Array<[number, number]>): number =>
      t.slice(10, 70).reduce((m, [, ty]) => Math.max(m, Math.abs(ty)), 0);
    const noisy = maxTy(computeTangents(points, 3, 0)); // adaptive disabled
    const stable = maxTy(computeTangents(points, 3, 25)); // wide minimum span
    expect(stable).toBeLessThan(noisy);
    expect(stable).toBeLessThan(0.2);
  });

  it('reports a consistent concave side around a smooth bend', () => {
    // A CCW circle bends toward its center; the left (+normal) side is inside.
    const points = circle(100, 240);
    const curv = localCurvature(points, computeTangents(points)).slice(20, 220);
    for (const c of curv) {
      expect(c.concaveSide).toBe(1);
    }
  });
});

describe('clampOffsetToCurvature', () => {
  const bendLeft: LocalCurvature = { radius: 10, concaveSide: 1 };

  it('reduces the offset on the concave side when it exceeds safety * radius', () => {
    // safety 0.65 * radius 10 = 6.5, below the requested 12.
    expect(clampOffsetToCurvature(12, 1, bendLeft, 0.65)).toBeCloseTo(6.5);
  });

  it('leaves the convex side untouched', () => {
    expect(clampOffsetToCurvature(12, -1, bendLeft, 0.65)).toBe(12);
  });

  it('does not enlarge an offset already within the safe radius', () => {
    expect(clampOffsetToCurvature(4, 1, bendLeft, 0.65)).toBe(4);
  });

  it('never clamps on straight runs', () => {
    const straight: LocalCurvature = { radius: Infinity, concaveSide: 0 };
    expect(clampOffsetToCurvature(50, 1, straight, 0.65)).toBe(50);
    expect(clampOffsetToCurvature(50, -1, straight, 0.65)).toBe(50);
  });
});
