// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { describe, expect, it } from 'vitest';
import {
  FLOW_RATE_FLOOR,
  computeFlowField,
  drawFlow,
  placeFlowChevrons,
} from '../src/render.js';
import type { ScreenPoint, VariableDef } from '../src/types.js';

const rateVar: VariableDef = {
  id: 'speed',
  name: 'Speed',
  short: 'Spd',
  range: [0, 1],
  ramp: 'cividis',
};

// A straight, evenly-sampled path along +x: arc length is just x.
function straightPath(n: number, step: number): ScreenPoint[] {
  return Array.from({ length: n }, (_, i) => ({ x: i * step, y: 0 }));
}
const tangentsAlongX = (n: number): Array<[number, number]> =>
  Array.from({ length: n }, () => [1, 0]);

describe('computeFlowField', () => {
  it('leaves u equal to arc length when no rate variable is set', () => {
    const pts = straightPath(5, 10);
    const f = computeFlowField(pts, null, null, false);
    expect(f.totalLen).toBeCloseTo(40, 10);
    expect(f.u).toEqual(f.cum);
    expect(f.totalU).toBeCloseTo(f.totalLen, 10);
  });

  it('warps u longer than arc length across a slow stretch', () => {
    // Rate collapses to zero on the last segment; both endpoints floor.
    const pts = straightPath(4, 10);
    const f = computeFlowField(pts, [1, 1, 0, 0], rateVar, false);
    const dsLast = f.cum[3] - f.cum[2]; // 10 px
    const duLast = f.u[3] - f.u[2];
    expect(dsLast).toBeCloseTo(10, 10);
    // du = ds / floor, so the slow segment stretches in flow coordinates.
    expect(duLast).toBeCloseTo(10 / FLOW_RATE_FLOOR, 6);
    expect(duLast).toBeGreaterThan(dsLast);
  });

  it('floors the rate so a stationary sample never diverges', () => {
    const pts = straightPath(2, 10);
    const f = computeFlowField(pts, [0, 0], rateVar, false);
    expect(f.rate[0]).toBeCloseTo(FLOW_RATE_FLOOR, 10);
    expect(Number.isFinite(f.totalU)).toBe(true);
  });

  it('inverts so a slowness variable (high = slow) reads correctly', () => {
    const pts = straightPath(2, 10);
    // Value at range max, inverted, becomes rate 0 -> floored.
    const f = computeFlowField(pts, [1, 1], rateVar, true);
    expect(f.rate[0]).toBeCloseTo(FLOW_RATE_FLOOR, 10);
  });
});

describe('placeFlowChevrons', () => {
  const pts = straightPath(11, 10); // length 100
  const tan = tangentsAlongX(11);
  const field = computeFlowField(pts, null, null, false);

  it('places roughly one chevron per spacing interval, headed downstream', () => {
    const chevrons = placeFlowChevrons(pts, tan, field, 0);
    expect(chevrons.length).toBe(4); // round(100 / 26)
    expect(chevrons[0].angle).toBeCloseTo(0, 10); // travels along +x
  });

  it('is deterministic in timeMs', () => {
    const a = placeFlowChevrons(pts, tan, field, 250);
    const b = placeFlowChevrons(pts, tan, field, 250);
    expect(a).toEqual(b);
  });

  it('advances chevrons downstream as time increases', () => {
    const t0 = placeFlowChevrons(pts, tan, field, 0);
    const t1 = placeFlowChevrons(pts, tan, field, 100); // small, no wrap
    expect(t1[0].x).toBeGreaterThan(t0[0].x);
  });

  it('returns nothing for a degenerate (zero-length) path', () => {
    const dot = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    const f = computeFlowField(dot, null, null, false);
    expect(placeFlowChevrons(dot, [[1, 0], [1, 0]], f, 0)).toEqual([]);
  });
});

describe('drawFlow', () => {
  it('strokes one path per chevron without throwing', () => {
    let strokes = 0;
    const ctx = {
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {
        strokes++;
      },
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
    } as unknown as CanvasRenderingContext2D;
    const pts = straightPath(11, 10);
    const field = computeFlowField(pts, null, null, false);
    const chevrons = placeFlowChevrons(pts, tangentsAlongX(11), field, 0);
    drawFlow(ctx, chevrons);
    expect(strokes).toBe(chevrons.length);
  });

  it('tolerates an empty chevron list', () => {
    const ctx = {
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
    } as unknown as CanvasRenderingContext2D;
    expect(() => drawFlow(ctx, [])).not.toThrow();
  });
});
