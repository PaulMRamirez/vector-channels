import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ======================================================================
// Vector Rails v2.5 — Glow band replaced with semantic outline
// ----------------------------------------------------------------------
// Change from v2.4: the glow band encoding is gone. Its one useful job
// (showing alert extent along the path) is now served by a per-segment
// colored outline on the main track:
//   nominal  → thin dark outline (decorative, as before)
//   warn     → amber outline, slightly thicker
//   critical → red outline, thicker still
//
// Driven by any variable with limits, independent of other slots.
// Doesn't compete with width, doesn't add geometry, reuses a channel
// (the outline) that was previously just for visual definition.
// ======================================================================

const VARIABLES = [
  { id: 'battery', name: 'Battery State of Charge', short: 'Batt',   unit: '%',  range: [20, 100], ramp: 'emerald', fmt: v => v.toFixed(1),
    limits: { warnLow: 25, criticalLow: 15 } },
  { id: 'slope',   name: 'Slope Angle',             short: 'Slope',  unit: '°',  range: [0, 22],   ramp: 'amber',   fmt: v => v.toFixed(1),
    limits: { warnHigh: 15, criticalHigh: 18 } },
  { id: 'cpu',     name: 'CPU Temperature',         short: 'CPU',    unit: '°C', range: [-20, 55], ramp: 'plasma',  fmt: v => v.toFixed(1),
    limits: { warnHigh: 45, criticalHigh: 50 } },
  { id: 'wheel',   name: 'Wheel Current (total)',   short: 'WheelI', unit: 'A',  range: [0, 7],    ramp: 'sky',     fmt: v => v.toFixed(2),
    limits: { warnHigh: 5, criticalHigh: 6 } },
  { id: 'databuf', name: 'Data Buffer Remaining',   short: 'Buf',    unit: 'GB', range: [0.5, 8],  ramp: 'teal',    fmt: v => v.toFixed(2),
    limits: { warnLow: 1.5, criticalLow: 0.8 } },
  { id: 'solar',   name: 'Solar Array Power',       short: 'Solar',  unit: 'W',  range: [0, 450],  ramp: 'viridis', fmt: v => v.toFixed(0),
    limits: null },
];
const VAR_BY_ID = Object.fromEntries(VARIABLES.map(v => [v.id, v]));

const MODES = {
  IDLE:     { color: '#64748b', label: 'Idle' },
  DRIVE:    { color: '#3b82f6', label: 'Drive' },
  IMAGE:    { color: '#a855f7', label: 'Image' },
  DRILL:    { color: '#f97316', label: 'Drill' },
  CHARGE:   { color: '#10b981', label: 'Charge' },
  DOWNLINK: { color: '#14b8a6', label: 'Downlink' },
};

const ACTIVITIES = [
  { start: 0.00, end: 0.05, label: 'Pre-flight check',       mode: 'IDLE',     color: '#64748b' },
  { start: 0.05, end: 0.25, label: 'Traverse A → Target 1',  mode: 'DRIVE',    color: '#3b82f6' },
  { start: 0.25, end: 0.35, label: 'Multispectral imaging',  mode: 'IMAGE',    color: '#a855f7' },
  { start: 0.35, end: 0.55, label: 'Traverse B → Target 2',  mode: 'DRIVE',    color: '#3b82f6' },
  { start: 0.55, end: 0.70, label: 'Drill & sample acquire', mode: 'DRILL',    color: '#f97316' },
  { start: 0.70, end: 0.85, label: 'Solar charging',         mode: 'CHARGE',   color: '#10b981' },
  { start: 0.85, end: 0.95, label: 'Traverse home',          mode: 'DRIVE',    color: '#3b82f6' },
  { start: 0.95, end: 1.00, label: 'Evening downlink',       mode: 'DOWNLINK', color: '#14b8a6' },
];

const EVENTS = [
  { t: 0.03, type: 'circle',   color: '#22c55e', label: 'Sol start / command uplink' },
  { t: 0.14, type: 'triangle', color: '#f97316', label: 'Wheel current elevated' },
  { t: 0.27, type: 'diamond',  color: '#60a5fa', label: 'Imaging sequence start' },
  { t: 0.42, type: 'triangle', color: '#ef4444', label: 'Rough terrain detected' },
  { t: 0.57, type: 'diamond',  color: '#60a5fa', label: 'Drill commencement' },
  { t: 0.72, type: 'circle',   color: '#22c55e', label: 'Solar charging nominal' },
  { t: 0.96, type: 'circle',   color: '#22c55e', label: 'DSN lock / downlink start' },
];

