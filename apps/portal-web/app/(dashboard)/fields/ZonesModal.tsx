"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldSummary, ZoneSummary, ZoneWrite } from "../../../lib/api";
import { UnsavedChangesPrompt } from "../_components/UnsavedChangesPrompt";
import {
  BoundaryBoxEditor,
  boxValueToPolygon,
  type BoxValue,
  type ContextFeature
} from "./BoundaryBoxEditor";
import { createZoneAction, deleteZoneAction, updateZoneAction } from "./actions";
import { acresFromDimensions, dimensionsFromBoundary, type GeoJsonPolygon } from "./fieldGeometry";
import { Field, inputClass } from "./formControls";

const DEFAULT_VIEW = { longitude: -95.57, latitude: 39.835, zoom: 3.4 };
const EMPTY_BOX: BoxValue = { lengthFt: "", widthFt: "", center: null };

function zoneAcres(boundary: GeoJsonPolygon | null): number | null {
  const dims = dimensionsFromBoundary(boundary);
  return dims ? acresFromDimensions(dims.lengthFt, dims.widthFt) : null;
}

// Manage a field's zones (sub-areas): a list of the field's zones plus a box
// editor to add/edit/delete one. The parent field boundary is drawn as gray
// context so zones stay inside it. Launched from a field card.
export function ZonesModal({
  open,
  field,
  zones,
  canManage,
  onClose
}: {
  open: boolean;
  field: FieldSummary | null;
  zones: ZoneSummary[];
  canManage: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // null = the "new zone" form; a string = editing that zone.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [box, setBox] = useState<BoxValue>(EMPTY_BOX);

  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirtyRef = useRef(false);
  const [closePrompt, setClosePrompt] = useState(false);
  const markDirty = () => {
    dirtyRef.current = true;
  };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const selectedZone = selectedId ? zones.find((z) => z.id === selectedId) ?? null : null;

  // Seed the form when opening or switching which zone is selected.
  useEffect(() => {
    if (!open) return;
    setName(selectedZone?.name ?? "");
    setDescription(selectedZone?.description ?? "");
    const dims = dimensionsFromBoundary(selectedZone?.boundary ?? null);
    setBox(
      dims
        ? {
            lengthFt: String(Math.round(dims.lengthFt)),
            widthFt: String(Math.round(dims.widthFt)),
            center: dims.center
          }
        : EMPTY_BOX
    );
    setConfirmingDelete(false);
    setError(null);
    dirtyRef.current = false;
    setClosePrompt(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedId]);

  const fieldId = field?.id;

  // The parent field (gray) + the other zones, drawn as placement context.
  const contextFeatures: ContextFeature[] = [];
  if (field?.boundary) contextFeatures.push({ name: field.name, boundary: field.boundary });
  for (const z of zones) {
    if (z.id !== selectedId && z.boundary) contextFeatures.push({ name: z.name, boundary: z.boundary });
  }

  const initialView = (() => {
    const dims = dimensionsFromBoundary(field?.boundary ?? null);
    if (dims) return { longitude: dims.center.lng, latitude: dims.center.lat, zoom: 14 };
    if (field?.centroid) {
      return { longitude: field.centroid.coordinates[0], latitude: field.centroid.coordinates[1], zoom: 14 };
    }
    return DEFAULT_VIEW;
  })();

  function startNew() {
    setSelectedId(null);
  }

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setClosePrompt(false);
      setError("Zone name is required.");
      return;
    }
    if (!field) return;
    setClosePrompt(false);
    setSaving(true);
    setError(null);
    const boundary = boxValueToPolygon(box);
    const body: ZoneWrite = { name: trimmedName, description: description.trim() || null, boundary };
    try {
      if (selectedZone) {
        await updateZoneAction(selectedZone.id, body);
      } else {
        await createZoneAction({ ...body, fieldId: field.id, name: trimmedName });
      }
      // Back to the new-zone form; the list refreshes via revalidation.
      dirtyRef.current = false;
      setSelectedId(null);
      setName("");
      setDescription("");
      setBox(EMPTY_BOX);
      setSaving(false);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Couldn't save the zone.");
    }
  }

  async function onDelete() {
    if (!selectedZone) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteZoneAction(selectedZone.id);
      dirtyRef.current = false;
      setSelectedId(null);
      setDeleting(false);
      setConfirmingDelete(false);
    } catch (err) {
      setDeleting(false);
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : "Couldn't delete the zone.");
    }
  }

  function requestClose() {
    if (saving || deleting) return;
    if (dirtyRef.current) setClosePrompt(true);
    else onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) requestClose();
      }}
      className="m-auto w-full max-w-2xl rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
    >
      <div className="relative flex max-h-[85vh] flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-base-content/10 px-6 py-4">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-neutral">Zones</h2>
            {field ? <p className="text-xs text-base-content/55">{field.name}</p> : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="-mr-1 rounded-md p-1 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          {/* Zone list */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-base-content/45">
                {zones.length} {zones.length === 1 ? "zone" : "zones"}
              </span>
              {canManage && selectedId !== null ? (
                <button
                  type="button"
                  onClick={startNew}
                  className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                >
                  + New zone
                </button>
              ) : null}
            </div>
            {zones.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {zones.map((z) => {
                  const acres = zoneAcres(z.boundary);
                  return (
                    <li key={z.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(z.id)}
                        className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                          z.id === selectedId
                            ? "border-primary/40 bg-primary/5"
                            : "border-base-content/10 hover:border-primary/30"
                        }`}
                      >
                        <span className="truncate font-medium text-neutral">{z.name}</span>
                        <span className="flex-shrink-0 text-xs text-base-content/55">
                          {acres != null ? `${acres.toLocaleString("en-US", { maximumFractionDigits: 1 })} ac` : "—"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-base-content/15 px-3 py-3 text-sm text-base-content/55">
                No zones yet.
              </p>
            )}
          </div>

          {/* Editor */}
          {canManage ? (
            <div className="flex flex-col gap-5 border-t border-base-content/10 pt-5">
              <h3 className="text-sm font-semibold text-neutral">
                {selectedZone ? "Edit zone" : "New zone"}
              </h3>
              <Field label="Zone name" required>
                <input
                  type="text"
                  value={name}
                  maxLength={200}
                  onChange={(e) => {
                    setName(e.target.value);
                    markDirty();
                  }}
                  placeholder="e.g. Low-yield block"
                  className={inputClass}
                />
              </Field>

              {open ? (
                <BoundaryBoxEditor
                  value={box}
                  onChange={(next) => {
                    markDirty();
                    setBox(next);
                  }}
                  contextFeatures={contextFeatures}
                  initialView={initialView}
                  mapKey={`${fieldId ?? "field"}-zone-${selectedId ?? "new"}`}
                  label="Zone area"
                  tone="zone"
                  height={240}
                />
              ) : null}

              <Field label="Description">
                <textarea
                  value={description}
                  maxLength={2000}
                  rows={2}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    markDirty();
                  }}
                  placeholder="Optional notes about this zone"
                  className={`${inputClass} resize-none`}
                />
              </Field>

              {error ? <p className="text-sm text-error">{error}</p> : null}
            </div>
          ) : (
            <p className="border-t border-base-content/10 pt-5 text-sm text-base-content/55">
              You don&apos;t have permission to edit zones.
            </p>
          )}
        </div>

        {/* Footer */}
        {canManage ? (
          <div className="flex items-center justify-between gap-3 border-t border-base-content/10 px-6 py-4">
            {selectedZone ? (
              confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-base-content/65">Delete zone?</span>
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
                  Delete zone
                </button>
              )
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-md px-3.5 py-2 text-sm font-medium text-base-content/65 transition-colors hover:text-neutral"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : selectedZone ? "Save zone" : "Add zone"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end border-t border-base-content/10 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3.5 py-2 text-sm font-medium text-base-content/65 transition-colors hover:text-neutral"
            >
              Close
            </button>
          </div>
        )}

        <UnsavedChangesPrompt
          open={closePrompt}
          saving={saving}
          onSave={() => void save()}
          onDiscard={onClose}
          onKeepEditing={() => setClosePrompt(false)}
        />
      </div>
    </dialog>
  );
}
