// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import type { ScreenPoint } from '@vector-channels/core';

export interface HitTestResult {
  sampleIdx: number | null;
  eventIdx: number | null;
}

export interface HitTestOptions {
  /** Pointer-to-sample max distance in CSS pixels. */
  sampleThresholdPx?: number;
  /** Pointer-to-event-glyph max distance in CSS pixels. */
  eventThresholdPx?: number;
}

const DEFAULT_SAMPLE_THRESHOLD = 80;
const DEFAULT_EVENT_THRESHOLD = 11;

/**
 * Find the nearest sample and event glyph to the pointer. Sample and event
 * hits are independent — the prototype's behavior (returning both when both
 * match) is preserved so callers can prioritize however they want.
 */
export function hitTest(
  pointer: { x: number; y: number },
  screenPoints: ScreenPoint[],
  eventIndices: number[],
  opts?: HitTestOptions,
): HitTestResult {
  const sampleThreshold = opts?.sampleThresholdPx ?? DEFAULT_SAMPLE_THRESHOLD;
  const eventThreshold = opts?.eventThresholdPx ?? DEFAULT_EVENT_THRESHOLD;

  let eventIdx: number | null = null;
  for (let i = 0; i < eventIndices.length; i++) {
    const sIdx = eventIndices[i];
    if (sIdx < 0 || sIdx >= screenPoints.length) continue;
    const p = screenPoints[sIdx];
    if (Math.hypot(pointer.x - p.x, pointer.y - p.y) < eventThreshold) {
      eventIdx = i;
      break;
    }
  }

  let sampleIdx: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < screenPoints.length; i++) {
    const p = screenPoints[i];
    const d = Math.hypot(pointer.x - p.x, pointer.y - p.y);
    if (d < bestDist) {
      bestDist = d;
      sampleIdx = i;
    }
  }
  if (sampleIdx === null || bestDist >= sampleThreshold) {
    sampleIdx = null;
  }

  return { sampleIdx, eventIdx };
}
