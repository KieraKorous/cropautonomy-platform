"use client";

import { useMemo, type ReactNode } from "react";
import Map, { Layer, Marker, Source, type MapMouseEvent } from "react-map-gl/mapbox";
import type { StyleSpecification } from "mapbox-gl";

export type MapStyle = string | StyleSpecification;
import type { Feature, FeatureCollection, Polygon } from "geojson";

/**
 * Default Mapbox basemap style.
 *
 * Long-term we want a custom `gaia-field` style authored in Mapbox Studio that pulls our palette
 * (warm earth-tone land, cool cream water, ink labels). Until that style exists, point at the
 * stock "light-v11" style — calm enough to live with, and a one-line swap when the custom style ships.
 *
 * Override per-call via the `mapStyle` prop on <MapPanel> when needed.
 */
const DEFAULT_STYLE = "mapbox://styles/mapbox/light-v11";

const layerToneClasses: Record<"primary" | "accent" | "muted", { bg: string; text: string; dot: string }> = {
  primary: { bg: "bg-primary", text: "text-primary-content", dot: "bg-primary-content/85" },
  accent: { bg: "bg-accent/15", text: "text-accent", dot: "bg-accent" },
  muted: { bg: "bg-base-content/[0.06]", text: "text-neutral", dot: "bg-base-content/55" }
};

export type MapViewMode = { id: string; label: string; active?: boolean };
export type MapLayerToggle = {
  id: string;
  label: string;
  active?: boolean;
  tone?: "primary" | "accent" | "muted";
  count?: number | string;
  icon?: ReactNode;
};

export type MapPanelHeader = {
  title: string;
  meta?: string;
  orgSelector?: { label: string; icon?: ReactNode };
  viewModes?: MapViewMode[];
  timeRange?: { label: string; icon?: ReactNode };
  openFullMapHref?: string;
};

export type MapLivenessIndicator = {
  label: string;
  /** Tone for the small live dot (default: success/green). */
  tone?: "success" | "accent" | "muted";
};

export type MapPanelProps = {
  header: MapPanelHeader;
  layers?: MapLayerToggle[];
  liveness?: MapLivenessIndicator;
  /**
   * Mapbox access token. Required — Mapbox refuses to load tiles without one.
   * Pass `process.env.NEXT_PUBLIC_MAPBOX_TOKEN` (or equivalent) from the call site.
   * The page should surface a helpful error if it's empty; this component throws on render.
   */
  mapboxAccessToken: string;
  /** Mapbox style URL. Defaults to mapbox://styles/mapbox/light-v11. */
  mapStyle?: MapStyle | string;
  initialViewState: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
  /** Map body height. Default 460px. */
  height?: number;
  /** Source/Layer/Marker children rendered inside the Map. */
  children?: ReactNode;
  /**
   * Called with the clicked coordinate when the user clicks the map body. Lets a
   * caller place/move a point (e.g. a farm centroid picker). When set, the map
   * cursor becomes a crosshair to signal it's clickable.
   */
  onMapClick?: (coords: { lng: number; lat: number }) => void;
  /** Bottom-right corner content (defaults to coordinates + zoom — pass null to suppress). */
  footerRight?: ReactNode;
  /** Bottom-left corner content (defaults to a 1mi scale bar — pass null to suppress). */
  footerLeft?: ReactNode;
};

export function MapPanel({
  header,
  layers,
  liveness,
  mapboxAccessToken,
  mapStyle = DEFAULT_STYLE,
  initialViewState,
  height = 460,
  children,
  onMapClick,
  footerLeft,
  footerRight
}: MapPanelProps) {
  if (!mapboxAccessToken) {
    throw new Error(
      "MapPanel requires a Mapbox access token. Set NEXT_PUBLIC_MAPBOX_TOKEN in your env and pass it in."
    );
  }

  const computedFooterLeft = footerLeft === undefined ? <DefaultScaleBar /> : footerLeft;
  const computedFooterRight =
    footerRight === undefined ? (
      <DefaultCoordinates lat={initialViewState.latitude} lng={initialViewState.longitude} zoom={initialViewState.zoom} />
    ) : (
      footerRight
    );

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
      <MapPanelHeaderBar header={header} />
      {layers && layers.length > 0 && <MapLayerStrip layers={layers} liveness={liveness} />}
      <div className="relative w-full overflow-hidden" style={{ height }}>
        <Map
          initialViewState={initialViewState}
          mapboxAccessToken={mapboxAccessToken}
          mapStyle={mapStyle}
          style={{ width: "100%", height: "100%" }}
          cursor={onMapClick ? "crosshair" : undefined}
          onClick={
            onMapClick
              ? (e: MapMouseEvent) => onMapClick({ lng: e.lngLat.lng, lat: e.lngLat.lat })
              : undefined
          }
        >
          {children}
        </Map>
        <MapFloatingControls />
        {(computedFooterLeft || computedFooterRight) && (
          <div className="pointer-events-none absolute inset-x-4 bottom-3.5 flex items-center justify-between">
            <div className="pointer-events-auto">{computedFooterLeft}</div>
            <div className="pointer-events-auto">{computedFooterRight}</div>
          </div>
        )}
      </div>
    </section>
  );
}

