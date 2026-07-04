// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { describe, expect, it } from 'vitest';
import {
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
  it('measures cumulative arc length and defaults rate to 1 with no variable', () => {
    const f = computeFlowField(straightPath(5, 10), null, null, false);
    expect(f.totalLen).toBeCloseTo(40, 10);
    expect(f.cum).toEqual([0, 10, 20, 30, 40]);
    expect(f.rate).toEqual([1, 1, 1, 1, 1]);
  });

  it('carries normalized rate per sample, reaching 0 when stationary', () => {
    const f = computeFlowField(straightPath(3, 10), [1, 0.5, 0], rateVar, false);
    expect(f.rate[0]).toBeCloseTo(1, 10);
    expect(f.rate[1]).toBeCloseTo(0.5, 10);
    expect(f.rate[2]).toBeCloseTo(0, 10); // no floor — stations read as truly zero
  });

  it('inverts so a slowness variable (high = stopped) fades correctly', () => {
    const f = computeFlowField(straightPath(2, 10), [1, 0], rateVar, true);
    expect(f.rate[0]).toBeCloseTo(0, 10);
    expect(f.rate[1]).toBeCloseTo(1, 10);
  });

  it('treats a null reading as full rate (no signal is not a stop)', () => {
    const f = computeFlowField(straightPath(3, 10), [1, null, 0], rateVar, false);
    expect(f.rate[1]).toBe(1);
  });
});

describe('placeFlowChevrons', () => {
  const pts = straightPath(11, 10); // length 100
  const tan = tangentsAlongX(11);
  const field = computeFlowField(pts, null, null, false);

  it('spaces chevrons evenly along the path, headed downstream', () => {
    const chevrons = placeFlowChevrons(pts, tan, field, 0);
    expect(chevrons.length).toBe(4); // round(100 / 26)
    expect(chevrons[0].angle).toBeCloseTo(0, 10);
    // Even spacing in physical arc length: ~25 px apart.
    expect(chevrons[1].x - chevrons[0].x).toBeCloseTo(25, 6);
  });

  it('is deterministic in timeMs', () => {
    expect(placeFlowChevrons(pts, tan, field, 250)).toEqual(
      placeFlowChevrons(pts, tan, field, 250),
    );
  });

  it('advances every chevron downstream at a constant pace', () => {
    const t0 = placeFlowChevrons(pts, tan, field, 0);
    const t1 = placeFlowChevrons(pts, tan, field, 100); // 34 px/s * 0.1s = 3.4 px
    expect(t1[0].x - t0[0].x).toBeCloseTo(3.4, 6);
  });

  it('drives opacity from local rate — bright while moving, gone when stopped', () => {
    // Rate high over the first half, zero over the second.
    const rates = Array.from({ length: 11 }, (_, i) => (i < 5 ? 1 : 0));
    const f = computeFlowField(pts, rates, rateVar, false);
    const chevrons = placeFlowChevrons(pts, tan, f, 0);
    const alphas = chevrons.map((c) => c.alpha);
    expect(Math.max(...alphas)).toBeGreaterThan(0.6); // moving stretch is visible
    expect(Math.min(...alphas)).toBeLessThan(0.05); // stationary stretch fades out
    // Monotone-ish: a downstream (slower) chevron is no brighter than an upstream one.
    expect(chevrons[chevrons.length - 1].alpha).toBeLessThan(chevrons[0].alpha);
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
  function recordingCtx(): {
    ctx: CanvasRenderingContext2D;
    strokes: () => number;
  } {
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
    return { ctx, strokes: () => strokes };
  }

  it('strokes only the visible chevrons, skipping faded-out ones', () => {
    const { ctx, strokes } = recordingCtx();
    const chevrons = [
      { x: 0, y: 0, angle: 0, alpha: 0.7 },
      { x: 1, y: 0, angle: 0, alpha: 0.0 }, // stationary — skipped
      { x: 2, y: 0, angle: 0, alpha: 0.4 },
    ];
    drawFlow(ctx, chevrons);
    expect(strokes()).toBe(2);
  });

  it('tolerates an empty chevron list', () => {
    const { ctx } = recordingCtx();
    expect(() => drawFlow(ctx, [])).not.toThrow();
  });
});
