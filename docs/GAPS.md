# Gaps and Opportunities

A survey of pain points in adjacent tools, opportunities those create for Vector Channels, and weaknesses in our current approach that we should address before they become baked in.

This document complements `COMPETITIVE.md` (which catalogs what exists) by analyzing where the opportunities and risks lie. Read both together.

## Part 1: Pain points in adjacent tools

Gaps and friction points in the tools Vector Channels will coexist with or compete against. Each item names the tool, the pain, and what it tells us.

### MMGIS

**Pain: vector layer styling is per-feature, not per-sample-along-a-path.** MMGIS can color a LineString by a single attribute from its GeoJSON properties, but multiple variables along the same trajectory require multiple layers stacked on the map — visually confusing, and they lose spatial correspondence with each other. The graph panel solves per-variable time-series but disconnects it from the map.

**Pain: the time slider is global, not layer-local.** Playing time animates all layers together; users can't scrub one variable forward without scrubbing everything.

**Pain: plugin surface for overlays is lightly documented.** The `*Plugin-Tools*` convention exists but plugin development guidance is thin, creating friction for anyone building complementary tools.

**What it tells us:** Vector Channels fills the per-sample-multivariate gap cleanly. The integration model should be "overlay that shares MMGIS's map instance but owns its own time/state axis," not "replace MMGIS's time slider."

### PlanDev (formerly Aerie)

**Pain: no spatial context at all.** PlanDev is timeline-first. Plans, constraints, simulated profiles — all rendered as time axes. For missions with spatial context (rovers, airborne surveys), operators mentally map timeline events to geography.

**Pain: plan-vs-actual comparison is timeline-based.** Aerie has plan comparison views, but they compare time profiles, not spatial paths. A rover that deviated from the planned route shows up as a time-aligned profile mismatch, not as a spatial divergence.

**Pain: constraint violations are annotations on timelines.** You see *when* a constraint was violated. You don't see *where* it was violated.

**What it tells us:** The ghost-path feature (v0.3) and spatial constraint-violation highlighting are genuine differentiators, not just nice-to-haves. They solve problems PlanDev has acknowledged but doesn't address because PlanDev isn't a map.

### OpenMCT

**Pain: composable widgets, but no spatial primitives.** OpenMCT lets users compose plots, tables, gauges, imagery, and timelines. No map. No trajectory. If you want to show "what happened where," you need a separate tool.

**Pain: widgets don't correlate spatially.** Two plot widgets can be brushed/linked in time, but there's no notion of spatial brushing — "show me the telemetry for the section of traverse where the rover was on that ridge."

**What it tells us:** Vector Channels could be an OpenMCT widget someday. The data model (`Trajectory` + `VariableDef`) is already compatible with what OpenMCT's plot widgets consume; the rendering substrate is different. An OpenMCT plugin is a plausible post-v0.4 artifact.

### Yamcs

**Pain: web client (Yamcs Web) has timelines, parameter plots, and event streams — but no spatial view.** Yamcs is designed for any vehicle; its UI stays agnostic. Users building rover or spacecraft ops UIs on top of Yamcs have to build their own spatial views.

**What it tells us:** Vector Channels could consume Yamcs archive data as a straightforward loader (v0.4+). It's the kind of complementary spatial view that Yamcs deliberately doesn't provide.

### deck.gl TripsLayer / kepler.gl / Foursquare Studio

**Pain: single-variable color, multi-variable via multiple overlapping layers.** deck.gl's TripsLayer colors paths by one attribute. Multi-variable requires stacking layers — loses spatial correspondence, expensive to render.

**Pain: animation-first, not analysis-first.** The primary use case is playing trips through time. Analytical comparison across many variables at once isn't the design target.

**Pain: WebGL expertise required for customization.** deck.gl's custom-layer path is powerful but high-friction. Many ops teams don't have a deck.gl specialist.

**What it tells us:** Our Canvas-based, analysis-first, single-view multi-variable approach occupies a genuinely different niche. The trade-off is scale (fewer samples before performance matters), which we address via decimation.

### Strava StatMaps and consumer fitness tools

**Pain: one variable at a time, by design.** Consumer products optimize for scan-ability. Multi-variable literally isn't a feature — users switch between pace, heart rate, elevation, etc.

**Pain: no comparison view.** You can view one activity's stat map, but comparing two rides side-by-side with their stat maps aligned isn't supported.

