// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import type { Limits, LimitStatus, RampId } from './types.js';

type RGB = [number, number, number];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpRgb = (c1: RGB, c2: RGB, t: number): RGB => [
  Math.round(lerp(c1[0], c2[0], t)),
  Math.round(lerp(c1[1], c2[1], t)),
  Math.round(lerp(c1[2], c2[2], t)),
];

export const toRgbStr = ([r, g, b]: RGB): string => `rgb(${r},${g},${b})`;

type Stop = { t: number; rgb: RGB };

/**
 * Build a piecewise-linear ramp from control stops sorted by t in [0, 1].
 * Values of t outside [0, 1] clamp to the nearest endpoint.
 */
function rampFromStops(stops: Stop[]): (t: number) => RGB {
  return (t: number): RGB => {
    if (t <= stops[0].t) return stops[0].rgb;
    const last = stops[stops.length - 1];
    if (t >= last.t) return last.rgb;
    for (let i = 1; i < stops.length; i++) {
      const hi = stops[i];
      if (hi.t >= t) {
        const lo = stops[i - 1];
        const u = (t - lo.t) / (hi.t - lo.t);
        return lerpRgb(lo.rgb, hi.rgb, u);
      }
    }
    return last.rgb;
  };
}

/**
 * Color ramp lookup table. Each ramp is a function mapping t ∈ [0, 1] to RGB.
 *
 * Stops approximate the standard matplotlib colormaps at five-point accuracy,
 * which is plenty for the 40-bucket sampling used by the rail renderer. The
 * perceptually-uniform sequential family (viridis, magma, inferno, cividis)
 * is color-blind safe; grayscale and terrain are included for contrast and
 * for cases where a non-heat palette reads more naturally.
 */
export const RAMPS: Record<RampId, (t: number) => RGB> = {
  viridis: rampFromStops([
    { t: 0.0, rgb: [68, 1, 84] },
    { t: 0.25, rgb: [59, 82, 139] },
    { t: 0.5, rgb: [33, 145, 140] },
    { t: 0.75, rgb: [94, 201, 98] },
    { t: 1.0, rgb: [253, 231, 37] },
  ]),
  magma: rampFromStops([
    { t: 0.0, rgb: [0, 0, 4] },
    { t: 0.25, rgb: [81, 18, 124] },
    { t: 0.5, rgb: [183, 55, 121] },
    { t: 0.75, rgb: [251, 135, 97] },
    { t: 1.0, rgb: [252, 253, 191] },
  ]),
  inferno: rampFromStops([
    { t: 0.0, rgb: [0, 0, 4] },
    { t: 0.25, rgb: [87, 16, 110] },
    { t: 0.5, rgb: [187, 55, 84] },
    { t: 0.75, rgb: [249, 142, 9] },
    { t: 1.0, rgb: [252, 255, 164] },
  ]),
  cividis: rampFromStops([
    { t: 0.0, rgb: [0, 32, 77] },
    { t: 0.25, rgb: [62, 73, 114] },
    { t: 0.5, rgb: [124, 123, 120] },
    { t: 0.75, rgb: [186, 178, 104] },
    { t: 1.0, rgb: [253, 231, 55] },
  ]),
  grayscale: rampFromStops([
    { t: 0.0, rgb: [10, 10, 10] },
    { t: 1.0, rgb: [245, 245, 245] },
  ]),
  terrain: rampFromStops([
    { t: 0.0, rgb: [45, 92, 30] },
    { t: 0.33, rgb: [72, 164, 40] },
    { t: 0.55, rgb: [223, 210, 106] },
    { t: 0.78, rgb: [135, 96, 68] },
    { t: 1.0, rgb: [194, 198, 198] },
  ]),

  // Diverging — meaningful center at t=0.5
  coolwarm: rampFromStops([
    { t: 0.0, rgb: [59, 76, 192] },
    { t: 0.25, rgb: [118, 144, 232] },
    { t: 0.5, rgb: [221, 221, 221] },
    { t: 0.75, rgb: [242, 157, 123] },
    { t: 1.0, rgb: [180, 4, 38] },
  ]),
  rdylgn: rampFromStops([
    { t: 0.0, rgb: [165, 0, 38] },
    { t: 0.25, rgb: [244, 109, 67] },
    { t: 0.5, rgb: [254, 254, 189] },
    { t: 0.75, rgb: [166, 217, 106] },
    { t: 1.0, rgb: [0, 104, 55] },
  ]),
  spectral: rampFromStops([
    { t: 0.0, rgb: [158, 1, 66] },
    { t: 0.2, rgb: [244, 109, 67] },
    { t: 0.4, rgb: [254, 224, 139] },
    { t: 0.6, rgb: [230, 245, 152] },
    { t: 0.8, rgb: [102, 194, 165] },
    { t: 1.0, rgb: [94, 79, 162] },
  ]),
  prgn: rampFromStops([
    { t: 0.0, rgb: [64, 0, 75] },
    { t: 0.25, rgb: [153, 112, 171] },
    { t: 0.5, rgb: [247, 247, 247] },
    { t: 0.75, rgb: [90, 174, 97] },
    { t: 1.0, rgb: [0, 68, 27] },
  ]),

  // Categorical — rendered as continuous interpolations between category colors
  // so they slot into the same `(t) => RGB` interface as the sequential ramps.
  // Good for visual variety; less principled for true continuous data.
  bold5: rampFromStops([
    { t: 0.0, rgb: [228, 26, 28] },
    { t: 0.25, rgb: [77, 175, 74] },
    { t: 0.5, rgb: [255, 255, 51] },
    { t: 0.75, rgb: [152, 78, 163] },
    { t: 1.0, rgb: [255, 127, 0] },
  ]),
  set1: rampFromStops([
    { t: 0.0, rgb: [228, 26, 28] },
    { t: 0.125, rgb: [55, 126, 184] },
    { t: 0.25, rgb: [77, 175, 74] },
    { t: 0.375, rgb: [152, 78, 163] },
    { t: 0.5, rgb: [255, 127, 0] },
    { t: 0.625, rgb: [255, 255, 51] },
    { t: 0.75, rgb: [166, 86, 40] },
    { t: 0.875, rgb: [247, 129, 191] },
    { t: 1.0, rgb: [153, 153, 153] },
  ]),
  paired: rampFromStops([
    { t: 0.0, rgb: [166, 206, 227] },
    { t: 0.0909, rgb: [31, 120, 180] },
    { t: 0.1818, rgb: [178, 223, 138] },
    { t: 0.2727, rgb: [51, 160, 44] },
    { t: 0.3636, rgb: [251, 154, 153] },
    { t: 0.4545, rgb: [227, 26, 28] },
    { t: 0.5454, rgb: [253, 191, 111] },
    { t: 0.6363, rgb: [255, 127, 0] },
    { t: 0.7272, rgb: [202, 178, 214] },
    { t: 0.8181, rgb: [106, 61, 154] },
    { t: 0.9090, rgb: [255, 255, 153] },
    { t: 1.0, rgb: [177, 89, 40] },
  ]),
  moran: rampFromStops([
    { t: 0.0, rgb: [215, 25, 28] },
    { t: 0.25, rgb: [253, 174, 97] },
    { t: 0.5, rgb: [245, 245, 220] },
    { t: 0.75, rgb: [171, 217, 233] },
    { t: 1.0, rgb: [44, 123, 182] },
  ]),
};

