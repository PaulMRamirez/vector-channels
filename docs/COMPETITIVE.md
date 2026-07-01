# Competitive Landscape

What else exists, how it overlaps with Vector Channels, and why the gap Vector Channels fills is real. This document catalogs what exists. For the flip side — pain points in those tools that become opportunities for us, plus weaknesses in our own current approach — see `GAPS.md`.

## The gap, stated plainly

No tool in current use, commercial or open source, shows **multiple telemetry variables simultaneously along a single 2D trajectory** in a way that preserves spatial correspondence across variables while remaining readable at mission-ops scale. Every tool in the landscape either:

1. Shows one variable per trajectory (Strava StatMaps, deck.gl TripsLayer, Mapbox path layers).
2. Shows multiple variables in multiple disjoint views (Grafana dashboards, MMGIS + its time graphs, PlanDev profiles).
3. Requires 3D to layer variables as stacked bands or tubes (Tominski et al. 2012, Russig et al.).

Vector Channels does (1) for multiple variables in a single 2D view, with explicit spatial correspondence, staying out of 3D. That's the gap.

## Within the NASA AMMOS ecosystem

### MMGIS

Web-based mapping and spatial data infrastructure for planetary science operations. Built on Leaflet, also uses Three.js, OpenLayers, Mapbox, and Cesium for different layer types. Currently on v4.0.0 (March 2025).

**What it does:** Tile layers (raster and vector), vector overlays (WFS/GeoJSON), 3D globes, measure tools, drawing tools, layer configuration UIs, a time slider, a per-variable graph panel, photo/photosphere integration, isochrone analysis.

**What it does not do:** Show multiple telemetry variables simultaneously tied to a trajectory. A single vector layer can carry one styled attribute. Multi-variable spatial correlation requires either multiple stacked layers (visually confusing) or the external graph panel (which loses spatial correspondence).

**How Vector Channels relates:** Vector Channels is intended to deploy as an MMGIS plugin at `/src/essence/*Plugin-Tools*/VectorChannels`. It adds multi-variable spatial capability alongside MMGIS's existing single-variable layers. MMGIS continues to handle base maps, time sliders, and per-variable graphs; Vector Channels handles spatial multivariate correlation; deep links connect the two.

### PlanDev (formerly Aerie)

Open-source planning, scheduling, and sequencing software. Java backend (Hasura + PostgreSQL), Svelte-based UI. Used on Europa Clipper and other flagship missions.

**What it does:** Mission activity modeling, plan authoring, discrete-event simulation, constraint checking, scheduling, profile visualization (time-aligned traces of modeled variables), activity editor, plan comparison.

**What it does not do:** Spatial context. PlanDev is entirely temporal. A plan is a set of activities arranged on timelines with constraints; there's no map component.

**How Vector Channels relates:** Vector Channels consumes PlanDev's profiles and activities (via the GraphQL API) and gives them spatial context. A planned traverse becomes a ghost path in Vector Channels (v0.3); a scheduled activity becomes an activity highlight; a simulated profile becomes a rail. Deep links from Vector Channels back into PlanDev let users jump to the authoring tool when they need temporal detail.

*Name history: Aerie was renamed to PlanDev in 2024 (the sequencing half split off as SeqDev). Repository names still use the old "aerie" convention at `github.com/NASA-AMMOS/aerie-ui` and `aerie-mission-model-template`, but product naming has moved on. Vector Channels docs use "PlanDev" consistently.*

### OpenMCT

NASA's mission control framework. Widget-based dashboards for telemetry.

**What it does:** Tree-navigated telemetry, time-series plots, tables, gauges, layout composition.

**What it does not do:** Spatial views. OpenMCT is dashboard-first, not map-first.

**How Vector Channels relates:** Complementary, not overlapping. An ops user might have an OpenMCT dashboard for real-time telemetry and Vector Channels for spatial-context analysis of past traverses.

### Yamcs

Open-source mission control system. Handles telemetry ingestion, command dispatch, archive storage.

**What it does:** Telemetry/command backend with a web client (Yamcs Web) offering events, parameters, commands, archive views.

**What it does not do:** Multi-variable trajectory visualization. The web client has timelines and plots but not spatial trajectories.

**How Vector Channels relates:** Vector Channels could consume Yamcs archive data via its REST/WebSocket API (future v0.4+ integration). Yamcs fills the live telemetry role; Vector Channels visualizes the trajectory + variables.

## Academic precedents

Relevant prior work that informed Vector Channels's design.

### Minard, 1869 — Napoleon's Russia campaign

The canonical example of width + color on a trajectory. Width encodes army size; direction and color encode advance vs. retreat; temperature is a companion line graph below. A single visual tying geography, time, and attribute together.

**What Vector Channels keeps:** Dual encoding on the primary channel (color + width). The idea that two orthogonal visual channels on the same path can carry meaningfully different information.

**What Vector Channels adds:** N additional channels for additional variables, an explicit interaction model for modern telemetry (hover, limit status), and a data model that scales beyond a single wartime narrative.

### Tominski et al. 2012 — Stacking-Based Visualization of Trajectory Attribute Data