const WAYPOINTS = [
  { x: 140, y: 340 }, { x: 220, y: 320 }, { x: 315, y: 300 }, { x: 390, y: 285 },
  { x: 420, y: 270 }, { x: 475, y: 310 }, { x: 555, y: 330 }, { x: 635, y: 300 },
  { x: 705, y: 250 }, { x: 765, y: 215 }, { x: 790, y: 280 }, { x: 735, y: 335 },
  { x: 645, y: 365 }, { x: 545, y: 385 }, { x: 465, y: 395 },
];

// ---------- Outline styling ----------
const OUTLINE_STYLES = {
  nominal:  { color: 'rgba(0, 0, 0, 0.35)', width: 0.75 },
  warn:     { color: '#f59e0b', width: 1.5 },
  critical: { color: '#dc2626', width: 2.0 },
};

function offsetForRail(idx) {
  const side = idx % 2 === 0 ? 1 : -1;
  const step = Math.floor(idx / 2);
  return side * (9 + step * 7);
}

// ---------- Color utilities ----------
const lerp = (a, b, t) => a + (b - a) * t;
const lerpRgb = (c1, c2, t) => [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
const toRgbStr = ([r, g, b]) => `rgb(${r},${g},${b})`;

const RAMPS = {
  viridis: (t) => t < 0.5 ? lerpRgb([68, 1, 84], [33, 145, 140], t * 2) : lerpRgb([33, 145, 140], [253, 231, 37], (t - 0.5) * 2),
  plasma:  (t) => t < 0.5 ? lerpRgb([13, 8, 135], [204, 71, 120], t * 2) : lerpRgb([204, 71, 120], [240, 249, 33], (t - 0.5) * 2),
  sky:     (t) => lerpRgb([224, 242, 254], [3, 105, 161], t),
  amber:   (t) => lerpRgb([254, 243, 199], [180, 83, 9], t),
  teal:    (t) => lerpRgb([204, 251, 241], [15, 118, 110], t),
  emerald: (t) => lerpRgb([209, 250, 229], [5, 150, 105], t),
};

const normalize = (v, range) => Math.max(0, Math.min(1, (v - range[0]) / (range[1] - range[0])));
const colorFor = (varDef, value) => toRgbStr(RAMPS[varDef.ramp](normalize(value, varDef.range)));

function computeLimitStatus(value, limits) {
  if (!limits) return { status: 'nominal', intensity: 0 };
  if (limits.criticalLow != null && value <= limits.criticalLow) return { status: 'critical', intensity: 1 };
  if (limits.warnLow != null && value < limits.warnLow) {
    const span = (limits.criticalLow != null) ? (limits.warnLow - limits.criticalLow) : (limits.warnLow * 0.1 || 1);
    return { status: 'warn', intensity: Math.min(1, (limits.warnLow - value) / span) };
  }
  if (limits.criticalHigh != null && value >= limits.criticalHigh) return { status: 'critical', intensity: 1 };
  if (limits.warnHigh != null && value > limits.warnHigh) {
    const span = (limits.criticalHigh != null) ? (limits.criticalHigh - limits.warnHigh) : (limits.warnHigh * 0.1 || 1);
    return { status: 'warn', intensity: Math.min(1, (value - limits.warnHigh) / span) };
  }
  return { status: 'nominal', intensity: 0 };
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2*p0.x - 5*p1.x + 4*p2.x - p3.x) * t2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2*p0.y - 5*p1.y + 4*p2.y - p3.y) * t2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y) * t3),
  };
}

function generatePath(wps, samplesPerSeg = 28) {
  const pts = [];
  const ex = [wps[0], ...wps, wps[wps.length - 1]];
  for (let i = 0; i < ex.length - 3; i++) {
    for (let j = 0; j < samplesPerSeg; j++) {
      pts.push(catmullRom(ex[i], ex[i+1], ex[i+2], ex[i+3], j / samplesPerSeg));
    }
  }
  pts.push({ ...wps[wps.length - 1] });
  return pts;
}

function computeTangents(points) {
  const n = points.length, tans = new Array(n), w = 3;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), b = Math.min(n - 1, i + w);
    const dx = points[b].x - points[a].x, dy = points[b].y - points[a].y;
    const m = Math.hypot(dx, dy) || 1;
    tans[i] = [dx / m, dy / m];
  }
  return tans;
}