export function normalize(value: number, range: [number, number]): number {
  const t = (value - range[0]) / (range[1] - range[0]);
  return Math.max(0, Math.min(1, t));
}

export function colorForValue(
  value: number,
  range: [number, number],
  ramp: RampId
): string {
  return toRgbStr(RAMPS[ramp](normalize(value, range)));
}

/**
 * Classify a value against configured limits. Returns the status label plus
 * an intensity (0..1) that indicates how far into the warn/critical region
 * the value has gone. Intensity is used for animated/graded visual feedback
 * elsewhere, though v0.1 uses binary coloring (status label only).
 */
export function computeLimitStatus(
  value: number,
  limits: Limits | undefined
): LimitStatus {
  if (!limits) return { status: 'nominal', intensity: 0 };

  if (limits.criticalLow != null && value <= limits.criticalLow) {
    return { status: 'critical', intensity: 1 };
  }
  if (limits.warnLow != null && value < limits.warnLow) {
    const span =
      limits.criticalLow != null
        ? limits.warnLow - limits.criticalLow
        : limits.warnLow * 0.1 || 1;
    return {
      status: 'warn',
      intensity: Math.min(1, (limits.warnLow - value) / span),
    };
  }
  if (limits.criticalHigh != null && value >= limits.criticalHigh) {
    return { status: 'critical', intensity: 1 };
  }
  if (limits.warnHigh != null && value > limits.warnHigh) {
    const span =
      limits.criticalHigh != null
        ? limits.criticalHigh - limits.warnHigh
        : limits.warnHigh * 0.1 || 1;
    return {
      status: 'warn',
      intensity: Math.min(1, (value - limits.warnHigh) / span),
    };
  }

  return { status: 'nominal', intensity: 0 };
}

/**
 * Alert band stroke styling. Only warn and critical render — nominal segments
 * are intentionally invisible so the band reads as pure attention signal
 * (calm = nothing drawn).
 */
export const ALERT_STYLES: Record<
  'warn' | 'critical',
  { color: string; width: number }
> = {
  warn: { color: '#f59e0b', width: 2.5 },
  critical: { color: '#dc2626', width: 3.5 },
};
