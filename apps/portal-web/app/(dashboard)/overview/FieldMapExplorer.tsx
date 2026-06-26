"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPanel, MapPinIcon, type MapLayerToggle, type MapViewMode } from "@gaia/ui";
import {
  ActivityMarkers,
  FarmMarkers,
  FieldPolygons,
  ZonePolygons,
  type ActivityPin,
  type FarmMarker,
  type FieldFeatureCollection,
  type ZoneFeatureCollection
} from "./OverviewMapContent";

type ViewMode = "map" | "satellite" | "ndvi" | "activity";

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "satellite", label: "Satellite" },
  { id: "ndvi", label: "NDVI" },
  { id: "activity", label: "Activity" }
];

// NDVI/Activity ride on the light basemap (NDVI imagery isn't wired up yet).
const BASEMAP: Record<ViewMode, string> = {
  map: "mapbox://styles/mapbox/light-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  ndvi: "mapbox://styles/mapbox/light-v11",
  activity: "mapbox://styles/mapbox/light-v11"
};

// Persisted view preferences (the user's basemap + per-layer choices survive
// reloads). v2 adds the Farms/Zones toggles alongside Fields; a missing key
// defaults the layer on, so upgrading from v1 simply starts with all layers shown.
const PREFS_KEY = "gaia.fieldmap.prefs.v2";
type Prefs = {
  viewMode: ViewMode;
  farmsVisible: boolean;
  fieldsVisible: boolean;
  zonesVisible: boolean;
};

function loadPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const viewMode = VIEW_MODES.some((m) => m.id === parsed.viewMode)
      ? (parsed.viewMode as ViewMode)
      : "map";
    return {
      viewMode,
      farmsVisible: parsed.farmsVisible !== false,
      fieldsVisible: parsed.fieldsVisible !== false,
      zonesVisible: parsed.zonesVisible !== false
    };
  } catch {
    return null;
  }
}

function fitBounds(
  fields: FieldFeatureCollection,
  markers: FarmMarker[]
): {
  longitude: number;
  latitude: number;
  zoom: number;
  bounds?: [[number, number], [number, number]];
  fitBoundsOptions?: { padding?: number; maxZoom?: number };
} {
  const fallback = { longitude: -95.57, latitude: 39.835, zoom: 3.6 };
  const points: Array<[number, number]> = [];
  for (const feature of fields.features) {
    for (const [lng, lat] of feature.geometry.coordinates[0]) points.push([lng, lat]);
  }
  for (const m of markers) points.push([m.longitude, m.latitude]);
  if (points.length === 0) return fallback;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return {
    longitude: (minLng + maxLng) / 2,
    latitude: (minLat + maxLat) / 2,
    zoom: 11.2,
    bounds: [
      [minLng, minLat],
      [maxLng, maxLat]
    ],
    fitBoundsOptions: { padding: 56, maxZoom: 14 }
  };
}

