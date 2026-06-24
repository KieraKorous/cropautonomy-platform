"use client";

import { useState } from "react";
import type {
  FillLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification
} from "mapbox-gl";
import { Layer, MapPinIcon, Marker, Source } from "@gaia/ui";

export type FarmMarker = {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  color: string;
};

// Local GeoJSON shape for the field polygons (the `geojson` types aren't a direct
// dep here). Structurally compatible with what react-map-gl's <Source> expects.
export type FieldFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { id: string; name: string; farmId: string; color: string };
    geometry: { type: "Polygon"; coordinates: number[][][] };
  }>;
};

// One recent-capture cluster, placed at a field's centroid (Activity view).
export type ActivityPin = {
  id: string;
  farmId: string;
  name: string;
  longitude: number;
  latitude: number;
  count: number;
};

// Field polygons are colored per farm via a data-driven `color` property; the
// stroke is the same hue at full strength so each farm reads as one group.
const fillPaint: FillLayerSpecification["paint"] = {
  "fill-color": ["get", "color"],
  "fill-opacity": 0.22
};
const linePaint: LineLayerSpecification["paint"] = {
  "line-color": ["get", "color"],
  "line-width": 2,
  "line-opacity": 0.9
};
// A field-name label sits at each box's centroid.
const labelLayout: SymbolLayerSpecification["layout"] = {
  "text-field": ["get", "name"],
  "text-size": 11,
  "text-anchor": "center",
  "text-allow-overlap": true
};
const labelPaint: SymbolLayerSpecification["paint"] = {
  "text-color": "#2b2b2b",
  "text-halo-color": "#ffffff",
  "text-halo-width": 1.3
};

// Farm-colored field boxes with name labels. Rendered as a child of MapPanel so
// Source/Layer share its map context.
export function FieldPolygons({ fields }: { fields: FieldFeatureCollection }) {
  return (
    <Source id="overview-fields" type="geojson" data={fields}>
      <Layer id="overview-fields-fill" type="fill" paint={fillPaint} />
      <Layer id="overview-fields-line" type="line" paint={linePaint} />
      <Layer id="overview-fields-label" type="symbol" layout={labelLayout} paint={labelPaint} />
    </Source>
  );
}

// A marker per farm (in its farm color) that reveals the farm name on hover.
export function FarmMarkers({ farms }: { farms: FarmMarker[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <>
      {farms.map((farm) => (
        <Marker key={farm.id} longitude={farm.longitude} latitude={farm.latitude} anchor="bottom">
          <div
            className="relative flex flex-col items-center"
            onMouseEnter={() => setHovered(farm.id)}
            onMouseLeave={() => setHovered((id) => (id === farm.id ? null : id))}
          >
            {hovered === farm.id ? (
              <div className="absolute bottom-full mb-1 whitespace-nowrap rounded bg-neutral px-2 py-1 text-[11px] font-medium text-neutral-content shadow-md">
                {farm.name}
              </div>
            ) : null}
            <span style={{ color: farm.color }} className="drop-shadow">
              <MapPinIcon size={26} />
            </span>
          </div>
        </Marker>
      ))}
    </>
  );
}

// Recent-capture clusters for the Activity view: an amber dot with the count,
// placed at each field's centroid.
export function ActivityMarkers({ pins }: { pins: ActivityPin[] }) {
  return (
    <>
      {pins.map((pin) => (
        <Marker key={pin.id} longitude={pin.longitude} latitude={pin.latitude} anchor="center">
          <div
            className="flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full border-2 border-base-100 bg-accent px-1 text-[11px] font-semibold text-accent-content shadow"
            title={`${pin.name}: ${pin.count} ${pin.count === 1 ? "capture" : "captures"}`}
          >
            {pin.count}
          </div>
        </Marker>
      ))}
    </>
  );
}
