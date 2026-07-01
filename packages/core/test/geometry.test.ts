// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { describe, expect, it } from 'vitest';
import { computeTangents, type ScreenPoint } from '../src/index.js';

describe('computeTangents', () => {
  it('returns unit tangents pointing along a straight line', () => {
    const points: ScreenPoint[] = Array.from({ length: 10 }, (_, i) => ({
      x: i * 5,
      y: 0,
    }));
    for (const [tx, ty] of computeTangents(points)) {
      expect(tx).toBeCloseTo(1);
      expect(ty).toBeCloseTo(0);
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
});