// The interactive field map: a basemap/view switcher (persisted), a per-farm
// filter dropdown, a Fields layer toggle, farm markers, and an Activity overlay
// of recent captures. Shared by the Overview card and the full-screen /map page.
export function FieldMapExplorer({
  fields,
  zones,
  farmMarkers,
  farmOptions,
  activityPins,
  acres,
  mapboxToken,
  openFullMapHref,
  fill
}: {
  fields: FieldFeatureCollection;
  zones: ZoneFeatureCollection;
  farmMarkers: FarmMarker[];
  farmOptions: { id: string; name: string }[];
  activityPins: ActivityPin[];
  acres: number;
  mapboxToken: string;
  openFullMapHref?: string;
  fill?: boolean;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [farmsVisible, setFarmsVisible] = useState(true);
  const [fieldsVisible, setFieldsVisible] = useState(true);
  const [zonesVisible, setZonesVisible] = useState(true);
  const [selectedFarmId, setSelectedFarmId] = useState<string>("all");

  // Restore persisted prefs after mount (avoids SSR/client hydration mismatch).
  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs) {
      setViewMode(prefs.viewMode);
      setFarmsVisible(prefs.farmsVisible);
      setFieldsVisible(prefs.fieldsVisible);
      setZonesVisible(prefs.zonesVisible);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ viewMode, farmsVisible, fieldsVisible, zonesVisible })
      );
    } catch {
      // Ignore storage failures (private mode, quota) — non-fatal.
    }
  }, [viewMode, farmsVisible, fieldsVisible, zonesVisible]);

  const filtered = useMemo<FieldFeatureCollection>(
    () =>
      selectedFarmId === "all"
        ? fields
        : {
            type: "FeatureCollection",
            features: fields.features.filter((f) => f.properties.farmId === selectedFarmId)
          },
    [fields, selectedFarmId]
  );
  const filteredZones = useMemo<ZoneFeatureCollection>(
    () =>
      selectedFarmId === "all"
        ? zones
        : {
            type: "FeatureCollection",
            features: zones.features.filter((z) => z.properties.farmId === selectedFarmId)
          },
    [zones, selectedFarmId]
  );
  const visibleMarkers = useMemo(
    () =>
      selectedFarmId === "all" ? farmMarkers : farmMarkers.filter((m) => m.id === selectedFarmId),
    [farmMarkers, selectedFarmId]
  );
  const visibleActivity = useMemo(
    () =>
      selectedFarmId === "all"
        ? activityPins
        : activityPins.filter((p) => p.farmId === selectedFarmId),
    [activityPins, selectedFarmId]
  );

  // Re-key on the farm filter so the map refits to the selection; basemap changes
  // swap in place (react-map-gl) without a refit, keeping the user's pan/zoom.
  const view = fitBounds(filtered, visibleMarkers);

  const viewModes: MapViewMode[] = VIEW_MODES.map((m) => ({
    id: m.id,
    label: m.label,
    active: m.id === viewMode
  }));
  const layers: MapLayerToggle[] = [
    { id: "farms", label: "Farms", active: farmsVisible, tone: "muted" },
    { id: "fields", label: "Fields", active: fieldsVisible, tone: "primary" },
    { id: "zones", label: "Zones", active: zonesVisible, tone: "accent" }
  ];
  const toggleLayer = (id: string) => {
    if (id === "farms") setFarmsVisible((v) => !v);
    else if (id === "fields") setFieldsVisible((v) => !v);
    else if (id === "zones") setZonesVisible((v) => !v);
  };
  const orgOptions = [{ id: "all", label: "All farms" }, ...farmOptions.map((f) => ({ id: f.id, label: f.name }))];
  const selectedLabel =
    selectedFarmId === "all"
      ? "All farms"
      : farmOptions.find((f) => f.id === selectedFarmId)?.name ?? "Farm";
  const meta =
    selectedFarmId === "all"
      ? `${farmOptions.length} ${farmOptions.length === 1 ? "farm" : "farms"} · ${acres.toLocaleString("en-US")} acres`
      : selectedLabel;

  return (
    <MapPanel
      key={selectedFarmId}
      header={{
        title: "Field map",
        meta,
        orgSelector: {
          label: selectedLabel,
          icon: <MapPinIcon />,
          options: orgOptions,
          activeId: selectedFarmId,
          onSelect: setSelectedFarmId
        },
        viewModes,
        onViewModeSelect: (id) => setViewMode(id as ViewMode),
        timeRange: { label: "Today" },
        openFullMapHref
      }}
      initialViewState={view}
      mapStyle={BASEMAP[viewMode]}
      layers={layers}
      onLayerToggle={toggleLayer}
      mapboxAccessToken={mapboxToken}
      enableFullscreen
      fill={fill}
    >
      {fieldsVisible ? <FieldPolygons fields={filtered} /> : null}
      {zonesVisible ? <ZonePolygons zones={filteredZones} /> : null}
      {farmsVisible ? <FarmMarkers farms={visibleMarkers} /> : null}
      {viewMode === "activity" ? <ActivityMarkers pins={visibleActivity} /> : null}
      {viewMode === "ndvi" ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-base-content/10 bg-base-100/90 px-4 py-2.5 text-center shadow-md">
          <p className="text-sm font-semibold text-neutral">NDVI imagery coming soon</p>
          <p className="text-xs text-base-content/60">Vegetation index layers aren&apos;t wired up yet.</p>
        </div>
      ) : null}
    </MapPanel>
  );
}
