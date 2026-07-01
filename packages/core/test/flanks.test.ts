// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { describe, expect, it } from 'vitest';
import {
  computeAlertFlanks,
  computeTangents,
  type ScreenPoint,
} from '../src/index.js';

const ALERT_PAD = 3.25; // gap(1.5) + ALERT_BASE_WIDTH/2(1.75), the production value
const WIDTH = 6; // constant primary width so hw is symmetric everywhere

function constWidths(n: number): number[] {
  return new Array(n).fill(WIDTH);
}

/**
 * A mirror-symmetric hairpin: a vertical entry tail, a semicircular turn of
 * radius R, and a vertical exit tail. Reversing the point order maps the path
 * onto itself, so the apex sits at a fixed index and the two legs mirror. When
 * `cw` is true the turn bends the other way (traversal reversed).
 */
function hairpin(R: number, cw = false): { points: ScreenPoint[]; apex: number } {
  const T = 8; // tail points per side
  const arcSteps = 24; // even, so the apex lands on an integer index
  const step = 3;
  const points: ScreenPoint[] = [];
  for (let i = T; i >= 1; i--) points.push({ x: R, y: -i * step });
  for (let k = 0; k <= arcSteps; k++) {
    const th = (Math.PI * k) / arcSteps;
    points.push({ x: R * Math.cos(th), y: R * Math.sin(th) });
  }
  for (let i = 1; i <= T; i++) points.push({ x: -R, y: -i * step });
  const apex = T + arcSteps / 2;
  if (cw) points.reverse(); // apex index is the symmetric center, so it is unchanged
  return { points, apex };
}

/** Indices where `mask` is false (flank suppressed). */
function suppressed(mask: boolean[]): number[] {
  const out: number[] = [];
  mask.forEach((ok, i) => {
    if (!ok) out.push(i);
  });
  return out;
}

describe('computeAlertFlanks', () => {
  it('draws both flanks everywhere on a straight run (regression: band must not vanish)', () => {
    const points: ScreenPoint[] = Array.from({ length: 30 }, (_, i) => ({
      x: i * 5,
      y: 0,
    }));
    const f = computeAlertFlanks(points, computeTangents(points), constWidths(points.length), {
      alertPad: ALERT_PAD,
      minAlertOffset: 0,
    });
    expect(f.leftOk.every(Boolean)).toBe(true);
    expect(f.rightOk.every(Boolean)).toBe(true);
  });

  it('suppresses the inside flank symmetrically about a symmetric hairpin apex', () => {
    const { points, apex } = hairpin(8);
    const f = computeAlertFlanks(points, computeTangents(points), constWidths(points.length), {
      alertPad: ALERT_PAD,
      minAlertOffset: 0,
    });

    // CCW turn: left is inside. The outside (right) flank is never dropped.
    expect(f.rightOk.every(Boolean)).toBe(true);

    // The inside (left) flank is drawn on the tails and dropped around the apex.
    expect(f.leftOk[0]).toBe(true);
    expect(f.leftOk[f.leftOk.length - 1]).toBe(true);
    expect(f.leftOk[apex]).toBe(false);

    // Shut-off and pick-up are equidistant from the apex (within a vertex).
    const gap = suppressed(f.leftOk);
    const first = gap[0];
    const last = gap[gap.length - 1];
    expect(Math.abs(apex - first - (last - apex))).toBeLessThanOrEqual(1);
  });

  it('handles a turn of either handedness (mirror suppresses the other flank)', () => {
    const { points, apex } = hairpin(8, true); // clockwise: right is inside
    const f = computeAlertFlanks(points, computeTangents(points), constWidths(points.length), {
      alertPad: ALERT_PAD,
      minAlertOffset: 0,
    });

    // Mirror of the previous case: left flank untouched, right flank dropped
    // symmetrically about the same apex index.
    expect(f.leftOk.every(Boolean)).toBe(true);
    expect(f.rightOk[apex]).toBe(false);

    const gap = suppressed(f.rightOk);
    const first = gap[0];
    const last = gap[gap.length - 1];
    expect(Math.abs(apex - first - (last - apex))).toBeLessThanOrEqual(1);
  });
});