function MapPanelHeaderBar({ header }: { header: MapPanelHeader }) {
  return (
    <header className="flex items-center justify-between border-b border-base-content/10 px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold text-neutral">{header.title}</h2>
          {header.meta && <p className="text-xs text-base-content/60">{header.meta}</p>}
        </div>
        {header.orgSelector && <OrgPill label={header.orgSelector.label} icon={header.orgSelector.icon} />}
      </div>
      <div className="flex items-center gap-2.5">
        {header.viewModes && <ViewModeToggle modes={header.viewModes} />}
        {header.timeRange && <TimePill label={header.timeRange.label} icon={header.timeRange.icon} />}
        {header.openFullMapHref && (
          <a
            className="whitespace-nowrap text-sm font-medium text-primary hover:text-primary/85"
            href={header.openFullMapHref}
          >
            Open full map →
          </a>
        )}
      </div>
    </header>
  );
}

function OrgPill({ label, icon }: { label: string; icon?: ReactNode }) {
  return (
    <button
      className="flex items-center gap-2 rounded-md bg-base-content/[0.04] px-2.5 py-1.5 hover:bg-base-content/[0.08]"
      type="button"
    >
      {icon && <span className="text-base-content/65">{icon}</span>}
      <span className="whitespace-nowrap text-sm font-medium text-neutral">{label}</span>
      <svg
        fill="none"
        height="13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="13"
        className="text-base-content/55"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function ViewModeToggle({ modes }: { modes: MapViewMode[] }) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-base-content/12">
      {modes.map((mode, idx) => {
        const isLast = idx === modes.length - 1;
        const activeClass = mode.active
          ? "bg-base-content/[0.05] font-semibold text-neutral"
          : "text-base-content/65 hover:text-neutral";
        const borderClass = isLast ? "" : "border-r border-base-content/8";
        return (
          <button
            className={`px-3 py-1.5 text-xs ${activeClass} ${borderClass}`}
            key={mode.id}
            type="button"
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

function TimePill({ label, icon }: { label: string; icon?: ReactNode }) {
  return (
    <button
      className="flex items-center gap-1.5 rounded-md border border-base-content/12 px-2.5 py-1.5 hover:bg-base-content/[0.04]"
      type="button"
    >
      <span className="text-base-content/65">
        {icon ?? (
          <svg
            fill="none"
            height="13"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
            width="13"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        )}
      </span>
      <span className="text-xs text-neutral">{label}</span>
    </button>
  );
}

function MapLayerStrip({
  layers,
  liveness
}: {
  layers: MapLayerToggle[];
  liveness?: MapLivenessIndicator;
}) {
  return (
    <div className="flex items-center justify-between border-b border-base-content/8 bg-base-content/[0.03] px-5 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="pr-1 text-xs font-semibold uppercase tracking-wider text-base-content/55">Layers</span>
        {layers.map((layer) => (
          <LayerChip layer={layer} key={layer.id} />
        ))}
      </div>
      {liveness && <LivenessIndicator liveness={liveness} />}
    </div>
  );
}

function LayerChip({ layer }: { layer: MapLayerToggle }) {
  if (!layer.active) {
    return (
      <button
        className="flex items-center gap-1.5 rounded-full border border-dashed border-base-content/20 px-2.5 py-1 text-xs text-base-content/65 hover:text-neutral"
        type="button"
      >
        {layer.icon && <span>{layer.icon}</span>}
        {layer.label}
      </button>
    );
  }
  const tone = layerToneClasses[layer.tone ?? "muted"];
  return (
    <button
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone.bg} ${tone.text}`}
      type="button"
    >
      {layer.icon ? <span>{layer.icon}</span> : <span className={`h-2 w-2 rounded-full ${tone.dot}`} />}
      {layer.count !== undefined ? `${layer.label} · ${layer.count}` : layer.label}
    </button>
  );
}

function LivenessIndicator({ liveness }: { liveness: MapLivenessIndicator }) {
  const dotClass =
    liveness.tone === "accent"
      ? "bg-accent"
      : liveness.tone === "muted"
        ? "bg-base-content/50"
        : "bg-success";
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs text-base-content/60">{liveness.label}</span>
      <div className="flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1">
        <span className={`h-1 w-1 rounded-full ${dotClass}`} />
        <span className="text-xs font-medium text-success">Live</span>
      </div>
    </div>
  );
}

function MapFloatingControls() {
  return (
    <div className="absolute right-4 top-4 flex flex-col gap-2">
      <div className="flex flex-col overflow-hidden rounded-md border border-base-content/12 bg-base-100/95 shadow-sm">
        <button
          aria-label="Zoom in"
          className="flex h-8 w-8 items-center justify-center border-b border-base-content/10 hover:bg-base-content/[0.05]"
          type="button"
        >
          <PlusGlyph />
        </button>
        <button
          aria-label="Zoom out"
          className="flex h-8 w-8 items-center justify-center hover:bg-base-content/[0.05]"
          type="button"
        >
          <MinusGlyph />
        </button>
      </div>
      <ControlButton ariaLabel="Recenter">
        <RecenterGlyph />
      </ControlButton>
      <ControlButton ariaLabel="Layers">
        <LayersGlyph />
      </ControlButton>
      <ControlButton ariaLabel="Draw">
        <DrawGlyph />
      </ControlButton>
    </div>
  );
}

function ControlButton({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  return (
    <button
      aria-label={ariaLabel}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-base-content/12 bg-base-100/95 shadow-sm hover:bg-base-content/[0.05]"
      type="button"
    >
      {children}
    </button>
  );
}

function PlusGlyph() {
  return (
    <svg fill="none" height="14" stroke="#18211c" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function MinusGlyph() {
  return (
    <svg fill="none" height="14" stroke="#18211c" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <path d="M5 12h14" />
    </svg>
  );
}

function RecenterGlyph() {
  return (
    <svg fill="none" height="14" stroke="#18211c" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </svg>
  );
}

function LayersGlyph() {
  return (
    <svg fill="none" height="14" stroke="#18211c" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14">
      <path d="M12 2 2 7l10 5 10-5z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

function DrawGlyph() {
  return (
    <svg fill="none" height="14" stroke="#18211c" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function DefaultScaleBar() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-base-content/10 bg-base-100/95 px-2.5 py-1.5">
      <span className="block h-[3px] w-[72px] rounded-sm bg-neutral" />
      <span className="text-xs font-medium text-neutral">1 mi</span>
    </div>
  );
}

function DefaultCoordinates({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-base-content/10 bg-base-100/95 px-3 py-1.5">
      <span className="text-xs text-base-content/65">
        {lat.toFixed(4)}° {lat >= 0 ? "N" : "S"} · {Math.abs(lng).toFixed(4)}° {lng >= 0 ? "E" : "W"}
      </span>
      <span className="text-base-content/20">·</span>
      <span className="text-xs text-base-content/65">Zoom {Math.round(zoom)}</span>
    </div>
  );
}

// --- Helper layers + markers ----------------------------------------------

const fieldFillPaint = {
  "fill-color": "#244f37",
  "fill-opacity": 0.28
} as const;

const fieldStrokePaint = {
  "line-color": "#244f37",
  "line-width": 1,
  "line-opacity": 0.55
} as const;

const watchlistFillPaint = {
  "fill-color": "#b26b2c",
  "fill-opacity": 0.22
} as const;

const watchlistStrokePaint = {
  "line-color": "#b26b2c",
  "line-width": 2,
  "line-opacity": 0.85
} as const;

export type FieldFeature = Feature<Polygon, { id: string; name?: string }>;

export function FieldsLayer({ features }: { features: FieldFeature[] }) {
  const data: FeatureCollection = useMemo(() => ({ type: "FeatureCollection", features }), [features]);
  return (
    <Source data={data} id="gaia-fields" type="geojson">
      <Layer id="gaia-fields-fill" paint={fieldFillPaint} type="fill" />
      <Layer id="gaia-fields-stroke" paint={fieldStrokePaint} type="line" />
    </Source>
  );
}

export function WatchlistLayer({ features }: { features: FieldFeature[] }) {
  const data: FeatureCollection = useMemo(() => ({ type: "FeatureCollection", features }), [features]);
  return (
    <Source data={data} id="gaia-watchlist" type="geojson">
      <Layer id="gaia-watchlist-fill" paint={watchlistFillPaint} type="fill" />
      <Layer id="gaia-watchlist-stroke" paint={watchlistStrokePaint} type="line" />
    </Source>
  );
}

export type DevicePinDatum = {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
  icon: ReactNode;
  /** Active device = moss-green pill. Docked/offline = dark muted pill. */
  status: "active" | "docked" | "offline";
  meta?: string;
};

export function DevicePinMarker({ device }: { device: DevicePinDatum }) {
  const pillClass =
    device.status === "active"
      ? "bg-primary text-primary-content"
      : "bg-neutral/85 text-neutral-content";
  const dotClass = device.status === "active" ? "bg-primary ring-base-100" : "bg-neutral/85 ring-base-100";
  return (
    <Marker latitude={device.latitude} longitude={device.longitude} anchor="bottom">
      <div className="flex flex-col items-center gap-0.5">
        <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 shadow-sm ${pillClass}`}>
          <span className="text-current">{device.icon}</span>
          <span className="whitespace-nowrap text-[11px] font-semibold">
            {device.label}
            {device.meta && ` · ${device.meta}`}
          </span>
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ring-2 ${dotClass}`} />
      </div>
    </Marker>
  );
}

// Re-export Mapbox primitives so consumers can build custom layers without importing react-map-gl directly.
export { Source, Layer, Marker };
