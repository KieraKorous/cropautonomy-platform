"use client";

import { useEffect, useState } from "react";
import type { MarkerDragEvent } from "react-map-gl/mapbox";
import type {
  FillLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification
} from "mapbox-gl";
import { Layer, MapPanel, Marker, Source } from "@gaia/ui";
import {
  acresFromDimensions,
  boxCorners,
  boxPolygon,
  resizeFromCorner,
  type Coords,
  type GeoJsonPolygon
} from "./fieldGeometry";
import { Field, inputClass } from "./formControls";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
// Starter box dropped when the operator clicks the map before typing dimensions.
const DEFAULT_DIM_FT = 660;

// Box tones: the primary green for a field, a warmer accent for a zone, so a zone
// reads as distinct from its (gray, context) parent field.
const TONES = {
  field: { fill: "#7c9e54", stroke: "#5a7d3a", handle: "bg-primary border-primary" },
  zone: { fill: "#b26b2c", stroke: "#8a4f1d", handle: "bg-accent border-accent" }
} as const;

// Muted styling for context features (the farm's other fields, or a zone's parent
// field) so the operator can place/resize without overlapping them.
const contextFillPaint: FillLayerSpecification["paint"] = {
  "fill-color": "#6b7280",
  "fill-opacity": 0.1
};
const contextStrokePaint: LineLayerSpecification["paint"] = {
  "line-color": "#6b7280",
  "line-width": 1.5,
  "line-opacity": 0.65,
  "line-dasharray": [2, 1]
};
const contextLabelLayout: SymbolLayerSpecification["layout"] = {
  "text-field": ["get", "name"],
  "text-size": 11,
  "text-anchor": "center"
};
const contextLabelPaint: SymbolLayerSpecification["paint"] = {
  "text-color": "#4b5563",
  "text-halo-color": "#ffffff",
  "text-halo-width": 1.2
};

export type BoxValue = { lengthFt: string; widthFt: string; center: Coords | null };
export type ContextFeature = { name: string; boundary: GeoJsonPolygon };

