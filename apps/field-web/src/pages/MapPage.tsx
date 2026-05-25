import { useEffect, useMemo, useState } from "react";
import Map, {
  Layer,
  Marker,
  Source,
  type LngLatBoundsLike
} from "react-map-gl/mapbox";

import { OverlayChrome } from "../components/OverlayChrome.js";
import { SurfaceSwitcher } from "../components/SurfaceSwitcher.js";
import { api, type FieldRecord } from "../lib/api.js";
import { env } from "../env.js";
import { useGps } from "../lib/hud-signals.js";
import { listPendingForUpload, type QueuedCaptureRecord } from "../lib/db.js";
import { useActiveSession } from "../lib/session.js";

// Map view — second primary surface alongside /capture. Shows the operator's
// fields (boundary polygons), GPS dot for current position, and capture pins
// for anything in the local queue that has a location. Designed for in-field
// situational awareness ("where have I been, what have I shot, where are the
// field edges"), not for desk-style mission planning.

const FALLBACK_VIEW = { longitude: -95.57, latitude: 39.835, zoom: 9.5 } as const;

export function MapPage() {
  const { session } = useActiveSession();
  const gps = useGps(true);
  const [fields, setFields] = useState<FieldRecord[] | null>(null);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [queued, setQueued] = useState<QueuedCaptureRecord[]>([]);

  // Fetch fields once on mount.
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
    return FALLBACK_VIEW;
  }, [gps.status, gps.position, fields]);

  const fieldsFeatureCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: (fields ?? [])
        .filter((f) => f.boundary)
        .map((f) => ({
          type: "Feature" as const,
          properties: { id: f.id, name: f.name, areaAcres: f.areaAcres },
          geometry: f.boundary!
        }))
    }),
    [fields]
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
        {/* Field boundaries — translucent fill + visible stroke */}
        {fieldsFeatureCollection.features.length > 0 && (
          <Source id="fields" type="geojson" data={fieldsFeatureCollection}>
            <Layer
              id="fields-fill"
              type="fill"
              paint={{
                "fill-color": "#9ec27e",
                "fill-opacity": 0.18
              }}
            />
            <Layer
              id="fields-stroke"
              type="line"
              paint={{
                "line-color": "#9ec27e",
                "line-width": 2,
                "line-opacity": 0.9
              }}
            />
          </Source>
        )}

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
