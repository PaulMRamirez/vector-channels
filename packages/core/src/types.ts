// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

/**
 * Core type definitions for Vector Channels.
 *
 * The data model separates three concerns:
 *   1. Variable definitions — what can be visualized (ranges, ramps, limits, labels).
 *   2. Trajectory data — the sampled telemetry along a path, with timestamps and positions.
 *   3. Config — which variable is assigned to which encoding role (primary, width, channels, alerts).
 *
 * Variable definitions and trajectories are typically loaded from external sources
 * (CSV, GraphQL from PlanDev, etc). Config is set by the user via the UI and persists
 * across data reloads.
 */

export type RampId =
  // Sequential
  | 'viridis'
  | 'magma'
  | 'inferno'
  | 'cividis'
  | 'grayscale'
  | 'terrain'
  // Diverging
  | 'coolwarm'
  | 'rdylgn'
  | 'spectral'
  | 'prgn'
  // Categorical (rendered as continuous gradients between category colors)
  | 'bold5'
  | 'set1'
  | 'paired'
  | 'moran';

export interface Limits {
  warnLow?: number;
  criticalLow?: number;
  warnHigh?: number;
  criticalHigh?: number;
}

export type LimitStatusLabel = 'nominal' | 'warn' | 'critical';

export interface LimitStatus {
  status: LimitStatusLabel;
  intensity: number; // 0..1, how far into warn/critical region
}

export interface VariableDef {
  id: string;
  name: string;
  short: string;
  unit?: string;
  range: [number, number];
  ramp: RampId;
  limits?: Limits;
  fmt?: (v: number) => string;
}

/**
 * Single sample along a trajectory. Position is (lng, lat) matching Leaflet's
 * LatLng convention when passed to L.latLng(). Time is seconds since epoch or
 * a relative reference point — renderer doesn't care, only ordering matters.
 */
export interface Sample {
  t: number;
  position: [number, number]; // [lng, lat]
  values: Record<string, number | null>; // varId → value; null indicates gap
  mode?: string; // optional discrete state (rover mode, aircraft phase, etc.)
}

export interface Activity {
  start: number; // same time base as Sample.t
  end: number;
  label: string;
  mode?: string;
  color: string;
}

export type EventGlyphType = 'circle' | 'diamond' | 'triangle';

export interface EventMarker {
  t: number;
  type: EventGlyphType;
  color: string;
  label: string;
}

export interface Trajectory {
  id: string;
  samples: Sample[];
  activities: Activity[];
  events: EventMarker[];
}

/**
 * Mode definitions for state overlay. Keys are mode identifiers referenced
 * from Sample.mode or Activity.mode.
 */
export interface ModeDef {
  color: string;
  label: string;
}

/**
 * Render-time configuration. Role assignments reference VariableDef.id.
 *
 * Terminology: the "primary" channel is the central path; it carries the
 * color, width, uncertainty-fade, and alert-band encodings. "Channels" are the
 * parallel offset lines, ordered from index 0 (tightest to the primary) outward.
 */
export interface RenderConfig {
  primaryVar: string | null;
  widthVar: string | null;
  widthInvert: boolean;
  /**
   * Variable whose value fades the primary strip's opacity — the "uncertainty"
   * role. High value = low confidence = more transparent, so untrustworthy
   * stretches (stale, interpolated, low-SNR) visibly recede. Independent of the
   * color/width roles; any variable can drive it. Null = no fade (fully opaque).
   * Deliberately does NOT dim the alert band: doubt about a reading must not
   * mute a limit breach on that reading.
   */
  uncertaintyVar: string | null;
  /** Flip the fade so a "confidence" variable (high = good) reads correctly. */
  uncertaintyInvert: boolean;
  /**
   * Variable that drives the flow overlay — animated chevrons marching along
   * the primary in the direction of travel, at screen-speed proportional to
   * this variable. Chevrons freeze where it reads ~0 (stationary) and bunch
   * where it is low, so motion itself encodes rate. Independent of every other
   * role. Null = no flow overlay.
   */
  flowVar: string | null;
  /** Flip so a variable framed as slowness (high = slow) reads correctly. */
  flowInvert: boolean;
  channels: string[]; // ordered list; index 0 is tightest to the primary
  /**
   * Watchlist of variable ids. Each watched variable contributes its limit
   * status to the alert band; the band renders the WORST status across all
   * watched variables at each segment. Variables without limits are silently
   * ignored. Empty list = no band rendered.
   */
  alerts: string[];
  stateOverlay: boolean;
  showEvents: boolean;
  /** Pixel offset used for the tightest channel pair. Subsequent channels step out. */
  channelOffsetBase?: number;
  /** Pixel step added per channel-pair beyond the first. */
  channelOffsetStep?: number;
  /** Stroke width for channels. */
  channelStrokeWidth?: number;
  /** Gap in CSS pixels between the primary edge and the alert band. Default 1.5. */
  alertGapPx?: number;
  /** Multiplier applied to the baseline alert widths. Default 1. */
  alertWidthScale?: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface RenderInput {
  /** Trajectory sample positions projected to screen-space pixel coordinates. */
  screenPoints: ScreenPoint[];
  /** Index into samples for event positions (precomputed). Length matches trajectory.events. */
  eventIndices?: number[];
  /** Activity start/end sample indices (precomputed). */
  activityIndices?: Array<{ start: number; end: number }>;
  /** Index of activity currently hovered (or null). */
  hoveredActivityIdx?: number | null;
  /** Index of sample currently hovered (or null). */
  hoveredSampleIdx?: number | null;
  /** Index of event currently hovered (or null). */
  hoveredEventIdx?: number | null;
  /** Size of the drawing surface in CSS pixels. */
  width: number;
  height: number;
  /** Whether to render the background grid. Off when layered over a basemap. */
  drawBackground?: boolean;
  /**
   * Elapsed animation time in milliseconds, used to phase the flow overlay.
   * The host advances this from its animation loop. Omit (or pass a constant)
   * to freeze flow at a static phase — the accessible fallback for reduced
   * motion, and what tests use for determinism.
   */
  timeMs?: number;
}
