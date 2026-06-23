"use client";

import { useEffect, useRef, useState } from "react";
import type { MarkerDragEvent } from "react-map-gl/mapbox";
import { Layer, MapPanel, Marker, Source } from "@gaia/ui";
import type { FarmSummary, FieldSummary, FieldWrite } from "../../../lib/api";
import { createFieldAction, deleteFieldAction, updateFieldAction } from "./actions";
import {
  acresFromDimensions,
  boxCorners,
  boxPolygon,
  dimensionsFromBoundary,
  resizeFromCorner,
  type Coords
} from "./fieldGeometry";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Continental-US framing for a field that has no box yet — zoomed out enough that
// the operator can find their ground with a click or two.
const DEFAULT_VIEW = { longitude: -95.57, latitude: 39.835, zoom: 3.4 };
// Starter box dropped when the operator clicks the map before typing dimensions
// (≈10 acres). They resize from there by dragging or retyping.
const DEFAULT_DIM_FT = 660;

const fillPaint = { "fill-color": "#7c9e54", "fill-opacity": 0.22 } as const;
const strokePaint = { "line-color": "#5a7d3a", "line-width": 2, "line-opacity": 0.9 } as const;

// A positive number from a dimension input, or null when blank/invalid.
function parseDim(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Create / edit a field. Native <dialog> (Escape + backdrop close), driven by the
// `open` flag from FieldsView. `field === null` while open = create mode; a field
// = edit mode. The size is entered as length × width (feet), which draws an
// axis-aligned box on the map; the operator can drag the box to move it or drag a
// corner to resize. Acreage, centroid, and boundary all derive from the box.
export function FieldFormModal({
  open,
  field,
  farms,
  seededFarmId,
  onClose
}: {
  open: boolean;
  field: FieldSummary | null;
  farms: FarmSummary[];
  seededFarmId: string | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const isEdit = field != null;

  const [name, setName] = useState("");
  const [farmId, setFarmId] = useState("");
  const [description, setDescription] = useState("");
  // Length (N–S) and width (E–W) in feet, as free text so a blank stays blank.
  const [lengthFt, setLengthFt] = useState("");
  const [widthFt, setWidthFt] = useState("");
  // Box center; null = no box placed yet (acreage can still save from L × W).
  const [center, setCenter] = useState<Coords | null>(null);
  // Fed to MapPanel.recenterTo to fly in when the box is first dropped from the
  // zoomed-out continental view (a small box would otherwise be sub-pixel).
  const [recenterTo, setRecenterTo] = useState<{ lng: number; lat: number; zoom?: number } | null>(
    null
  );

  // Flips true once the operator positions the box themselves (click / drag), so
  // the box stops auto-following the farm selector. Dimension edits don't trip it.
  const positionTouchedRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Seed the form when the dialog opens (or switches to a different field).
  // Dimensions + center are reconstructed from the stored boundary box.
  const fieldId = field?.id;
  useEffect(() => {
    if (!open) return;
    setName(field?.name ?? "");
    setFarmId(field?.farmId ?? seededFarmId ?? farms[0]?.id ?? "");
    setDescription(field?.description ?? "");
    const dims = dimensionsFromBoundary(field?.boundary ?? null);
    if (dims) {
      // Editing a field that already has a box — seed from it and leave it put.
      setLengthFt(String(Math.round(dims.lengthFt)));
      setWidthFt(String(Math.round(dims.widthFt)));
      setCenter(dims.center);
      positionTouchedRef.current = true;
    } else {
      // New (or boxless) field — the box auto-drops at the selected farm below.
      setLengthFt("");
      setWidthFt("");
      setCenter(null);
      positionTouchedRef.current = isEdit;
    }
    setSaving(false);
    setConfirmingDelete(false);
    setDeleting(false);
    setError(null);
    setRecenterTo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fieldId, seededFarmId]);

  // Auto-place the box at the selected farm's location for a new field, and keep
  // it following the farm selector until the operator moves it themselves. Farms
  // without a location fall back to the continental view (click to place).
  const selectedFarm = farms.find((f) => f.id === farmId);
  const farmLngLat = selectedFarm?.location?.coordinates;
  useEffect(() => {
    if (!open || isEdit || positionTouchedRef.current || !farmLngLat) return;
    const at = { lat: farmLngLat[1], lng: farmLngLat[0] };
    setLengthFt((prev) => prev || String(DEFAULT_DIM_FT));
    setWidthFt((prev) => prev || String(DEFAULT_DIM_FT));
    setCenter(at);
    setRecenterTo({ lng: at.lng, lat: at.lat, zoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, farmId]);

  const length = parseDim(lengthFt);
  const width = parseDim(widthFt);
  // The box exists once it's placed and both dimensions are valid.
  const hasBox = center != null && length != null && width != null;
  const corners = hasBox ? boxCorners(center, length, width) : null;
  const acres = length != null && width != null ? acresFromDimensions(length, width) : null;

  // Where the map frames on open (before effects run): the field's existing box,
  // else the seeded farm's location, else the continental view. Keyed below so a
  // new-field modal opened for a given farm mounts already looking at it.
  const openFarm = farms.find((f) => f.id === (field?.farmId ?? seededFarmId ?? farms[0]?.id));
  const initialView = (() => {
    const editDims = dimensionsFromBoundary(field?.boundary ?? null);
    if (editDims) return { longitude: editDims.center.lng, latitude: editDims.center.lat, zoom: 13 };
    const loc = openFarm?.location?.coordinates;
    if (loc) return { longitude: loc[0], latitude: loc[1], zoom: 13 };
    return DEFAULT_VIEW;
  })();

  // Click the map to place / move the box. Seeds default dimensions if the
  // operator hasn't typed any yet, so a box appears immediately.
  function placeBox(at: Coords) {
    positionTouchedRef.current = true;
    if (length == null) setLengthFt(String(DEFAULT_DIM_FT));
    if (width == null) setWidthFt(String(DEFAULT_DIM_FT));
    // Fly in only on the first drop (from the far-out view); later clicks just
    // move the box without yanking the user's zoom.
    if (center == null) setRecenterTo({ lng: at.lng, lat: at.lat, zoom: 14 });
    setCenter(at);
  }

  // Drag the whole box (center handle) to move it.
  function moveBox(at: Coords) {
    positionTouchedRef.current = true;
    setCenter(at);
  }

  // Drag a corner → resize against the diagonally opposite corner (kept fixed),
  // updating both the center and the dimension inputs live.
  function onCornerDrag(index: number, lngLat: { lng: number; lat: number }) {
    if (!corners) return;
    positionTouchedRef.current = true;
    const opp = corners[(index + 2) % 4];
    const next = resizeFromCorner(
      { lat: lngLat.lat, lng: lngLat.lng },
      { lat: opp[1], lng: opp[0] }
    );
    setCenter(next.center);
    setLengthFt(String(Math.round(next.lengthFt)));
    setWidthFt(String(Math.round(next.widthFt)));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Field name is required.");
      return;
    }
    if (!farmId) {
      setError("Pick a farm for this field.");
      return;
    }
    setSaving(true);
    setError(null);
    const body: FieldWrite & { name: string; farmId: string } = {
      name: trimmedName,
      farmId,
      description: description.trim() || null,
      areaAcres: acres,
      centroid: hasBox ? center : null,
      boundary: hasBox ? boxPolygon(center, length, width) : null
    };
    try {
      if (isEdit && field) {
        await updateFieldAction(field.id, body);
      } else {
        await createFieldAction(body);
      }
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Couldn't save the field.");
    }
  }

  async function onDelete() {
    if (!field) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteFieldAction(field.id);
      onClose();
    } catch (err) {
      setDeleting(false);
      setConfirmingDelete(false);
      // The API 409s with a "reassign this field's captures first" message when
      // the field still has captures — surface it verbatim.
      setError(err instanceof Error ? err.message : "Couldn't delete the field.");
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-full max-w-2xl rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
    >
      <form onSubmit={onSubmit} className="flex max-h-[85vh] flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-base-content/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral">
            {isEdit ? "Edit field" : "New field"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-md p-1 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          <Field label="Field name" required>
            <input
              type="text"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. North 40"
              className={inputClass}
              autoFocus
            />
          </Field>

          <Field label="Farm" required>
            <select
              value={farmId}
              onChange={(e) => setFarmId(e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Select a farm…
              </option>
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </Field>

          {/* Dimensions → acreage */}
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
                  value={lengthFt}
                  onChange={(e) => setLengthFt(e.target.value)}
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
                  value={widthFt}
                  onChange={(e) => setWidthFt(e.target.value)}
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
                "Enter length and width to size the field."
              )}
            </p>
          </fieldset>

          <Field label="Description">
            <textarea
              value={description}
              maxLength={2000}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this field"
              className={`${inputClass} resize-none`}
            />
          </Field>

          {/* Boundary box */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-base-content/45">
                Boundary
              </span>
              {hasBox ? (
                <button
                  type="button"
                  onClick={() => setCenter(null)}
                  className="text-xs font-medium text-base-content/55 transition-colors hover:text-error"
                >
                  Clear box
                </button>
              ) : null}
            </div>
            {MAPBOX_TOKEN ? (
              open ? (
                <MapPanel
                  key={fieldId ?? `new-${seededFarmId ?? "none"}`}
                  header={{
                    title: "Field box",
                    meta: hasBox
                      ? "Drag the box to move · drag a corner to resize"
                      : "Click the map to place the field"
                  }}
                  initialViewState={initialView}
                  mapboxAccessToken={MAPBOX_TOKEN}
                  height={260}
                  enableFullscreen
                  recenterTo={recenterTo}
                  recenterTarget={
                    center ? { lng: center.lng, lat: center.lat, zoom: 14 } : null
                  }
                  footerLeft={null}
                  footerRight={null}
                  onMapClick={(c) => placeBox({ lat: c.lat, lng: c.lng })}
                >
                  {hasBox && corners ? (
                    <>
                      <Source
                        id="field-box"
                        type="geojson"
                        data={{
                          type: "Feature",
                          properties: {},
                          geometry: boxPolygon(center, length, width)
                        }}
                      >
                        <Layer id="field-box-fill" type="fill" paint={fillPaint} />
                        <Layer id="field-box-stroke" type="line" paint={strokePaint} />
                      </Source>

                      {/* Center handle — drag to move the whole box. */}
                      <Marker
                        latitude={center.lat}
                        longitude={center.lng}
                        anchor="center"
                        draggable
                        onDrag={(e: MarkerDragEvent) =>
                          moveBox({ lat: e.lngLat.lat, lng: e.lngLat.lng })
                        }
                      >
                        <span className="block h-3.5 w-3.5 cursor-move rounded-full border-2 border-base-100 bg-primary shadow" />
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
                          <span className="block h-3 w-3 cursor-pointer rounded-sm border-2 border-primary bg-base-100 shadow" />
                        </Marker>
                      ))}
                    </>
                  ) : null}
                </MapPanel>
              ) : null
            ) : (
              <p className="rounded-lg border border-dashed border-base-content/20 bg-base-content/[0.02] px-4 py-3 text-xs text-base-content/55">
                Set <code className="rounded bg-base-content/[0.06] px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> to draw a
                boundary. The field still saves without it.
              </p>
            )}
          </div>

          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 border-t border-base-content/10 px-6 py-4">
          {isEdit ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-base-content/65">Delete permanently?</span>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="rounded-md px-2.5 py-1.5 text-sm font-medium text-base-content/65 transition-colors hover:text-neutral disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="rounded-md bg-error px-3 py-1.5 text-sm font-semibold text-error-content transition-colors hover:bg-error/90 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error/10"
              >
                Delete field
              </button>
            )
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3.5 py-2 text-sm font-medium text-base-content/65 transition-colors hover:text-neutral"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create field"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

const inputClass =
  "w-full rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral outline-none transition-colors focus:border-primary/50";

function Field({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-base-content/65">
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
