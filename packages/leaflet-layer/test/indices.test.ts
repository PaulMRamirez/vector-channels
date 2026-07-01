// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { describe, expect, it } from 'vitest';
import type { Sample, Trajectory } from '@vector-channels/core';
import {
  computeActivityIndices,
  computeEventIndices,
  nearestSampleIndex,
} from '../src/indices.js';

function makeSamples(times: number[]): Sample[] {
  return times.map((t) => ({ t, position: [0, 0], values: {} }));
}

describe('nearestSampleIndex', () => {
  it('returns 0 for an empty samples array', () => {
    expect(nearestSampleIndex([], 42)).toBe(0);
  });

  it('returns the only index when there is a single sample', () => {
    const samples = makeSamples([10]);
    expect(nearestSampleIndex(samples, 0)).toBe(0);
    expect(nearestSampleIndex(samples, 100)).toBe(0);
  });

  it('returns the first index for a timestamp before the series', () => {
    const samples = makeSamples([10, 20, 30, 40]);
    expect(nearestSampleIndex(samples, -100)).toBe(0);
  });

  it('returns the last index for a timestamp after the series', () => {
    const samples = makeSamples([10, 20, 30, 40]);
    expect(nearestSampleIndex(samples, 9999)).toBe(3);
  });

  it('returns an exact match', () => {
    const samples = makeSamples([10, 20, 30, 40]);
    expect(nearestSampleIndex(samples, 30)).toBe(2);
  });

  it('picks the closer bracketing sample', () => {
    const samples = makeSamples([0, 10, 20, 30]);
    expect(nearestSampleIndex(samples, 12)).toBe(1);
    expect(nearestSampleIndex(samples, 17)).toBe(2);
  });

  it('handles ties deterministically (closer-or-equal to the later sample)', () => {
    const samples = makeSamples([0, 10]);
    // Distance to both is 5; the tiebreak rule in the implementation
    // returns `lo` when distances are equal, i.e. the later sample.
    expect(nearestSampleIndex(samples, 5)).toBe(1);
  });
});

describe('computeEventIndices / computeActivityIndices', () => {
  const samples = makeSamples([0, 100, 200, 300, 400]);

  const trajectory: Trajectory = {
    id: 'test',
    samples,
    events: [
      { t: 0, type: 'circle', color: '#fff', label: 'a' },
      { t: 150, type: 'diamond', color: '#fff', label: 'b' },
      { t: 399, type: 'triangle', color: '#fff', label: 'c' },
    ],
    activities: [
      { start: 50, end: 250, label: 'x', color: '#fff' },
      { start: 300, end: 400, label: 'y', color: '#fff' },
    ],
  };

  it('maps event timestamps to nearest sample indices', () => {
    expect(computeEventIndices(trajectory)).toEqual([0, 2, 4]);
  });

  it('maps activity start/end timestamps to nearest sample indices', () => {
    expect(computeActivityIndices(trajectory)).toEqual([
      { start: 1, end: 3 },
      { start: 3, end: 4 },
    ]);
  });
});
