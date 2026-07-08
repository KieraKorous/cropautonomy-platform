"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FarmSummary, FieldSummary, FieldWrite, TeamSummary } from "../../../lib/api";
import { TeamMultiSelect } from "../_components/TeamMultiSelect";
import { UnsavedChangesPrompt } from "../_components/UnsavedChangesPrompt";
import {
  BoundaryBoxEditor,
  boxValueAcres,
  boxValueToPolygon,
  type BoxValue,
  type ContextFeature
} from "./BoundaryBoxEditor";
import {
  createFieldAction,
  deleteFieldAction,
  setFieldTeamAction,
  updateFieldAction
} from "./actions";
import { dimensionsFromBoundary } from "./fieldGeometry";
import { Field, inputClass } from "./formControls";

// Continental-US framing for a field that has no box yet.
const DEFAULT_VIEW = { longitude: -95.57, latitude: 39.835, zoom: 3.4 };
const DEFAULT_DIM_FT = 660;

const EMPTY_BOX: BoxValue = { lengthFt: "", widthFt: "", center: null };

// Create / edit a field. The size + boundary are handled by the shared
// BoundaryBoxEditor (length × width → a draggable box). A field also carries a
// free-text crop and an optional description.
export function FieldFormModal({
  open,
  field,
  farms,
  fields,
  seededFarmId,
  teams,
  canAssignTeams,
  onClose
}: {
  open: boolean;
  field: FieldSummary | null;
  farms: FarmSummary[];
  fields: FieldSummary[];
  seededFarmId: string | null;
  // All org teams + whether the caller may file this field onto them (teams.assign).
  teams: TeamSummary[];
  canAssignTeams: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const isEdit = field != null;

  const [name, setName] = useState("");
  const [farmId, setFarmId] = useState("");
  const [description, setDescription] = useState("");
  const [box, setBox] = useState<BoxValue>(EMPTY_BOX);
  const [crop, setCrop] = useState("");
  // Parent-driven fly-in (auto-placement at the selected farm).
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number; zoom?: number } | null>(null);

  // Flips true once the operator positions the box themselves, so it stops
  // auto-following the farm selector.
  const positionTouchedRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Team assignment (edit only; optimistic — each toggle persists immediately).
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teamBusy, setTeamBusy] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);

  // Tracks real user edits so closing with unsaved changes can prompt to save.
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

  // Seed the form when the dialog opens (or switches to a different field).
  const fieldId = field?.id;
  useEffect(() => {
    if (!open) return;
    setName(field?.name ?? "");
    setFarmId(field?.farmId ?? seededFarmId ?? farms[0]?.id ?? "");
    setDescription(field?.description ?? "");
    const dims = dimensionsFromBoundary(field?.boundary ?? null);
    if (dims) {
      setBox({
        lengthFt: String(Math.round(dims.lengthFt)),
        widthFt: String(Math.round(dims.widthFt)),
        center: dims.center
      });
      positionTouchedRef.current = true;
    } else {
      setBox(EMPTY_BOX);
      positionTouchedRef.current = isEdit;
    }
    setCrop(field?.crop ?? "");
    setSaving(false);
    setConfirmingDelete(false);
    setDeleting(false);
    setError(null);
    setFlyTo(null);
    setTeamIds(field?.teamIds ?? []);
    setTeamBusy(null);
    setTeamError(null);
    dirtyRef.current = false;
    setClosePrompt(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fieldId, seededFarmId]);

  // Toggle this field on/off one team. Optimistic; reverts on failure. Persists
  // immediately (no Save needed) — separate from the form's fields.
  async function onToggleTeam(teamId: string, assigned: boolean) {
    if (!field) return;
    const prev = teamIds;
    setTeamBusy(teamId);
    setTeamError(null);
    setTeamIds(assigned ? [...prev, teamId] : prev.filter((t) => t !== teamId));
    try {
      await setFieldTeamAction(field.id, teamId, assigned);
      router.refresh();
    } catch (err) {
      setTeamIds(prev);
      setTeamError(err instanceof Error ? err.message : "Couldn't update the field's teams.");
    } finally {
      setTeamBusy(null);
    }
  }

  // Auto-place the box at the selected farm's location for a new field, following
  // the farm selector until the operator moves it themselves.
  const farmLngLat = farms.find((f) => f.id === farmId)?.location?.coordinates;
  useEffect(() => {
    if (!open || isEdit || positionTouchedRef.current || !farmLngLat) return;
    const at = { lat: farmLngLat[1], lng: farmLngLat[0] };
    setBox((prev) => ({
      lengthFt: prev.lengthFt || String(DEFAULT_DIM_FT),
      widthFt: prev.widthFt || String(DEFAULT_DIM_FT),
      center: at
    }));
    setFlyTo({ lng: at.lng, lat: at.lat, zoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, farmId]);

  // The selected farm's other mapped fields, drawn as gray placement context.
  const contextFeatures: ContextFeature[] = fields
    .filter((f) => f.farmId === farmId && f.id !== field?.id && f.boundary)
    .map((f) => ({ name: f.name, boundary: f.boundary! }));

  // Where the map frames on open (before effects run).
  const openFarm = farms.find((f) => f.id === (field?.farmId ?? seededFarmId ?? farms[0]?.id));
  const initialView = (() => {
    const editDims = dimensionsFromBoundary(field?.boundary ?? null);
    if (editDims) return { longitude: editDims.center.lng, latitude: editDims.center.lat, zoom: 13 };
    const loc = openFarm?.location?.coordinates;
    if (loc) return { longitude: loc[0], latitude: loc[1], zoom: 13 };
    return DEFAULT_VIEW;
  })();

  function onBoxChange(next: BoxValue, kind: "dimensions" | "position") {
    markDirty();
    if (kind === "position") positionTouchedRef.current = true;
    setBox(next);
  }

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setClosePrompt(false);
      setError("Field name is required.");
      return;
    }
    if (!farmId) {
      setClosePrompt(false);
      setError("Pick a farm for this field.");
      return;
    }
    setClosePrompt(false);
    setSaving(true);
    setError(null);
    const boundary = boxValueToPolygon(box);
    const body: FieldWrite & { name: string; farmId: string } = {
      name: trimmedName,
      farmId,
      description: description.trim() || null,
      areaAcres: boxValueAcres(box),
      centroid: box.center,
      boundary,
      crop: crop.trim() || null
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

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    void save();
  }

  function requestClose() {
    if (saving || deleting) return;
    if (dirtyRef.current) setClosePrompt(true);
    else onClose();
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
      setError(err instanceof Error ? err.message : "Couldn't delete the field.");
    }
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
      <form onSubmit={onSubmit} className="relative flex max-h-[85vh] flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-base-content/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral">
            {isEdit ? "Edit field" : "New field"}
          </h2>
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
          <Field label="Field name" required>
            <input
              type="text"
              value={name}
              maxLength={200}
              onChange={(e) => {
                setName(e.target.value);
                markDirty();
              }}
              placeholder="e.g. North 40"
              className={inputClass}
              autoFocus
            />
          </Field>

          {/* Teams — which crews this field belongs to (edit only; a field can be
              on several). Each toggle persists immediately. */}
          {isEdit && canAssignTeams ? (
            <>
              <TeamMultiSelect
                teams={teams}
                selectedIds={teamIds}
                busyId={teamBusy}
                subjectLabel="field"
                inline
                onToggle={onToggleTeam}
              />
              {teamError ? <p className="text-sm text-error">{teamError}</p> : null}
            </>
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
              placeholder="Optional notes about this field"
              className={`${inputClass} resize-none`}
            />
          </Field>

          <Field label="Farm" required>
            <select
              value={farmId}
              onChange={(e) => {
                setFarmId(e.target.value);
                markDirty();
              }}
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

          <Field label="Crop">
            <input
              type="text"
              value={crop}
              maxLength={200}
              onChange={(e) => {
                setCrop(e.target.value);
                markDirty();
              }}
              placeholder="e.g. Corn — leave blank if none"
              className={inputClass}
            />
          </Field>

          {/* Boundary map stays at the very bottom of the form. */}
          {open ? (
            <BoundaryBoxEditor
              value={box}
              onChange={onBoxChange}
              contextFeatures={contextFeatures}
              initialView={initialView}
              mapKey={fieldId ?? `new-${seededFarmId ?? "none"}`}
              flyTo={flyTo}
              label="Boundary"
              tone="field"
            />
          ) : null}

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
              onClick={requestClose}
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

        <UnsavedChangesPrompt
          open={closePrompt}
          saving={saving}
          onSave={() => void save()}
          onDiscard={onClose}
          onKeepEditing={() => setClosePrompt(false)}
        />
      </form>
    </dialog>
  );
}