**What it tells us:** Multi-activity comparison isn't a consumer need but is a real mission-ops need. Fleet comparison (e.g., two rovers' traverses overlaid, or planned-vs-alternate-plan-vs-actual) is an unaddressed niche. Candidate for roadmap.

### Grafana / Kibana / observability dashboards

**Pain: not spatial.** Time-series, histograms, heatmaps — all temporal or statistical, not geographic. Ops teams in space (and increasingly in autonomous-vehicle domains) need the spatial dimension these tools lack.

**Pain: dashboard composition is expensive cognitively.** Coordinating five panels with shared time selection works but fragments attention. "All in one view" is still valued.

**What it tells us:** The single-view multi-variable philosophy of Vector Channels is a deliberate departure from dashboard-composition norms. It's a strength for quick-look, weak for deep analysis of any single variable. Positioning matters: "scan many variables spatially at once" vs. "investigate one variable deeply."

### RSVP (Rover Sequencing and Visualization Program)

Legacy tool. MER / MSL heritage. Desktop-based, 3D rover environment, command-sequence editing.

**Pain: desktop-only, Java-based, per-mission customized. High deployment friction.** Each new mission requires adaptation. MMGIS emerged partly to fill the "web-accessible, multi-mission" gap RSVP couldn't.

**Pain: 3D immersive environment is powerful but heavy.** Not suitable for quick-look or shift-handover scenarios where you want to scan a sol in seconds.

**What it tells us:** The web-first, 2D-scannable, lightweight posture is correct for shift-handover and quick-look. 3D is powerful but not the right substrate for frequent quick review.

### xGDS / Playbook (ARC, NASA analog mission operations)

**Pain: xGDS is powerful but field-mission specific.** Developed for analog missions (BASALT, Mojave Volatiles Prospector) with lots of science-team collaboration features. Some of these would transfer to other missions but haven't.

**Pain: planning phase ↔ monitoring phase gap.** Plans are created in one interface, monitoring happens in another, archives are a third.

**What it tells us:** Unified planning-monitoring-archive view is a recognized need that hasn't been solved. Vector Channels doesn't try to solve the whole thing, but its ghost-path feature implicitly bridges planning (the ghost) and monitoring (the actual). That's a small foothold in a larger pain point.

## Part 2: Opportunities Vector Channels can claim

Given the pain points above, these are specific opportunities for Vector Channels to differentiate or lead:

### A. Multi-variable spatial quick-look

The core proposition, worth restating here: no other tool in the ecosystem shows 3+ telemetry variables along a trajectory in a single 2D view with preserved spatial correspondence. This is Vector Channels's primary claim to existence. Already in scope.

### B. Spatial plan-vs-actual comparison (v0.3)

PlanDev compares plans on timelines. MMGIS doesn't compare plans. Nobody shows spatial divergence between plan and execution in a single view. This is the single most operationally distinctive capability Vector Channels could offer. Already on the roadmap.

### C. Constraint violation shown spatially

PlanDev models constraints and flags violations on timelines. Vector Channels already renders limit-status via the alerts watchlist (multiple watched variables, worst-status wins per segment). Extending this to PlanDev constraints (not just simple per-variable numeric limits) is an opportunity: users see both *when* and *where* constraints were violated, in the same view that already shows the telemetry that violated them.

This should be additive on top of the v0.4 PlanDev integration work. Constraints come over the GraphQL API; they feed the alerts watchlist (or a new constraint-band if their semantics differ enough from simple limits); click-through opens the PlanDev constraint view.

### D. Multi-trajectory comparison (not on current roadmap)

Operations often needs to compare:
- Plan A vs. Plan B vs. Actual (three ghost paths)
- Same rover on two different sols (longitudinal comparison)
- Two rovers in a fleet (cross-vehicle)
- Current traverse vs. heritage traverse from a past mission

None of the existing tools do this well. Strava punts, MMGIS layers stack, PlanDev is temporal-only. A "trajectory bundle" concept — multiple trajectories, same encoding, distinguished by desaturation / line style / grouping — would be a clean extension of the current design.

**Recommendation:** Add as v0.4 or v0.5. Design needs thought: how do you avoid visual collapse when overlaying five trajectories? Probably need explicit focus/context mode (one active, others ghosted).

### E. Spatial brushing and linking

Coordinated-multiple-views literature (Roberts 2007, North & Shneiderman, Scherr 2008) is well-established but the mission-ops community underuses it. Vector Channels is already poised to be one side of a brush+link relationship with MMGIS's graph view: hover a section of the trajectory, see those samples highlighted in the graph. Currently deferred to v0.4 as "bidirectional selection sync."

