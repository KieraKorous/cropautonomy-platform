import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Map, {
  Layer,
  Marker,
  Source,
  type LngLatBoundsLike
} from "react-map-gl/mapbox";

import { OverlayChrome } from "../components/OverlayChrome.js";
import { SurfaceSwitcher } from "../components/SurfaceSwitcher.js";
import { api, type FarmRecord, type FieldRecord } from "../lib/api.js";
import { env } from "../env.js";
import { useGps } from "../lib/hud-signals.js";
import { listPendingForUpload, type QueuedCaptureRecord } from "../lib/db.js";
import { useActiveSession } from "../lib/session.js";

// Map view — second primary surface alongside /capture. Shows the operator's
// farms (pins) and fields (boundary polygons colored per farm), a GPS dot for
// current position, and capture pins for anything in the local queue that has a
// location. Designed for in-field situational awareness ("where have I been,
// what have I shot, where are the field edges"), not for desk-style mission
// planning.

const FALLBACK_VIEW = { longitude: -95.57, latitude: 39.835, zoom: 9.5 } as const;

// A calm, distinguishable palette assigned to farms in list order so each farm's
// fields + marker share one color — mirrors the portal's Overview map so the two
// surfaces read the same. See apps/portal-web/.../fieldMapData.ts.
const FARM_COLORS = [
  "#9ec27e", // field green (the previous single-farm default)
  "#7fb0c9", // blue
  "#d19a5c", // amber
  "#a897c9", // purple
  "#77b3a4", // teal
  "#c1c46f", // olive
  "#cc8585", // brick
  "#8aa1c9" // slate-blue
] as const;
const DEFAULT_FARM_COLOR = FARM_COLORS[0];

