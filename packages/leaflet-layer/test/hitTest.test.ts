// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { describe, expect, it } from 'vitest';
import type { ScreenPoint } from '@vector-channels/core';
import { hitTest } from '../src/hitTest.js';

const line: ScreenPoint[] = Array.from({ length: 10 }, (_, i) => ({
  x: i * 20,
  y: 100,
}));

describe('hitTest', () => {
  it('returns null for both when pointer is far from every sample', () => {
    const r = hitTest({ x: 500, y: 500 }, line, []);
    expect(r.sampleIdx).toBe(null);
    expect(r.eventIdx).toBe(null);
  });

  it('finds the nearest sample within the default 80px radius', () => {
    const r = hitTest({ x: 42, y: 105 }, line, []);
    expect(r.sampleIdx).toBe(2); // sample at x=40 is closest to x=42
    expect(r.eventIdx).toBe(null);
  });

  it('rejects the nearest sample when it is beyond the threshold', () => {
    const r = hitTest({ x: 40, y: 400 }, line, [], { sampleThresholdPx: 50 });
    expect(r.sampleIdx).toBe(null);
  });

  it('hits an event when the pointer is on its glyph', () => {
    // event index 0 points to sample 5 at (100, 100).
    const r = hitTest({ x: 103, y: 102 }, line, [5, 9]);
    expect(r.eventIdx).toBe(0);
  });

  it('returns the first event hit when multiple events overlap the cursor', () => {
    const r = hitTest({ x: 100, y: 100 }, line, [5, 5]);
    expect(r.eventIdx).toBe(0);
  });

  it('returns both a sample hit and an event hit independently', () => {
    // Pointer sits right on sample 5 (also where event 0 lives).
    const r = hitTest({ x: 100, y: 100 }, line, [5]);
    expect(r.sampleIdx).toBe(5);
    expect(r.eventIdx).toBe(0);
  });

  it('ignores event indices outside the screenPoints range', () => {
    const r = hitTest({ x: 100, y: 100 }, line, [-1, 999]);
    expect(r.eventIdx).toBe(null);
  });

  it('honors custom thresholds', () => {
    const r = hitTest({ x: 100, y: 100 }, line, [5], {
      eventThresholdPx: 0.5,
    });
    // Zero-distance hit still passes because pointer is exactly on the point.
    expect(r.eventIdx).toBe(0);

    const miss = hitTest({ x: 101, y: 101 }, line, [5], {
      eventThresholdPx: 0.5,
    });
    expect(miss.eventIdx).toBe(null);
  });
});
