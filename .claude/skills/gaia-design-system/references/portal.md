# Portal patterns

This reference covers the authenticated CropAutonomy portal — dashboards, in-product chrome, data-dense surfaces, maps. The patterns here extend the landing register: same `gaia-field` palette, same canonical text scale, same calm/human posture. The user's standing rule is that portal surfaces must read as an extension of the landing pages, not as a switch into "mission-control HUD" territory. If you find yourself reaching for dark surfaces everywhere, mono telemetry chips, or instrument-cluster overlays — stop and re-read the editorial-styling rule in [SKILL.md](../SKILL.md).

The portal lives in `apps/portal-web` (port 3002), separate from the marketing apps per the repo conventions in `CLAUDE.md`. Auth is Clerk (when wired); chrome and pages compose from `@gaia/ui` like the landing pages do.

## Dashboard register cheat sheet

Density steps DOWN from landing — dashboards carry more information per screen.

| Element | Landing | Portal |
|---|---|---|
| Page heading | `text-5xl` / `text-6xl` | `text-2xl` |
| Section heading | `text-3xl` / `text-4xl` | `text-base font-semibold` |
| Body | `text-lg` | `text-sm` |
| Caption / meta | `text-sm` | `text-xs` |
| Section padding | `py-20 lg:py-24` | `py-8` or just card padding |
| Surface | `bg-base-100` | `bg-base-100` with `bg-base-200/60` sidebar |

Color discipline stays the same:

- `primary` (moss) — active nav, primary CTAs, link accents
- `accent` (copper) — **sparing** attention markers only (3 max per screen). Use it for items that genuinely need user action: watchlist field borders, "Needs review" pills, attention badges
- `secondary` (slate) — supporting status pills (Planned, Action queued)
- `success` / `warning` / `error` — semantic state pills only
- `text-leaf-soft` / `bg-leaf-soft` — soft green accents on dark surfaces
- `bg-shell-deep` — the deepest dark (footer, hero overlays on landing — rarely needed in portal)

## Four primitives the portal needs that landing doesn't

These should graduate to `@gaia/ui` as they're built. Compose from them — don't reinvent.

### 1. AppShell

```
<AppShell>
  <AppShell.TopBar brand="cropautonomy" org={...} user={...} />
  <AppShell.Sidebar nav={navConfig} />
  <AppShell.Main>{children}</AppShell.Main>
</AppShell>
```

- TopBar: brand wordmark, org switcher (KF chip + name + dropdown), search field with ⌘K hint, notifications icon (copper dot when unread), user pill (initials avatar + name)
- Sidebar: 240px wide, `bg-base-200/60` ground (warm cream, not dark), grouped nav items with optional badge slot (count, copper pill), pinned status block at the bottom (e.g., "Fleet operational" with green pulse)
- Main: flex-1, `bg-base-100`, `px-10 py-8`

### 2. StatCard

```
<StatCard
  label="Scans this week"
  value="1,247"
  delta="+18%"
  deltaTone="success"
  meta="vs 1,053 last week"
  icon={<CameraIcon />}
  tone="default"  // or "accent" to attract attention
/>
```

- Default tone: `border-base-content/10`
- Accent tone: `border-accent/35` — the visual cue that this card is the user's most important number right now. **One accent card per row maximum**.

### 3. DataTable / DataRow

A labeled column header strip + structured rows with consistent vertical lanes. Each row carries an optional leading icon-cell (accent-tinted when the row needs attention, calm otherwise), then content cells, then a trailing status/value cell.

```
<DataTable columns={[{ key: "scan", label: "Scan", width: 200 }, ...]}>
  {scans.map(scan => (
    <DataRow key={scan.id} icon={...} tone={scan.tone}>
      <DataRow.Cell title="Tar spot signature" subtitle="2 hours ago · 38 acres" />
      <DataRow.Cell title="Doniphan F-22" subtitle="Doniphan Bottoms" />
      ...
      <StatusPill label="Needs review" tone="accent" />
      <DataRow.Value>0.92</DataRow.Value>
    </DataRow>
  ))}
</DataTable>
```

Use the existing `StatusPill` from `@gaia/ui/atoms` for the status cell — same tone vocabulary as `RoadmapList`.

### 4. MapPanel

The most distinctive portal pattern. Wraps a real interactive map (Mapbox GL JS via `react-map-gl`) in a card shell consistent with the rest of the dashboard chrome.

```
<MapPanel
  title="Field map"
  meta="Seven farms · 12,840 acres · updated 18 sec ago"
  orgFilter={...}
  viewModes={["Satellite", "NDVI", "Activity"]}
  layers={layerConfig}
  livenessIndicator={{ devices: 5, scansThisHour: 3 }}
>
  <MapPanel.Map
    style={GAIA_FIELD_MAP_STYLE}
    initialViewState={{ longitude: -95.57, latitude: 39.82, zoom: 12 }}
  >
    <FieldsLayer features={fieldsGeoJSON} />
    <WatchlistLayer features={watchlistGeoJSON} />
    <DevicePinsLayer devices={devices} />
  </MapPanel.Map>
</MapPanel>
```