export function MapPage() {
  const { session } = useActiveSession();
  const navigate = useNavigate();
  const location = useLocation();
  const gps = useGps(true);

  // Contextual back out of the map. Mirrors QueuePage's "Done". On a cold start
  // where the map is the entry route (deep link / PWA launch), `location.key`
  // is "default" and there's no in-app history to pop, so fall back to home
  // rather than escaping the app.
  const handleExit = () => {
    if (location.key === "default") navigate("/");
    else navigate(-1);
  };
  const [fields, setFields] = useState<FieldRecord[] | null>(null);
  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [queued, setQueued] = useState<QueuedCaptureRecord[]>([]);

  // Fetch farms + fields once on mount. Farms drive the per-farm coloring and
  // markers; a farms failure is non-fatal (the map still shows fields, just in
  // the default color), so it doesn't surface an error banner.
  useEffect(() => {
    let alive = true;
    api
      .listFields()
      .then((res) => alive && setFields(res.fields))
      .catch((err: unknown) => {
        if (!alive) return;
        setFieldsError(err instanceof Error ? err.message : "Failed to load fields.");
        setFields([]);
      });
    api
      .listFarms()
      .then((res) => alive && setFarms(res.farms))
      .catch(() => {
        /* non-fatal: fields fall back to the default color, no markers */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Refresh queue (drives pin layer) — same cadence as the queue page.
  useEffect(() => {
    let alive = true;
    async function refresh() {
      const records = await listPendingForUpload();
      if (alive) setQueued(records);
    }
    void refresh();
    const interval = setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  // farmId → color, assigned in farm list order so each farm's fields + marker
  // share one hue.
  const farmColor = useMemo(() => {
    const map: Record<string, string> = {};
    farms.forEach((farm, i) => {
      map[farm.id] = FARM_COLORS[i % FARM_COLORS.length];
    });
    return map;
  }, [farms]);

  const initialView = useMemo(() => {
    if (gps.status === "fix" && gps.position) {
      return {
        longitude: gps.position.coords.longitude,
        latitude: gps.position.coords.latitude,
        zoom: 14
      };
    }
    if (fields && fields.length > 0) {
      const centroid =
        fields.find((f) => f.centroid)?.centroid?.coordinates;
      if (centroid) {
        return { longitude: centroid[0], latitude: centroid[1], zoom: 12 };
      }
    }
    // No GPS fix and no field with a centroid — fall back to a pinned farm.
    const farm = farms.find((f) => f.location);
    if (farm?.location) {
      return { longitude: farm.location.coordinates[0], latitude: farm.location.coordinates[1], zoom: 11 };
    }
    return FALLBACK_VIEW;
  }, [gps.status, gps.position, fields, farms]);

  const fieldsFeatureCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: (fields ?? [])
        .filter((f) => f.boundary)
        .map((f) => ({
          type: "Feature" as const,
          properties: {
            id: f.id,
            name: f.name,
            areaAcres: f.areaAcres,
            color: farmColor[f.farmId] ?? DEFAULT_FARM_COLOR
          },
          geometry: f.boundary!
        }))
    }),
    [fields, farmColor]
  );

  if (!env.mapboxToken) {
    return (
      <div className="relative h-full bg-base-200">
        <OverlayChrome
          variant="light"
          queueCount={queued.length}
          sessionStatus={session?.status ?? "off"}
        />
        <div className="grid h-full place-items-center px-6 text-center">
          <div className="max-w-md">
            <p className="text-xs uppercase tracking-wider text-warning">
              Map needs setup
            </p>
            <h1 className="mt-1 text-xl font-semibold text-neutral">
              Mapbox token not configured
            </h1>
            <p className="mt-2 text-sm text-base-content/65">
              Set <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">VITE_MAPBOX_TOKEN</code> in{" "}
              <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">apps/field-web/.env.local</code>{" "}
              and restart the dev server. The rest of the field PWA works without it; only the map view needs it.
            </p>
          </div>
        </div>
        <ExitPill variant="light" onExit={handleExit} />
        <SurfaceSwitcher variant="light" />
      </div>
    );
  }

  return (
    <div className="relative h-full bg-black">
      <Map
        initialViewState={initialView}
        mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
        mapboxAccessToken={env.mapboxToken}
        style={{ position: "absolute", inset: 0 }}
        attributionControl={false}
      >
        {/* Field boundaries — translucent fill + visible stroke, colored per
            farm, with a name label at each box's centroid */}
        {fieldsFeatureCollection.features.length > 0 && (
          <Source id="fields" type="geojson" data={fieldsFeatureCollection}>
            <Layer
              id="fields-fill"
              type="fill"
              paint={{
                "fill-color": ["get", "color"],
                "fill-opacity": 0.18
              }}
            />
            <Layer
              id="fields-stroke"
              type="line"
              paint={{
                "line-color": ["get", "color"],
                "line-width": 2,
                "line-opacity": 0.9
              }}
            />
            <Layer
              id="fields-label"
              type="symbol"
              layout={{
                "text-field": ["get", "name"],
                "text-size": 11,
                "text-anchor": "center"
              }}
              paint={{
                "text-color": "#f5f7f0",
                "text-halo-color": "#1a1a1a",
                "text-halo-width": 1.3
              }}
            />
          </Source>
        )}

        {/* Farm pins — a dot in the farm's color, labeled with the farm name */}
        {farms
          .filter((f) => f.location)
          .map((farm) => (
            <Marker
              key={farm.id}
              longitude={farm.location!.coordinates[0]}
              latitude={farm.location!.coordinates[1]}
              anchor="bottom"
            >
              <div className="flex flex-col items-center gap-0.5">
                <span className="whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
                  {farm.name}
                </span>
                <span
                  className="block h-3.5 w-3.5 rounded-full border-2 border-white shadow"
                  style={{ backgroundColor: farmColor[farm.id] ?? DEFAULT_FARM_COLOR }}
                  aria-label={`Farm ${farm.name}`}
                />
              </div>
            </Marker>
          ))}

        {/* Capture pins — small dots for queued/uploading captures */}
        {queued
          .filter((c) => c.location)
          .map((capture) => (
            <Marker
              key={capture.id}
              longitude={capture.location!.lng}
              latitude={capture.location!.lat}
              anchor="center"
            >
              <span
                className="block h-3 w-3 rounded-full border-2 border-white bg-accent shadow"
                aria-label={`Capture at ${capture.capturedAt}`}
              />
            </Marker>
          ))}

        {/* Operator GPS dot */}
        {gps.status === "fix" && gps.position && (
          <Marker
            longitude={gps.position.coords.longitude}
            latitude={gps.position.coords.latitude}
            anchor="center"
          >
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute h-8 w-8 animate-ping rounded-full bg-primary/30" />
              <span className="block h-4 w-4 rounded-full border-2 border-white bg-primary shadow" />
            </span>
          </Marker>
        )}
      </Map>

      <OverlayChrome
        variant="dark"
        queueCount={queued.length}
        sessionStatus={session?.status ?? "off"}
      />
      <ExitPill variant="dark" onExit={handleExit} />
      <SurfaceSwitcher variant="dark" />

      {fieldsError && (
        <div className="safe-bottom pointer-events-none fixed bottom-20 left-1/2 z-30 -translate-x-1/2 px-3">
          <span className="pointer-events-auto rounded-md bg-error/85 px-3 py-1.5 text-xs font-medium text-error-content shadow">
            {fieldsError}
          </span>
        </div>
      )}
    </div>
  );
}

// Bottom-left exit out of the map, level with the centered SurfaceSwitcher.
// The map is a full-bleed surface with no dock, so without this the only way
// off it is the Camera toggle — which, with no active session, flashes the
// camera before bouncing home. Two surface variants mirror SurfaceSwitcher so
// it reads correctly over both the satellite map (dark) and the token-missing
// screen (light).
function ExitPill({
  variant,
  onExit
}: {
  variant: "dark" | "light";
  onExit: () => void;
}) {
  const surface =
    variant === "dark"
      ? "bg-black/45 text-white backdrop-blur-md"
      : "bg-base-100/90 text-neutral backdrop-blur border border-base-content/10";

  return (
    <div className="safe-bottom pointer-events-none fixed bottom-0 left-0 z-30 px-4 pb-6 mb-4">
      <button
        type="button"
        onClick={onExit}
        aria-label="Back"
        className={`pointer-events-auto flex h-14 items-center gap-2 rounded-full px-5 text-sm font-semibold ${surface}`}
      >
        <ChevronLeftIcon />
        <span>Back</span>
      </button>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
