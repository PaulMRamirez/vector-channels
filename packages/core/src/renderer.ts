// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import { computeTangents, offsetForChannel } from './geometry.js';
import {
  ALERT_BASE_WIDTH,
  type AlertWatch,
  computeFlowField,
  computePrimaryWidths,
  computeUncertaintyAlphas,
  drawActivityHighlight,
  drawFlow,
  drawBackground,
  drawChannel,
  drawGlyph,
  drawHoverIndicator,
  drawPrimaryChannel,
  extractModes,
  extractValues,
  placeFlowChevrons,
} from './render.js';
import type {
  ModeDef,
  RenderConfig,
  RenderInput,
  Trajectory,
  VariableDef,
} from './types.js';

export interface RendererOptions {
  variables: VariableDef[];
  trajectory: Trajectory;
  config: RenderConfig;
  modes?: Record<string, ModeDef>;
}

/**
 * Stateful rendering orchestrator. Owns the trajectory-derived caches
 * (per-variable value arrays, mode array) so they don't recompute every frame,
 * and owns the config-derived caches (primary channel widths) so they only
 * recompute when config changes.
 *
 * The Leaflet layer (or any host) should:
 *   1. Construct a Renderer with initial options.
 *   2. Call setTrajectory / setConfig when data or config changes.
 *   3. Call draw(ctx, input) from its own redraw lifecycle (e.g., map pan/zoom).
 *
 * All projection to screen-space coordinates happens outside the renderer —
 * the host passes in pre-projected screenPoints matching the trajectory samples.
 */
export class VectorChannelsRenderer {
  private variables: VariableDef[];
  private variablesById: Map<string, VariableDef>;
  private trajectory: Trajectory;
  private config: RenderConfig;
  private modes: Record<string, ModeDef>;

  // Caches keyed on trajectory
  private valueArrays: Map<string, (number | null)[]> = new Map();
  private modeArray: (string | undefined)[] = [];

  constructor(options: RendererOptions) {
    this.variables = options.variables;
    this.variablesById = new Map(options.variables.map((v) => [v.id, v]));
    this.trajectory = options.trajectory;
    this.config = options.config;
    this.modes = options.modes ?? {};
    this.rebuildTrajectoryCaches();
  }

  setTrajectory(trajectory: Trajectory): void {
    this.trajectory = trajectory;
    this.rebuildTrajectoryCaches();
  }

  setConfig(config: RenderConfig): void {
    this.config = config;
  }

  setVariables(variables: VariableDef[]): void {
    this.variables = variables;
    this.variablesById = new Map(variables.map((v) => [v.id, v]));
    this.rebuildTrajectoryCaches();
  }

  setModes(modes: Record<string, ModeDef>): void {
    this.modes = modes;
  }

  getVariable(id: string | null): VariableDef | null {
    if (!id) return null;
    return this.variablesById.get(id) ?? null;
  }

  getTrajectory(): Trajectory {
    return this.trajectory;
  }

  getConfig(): RenderConfig {
    return this.config;
  }

  private rebuildTrajectoryCaches(): void {
    this.valueArrays.clear();
    for (const v of this.variables) {
      this.valueArrays.set(v.id, extractValues(this.trajectory, v.id));
    }
    this.modeArray = extractModes(this.trajectory);
  }

  private getValues(varId: string | null): (number | null)[] | null {
    if (!varId) return null;
    return this.valueArrays.get(varId) ?? null;
  }