**Recommendation:** Elevate this from "integration wiring" to a first-class design consideration. It's the standard pattern for coordinated-multiple-views workflows and operators will expect it.

### F. Uncertainty rendering

Spacecraft telemetry anomaly detection literature (Fuertes et al., Hundman et al., the ESA Anomalies Dataset benchmark) increasingly produces confidence intervals, prediction bounds, and anomaly scores — not just values. Visualizing these on a trajectory is a gap across the board.

Candidate encodings:
- **Width variance** — modulate width by confidence: wide where confident, thin where uncertain. This reuses our existing width channel meaningfully.
- **Desaturation** — reduce color saturation in low-confidence regions. This was already in our deferred-ideas list but the anomaly-detection use case sharpens it.
- **Anomaly score as alerts** — same pattern as the limit-status alert band, but driven by a continuous anomaly score rather than discrete thresholds. Perhaps a third "intensity" level between warn and critical, or a separate overlay tier.

**Recommendation:** Probably post-v0.4. Needs a concrete data source (ESA-ADB? internal anomaly models?) to validate design against real scores rather than synthetic.

### G. Shift-handover quick-look mode

MER shift-handover research (Parke & Mishkin 2005) documents this as a recurring pain: incoming ops need to absorb what happened on the previous shift fast. The standard artifact is a written handoff document plus a verbal briefing.

Vector Channels could support a "handoff view" — one canvas showing the last shift's traverse with the key events annotated, exported as an image or a shareable URL with state preserved. This is mostly a persistence + export feature rather than a new encoding, but it's a real workflow gap.

**Recommendation:** v0.5 or later. Low technical complexity, high operational value. Depends on persistence being in place first.

### H. Anomaly-first view

Most tools show nominal operations with anomalies as annotations. Vector Channels could support a mode where the path is desaturated/thinned except at anomaly regions, which are rendered at full encoding. The operator sees where to look first.

**Recommendation:** Interesting enough to prototype but not high priority. Fits the spatial-correlator scope.

### I. MCP App for AI-assistant-driven workflows

MCP Apps (SEP-1865, officially launched January 2026) is the first official extension to the Model Context Protocol. It lets MCP tools return interactive HTML UIs that render inline in the host (Claude, ChatGPT, Goose, VS Code) rather than just text or JSON. UIs are declared as resources with a `ui://` URI scheme, run in sandboxed iframes, and communicate bidirectionally with both the host and the MCP server via JSON-RPC over postMessage. The launch announcement explicitly calls out "charts, dashboards, forms, visualizations" as the primary use cases.

Vector Channels is a near-canonical example of what MCP Apps is for. Three reasons:

1. **Visualization is the specified use case.** "Interactive chart" is the leading example in the spec.
2. **Our architecture is already embedding-friendly.** `core` is pure TypeScript with no framework dependencies. A production HTML bundle wrapping `core` + a trimmed rendering shell is a small repackaging job, not a rewrite.
3. **The AI-in-the-loop workflow genuinely helps ops users.** "Show me Percy's last 10 sols with battery and slope" is a shift-handover query that today requires opening MMGIS and configuring layers manually. With MCP Apps it becomes one natural-language question producing an interactive Vector Channels view inline.

MMGIS is adding an MCP server through its CLI. PlanDev will likely follow. The natural integration has the MMGIS MCP own the data side (`get_trajectory`, `get_activity_details`), Vector Channels owns a separate MCP server that exposes `render_trajectory` returning a `ui://` resource, and the host stitches them together. User clicks in the embedded UI call back through the host and can trigger further MCP tools on either server — the LLM watches the user's interaction with the visualization and reasons about it in the next turn.

Architecture: two additional packages layered on the existing scaffold, shipped together as a single MCP Bundle (`.mcpb`):

```
packages/
  mcp-app/        production HTML bundle — core + trimmed rendering shell for iframe
  mcp-server/     MCP server exposing render_trajectory, compare_trajectories, update_view
```

The v0.3 ghost path feature becomes a natural `compare_trajectories` tool. The v0.5 shift-handover feature becomes a trivial preset ("show me the last shift's traverse with battery limits").

