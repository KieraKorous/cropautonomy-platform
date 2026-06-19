"use client";

import { useEffect, useRef, useState } from "react";
import type { MarkerDragEvent } from "react-map-gl/mapbox";
import { MapPanel, Marker, MapPinIcon } from "@gaia/ui";
import type { FarmSummary, FieldSummary, FieldWrite } from "../../../lib/api";
import { createFieldAction, deleteFieldAction, updateFieldAction } from "./actions";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Continental-US framing for a field that has no pin yet — zoomed out enough that
// the operator can find their ground with a click or two.
const DEFAULT_VIEW = { longitude: -95.57, latitude: 39.835, zoom: 3.4 };

type Coords = { lat: number; lng: number };

// Create / edit a field. Native <dialog> (Escape + backdrop close), driven by the
// `open` flag from FieldsView. `field === null` while open = create mode; a field
// = edit mode. Submitting goes through a server action that revalidates /fields,
// so the grid reflects the change after onClose. Fields capture a manual acreage
// + an optional centroid pin; the boundary polygon isn't editable here yet.
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
  // Acreage is a free-text input so an empty field stays empty (not 0); parsed on
  // submit. null when blank.
  const [acres, setAcres] = useState("");
  const [location, setLocation] = useState<Coords | null>(null);

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

  // Seed the form when the dialog opens (or switches to a different field). Keyed
  // on the field id + seeded farm + open so an in-place refresh of the field prop
  // doesn't clobber edits the user is mid-way through.
  const fieldId = field?.id;
  useEffect(() => {
    if (!open) return;
    setName(field?.name ?? "");
    setFarmId(field?.farmId ?? seededFarmId ?? farms[0]?.id ?? "");
    setDescription(field?.description ?? "");
    setAcres(field?.areaAcres != null ? String(field.areaAcres) : "");
    setLocation(
      field?.centroid
        ? { lng: field.centroid.coordinates[0], lat: field.centroid.coordinates[1] }
        : null
    );
    setSaving(false);
    setConfirmingDelete(false);
    setDeleting(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fieldId, seededFarmId]);

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
    // Acreage is optional; reject only a non-empty value that isn't a number.
    let areaAcres: number | null = null;
    if (acres.trim()) {
      const parsed = Number(acres);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Acreage must be a positive number.");
        return;
      }
      areaAcres = parsed;
    }
    setSaving(true);
    setError(null);
    const body: FieldWrite & { name: string; farmId: string } = {
      name: trimmedName,
      farmId,
      description: description.trim() || null,
      areaAcres,
      centroid: location
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

          <div className="grid gap-4 sm:grid-cols-2">
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

            <Field label="Size (acres)">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={acres}
                onChange={(e) => setAcres(e.target.value)}
                placeholder="e.g. 41.3"
                className={inputClass}
              />
            </Field>
          </div>

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

          {/* Location pin */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-base-content/45">
                Location pin
              </span>
              {location ? (
                <button
                  type="button"
                  onClick={() => setLocation(null)}
                  className="text-xs font-medium text-base-content/55 transition-colors hover:text-error"
                >
                  Clear pin
                </button>
              ) : null}
            </div>
            {MAPBOX_TOKEN ? (
              open ? (
                <MapPanel
                  key={fieldId ?? "new"}
                  header={{
                    title: "Centroid",
                    meta: location
                      ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                      : "Click the map to drop a pin"
                  }}
                  initialViewState={
                    location
                      ? { longitude: location.lng, latitude: location.lat, zoom: 12 }
                      : DEFAULT_VIEW
                  }
                  mapboxAccessToken={MAPBOX_TOKEN}
                  height={240}
                  enableFullscreen
                  recenterTarget={
                    location ? { lng: location.lng, lat: location.lat, zoom: 13 } : null
                  }
                  footerLeft={null}
                  footerRight={null}
                  onMapClick={(c) => setLocation({ lat: c.lat, lng: c.lng })}
                >
                  {location ? (
                    <Marker
                      latitude={location.lat}
                      longitude={location.lng}
                      anchor="bottom"
                      draggable
                      onDragEnd={(e: MarkerDragEvent) =>
                        setLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng })
                      }
                    >
                      <span className="text-primary drop-shadow">
                        <MapPinIcon size={28} />
                      </span>
                    </Marker>
                  ) : null}
                </MapPanel>
              ) : null
            ) : (
              <p className="rounded-lg border border-dashed border-base-content/20 bg-base-content/[0.02] px-4 py-3 text-xs text-base-content/55">
                Set <code className="rounded bg-base-content/[0.06] px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> to drop a
                location pin. The field still saves without it.
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