  /**
   * Main draw entry point. Called by the host (e.g., Leaflet layer) whenever
   * the screen projection changes or config/trajectory updates.
   */
  draw(ctx: CanvasRenderingContext2D, input: RenderInput): void {
    const { screenPoints, width, height } = input;
    const n = screenPoints.length;

    if (input.drawBackground) {
      drawBackground(ctx, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    if (n < 2) return;

    const tangents = computeTangents(screenPoints);
    const { config } = this;

    const primaryVar = this.getVariable(config.primaryVar);
    const widthVar = this.getVariable(config.widthVar);

    // Build the watchlist. Skip ids that aren't known or lack limits — those
    // can never produce an alert status.
    const alertWatches: AlertWatch[] = [];
    for (const id of config.alerts) {
      const v = this.getVariable(id);
      if (!v || !v.limits) continue;
      const values = this.getValues(id);
      if (!values) continue;
      alertWatches.push({ var: v, values });
    }

    const widths = computePrimaryWidths(
      n,
      this.getValues(config.widthVar),
      widthVar,
      config.widthInvert
    );

    const uncertaintyVar = this.getVariable(config.uncertaintyVar);
    const uncertaintyAlphas = computeUncertaintyAlphas(
      n,
      this.getValues(config.uncertaintyVar),
      uncertaintyVar,
      config.uncertaintyInvert
    );

    const channelOffsetBase = config.channelOffsetBase ?? 9;
    const channelOffsetStep = config.channelOffsetStep ?? 7;
    const channelStrokeWidth = config.channelStrokeWidth ?? 3.5;

    // Layer order:
    //   1. channels (outer → inner, so tighter channels render on top)
    //   2. primary channel (with alert band)
    //   3. flow overlay (chevrons on the path)
    //   4. activity hover highlight
    //   5. event glyphs
    //   6. hover indicator

    for (let idx = config.channels.length - 1; idx >= 0; idx--) {
      const id = config.channels[idx];
      const varDef = this.getVariable(id);
      const values = this.getValues(id);
      if (!varDef || !values) continue;
      drawChannel(
        ctx,
        screenPoints,
        tangents,
        values,
        varDef,
        offsetForChannel(idx, channelOffsetBase, channelOffsetStep),
        channelStrokeWidth
      );
    }

    if (primaryVar || config.stateOverlay) {
      // Floor the alert band's distance from the primary centerline so it
      // always sits beyond the outermost channel. With no channels this is 0
      // and the band falls back to its fill-relative offset.
      let alertMinOffset = 0;
      if (config.channels.length > 0) {
        const maxChannelOffset = Math.abs(
          offsetForChannel(
            config.channels.length - 1,
            channelOffsetBase,
            channelOffsetStep,
          ),
        );
        const gap = config.alertGapPx ?? 1.5;
        alertMinOffset =
          maxChannelOffset +
          channelStrokeWidth / 2 +
          gap +
          ALERT_BASE_WIDTH / 2;
      }

      drawPrimaryChannel(ctx, {
        points: screenPoints,
        tangents,
        widths,
        colorValues: this.getValues(config.primaryVar),
        colorVar: primaryVar,
        uncertaintyAlphas,
        stateValues: this.modeArray,
        stateOverlay: config.stateOverlay,
        modes: this.modes,
        alertWatches,
        alertGapPx: config.alertGapPx,
        alertWidthScale: config.alertWidthScale,
        alertMinOffsetPx: alertMinOffset,
      });
    }

    // Flow overlay: independent of the primary role — chevrons ride the path
    // itself, so this draws whenever a flow variable is assigned. On top of the
    // strip/alerts, under event glyphs and the hover indicator.
    const flowVar = this.getVariable(config.flowVar);
    if (flowVar) {
      const field = computeFlowField(
        screenPoints,
        this.getValues(config.flowVar),
        flowVar,
        config.flowInvert
      );
      const chevrons = placeFlowChevrons(
        screenPoints,
        tangents,
        field,
        input.timeMs ?? 0
      );
      drawFlow(ctx, chevrons);
    }

    if (
      input.hoveredActivityIdx != null &&
      input.activityIndices &&
      input.activityIndices[input.hoveredActivityIdx]
    ) {
      const idx = input.activityIndices[input.hoveredActivityIdx];
      const activity = this.trajectory.activities[input.hoveredActivityIdx];
      if (activity) {
        drawActivityHighlight(ctx, screenPoints, idx.start, idx.end, activity.color);
      }
    }

    if (config.showEvents && input.eventIndices) {
      for (let i = 0; i < this.trajectory.events.length; i++) {
        const evt = this.trajectory.events[i];
        const sIdx = input.eventIndices[i];
        if (sIdx == null || sIdx < 0 || sIdx >= screenPoints.length) continue;
        const p = screenPoints[sIdx];
        drawGlyph(ctx, p.x, p.y, evt.type, evt.color, 6.5);
      }
    }

    if (input.hoveredSampleIdx != null) {
      const idx = input.hoveredSampleIdx;
      if (idx >= 0 && idx < screenPoints.length) {
        drawHoverIndicator(ctx, screenPoints[idx], tangents[idx]);
      }
    }
  }
}