function fitTransform(wps, W, H, pad = 44) {
  const xs = wps.map(p => p.x), ys = wps.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX, spanY = maxY - minY;
  const s = Math.min((W - 2*pad) / spanX, (H - 2*pad) / spanY);
  const ox = pad + ((W - 2*pad) - spanX * s) / 2 - minX * s;
  const oy = pad + ((H - 2*pad) - spanY * s) / 2 - minY * s;
  return { s, ox, oy };
}

function computeMainWidths(widthVals, widthVar, widthInvert, n) {
  const widths = new Array(n);
  for (let i = 0; i < n; i++) {
    if (widthVals && widthVar) {
      let t = normalize(widthVals[i], widthVar.range);
      if (widthInvert) t = 1 - t;
      widths[i] = 2.5 + t * 11.5;
    } else {
      widths[i] = 7.5;
    }
  }
  return widths;
}

function modeAtT(t) {
  for (const a of ACTIVITIES) if (t >= a.start && t < a.end) return a.mode;
  return 'IDLE';
}

function generateStateArray(n) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) arr[i] = modeAtT(i / (n - 1));
  return arr;
}

function generateTelemetry(n) {
  const data = {};
  for (const v of VARIABLES) {
    const arr = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const mode = modeAtT(t);
      let norm;
      switch (v.id) {
        case 'battery': {
          let b;
          if (t < 0.05) b = 0.62;
          else if (t < 0.25) b = 0.62 - (t - 0.05) * 0.6;
          else if (t < 0.35) b = 0.50 - (t - 0.25) * 0.5;
          else if (t < 0.55) b = 0.45 - (t - 0.35) * 0.7;
          else if (t < 0.70) b = 0.31 - (t - 0.55) * 0.5;
          else if (t < 0.85) b = 0.23 + (t - 0.70) * 4.3;
          else if (t < 0.95) b = 0.875 - (t - 0.85) * 0.55;
          else b = 0.82 - (t - 0.95) * 0.6;
          norm = b + 0.01 * Math.sin(t * Math.PI * 20);
          break;
        }
        case 'slope':
          norm = 0.12 + 0.08 * Math.sin(t * Math.PI * 6.3)
               + 0.60 * Math.exp(-Math.pow((t - 0.42) / 0.05, 2))
               + 0.30 * Math.exp(-Math.pow((t - 0.13) / 0.04, 2))
               + 0.20 * Math.exp(-Math.pow((t - 0.88) / 0.03, 2));
          break;
        case 'cpu': {
          let base = 0.25;
          if (mode === 'IMAGE') base = 0.75;
          else if (mode === 'DRILL') base = 0.85;
          else if (mode === 'DOWNLINK') base = 0.65;
          else if (mode === 'DRIVE') base = 0.40;
          norm = base + 0.06 * Math.sin(t * Math.PI * 17);
          break;
        }
        case 'wheel': {
          let w = 0;
          if (mode === 'DRIVE') w = 0.35;
          w += 0.55 * Math.exp(-Math.pow((t - 0.42) / 0.06, 2));
          w += 0.25 * Math.exp(-Math.pow((t - 0.13) / 0.04, 2));
          w += 0.15 * Math.exp(-Math.pow((t - 0.88) / 0.03, 2));
          w += 0.04 * Math.sin(t * Math.PI * 22);
          norm = w;
          break;
        }
        case 'databuf': {
          let rem;
          if (t < 0.25) rem = 1.0;
          else if (t < 0.35) rem = 1.0 - (t - 0.25) * 1.8;
          else if (t < 0.55) rem = 0.82;
          else if (t < 0.70) rem = 0.82 - (t - 0.55) * 3.5;
          else if (t < 0.95) rem = 0.295;
          else rem = 0.295 + (t - 0.95) * 14;
          norm = Math.max(0, Math.min(1, rem));
          break;
        }
        case 'solar':
          norm = Math.max(0, Math.sin(t * Math.PI)) * 0.96;
          break;
        default:
          norm = 0.5;
      }
      norm = Math.max(0, Math.min(1, norm));
      arr[i] = v.range[0] + norm * (v.range[1] - v.range[0]);
    }
    data[v.id] = arr;
  }
  return data;
}