IEEE TVCG paper. Stacked 3D bands above a 2D trajectory on a map, each band encoding a different attribute. Closest academic precedent to Vector Channels.

**What it does well:** Multiple attributes, preserved spatial correspondence.

**What limits it:** 3D. Requires depth perception, occlusion handling, and camera controls. Hard to embed in a standard web-based GIS context. Hard to read at-a-glance for operational tasks where users scan many trajectories quickly.

**What Vector Channels does differently:** Stays strictly 2D. Offsets in screen space instead of stacking in world space. The trade-off: fewer simultaneous variables before visual clutter, but works in any 2D map context including MMGIS.

### Russig et al. — On-Tube Attribute Visualization

3D tubes with width + color encoding two attributes on the same trajectory. Inverse width used for alert indication.

**What Vector Channels borrows:** The dual-encoding idea on the main "tube" (primary channel in Vector Channels). The specific inverse-width-for-alert pattern.

**What Vector Channels does differently:** 2D track instead of 3D tube. Limit status carried by outline instead of width (width is used for quality/companion variable separately).

### Lange et al. — Trajectory Mapper

Three-way texturing of a trajectory surface to carry three attributes on one ribbon.

**What it does well:** Three attributes on one band, 2D-ish.

**What limits it:** Texturing is dense and visually ambiguous — users reported needing legends to decode. Vector Channels's bucketed color ramps are more learnable because they use canonical color-value mappings.

## Modern commercial / open-source tools

### deck.gl TripsLayer

visgl's WebGL-based trajectory animation layer. Single-variable color, animated path with trailing fade.

**What it does:** Animated paths, GPU-accelerated, scales to millions of points.

**What it does not do:** Multi-variable encoding. Single color per path. Multi-variable requires multiple TripsLayer instances stacked, which loses spatial correspondence.

**Why not use deck.gl instead:** Vector Channels's design specifically avoids WebGL complexity because (a) MMGIS uses Leaflet not deck.gl, (b) the visual demands don't require GPU rendering at the current scale, (c) 2D Canvas gives us DPR handling and DOM integration for free.

### kepler.gl

Uber's geospatial analysis tool, built on deck.gl. Rich dataset exploration, many layer types, time playback.

**What it does:** Heatmaps, hexbins, arcs, trips, 3D extrusions, point-in-time filtering.

**What it does not do:** The specific multi-variable-on-single-trajectory pattern.

**How it informs Vector Channels:** kepler.gl's approach to filter controls and layer configuration influenced the sidebar design (dropdowns per role, live preview, minimal modal interruption).

### Strava StatMaps

Consumer fitness: an activity's GPS trace colored by one of {pace, heart rate, elevation, gradient, temperature, power}.

**What it does:** Single-variable color gradient on a 2D path, legible, production-quality.

**What it does not do:** Multi-variable. Strava explicitly punted on this — users pick one variable at a time.

**What this tells us:** The "single variable at a time" constraint is an explicit design choice, not a capability limit. Consumer products optimize for scan-ability; multi-variable visualizations require more skill to read. Vector Channels targets mission ops users who have that skill — but the lesson is real: every channel beyond the first costs visual attention. Hence the design decision to make channels optional, reorderable, and capped by natural visual limits rather than hard caps.

### Mapbox / ArcGIS / Cesium

Base maps and rendering platforms, not multi-variable trajectory tools. Any of them could host a Vector Channels-like overlay, but none ships one out of the box.

## Adjacent categories (not direct competitors)

- **Grafana / Kibana.** Time-series dashboards. Not spatial. Complementary for live telemetry monitoring.
- **QGIS Temporal Controller.** Time-enabled GIS layers. Can show a trajectory at a moment or animate it, but doesn't do multi-variable encoding per se.
- **Observable Plot / Vega-Lite.** General-purpose grammars of graphics. Could technically render a Vector Channels-like view with enough custom encoding; nobody has built one because the target users aren't in these ecosystems.
- **Tableau / Power BI.** BI dashboarding. Map layers exist but are single-variable. Not ops-focused.
- **CAMP (Mars 2020 mission ops tool).** Mission-specific rover planning tool. Closed ecosystem. Referenced in MMGIS papers as a predecessor influence. Not a general-purpose option.

## Why the gap exists

Three reasons multi-variable spatial trajectory visualization isn't a solved problem despite the obvious utility:

1. **Single-variable bias in consumer tools.** Strava, Garmin, Wahoo, and other fitness/fleet products optimize for legibility at a glance. Adding a second variable complicates the interaction enough that they punt.

2. **3D escape in academic tools.** Stacking, tubes, textured surfaces — all 3D solutions to the multi-variable problem. Academically interesting, operationally impractical for at-a-glance use.

3. **Temporal/spatial split in ops tools.** Ops tooling has historically separated "where" (maps) from "when" (timelines), with different teams owning each. Multi-variable-spatial falls in the gap between those teams.

Vector Channels is a 2D tool built for ops users who need both. It deliberately does not try to be everything — it hands off to MMGIS and PlanDev when those tools are the right answer — but it owns the specific spatial-multivariate-correlation job that neither of them does well.
