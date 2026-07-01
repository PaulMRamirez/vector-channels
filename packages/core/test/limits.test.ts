// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { describe, expect, it } from 'vitest';
import { computeLimitStatus } from '../src/color.js';

describe('computeLimitStatus', () => {
  it('returns nominal when no limits defined', () => {
    const r = computeLimitStatus(50, undefined);
    expect(r.status).toBe('nominal');
    expect(r.intensity).toBe(0);
  });

  it('returns nominal when value is within bounds', () => {
    const r = computeLimitStatus(50, { warnLow: 20, warnHigh: 80 });
    expect(r.status).toBe('nominal');
  });

  it('flags warn when value crosses high threshold', () => {
    const r = computeLimitStatus(85, {
      warnHigh: 80,
      criticalHigh: 95,
    });
    expect(r.status).toBe('warn');
    expect(r.intensity).toBeGreaterThan(0);
    expect(r.intensity).toBeLessThan(1);
  });

  it('flags warn when value crosses low threshold', () => {
    const r = computeLimitStatus(15, {
      warnLow: 20,
      criticalLow: 10,
    });
    expect(r.status).toBe('warn');
  });

  it('flags critical at or above criticalHigh', () => {
    const r = computeLimitStatus(95, {
      warnHigh: 80,
      criticalHigh: 95,
    });
    expect(r.status).toBe('critical');
    expect(r.intensity).toBe(1);
  });

  it('flags critical at or below criticalLow', () => {
    const r = computeLimitStatus(10, {
      warnLow: 20,
      criticalLow: 10,
    });
    expect(r.status).toBe('critical');
  });

  it('intensity increases as value moves deeper into warn region', () => {
    const limits = { warnHigh: 80, criticalHigh: 100 };
    const low = computeLimitStatus(81, limits);
    const high = computeLimitStatus(99, limits);
    expect(high.intensity).toBeGreaterThan(low.intensity);
  });

  it('handles variables with only high limits', () => {
    const r = computeLimitStatus(50, { warnHigh: 40 });
    expect(r.status).toBe('warn');
  });

  it('handles variables with only low limits', () => {
    const r = computeLimitStatus(5, { warnLow: 10 });
    expect(r.status).toBe('warn');
  });
});
