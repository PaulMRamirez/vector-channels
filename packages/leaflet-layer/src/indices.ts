// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import type { Sample, Trajectory } from '@vector-channels/core';

/**
 * Binary search for the sample whose `t` is closest to the given timestamp.
 * Assumes samples are sorted by `t` ascending (the Trajectory contract).
 */
export function nearestSampleIndex(samples: Sample[], t: number): number {
  if (samples.length === 0) return 0;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(samples[lo - 1].t - t) < Math.abs(samples[lo].t - t)) {
    return lo - 1;
  }
  return lo;
}

export function computeEventIndices(trajectory: Trajectory): number[] {
  return trajectory.events.map((evt) =>
    nearestSampleIndex(trajectory.samples, evt.t),
  );
}

export function computeActivityIndices(
  trajectory: Trajectory,
): Array<{ start: number; end: number }> {
  return trajectory.activities.map((act) => ({
    start: nearestSampleIndex(trajectory.samples, act.start),
    end: nearestSampleIndex(trajectory.samples, act.end),
  }));
}
