// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { describe, expect, it } from 'vitest';
import {
  UNCERTAINTY_ALPHA_FLOOR,
  computeUncertaintyAlphas,
  drawPrimaryChannel,
} from '../src/render.js';
import { VectorChannelsRenderer } from '../src/renderer.js';
import type {
  RenderConfig,
  ScreenPoint,
  Trajectory,
  VariableDef,
} from '../src/types.js';

const uVar: VariableDef = {
  id: 'snr',
  name: 'Signal uncertainty',
  short: 'Unc',
  range: [0, 10],
  ramp: 'viridis',
};

describe('computeUncertaintyAlphas', () => {
  it('returns full opacity for every sample when no variable is assigned', () => {
    const a = computeUncertaintyAlphas(4, null, null, false);
    expect(a).toEqual([1, 1, 1, 1]);
  });

  it('maps range min to opaque and range max to the floor', () => {
    const a = computeUncertaintyAlphas(2, [0, 10], uVar, false);
    expect(a[0]).toBeCloseTo(1, 10);
    expect(a[1]).toBeCloseTo(UNCERTAINTY_ALPHA_FLOOR, 10);
  });

  it('maps the midpoint halfway between opaque and the floor', () => {
    const [mid] = computeUncertaintyAlphas(1, [5], uVar, false);
    expect(mid).toBeCloseTo(1 - 0.5 * (1 - UNCERTAINTY_ALPHA_FLOOR), 10);
  });

  it('inverts so a confidence framing (high = good) reads as opaque', () => {
    const plain = computeUncertaintyAlphas(2, [0, 10], uVar, false);
    const inv = computeUncertaintyAlphas(2, [0, 10], uVar, true);
    expect(inv[0]).toBeCloseTo(plain[1], 10);
    expect(inv[1]).toBeCloseTo(plain[0], 10);
  });

  it('keeps samples with a null reading fully opaque (no signal is not doubt)', () => {
    const a = computeUncertaintyAlphas(3, [0, null, 10], uVar, false);
    expect(a[1]).toBe(1);
  });

  it('never drops below the floor even past the range', () => {
    const a = computeUncertaintyAlphas(2, [-5, 999], uVar, false);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(UNCERTAINTY_ALPHA_FLOOR);
  });
});

// A recording stub for the fill-opacity invariant: uncertainty must fade the
// fill but leave the context at globalAlpha 1 afterward, or every encoding
// drawn on top of the primary would inherit the fade.
function recordingCtx(): {
  ctx: CanvasRenderingContext2D;
  alphasAtFill: number[];
  finalAlpha: () => number;
} {
  const alphasAtFill: number[] = [];
  let alpha = 1;
  const ctx = {
    set globalAlpha(v: number) {
      alpha = v;
    },
    get globalAlpha() {
      return alpha;
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    fill() {
      alphasAtFill.push(alpha);
    },
    // Fill styling + no-op drawing surface used by the full renderer path.
    clearRect() {},
    fillRect() {},
    rect() {},
    arc() {},
    save() {},
    restore() {},
    setTransform() {},
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  } as unknown as CanvasRenderingContext2D;
  return { ctx, alphasAtFill, finalAlpha: () => alpha };
}

describe('drawPrimaryChannel uncertainty fade', () => {
  const points: ScreenPoint[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ];
  const tangents: Array<[number, number]> = [
    [1, 0],
    [1, 0],
    [1, 0],
  ];
  const widths = [6, 6, 6];

  it('applies per-quad alpha from the supplied alphas array', () => {
    const { ctx, alphasAtFill } = recordingCtx();
    drawPrimaryChannel(ctx, {
      points,
      tangents,
      widths,
      colorValues: [1, 1, 1],
      colorVar: uVar,
      uncertaintyAlphas: [1, 0.5, 0.2],
    });
    // Two quads: means of (1, 0.5) and (0.5, 0.2).
    expect(alphasAtFill[0]).toBeCloseTo(0.75, 10);
    expect(alphasAtFill[1]).toBeCloseTo(0.35, 10);
  });

  it('restores globalAlpha to 1 after filling', () => {
    const { ctx, finalAlpha } = recordingCtx();
    drawPrimaryChannel(ctx, {
      points,
      tangents,
      widths,
      colorValues: [1, 1, 1],
      colorVar: uVar,
      uncertaintyAlphas: [1, 0.5, 0.2],
    });
    expect(finalAlpha()).toBe(1);
  });

  it('fills fully opaque when no alphas are provided', () => {
    const { ctx, alphasAtFill } = recordingCtx();
    drawPrimaryChannel(ctx, {
      points,
      tangents,
      widths,
      colorValues: [1, 1, 1],
      colorVar: uVar,
    });
    expect(alphasAtFill.every((a) => a === 1)).toBe(true);
  });
});

// End-to-end wiring: config.uncertaintyVar must reach the fill through the
// renderer, and an alert on the SAME stretch must still stroke fully opaque.
describe('VectorChannelsRenderer uncertainty wiring', () => {
  const primary: VariableDef = {
    id: 'batt',
    name: 'Battery',
    short: 'Batt',
    range: [0, 100],
    ramp: 'viridis',
    limits: { warnLow: 40, criticalLow: 20 },
  };
  const unc: VariableDef = {
    id: 'unc',
    name: 'Uncertainty',
    short: 'Unc',
    range: [0, 10],
    ramp: 'grayscale',
  };
  // Battery dives into critical over the back half, exactly where uncertainty
  // saturates — the stretch that must fade yet still raise an alert.
  const trajectory: Trajectory = {
    id: 't',
    samples: [
      { t: 0, position: [0, 0], values: { batt: 90, unc: 0 } },
      { t: 1, position: [1, 0], values: { batt: 70, unc: 0 } },
      { t: 2, position: [2, 0], values: { batt: 15, unc: 10 } },
      { t: 3, position: [3, 0], values: { batt: 10, unc: 10 } },
    ],
    activities: [],
    events: [],
  };
  const baseConfig: RenderConfig = {
    primaryVar: 'batt',
    widthVar: null,
    widthInvert: false,
    uncertaintyVar: 'unc',
    uncertaintyInvert: false,
    channels: [],
    alerts: ['batt'],
    stateOverlay: false,
    showEvents: false,
  };
  const screenPoints: ScreenPoint[] = [
    { x: 0, y: 50 },
    { x: 40, y: 50 },
    { x: 80, y: 50 },
    { x: 120, y: 50 },
  ];
  const input = { screenPoints, width: 200, height: 100 };

  it('fades the fill on the uncertain stretch and resets afterward', () => {
    const { ctx, alphasAtFill, finalAlpha } = recordingCtx();
    new VectorChannelsRenderer({
      variables: [primary, unc],
      trajectory,
      config: baseConfig,
    }).draw(ctx, input);
    // Three quads: opaque at the confident start, floored on the saturated end.
    expect(alphasAtFill[0]).toBeCloseTo(1, 10);
    expect(alphasAtFill[2]).toBeCloseTo(UNCERTAINTY_ALPHA_FLOOR, 10);
    // The alert band + anything after the primary must not inherit the fade.
    expect(finalAlpha()).toBe(1);
  });

  it('leaves the fill opaque when no uncertainty variable is assigned', () => {
    const { ctx, alphasAtFill } = recordingCtx();
    new VectorChannelsRenderer({
      variables: [primary, unc],
      trajectory,
      config: { ...baseConfig, uncertaintyVar: null },
    }).draw(ctx, input);
    expect(alphasAtFill.every((a) => a === 1)).toBe(true);
  });
});