**Technical gotchas worth noting:**
- Sandboxed iframes mean no localStorage, no cross-origin fetches, no IndexedDB. Not a blocker — our state lives in Zustand in-memory and data arrives via MCP tool calls.
- The extension currently supports only text/html content. External URLs and native widgets are deferred. Fine for us since we serve a static HTML bundle with inlined JS/CSS.
- Bundle size matters (~150 kB gzipped is our back-of-envelope total with Leaflet). Within acceptable range, but we may want to offer a leaner MCP App variant without Leaflet — MCP App iframes don't need pan-zoom navigation to the same extent since the data is pre-scoped by the tool call. `core` is already decoupled from Leaflet, so a canvas-only shell is straightforward.
- Trajectory data payload flows through the MCP call result. At 10k samples × 6 variables this is ~480 kB raw. Compressible, but long trajectories push against practical host limits — another reason to elevate decimation (G6) sooner.
- Bidirectional update flow is still evolving in the spec (the SEP-1865 PR discussion flagged open questions about widgets subscribing to subsequent data updates). Worth tracking if we want plan-vs-actual streaming updates.

**Tool vs. app split:** MCP Apps is additive to regular MCP tools, not a replacement. The Vector Channels MCP server should expose both — a mix, not a pure app-only play. Rough taxonomy to preserve:

- *Data-returning tools* (LLM reasons from them): `summarize_traverse`, `detect_anomalies`, `query_at_position`, `find_extrema`. Cheap, text output. Lets the LLM answer "what was the total distance?" without rendering a full UI.
- *UI-returning tools* (return `ui://` resources): `render_trajectory`, `compare_trajectories`, `render_handoff_view`. The visualization is the answer.
- *Side-effect tools*: `export_view`, `save_bookmark`.

The test for which side something belongs on: if a follow-up question could be answered from the data alone, expose as a tool; if it needs the visual representation, expose as an app (UI-returning tool). Full taxonomy lives here until we're close enough to v0.4 to move it into `ROADMAP.md`.

**Strategic framing:** The MMGIS plugin (v0.4 integration) puts Vector Channels in front of existing MMGIS users. The MCP App puts it in front of anyone using an AI assistant with mission-ops MCP servers connected — a potentially much larger audience as MMGIS, PlanDev, and OpenMCT all expose MCP servers. Paul's existing cross-platform AI agent layer work sits in exactly this ecosystem.

**Recommendation:** Frame as a parallel v0.4 distribution target alongside the MMGIS plugin. Both share the underlying work (decoupled packaging, bundle optimization, real data loaders) and both benefit from v0.2/v0.3 feature work (export, pin-and-compare, ghost path). Not urgent enough to disrupt v0.1–v0.3 scaffolding but worth keeping in mind as we make packaging and decoupling decisions.

## Part 3: Gaps in our current approach

Things Vector Channels doesn't do well yet, or doesn't do at all, that matter for the spatial-correlator niche.

### G1. Still fundamentally single-trajectory

The whole design assumes one trajectory in view. Multi-trajectory comparison (item D above) would require rethinking hit-testing, layering, color assignment, and the legend. Not a trivial extension.

**Mitigation:** Explicit non-goal for v0.1-v0.3. Revisit for v0.4+ with a clear design pass.

### G2. Small-multiples affordance absent

Sometimes what users want isn't one view with many variables, but many small views each showing one variable — the Tufte small-multiples pattern. Vector Channels's design prohibits this (everything is one canvas).

**Mitigation:** We deliberately chose single-view, and the argument still holds (spatial correspondence across variables is the value prop). But: we could *export* small-multiples from the same data model — render each channel as a standalone miniature for a handoff document. This is a natural extension of the handoff-view feature.

### G3. No export/share primitives

Related to shift-handover. No way to:
- Share a URL that reproduces the current view
- Export the current view as an image
- Export underlying data as CSV for offline analysis

**Mitigation:** Persistence (URL state) is in the v0.1+ production-concerns list. Image export is a small addition. Data export is straightforward since the data model is already structured.

### G4. Discrete events are undersupported

