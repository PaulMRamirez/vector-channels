// Copyright (c) 2026 Paul Ramirez
// Licensed under the MIT License

import L from 'leaflet';
import {
  VectorChannelsRenderer,
  type ModeDef,
  type RenderConfig,
  type ScreenPoint,
  type Trajectory,
  type VariableDef,
} from '@vector-channels/core';
import {
  computeActivityIndices,
  computeEventIndices,
} from './indices.js';
import { hitTest } from './hitTest.js';

export interface VectorChannelsLayerOptions {
  variables: VariableDef[];
  trajectory: Trajectory;
  config: RenderConfig;
  modes?: Record<string, ModeDef>;
  /** Pointer-to-sample max distance in CSS pixels. Default 80. */
  sampleHitRadiusPx?: number;
  /** Pointer-to-event-glyph max distance in CSS pixels. Default 11. */
  eventHitRadiusPx?: number;
}

export interface HoverState {
  sampleIdx: number | null;
  eventIdx: number | null;
  activityIdx: number | null;
}

export interface HoverPartial {
  sampleIdx?: number | null;
  eventIdx?: number | null;
  activityIdx?: number | null;
}

export class VectorChannelsLayer extends L.Layer {
  private _renderer: VectorChannelsRenderer;
  private _canvas!: HTMLCanvasElement;
  private _mapRef?: L.Map;

  private _eventIndices: number[];
  private _activityIndices: Array<{ start: number; end: number }>;

  private _hover: HoverState = {
    sampleIdx: null,
    eventIdx: null,
    activityIdx: null,
  };

  private _lastScreenPoints: ScreenPoint[] = [];
  private _cssWidth = 0;
  private _cssHeight = 0;
  private _rafId: number | null = null;

  private _sampleHitRadiusPx: number;
  private _eventHitRadiusPx: number;

  constructor(options: VectorChannelsLayerOptions) {
    super();
    this._renderer = new VectorChannelsRenderer({
      variables: options.variables,
      trajectory: options.trajectory,
      config: options.config,
      modes: options.modes,
    });
    this._eventIndices = computeEventIndices(options.trajectory);
    this._activityIndices = computeActivityIndices(options.trajectory);
    this._sampleHitRadiusPx = options.sampleHitRadiusPx ?? 80;
    this._eventHitRadiusPx = options.eventHitRadiusPx ?? 11;
  }

  override onAdd(map: L.Map): this {
    this._mapRef = map;
    this._canvas = L.DomUtil.create(
      'canvas',
      'leaflet-zoom-animated vector-channels-canvas',
    ) as HTMLCanvasElement;
    this._canvas.style.pointerEvents = 'auto';
    map.getPanes().overlayPane.appendChild(this._canvas);

    map.on('viewreset', this._reset, this);
    map.on('zoom', this._reset, this);
    map.on('move', this._reset, this);
    map.on('moveend', this._reset, this);
    map.on('resize', this._reset, this);
    map.on('zoomanim', this._animateZoom, this);

    this._canvas.addEventListener('mousemove', this._onPointerMove);
    this._canvas.addEventListener('mouseleave', this._onPointerLeave);

    this._reset();
    return this;
  }

  override onRemove(map: L.Map): this {
    map.off('viewreset', this._reset, this);
    map.off('zoom', this._reset, this);
    map.off('move', this._reset, this);
    map.off('moveend', this._reset, this);
    map.off('resize', this._reset, this);
    map.off('zoomanim', this._animateZoom, this);

    this._canvas.removeEventListener('mousemove', this._onPointerMove);
    this._canvas.removeEventListener('mouseleave', this._onPointerLeave);

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    L.DomUtil.remove(this._canvas);
    this._mapRef = undefined;
    return this;
  }

  setConfig(config: RenderConfig): void {
    this._renderer.setConfig(config);
    this._scheduleRedraw();
  }

  setTrajectory(trajectory: Trajectory): void {
    this._renderer.setTrajectory(trajectory);
    this._eventIndices = computeEventIndices(trajectory);
    this._activityIndices = computeActivityIndices(trajectory);
    this._scheduleRedraw();
  }