// A positive number from a dimension input, or null when blank/invalid.
function parseDim(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Build a GeoJSON polygon from a box value, or null when it isn't fully placed.
export function boxValueToPolygon(value: BoxValue): GeoJsonPolygon | null {
  const length = parseDim(value.lengthFt);
  const width = parseDim(value.widthFt);
  if (value.center == null || length == null || width == null) return null;
  return boxPolygon(value.center, length, width);
}

export function boxValueAcres(value: BoxValue): number | null {
  const length = parseDim(value.lengthFt);
  const width = parseDim(value.widthFt);
  return length != null && width != null ? acresFromDimensions(length, width) : null;
}

// A controlled length × width box editor: Size inputs + a Mapbox box the operator
// drags to move / drags a corner to resize. The parent owns the BoxValue (so it
// can persist it); `onChange` reports edits with a `kind` so the caller can tell a
// position change (click/drag) from a dimension edit. Reused by the field modal
// and the zones modal.
export function BoundaryBoxEditor({
  value,
  onChange,
  contextFeatures,
  initialView,
  mapKey,
  flyTo,
  label = "Boundary",
  tone = "field",
  height = 260
}: {
  value: BoxValue;
  onChange: (next: BoxValue, kind: "dimensions" | "position") => void;
  contextFeatures: ContextFeature[];
  initialView: { longitude: number; latitude: number; zoom: number };
  mapKey: string;
  flyTo?: { lng: number; lat: number; zoom?: number } | null;
  label?: string;
  tone?: keyof typeof TONES;
  height?: number;
}) {
  // Map fly-in: driven both by the parent (flyTo prop, e.g. auto-placement) and by
  // the editor itself (first click-to-place from a far-out view).
  const [recenterTo, setRecenterTo] = useState<{ lng: number; lat: number; zoom?: number } | null>(
    null
  );
  useEffect(() => {
    if (flyTo) setRecenterTo(flyTo);
  }, [flyTo]);

  const length = parseDim(value.lengthFt);
  const width = parseDim(value.widthFt);
  const { center } = value;
  const hasBox = center != null && length != null && width != null;
  const corners = hasBox ? boxCorners(center, length, width) : null;
  const acres = length != null && width != null ? acresFromDimensions(length, width) : null;
  const palette = TONES[tone];

  const fillPaint = { "fill-color": palette.fill, "fill-opacity": 0.22 } as const;
  const strokePaint = {
    "line-color": palette.stroke,
    "line-width": 2,
    "line-opacity": 0.9
  } as const;

  function setDimensions(next: Partial<Pick<BoxValue, "lengthFt" | "widthFt">>) {
    onChange({ ...value, ...next }, "dimensions");
  }

  // Click the map to place / move the box, seeding default dimensions if none yet.
  function placeBox(at: Coords) {
    if (center == null) setRecenterTo({ lng: at.lng, lat: at.lat, zoom: 14 });
    onChange(
      {
        lengthFt: length == null ? String(DEFAULT_DIM_FT) : value.lengthFt,
        widthFt: width == null ? String(DEFAULT_DIM_FT) : value.widthFt,
        center: at
      },
      "position"
    );
  }

  function onCornerDrag(index: number, lngLat: { lng: number; lat: number }) {
    if (!corners) return;
    const opp = corners[(index + 2) % 4];
    const next = resizeFromCorner(
      { lat: lngLat.lat, lng: lngLat.lng },
      { lat: opp[1], lng: opp[0] }
    );
    onChange(
      {
        lengthFt: String(Math.round(next.lengthFt)),
        widthFt: String(Math.round(next.widthFt)),
        center: next.center
      },
      "position"
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-base-content/45">
          Size
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Length (ft)">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={value.lengthFt}
              onChange={(e) => setDimensions({ lengthFt: e.target.value })}
              placeholder="e.g. 1320"
              className={inputClass}
            />
          </Field>
          <Field label="Width (ft)">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={value.widthFt}
              onChange={(e) => setDimensions({ widthFt: e.target.value })}
              placeholder="e.g. 1320"
              className={inputClass}
            />
          </Field>
        </div>
        <p className="text-xs text-base-content/55">
          {acres != null ? (
            <>
              ≈{" "}
              <span className="font-semibold text-neutral">
                {acres.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>{" "}
              acres
            </>
          ) : (
            "Enter length and width to size it."
          )}
        </p>
      </fieldset>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-base-content/45">
            {label}
          </span>
          {hasBox ? (
            <button
              type="button"
              onClick={() => onChange({ ...value, center: null }, "position")}
              className="text-xs font-medium text-base-content/55 transition-colors hover:text-error"
            >
              Clear box
            </button>
          ) : null}
        </div>
        {MAPBOX_TOKEN ? (
          <MapPanel
            key={mapKey}
            header={{
              title: label,
              meta: hasBox
                ? "Drag the box to move · drag a corner to resize"
                : "Click the map to place it"
            }}
            initialViewState={initialView}
            mapboxAccessToken={MAPBOX_TOKEN}
            height={height}
            enableFullscreen
            recenterTo={recenterTo}
            recenterTarget={center ? { lng: center.lng, lat: center.lat, zoom: 14 } : null}
            footerLeft={null}
            footerRight={null}
            onMapClick={(c) => placeBox({ lat: c.lat, lng: c.lng })}
          >
            {contextFeatures.length > 0 ? (
              <Source
                id="box-context"
                type="geojson"
                data={{
                  type: "FeatureCollection",
                  features: contextFeatures.map((f) => ({
                    type: "Feature" as const,
                    properties: { name: f.name },
                    geometry: f.boundary
                  }))
                }}
              >
                <Layer id="box-context-fill" type="fill" paint={contextFillPaint} />
                <Layer id="box-context-stroke" type="line" paint={contextStrokePaint} />
                <Layer
                  id="box-context-label"
                  type="symbol"
                  layout={contextLabelLayout}
                  paint={contextLabelPaint}
                />
              </Source>
            ) : null}

            {hasBox && corners ? (
              <>
                <Source
                  id="box"
                  type="geojson"
                  data={{
                    type: "Feature",
                    properties: {},
                    geometry: boxPolygon(center, length, width)
                  }}
                >
                  <Layer id="box-fill" type="fill" paint={fillPaint} />
                  <Layer id="box-stroke" type="line" paint={strokePaint} />
                </Source>

                {/* Center handle — drag to move the whole box. */}
                <Marker
                  latitude={center.lat}
                  longitude={center.lng}
                  anchor="center"
                  draggable
                  onDrag={(e: MarkerDragEvent) =>
                    onChange({ ...value, center: { lat: e.lngLat.lat, lng: e.lngLat.lng } }, "position")
                  }
                >
                  <span
                    className={`block h-3.5 w-3.5 cursor-move rounded-full border-2 border-base-100 shadow ${palette.handle}`}
                  />
                </Marker>

                {/* Corner handles — drag to resize. */}
                {corners.map((c, i) => (
                  <Marker
                    key={i}
                    latitude={c[1]}
                    longitude={c[0]}
                    anchor="center"
                    draggable
                    onDrag={(e: MarkerDragEvent) => onCornerDrag(i, e.lngLat)}
                  >
                    <span
                      className={`block h-3 w-3 cursor-pointer rounded-sm border-2 bg-base-100 ${
                        tone === "zone" ? "border-accent" : "border-primary"
                      } shadow`}
                    />
                  </Marker>
                ))}
              </>
            ) : null}
          </MapPanel>
        ) : (
          <p className="rounded-lg border border-dashed border-base-content/20 bg-base-content/[0.02] px-4 py-3 text-xs text-base-content/55">
            Set <code className="rounded bg-base-content/[0.06] px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> to draw a
            boundary. It still saves without one.
          </p>
        )}
      </div>
    </div>
  );
}