Shell parts:
- Header bar: title + meta + farm selector + view-mode toggle + time selector + "Open full map →"
- Layer strip: chip toggles for `Fields` / `Devices` / `Watchlist · N` / `Scans` / `Routes` + a live-activity readout on the right
- Map body: the actual map surface
- Floating controls (right edge of body): zoom +/-, recenter, layers, draw — clean cream pills with subtle shadow
- Footer overlay (inside body, bottom): scale bar + coordinates + zoom level

## Map provider decision: Mapbox GL JS via react-map-gl

We are standardizing on **Mapbox GL JS** through `react-map-gl` for all interactive map surfaces in CropAutonomy. The decision is committed — don't reintroduce alternatives as fallbacks.

### Why Mapbox

- **Industry standard for agtech.** Climate FieldView, John Deere Operations Center, and Granular all run on Mapbox precisely because the polygon-and-overlay workload that farm software produces is exactly what vector tiles handle well.
- **Custom basemap styling.** Mapbox Studio lets us author a `gaia-field` basemap that pulls our palette directly — moss fills, cream water/roads, ink labels — so the map reads as part of CropAutonomy and not as a third-party widget bolted on.
- **Polygon/GeoJSON ergonomics.** Field boundaries, scan footprints, route paths, NDVI heatmaps all compose cleanly as Mapbox sources + layers with full styling control.
- **Pricing fits early access.** 50,000 map loads/month free. Above that, ~$0.50/1,000 loads. Affordable through the August 2026 prototype window.

### Token handling

`NEXT_PUBLIC_MAPBOX_TOKEN` is **required** in any app that renders a map surface. `MapPanel` throws at render time if it's empty, on purpose — silent fallbacks to a different provider would create two code paths to maintain and would drift away from the chosen visual register.

For local development, get a token from `https://account.mapbox.com/access-tokens/` and put it in `.env.local`. CI and Vercel/hosting envs need it set too — failure to render a map is preferable to rendering something off-brand.

### Why not Google Maps or MapLibre

- **Google Maps**: limited custom styling (always reads as Google Maps), clunkier polygon overlays, higher per-load cost, basemap reads as a third-party surface rather than part of CropAutonomy.
- **MapLibre GL**: same API as Mapbox, but the visual ecosystem (Studio, ready-made styles tuned for our palette) lives on the Mapbox side. We considered MapLibre as a token-free path and decided against it — committing to Mapbox keeps the basemap-styling pipeline single-source.

Only revisit either if there's an external constraint forcing it (Mapbox pricing breaks, license change, etc.).

## Basemap style

The long-term goal is a custom `gaia-field` basemap authored in Mapbox Studio that pulls our palette:

- Land / cropland: warm earth tones derived from `base-200` (#e8e2d4) and `base-300` (#d3c8b4)
- Water: cool variant of `base-100` (e.g., `#e8eef0`)
- Roads: thin lines in `base-content/30`
- Labels: `base-content` for primary, `base-content/65` for secondary
- Land cover (forest, urban): muted variants — no high-chroma colors

Until that Studio style ships, `MapPanel` defaults to `mapbox://styles/mapbox/light-v11` — calm enough to live with, and a one-line swap when the custom style URL is available. Document the Studio style URL (and any versioning) here alongside the change.

## Building the dashboard

Sequence:

1. **AppShell first.** Mount `<AppShell>` in `app/layout.tsx` with the brand + org + user + nav config. Pages render inside `AppShell.Main`.
2. **Compose the page in sections.** Page header (greeting + meta + primary action) → StatCard row → MapPanel → two-column split (DataTable left, attention/conditions/devices cards right) → scout list. Match the layout in the Paper artboard `CropAutonomy — Dashboard (system-aligned)`.
3. **Fixtures over fake APIs at v0.** Hard-code the data in `lib/fixtures.ts` to match the Paper design exactly. When real data exists, replace the fixture imports with server-side fetches.
4. **Mapbox token via env var.** `.env.example` lists `NEXT_PUBLIC_MAPBOX_TOKEN=` empty. It's required at runtime — `MapPanel` throws if it's missing. No silent fallback, no alternative provider — Mapbox is the standard.
5. **Skip auth at v0.** The portal page renders without Clerk in scaffolding mode. Wiring Clerk is a separate task — when it lands, mount `<ClerkProvider>` in the layout and gate the page on session.

## Open questions for when the portal grows

- **Real-time updates.** Device positions and scan status will need to push to the client. Supabase Realtime is the obvious fit (the rest of the data layer is there); start with polling and migrate when latency matters.
- **Map performance with many polygons.** At ~10 farms × ~30 fields, the polygon set is small enough to load all at once. At thousands of fields per org, switch to vector tiles served from your own tile endpoint (PostGIS → pg_tileserv or Martin).
- **Mobile portal.** The dashboard above is desktop-first. A mobile portal is its own design exercise — probably a different navigation pattern (bottom tabs?) and stacked cards. Build when there's actual mobile usage to design against.