// ---------- Drawing ----------
function drawBackground(ctx, W, H) {
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function drawActivityHoverHighlight(ctx, points, startT, endT, color) {
  const n = points.length;
  const si = Math.round(startT * (n - 1));
  const ei = Math.min(n - 1, Math.round(endT * (n - 1)));
  if (ei <= si) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(points[si].x, points[si].y);
  for (let i = si + 1; i <= ei; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(points[si].x, points[si].y);
  for (let i = si + 1; i <= ei; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

function drawRail(ctx, points, tangents, values, varDef, offsetPx, strokeWidth) {
  if (!values || !varDef) return;
  const n = points.length;
  const BUCKETS = 40;
  const buckets = Array.from({ length: BUCKETS }, () => []);
  const offs = new Array(n);
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tangents[i];
    offs[i] = { x: points[i].x + (-ty) * offsetPx, y: points[i].y + tx * offsetPx };
  }
  for (let i = 0; i < n - 1; i++) {
    const t = normalize(values[i], varDef.range);
    const b = Math.min(BUCKETS - 1, Math.floor(t * BUCKETS));
    buckets[b].push(i);
  }
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let b = 0; b < BUCKETS; b++) {
    if (buckets[b].length === 0) continue;
    ctx.strokeStyle = toRgbStr(RAMPS[varDef.ramp]((b + 0.5) / BUCKETS));
    ctx.beginPath();
    for (const i of buckets[b]) {
      ctx.moveTo(offs[i].x, offs[i].y);
      ctx.lineTo(offs[i+1].x, offs[i+1].y);
    }
    ctx.stroke();
  }
}

function drawMainTrack(ctx, points, tangents, mainWidths, colorVals, colorVar, stateVals, stateOverlay, outlineVals, outlineVar) {
  const n = points.length;
  const L = new Array(n), R = new Array(n);
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tangents[i];
    const hw = mainWidths[i] / 2;
    L[i] = { x: points[i].x + (-ty) * hw, y: points[i].y + tx * hw };
    R[i] = { x: points[i].x - (-ty) * hw, y: points[i].y - tx * hw };
  }
  
  // Fill quads
  for (let i = 0; i < n - 1; i++) {
    let color;
    if (stateOverlay && stateVals) color = MODES[stateVals[i]]?.color || '#64748b';
    else if (colorVar && colorVals) color = colorFor(colorVar, (colorVals[i] + colorVals[i+1]) / 2);
    else color = '#64748b';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(L[i].x, L[i].y);
    ctx.lineTo(L[i+1].x, L[i+1].y);
    ctx.lineTo(R[i+1].x, R[i+1].y);
    ctx.lineTo(R[i].x, R[i].y);
    ctx.closePath();
    ctx.fill();
  }
  
  // Outline — semantic per-segment if outlineVar has limits, else uniform dark
  const hasSemanticOutline = outlineVar && outlineVals && outlineVar.limits;
  
  if (hasSemanticOutline) {
    // Compute per-segment status
    const statuses = outlineVals.map(v => computeLimitStatus(v, outlineVar.limits).status);
    
    // Group consecutive same-status segments into runs for clean continuous strokes
    // (avoids rounded-cap blobs at every segment boundary within the same status)
    const runs = [];
    let curStatus = statuses[0];
    let runStart = 0;
    for (let i = 1; i < n - 1; i++) {
      if (statuses[i] !== curStatus) {
        runs.push({ status: curStatus, start: runStart, end: i - 1 });
        curStatus = statuses[i];
        runStart = i;
      }
    }
    runs.push({ status: curStatus, start: runStart, end: n - 2 });
    
    // Sort runs so nominal renders first, warn second, critical last (critical on top)
    const severityOrder = { nominal: 0, warn: 1, critical: 2 };
    runs.sort((a, b) => severityOrder[a.status] - severityOrder[b.status]);
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const run of runs) {
      const style = OUTLINE_STYLES[run.status];
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width;
      // L edge
      ctx.beginPath();
      ctx.moveTo(L[run.start].x, L[run.start].y);
      for (let i = run.start; i <= run.end; i++) ctx.lineTo(L[i+1].x, L[i+1].y);
      ctx.stroke();
      // R edge
      ctx.beginPath();
      ctx.moveTo(R[run.start].x, R[run.start].y);
      for (let i = run.start; i <= run.end; i++) ctx.lineTo(R[i+1].x, R[i+1].y);
      ctx.stroke();
    }
  } else {
    // Default plain outline
    const style = OUTLINE_STYLES.nominal;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(L[i].x, L[i].y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R[0].x, R[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(R[i].x, R[i].y);
    ctx.stroke();
  }
}

function drawGlyph(ctx, x, y, type, color, size = 6.5) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  if (type === 'circle') ctx.arc(x, y, size, 0, Math.PI * 2);
  else if (type === 'diamond') { ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y); ctx.closePath(); }
  else if (type === 'triangle') { const h = size * 1.05; ctx.moveTo(x, y - h); ctx.lineTo(x + size * 0.9, y + h * 0.55); ctx.lineTo(x - size * 0.9, y + h * 0.55); ctx.closePath(); }
  ctx.fill();
  ctx.stroke();
}

