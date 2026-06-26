import type { CaptureSummary, FarmSummary, FieldSummary, ZoneSummary } from "../../../lib/api";
import type {
  ActivityPin,
  FarmMarker,
  FieldFeatureCollection,
  ZoneFeatureCollection
} from "./OverviewMapContent";

// A calm, distinguishable palette assigned to farms in list order so each farm's
// fields + marker share one color on the map.
const FARM_COLORS = [
  "#5a7d3a", // green
  "#2f6f8f", // blue
  "#b26b2c", // amber
  "#6b5b95", // purple
  "#3f7d6e", // teal
  "#8a8f3a", // olive
  "#9a4f4f", // brick
  "#4f6d9a" // slate-blue
];
const DEFAULT_FARM_COLOR = FARM_COLORS[0];

// A field's map point: its centroid, else the center of its boundary box.
function fieldCenter(field: FieldSummary): { lng: number; lat: number } | null {
  if (field.centroid) {
    return { lng: field.centroid.coordinates[0], lat: field.centroid.coordinates[1] };
  }
  const ring = field.boundary?.coordinates?.[0];
  if (!ring || ring.length < 4) return null;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
}

export type FieldMapData = {
  fieldCollection: FieldFeatureCollection;
  zoneCollection: ZoneFeatureCollection;
  farmMarkers: FarmMarker[];
  farmOptions: { id: string; name: string }[];
  activityPins: ActivityPin[];
  acres: number;
};

// Shared shaping of the field-map inputs for the Overview card + the /map page:
// per-farm colors, the field + zone FeatureCollections, farm markers, the
// dropdown options, and Activity pins (recent-capture counts at field centroids).
export function buildFieldMapData(
  fields: FieldSummary[],
  farms: FarmSummary[],
  captures: CaptureSummary[],
  zones: ZoneSummary[] = []
): FieldMapData {
  const farmColor: Record<string, string> = {};
  farms.forEach((farm, i) => {
    farmColor[farm.id] = FARM_COLORS[i % FARM_COLORS.length];
  });

  const fieldCollection: FieldFeatureCollection = {
    type: "FeatureCollection",
    features: fields
      .filter((f) => f.boundary)
      .map((f) => ({
        type: "Feature",
        properties: {
          id: f.id,
          name: f.name,
          farmId: f.farmId,
          color: farmColor[f.farmId] ?? DEFAULT_FARM_COLOR
        },
        geometry: f.boundary!
      }))
  };

  // Zones carry their parent field's farmId so the per-farm filter reaches them.
  const fieldFarm = new Map(fields.map((f) => [f.id, f.farmId]));
  const zoneCollection: ZoneFeatureCollection = {
    type: "FeatureCollection",
    features: zones
      .filter((z) => z.boundary)
      .map((z) => ({
        type: "Feature",
        properties: {
          id: z.id,
          name: z.name,
          fieldId: z.fieldId,
          farmId: fieldFarm.get(z.fieldId) ?? ""
        },
        geometry: z.boundary!
      }))
  };

  const farmMarkers: FarmMarker[] = farms
    .filter((farm) => farm.location)
    .map((farm) => ({
      id: farm.id,
      name: farm.name,
      longitude: farm.location!.coordinates[0],
      latitude: farm.location!.coordinates[1],
      color: farmColor[farm.id] ?? DEFAULT_FARM_COLOR
    }));

  const farmOptions = farms.map((farm) => ({ id: farm.id, name: farm.name }));

  // Activity: count captures per field, placed at the field's centroid.
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const counts = new Map<string, number>();
  for (const capture of captures) {
    if (!capture.fieldId) continue;
    counts.set(capture.fieldId, (counts.get(capture.fieldId) ?? 0) + 1);
  }
  const activityPins: ActivityPin[] = [];
  for (const [fieldId, count] of Array.from(counts.entries())) {
    const field = fieldById.get(fieldId);
    if (!field) continue;
    const center = fieldCenter(field);
    if (!center) continue;
    activityPins.push({
      id: fieldId,
      farmId: field.farmId,
      name: field.name,
      longitude: center.lng,
      latitude: center.lat,
      count
    });
  }

  const acres = Math.round(fields.reduce((sum, f) => sum + (f.areaAcres ?? 0), 0));

  return { fieldCollection, zoneCollection, farmMarkers, farmOptions, activityPins, acres };
}