Event glyphs exist but they're just markers. Real mission events have:
- Duration (some events aren't instants)
- Relationship to each other (cause → effect)
- Severity levels
- Categorization (command, fault, science, comm)

Currently we have three glyph types and a color per event. Good enough for v0.1; will feel thin at scale.

**Mitigation:** Post-v0.3. When PlanDev integration lands, events become richer objects with more to show; redesign event rendering then.

### G5. Discrete states conflated with rover modes

State overlay assumes one discrete state series (rover mode). Real vehicles have many concurrent state machines: drive mode, comm mode, science instrument state, fault state, etc. Currently Vector Channels can show only one at a time.

**Mitigation:** Minor extension. Multiple state overlays could be layered as thin bands near the primary channel, one per state machine, each using a different color family. Needs design thought to avoid cluttering.

### G6. No multi-resolution / zoom-adaptive rendering

At very low zoom, all 400 samples render at sub-pixel spacing. At very high zoom, individual samples are visible but the channels may converge into the primary channel. The current design doesn't adapt.

**Mitigation:** The decimation work already in the v0.x production-concerns list. Zoom-adaptive sample selection gives us LOD for free.

### G7. Alert-band width tuning against narrow primary widths

An earlier concern was that the v2.5 critical outline (2 px) could visually dominate a narrow primary fill when the width variable drove small widths. Partly addressed since: the alert band no longer strokes the primary's edges — it now sits *beyond* all channels with a configurable gap (`alertGapPx`, default 1.5 px) and scaled widths (`alertWidthScale`, default 1). The old "clamp outline width to ≤ main width − 1" fix is moot.

Residual concern: at very narrow primary widths *and* many channels, the alert band is far from the primary fill and a first-time viewer may not immediately associate the two. Worth a visual pass if operators report it.

**Mitigation:** No code change needed now. Revisit if UX feedback surfaces the disconnect.

### G8. No way to lock a comparison point

Hover shows one moment's values. There's no way to pin a reference point and hover to see deltas from it. In analysis workflows (especially anomaly investigation and plan-vs-actual), pin-and-compare is standard.

**Mitigation:** Candidate feature for v0.3. Ties naturally to the ghost-path work — same UI concept extended to pinning on the actual path.

### G9. Accessibility gaps

Listed in ROADMAP but worth re-emphasizing:
- Keyboard navigation along the path.
- Screen-reader descriptions of encoded channels.
- Color-blind safety across the ramp catalog. The perceptually-uniform sequential set (viridis, magma, inferno, cividis) is inherently safe. Terrain and grayscale need audit. The diverging and categorical families (coolwarm / rdylgn / spectral / prgn, bold5 / set1 / paired / moran) need full review since several were added without a color-blind pass.
- High-contrast mode for outdoor / field-ops displays.

**Mitigation:** Scheduled per ROADMAP. Should be addressed before declaring v1.0.

### G10. No notion of data provenance on a per-sample basis

Was this sample actually measured, interpolated, predicted, or simulated? In ops use, knowing data authority matters: a predicted trajectory looks nominally identical to a flown one unless we mark it visually.

**Mitigation:** Candidate encoding in deferred ideas (dashed segments for interpolated / predicted data). Probably worth elevating to first-class for the v0.3 ghost-path work since planned trajectories are predicted by definition.

## Summary: where to invest

From this analysis, the highest-leverage opportunities are:

| Opportunity | Current plan | Recommendation |
|---|---|---|
| Multi-variable spatial quick-look (A) | Core scope | **Keep as center of gravity.** This is our claim. |
| Spatial plan-vs-actual (B) | v0.3 | **Confirm v0.3 priority.** Single most distinctive feature. |
| Constraint violations spatially (C) | Implicit in v0.4 | **Make explicit.** First-class integration with PlanDev constraints via the alerts watchlist. |
| Multi-trajectory comparison (D) | Not planned | **Add as v0.5.** Fleet / heritage comparison is unaddressed. |
| Brushing + linking with MMGIS (E) | v0.4 wiring | **Elevate.** Core UX pattern, not just integration. |
| Uncertainty rendering (F) | Not planned | **Prototype post-v0.4.** Real gap across the field. |
| Shift-handover quick-look (G) | Not planned | **Add as v0.5 feature.** Low cost, high op-value. |
| MCP App distribution (I) | Not planned | **Parallel v0.4 target** alongside MMGIS plugin. Keep packaging decoupled now to preserve the option. |

The highest-leverage current-approach gaps to close:

| Gap | Mitigation | Priority |
|---|---|---|
| G3 export/share | URL state + image export | v0.2 |
| G8 pin-and-compare | Reference-point UI | v0.3 |
| G10 data authority encoding | Dashed segments for predicted | v0.3 (with ghost path) |
| G4 event richness | Rework when PlanDev lands | v0.4 |
| G2 small-multiples export | Derive from existing model | v0.5 |
| G9 accessibility | As listed in ROADMAP | before v1.0 |
| G7 alert-band proximity cue | Watch for UX feedback | as needed |
| G1, G5, G6 | Already planned or intentional | n/a |