function drawHover(ctx, point, tangent) {
  const [tx, ty] = tangent;
  const nx = -ty, ny = tx;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(point.x + nx * 45, point.y + ny * 45);
  ctx.lineTo(point.x - nx * 45, point.y - ny * 45);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- UI atoms ----------
function Section({ title, children, hint }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">{title}</div>
        {hint && <div className="text-xs text-slate-600">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function VarSelect({ value, options, onChange, includeNone, noneLabel = '(none)', disabled }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      disabled={disabled}
      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {includeNone && <option value="">{noneLabel}</option>}
      {options.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
  );
}

function RampSwatch({ ramp, w = 64, h = 8 }) {
  const stops = 8;
  return (
    <div className="flex items-center shrink-0">
      {Array.from({ length: stops }, (_, i) => (
        <div key={i} style={{ width: `${w / stops}px`, height: `${h}px`, background: toRgbStr(RAMPS[ramp](i / (stops - 1))) }} />
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status || status === 'nominal') return null;
  const cls = status === 'critical'
    ? 'bg-red-950 text-red-400 border-red-900'
    : 'bg-amber-950 text-amber-400 border-amber-900';
  return <span className={`text-xs px-1.5 py-0.5 rounded border uppercase tracking-wide tabular-nums ${cls}`}>{status}</span>;
}

// ---------- Main component ----------
export default function VectorRailsV25() {
  const rawPath = useMemo(() => generatePath(WAYPOINTS, 28), []);
  const telemetry = useMemo(() => generateTelemetry(rawPath.length), [rawPath.length]);
  const stateArray = useMemo(() => generateStateArray(rawPath.length), [rawPath.length]);
  
  const [mainVar, setMainVar] = useState('battery');
  const [widthVar, setWidthVar] = useState('slope');
  const [widthInvert, setWidthInvert] = useState(true);
  const [rails, setRails] = useState(['cpu', 'wheel', 'databuf', 'solar']);
  const [showEvents, setShowEvents] = useState(true);
  const [stateOverlay, setStateOverlay] = useState(false);
  const [outlineVar, setOutlineVar] = useState('battery');
  const [hoverT, setHoverT] = useState(null);
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [hoveredActivityIdx, setHoveredActivityIdx] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 520 });
  
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  const handleMain = (v) => {
    if (!v) return;
    if (rails.includes(v)) setRails(r => r.filter(x => x !== v));
    setMainVar(v);
  };
  const handleWidth = (v) => setWidthVar(v);
  
  const moveRail = useCallback((idx, dir) => {
    setRails(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);
  
  const removeRail = useCallback((id) => {
    setRails(prev => prev.filter(x => x !== id));
  }, []);
  
  const addRail = useCallback((id) => {
    if (!id) return;
    if (mainVar === id) setMainVar(null);
    setRails(prev => prev.includes(id) ? prev : [...prev, id]);
  }, [mainVar]);
  
  const mainVarDef = mainVar ? VAR_BY_ID[mainVar] : null;
  const widthVarDef = widthVar ? VAR_BY_ID[widthVar] : null;
  const outlineVarDef = outlineVar ? VAR_BY_ID[outlineVar] : null;
  
  const optsForMain = VARIABLES;
  const optsForWidth = VARIABLES;
  const optsForAddRail = VARIABLES.filter(v => v.id !== mainVar && !rails.includes(v.id));
  const optsForOutline = VARIABLES.filter(v => v.limits);
  
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ w: Math.max(400, Math.floor(width)), h: Math.max(300, Math.floor(height)) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w: W, h: H } = canvasSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    const { s, ox, oy } = fitTransform(WAYPOINTS, W, H);
    const screenPath = rawPath.map(p => ({ x: p.x * s + ox, y: p.y * s + oy }));
    const tans = computeTangents(screenPath);
    const mainWidths = computeMainWidths(widthVarDef ? telemetry[widthVar] : null, widthVarDef, widthInvert, screenPath.length);
    
    drawBackground(ctx, W, H);
    
    // Layer order:
    //  1. rails (outer → inner)
    //  2. main track (now with semantic outline, no separate glow)
    //  3. activity hover highlight
    //  4. event glyphs
    //  5. hover indicator
    
    for (let idx = rails.length - 1; idx >= 0; idx--) {
      const id = rails[idx];
      drawRail(ctx, screenPath, tans, telemetry[id], VAR_BY_ID[id], offsetForRail(idx), 3.5);
    }
    
    if (mainVarDef || stateOverlay) {
      drawMainTrack(
        ctx, screenPath, tans, mainWidths,
        telemetry[mainVar], mainVarDef,
        stateArray, stateOverlay,
        outlineVarDef ? telemetry[outlineVar] : null, outlineVarDef
      );
    }
    
    if (hoveredActivityIdx != null) {
      const a = ACTIVITIES[hoveredActivityIdx];
      drawActivityHoverHighlight(ctx, screenPath, a.start, a.end, a.color);
    }
    
    if (showEvents) {
      EVENTS.forEach(evt => {
        const idx = Math.round(evt.t * (screenPath.length - 1));
        drawGlyph(ctx, screenPath[idx].x, screenPath[idx].y, evt.type, evt.color, 6.5);
      });
    }
    
    if (hoverT != null) {
      const idx = Math.round(hoverT * (screenPath.length - 1));
      drawHover(ctx, screenPath[idx], tans[idx]);
    }
    
    if (hoveredEvent) {
      const idx = Math.round(hoveredEvent.t * (screenPath.length - 1));
      const p = screenPath[idx];
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = hoveredEvent.color;
      ctx.lineWidth = 1;
      const label = hoveredEvent.label;
      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
      const metrics = ctx.measureText(label);
      const bw = metrics.width + 12;
      const bh = 20;
      const bx = Math.min(W - bw - 4, Math.max(4, p.x + 10));
      const by = Math.max(4, p.y - bh - 10);
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText(label, bx + 6, by + bh - 6);
    }
  }, [canvasSize, rawPath, telemetry, stateArray, mainVar, widthVar, widthInvert, rails, showEvents, stateOverlay, outlineVar, outlineVarDef, hoverT, hoveredEvent, hoveredActivityIdx, mainVarDef, widthVarDef]);
  
  const handleMouse = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { w: W, h: H } = canvasSize;
    const { s, ox, oy } = fitTransform(WAYPOINTS, W, H);
    const screenPath = rawPath.map(p => ({ x: p.x * s + ox, y: p.y * s + oy }));
    
    let hitEvt = null;
    for (const evt of EVENTS) {
      const idx = Math.round(evt.t * (screenPath.length - 1));
      const p = screenPath[idx];
      if (Math.hypot(mx - p.x, my - p.y) < 11) { hitEvt = evt; break; }
    }
    setHoveredEvent(hitEvt);
    
    let best = 0, bestD = Infinity;
    for (let i = 0; i < screenPath.length; i++) {
      const d = Math.hypot(mx - screenPath[i].x, my - screenPath[i].y);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (bestD < 80) setHoverT(best / (screenPath.length - 1));
    else setHoverT(null);
  };
  
  const handleMouseLeave = () => { setHoverT(null); setHoveredEvent(null); };
  
  const hoverIdx = hoverT != null ? Math.round(hoverT * (rawPath.length - 1)) : null;
  const readout = (id) => (hoverIdx != null && telemetry[id]) ? telemetry[id][hoverIdx] : null;
  const hoverMode = hoverIdx != null ? stateArray[hoverIdx] : null;
  const hoverActivity = hoverT != null ? ACTIVITIES.find(a => hoverT >= a.start && hoverT < a.end) : null;
  
  const activeVarIds = [];
  const pushed = new Set();
  const push = (id) => { if (id && !pushed.has(id)) { activeVarIds.push(id); pushed.add(id); } };
  if (mainVar && !stateOverlay) push(mainVar);
  if (widthVar) push(widthVar);
  rails.forEach(push);
  if (outlineVar) push(outlineVar);
  
  const getRoles = (id) => {
    const roles = [];
    if (id === mainVar && !stateOverlay) roles.push('main');
    if (id === widthVar) roles.push('width');
    const railIdx = rails.indexOf(id);
    if (railIdx >= 0) roles.push(`rail #${railIdx + 1}`);
    if (id === outlineVar) roles.push('outline');
    return roles;
  };
  
  const outlineStatus = (outlineVarDef && hoverIdx != null)
    ? computeLimitStatus(telemetry[outlineVar][hoverIdx], outlineVarDef.limits)
    : null;
  
  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-mono">
      <div className="px-4 py-2 border-b border-slate-800 flex items-baseline justify-between">
        <div>
          <span className="text-sm font-semibold">Vector Rails</span>
          <span className="ml-3 text-xs text-slate-500">v2.5 · semantic outline</span>
        </div>
        <div className="text-xs text-slate-600 flex items-center gap-3">
          {hoverT != null ? (
            <>
              <span>t = {(hoverT * 100).toFixed(1)}%</span>
              {hoverActivity && <span className="text-slate-400">{hoverActivity.label}</span>}
              {hoverMode && <span style={{ color: MODES[hoverMode].color }}>{MODES[hoverMode].label}</span>}
              {outlineStatus && outlineStatus.status !== 'nominal' && <StatusBadge status={outlineStatus.status} />}
            </>
          ) : 'hover the track'}
        </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={containerRef} className="flex-1 relative">
            <canvas ref={canvasRef} onMouseMove={handleMouse} onMouseLeave={handleMouseLeave} className="block cursor-crosshair" />
          </div>
          
          <div className="border-t border-slate-800 px-4 py-3 bg-slate-950">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
              {activeVarIds.map(id => {
                const v = VAR_BY_ID[id];
                const val = readout(id);
                const roles = getRoles(id);
                const status = v.limits && val != null ? computeLimitStatus(val, v.limits).status : null;
                return (
                  <div key={id} className="flex items-center gap-2">
                    <RampSwatch ramp={v.ramp} w={36} h={6} />
                    <div>
                      <div className="text-slate-300">
                        {v.short}
                        <span className="ml-1.5 text-slate-600">{roles.join('·') || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-100 text-sm tabular-nums">
                          {val != null ? `${v.fmt(val)}${v.unit ? ' ' + v.unit : ''}` : '—'}
                        </span>
                        {status && status !== 'nominal' && <StatusBadge status={status} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {stateOverlay && hoverMode && (
                <div className="flex items-center gap-2">
                  <div className="w-9 h-1.5 rounded" style={{ background: MODES[hoverMode].color }} />
                  <div>
                    <div className="text-slate-300">Mode <span className="ml-1.5 text-slate-600">main</span></div>
                    <div className="text-sm" style={{ color: MODES[hoverMode].color }}>{MODES[hoverMode].label}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="w-80 shrink-0 border-l border-slate-800 overflow-y-auto p-4 space-y-5" style={{ backgroundColor: '#0a0f1a' }}>
          
          <Section title="Main track" hint="color + width">
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">
                  Color {stateOverlay && <span className="text-amber-500">(overridden)</span>}
                </label>
                <VarSelect value={mainVar} options={optsForMain} onChange={handleMain} disabled={stateOverlay} />
                {mainVarDef && !stateOverlay && (
                  <div className="flex items-center gap-2 pt-1">
                    <RampSwatch ramp={mainVarDef.ramp} w={120} h={8} />
                    <div className="text-xs text-slate-500">
                      {mainVarDef.range[0]}–{mainVarDef.range[1]}{mainVarDef.unit ? ' ' + mainVarDef.unit : ''}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Width</label>
                <VarSelect value={widthVar} options={optsForWidth} onChange={handleWidth} includeNone noneLabel="(constant)" />
                {widthVarDef && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex items-center">
                      <div className="bg-slate-400" style={{ width: '3px', height: '14px' }} />
                      <div className="mx-1 text-xs text-slate-600">→</div>
                      <div className="bg-slate-400" style={{ width: '10px', height: '14px' }} />
                    </div>
                    <label className="text-xs text-slate-500 flex items-center gap-1.5 cursor-pointer ml-2">
                      <input type="checkbox" checked={widthInvert} onChange={(e) => setWidthInvert(e.target.checked)} className="accent-slate-400" />
                      invert
                    </label>
                  </div>
                )}
              </div>
            </div>
          </Section>
          
          <Section title="Outline" hint="limit status">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Driven by</label>
              <VarSelect value={outlineVar} options={optsForOutline} onChange={setOutlineVar} includeNone noneLabel="(none — plain edge)" />
              {outlineVarDef && outlineVarDef.limits && (
                <>
                  <div className="text-xs text-slate-500 space-y-0.5 pt-1">
                    {outlineVarDef.limits.warnLow != null && (
                      <div>warn below <span className="text-amber-400 tabular-nums">{outlineVarDef.limits.warnLow}{outlineVarDef.unit ? ' ' + outlineVarDef.unit : ''}</span> · critical below <span className="text-red-400 tabular-nums">{outlineVarDef.limits.criticalLow}{outlineVarDef.unit ? ' ' + outlineVarDef.unit : ''}</span></div>
                    )}
                    {outlineVarDef.limits.warnHigh != null && (
                      <div>warn above <span className="text-amber-400 tabular-nums">{outlineVarDef.limits.warnHigh}{outlineVarDef.unit ? ' ' + outlineVarDef.unit : ''}</span> · critical above <span className="text-red-400 tabular-nums">{outlineVarDef.limits.criticalHigh}{outlineVarDef.unit ? ' ' + outlineVarDef.unit : ''}</span></div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                    <div className="flex items-center gap-1">
                      <div style={{ width: '14px', height: '2px', background: '#f59e0b' }} />
                      <span>warn</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div style={{ width: '14px', height: '2px', background: '#dc2626' }} />
                      <span>critical</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Section>
          
          <Section title="State overlay" hint="discrete mode">
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={stateOverlay} onChange={(e) => setStateOverlay(e.target.checked)} className="accent-slate-400" />
                <span className="text-sm text-slate-300">Color main track by rover mode</span>
              </label>
              {stateOverlay && (
                <div className="pl-6 grid grid-cols-2 gap-y-1 gap-x-3 text-xs">
                  {Object.entries(MODES).map(([k, m]) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ background: m.color }} />
                      <span className="text-slate-300">{m.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
          
          <Section title="Rails" hint="tight → outer, ordered">
            <div className="space-y-1">
              {rails.length === 0 && (
                <div className="text-xs text-slate-600 italic px-1">No rails. Use dropdown below to add context variables.</div>
              )}
              {rails.map((id, idx) => {
                const v = VAR_BY_ID[id];
                return (
                  <div key={id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-900">
                    <span className="text-xs text-slate-500 tabular-nums w-4 text-right">{idx + 1}</span>
                    <RampSwatch ramp={v.ramp} w={24} h={5} />
                    <span className="text-sm text-slate-300 flex-1 truncate">{v.name}</span>
                    <div className="flex items-center text-slate-600 shrink-0">
                      <button
                        onClick={() => moveRail(idx, -1)}
                        disabled={idx === 0}
                        className="hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed px-1 text-xs"
                        title="Move closer to main"
                      >↑</button>
                      <button
                        onClick={() => moveRail(idx, 1)}
                        disabled={idx === rails.length - 1}
                        className="hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed px-1 text-xs"
                        title="Move farther from main"
                      >↓</button>
                      <button
                        onClick={() => removeRail(id)}
                        className="hover:text-red-400 px-1 text-sm"
                        title="Remove rail"
                      >×</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {optsForAddRail.length > 0 && (
              <select
                value=""
                onChange={(e) => { if (e.target.value) addRail(e.target.value); }}
                className="w-full bg-slate-900 border border-dashed border-slate-700 rounded px-2 py-1.5 text-sm text-slate-400 focus:outline-none focus:border-slate-500 cursor-pointer mt-2"
              >
                <option value="">+ Add rail…</option>
                {optsForAddRail.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            )}
          </Section>
          
          <Section title="Activities" hint="hover to highlight">
            <div className="space-y-1 text-xs">
              {ACTIVITIES.map((a, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-slate-800"
                  onMouseEnter={() => setHoveredActivityIdx(idx)}
                  onMouseLeave={() => setHoveredActivityIdx(null)}
                >
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
                  <span className="text-slate-300 truncate">{a.label}</span>
                  <span className="text-slate-600 ml-auto shrink-0 tabular-nums">
                    {(a.start * 100).toFixed(0)}–{(a.end * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </Section>
          
          <Section title="Events" hint="glyphs on main track">
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} className="accent-slate-400" />
                <span className="text-sm text-slate-300">Show event glyphs</span>
              </label>
              <div className="pl-6 space-y-1 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-green-500 border border-slate-100" />
                  info / waypoint
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 bg-blue-400 border border-slate-100" style={{ transform: 'rotate(45deg)' }} />
                  state transition
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block" style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '10px solid #f97316' }} />
                  anomaly / warning
                </div>
              </div>
            </div>
          </Section>
          
          <div className="pt-3 border-t border-slate-800 text-xs text-slate-600 leading-relaxed">
            Glow replaced with semantic outline. Battery dips during drilling now show as amber edges, with red where it crosses critical. Reclaims the geometric space around the track without losing the alert-extent signal. Set outline to (none) for plain decorative edges.
          </div>
        </div>
      </div>
    </div>
  );
}