  setVariables(variables: VariableDef[]): void {
    this._renderer.setVariables(variables);
    this._scheduleRedraw();
  }

  setModes(modes: Record<string, ModeDef>): void {
    this._renderer.setModes(modes);
    this._scheduleRedraw();
  }

  setHover(partial: HoverPartial): void {
    const next: HoverState = {
      sampleIdx:
        partial.sampleIdx !== undefined ? partial.sampleIdx : this._hover.sampleIdx,
      eventIdx:
        partial.eventIdx !== undefined ? partial.eventIdx : this._hover.eventIdx,
      activityIdx:
        partial.activityIdx !== undefined
          ? partial.activityIdx
          : this._hover.activityIdx,
    };
    if (
      next.sampleIdx === this._hover.sampleIdx &&
      next.eventIdx === this._hover.eventIdx &&
      next.activityIdx === this._hover.activityIdx
    ) {
      return;
    }
    this._hover = next;
    this.fire('vc:hover', { ...this._hover });
    this._scheduleRedraw();
  }

  getHover(): HoverState {
    return { ...this._hover };
  }

  private _reset(): void {
    const map = this._mapRef;
    if (!map) return;

    const size = map.getSize();
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);

    const dpr = window.devicePixelRatio || 1;
    const backingW = Math.round(size.x * dpr);
    const backingH = Math.round(size.y * dpr);

    if (this._canvas.width !== backingW || this._canvas.height !== backingH) {
      this._canvas.width = backingW;
      this._canvas.height = backingH;
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
    }

    this._cssWidth = size.x;
    this._cssHeight = size.y;
    this._scheduleRedraw();
  }

  // Why: _latLngToNewLayerPoint is a private Leaflet method that @types/leaflet
  // does not expose, but it is the standard way to keep a canvas layer aligned
  // during a zoom animation — the same pattern used by L.GridLayer and L.SVG.
  private _animateZoom(e: L.ZoomAnimEvent): void {
    const map = this._mapRef;
    if (!map) return;
    const scale = map.getZoomScale(e.zoom, map.getZoom());
    const offset = (
      map as unknown as {
        _latLngToNewLayerPoint: (
          latlng: L.LatLng,
          zoom: number,
          center: L.LatLng,
        ) => L.Point;
      }
    )._latLngToNewLayerPoint(
      map.containerPointToLatLng([0, 0]),
      e.zoom,
      e.center,
    );
    L.DomUtil.setTransform(this._canvas, offset, scale);
  }

  private _scheduleRedraw(): void {
    if (this._rafId !== null) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._redraw();
    });
  }

  private _redraw(): void {
    const map = this._mapRef;
    if (!map) return;
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const samples = this._renderer.getTrajectory().samples;
    const screenPoints: ScreenPoint[] = new Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const [lng, lat] = samples[i].position;
      const p = map.latLngToContainerPoint(L.latLng(lat, lng));
      screenPoints[i] = { x: p.x, y: p.y };
    }
    this._lastScreenPoints = screenPoints;

    this._renderer.draw(ctx, {
      screenPoints,
      eventIndices: this._eventIndices,
      activityIndices: this._activityIndices,
      hoveredSampleIdx: this._hover.sampleIdx,
      hoveredEventIdx: this._hover.eventIdx,
      hoveredActivityIdx: this._hover.activityIdx,
      width: this._cssWidth,
      height: this._cssHeight,
      drawBackground: false,
    });
  }

  private _onPointerMove = (ev: MouseEvent): void => {
    if (this._lastScreenPoints.length === 0) return;
    const rect = this._canvas.getBoundingClientRect();
    const result = hitTest(
      { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
      this._lastScreenPoints,
      this._eventIndices,
      {
        sampleThresholdPx: this._sampleHitRadiusPx,
        eventThresholdPx: this._eventHitRadiusPx,
      },
    );
    this.setHover({
      sampleIdx: result.sampleIdx,
      eventIdx: result.eventIdx,
    });
  };

  private _onPointerLeave = (): void => {
    this.setHover({ sampleIdx: null, eventIdx: null });
  };
}
