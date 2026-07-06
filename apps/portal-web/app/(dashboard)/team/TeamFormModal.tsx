"use client";

import { useEffect, useRef, useState } from "react";
import type { TeamSummary, TeamWrite } from "../../../lib/api";
import { UnsavedChangesPrompt } from "../_components/UnsavedChangesPrompt";
import { createTeamAction, deleteTeamAction, updateTeamAction } from "./actions";

// Preset swatches for the team accent. The stored value is always the hex
// string; a team seeded with a color outside this list still shows as selected
// (we compare on the raw value).
const PRESET_COLORS = [
  "#5a7d3a", // moss green
  "#2f6f8f", // slate blue
  "#b45309", // amber
  "#9333ea", // violet
  "#dc2626", // red
  "#0d9488" // teal
];

// Create / edit a team. Native <dialog> (Escape + backdrop close), driven by the
// `open` flag from TeamsView. `team === null` while open = create mode; a team =
// edit mode. Submitting goes through a server action that revalidates /team.
export function TeamFormModal({
  open,
  team,
  onClose
}: {
  open: boolean;
  team: TeamSummary | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const isEdit = team != null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string | null>(null);

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

  // Seed the form when the dialog opens (or switches to a different team).
  const teamId = team?.id;
  useEffect(() => {
    if (!open) return;
    setName(team?.name ?? "");
    setDescription(team?.description ?? "");
    setColor(team?.color ?? null);
    setSaving(false);
    setConfirmingDelete(false);
    setDeleting(false);
    setError(null);
    dirtyRef.current = false;
    setClosePrompt(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teamId]);

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setClosePrompt(false);
      setError("Team name is required.");
      return;
    }
    setClosePrompt(false);
    setSaving(true);
    setError(null);
    const body: TeamWrite & { name: string } = {
      name: trimmedName,
      description: description.trim() || null,
      color
    };
    try {
      if (isEdit && team) {
        await updateTeamAction(team.id, body);
      } else {
        await createTeamAction(body);
      }
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Couldn't save the team.");
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
    if (!team) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteTeamAction(team.id);
      onClose();
    } catch (err) {
      setDeleting(false);
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : "Couldn't delete the team.");
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
      className="m-auto w-full max-w-lg rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
    >
      <form onSubmit={onSubmit} className="relative flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-base-content/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral">
            {isEdit ? "Edit team" : "New team"}
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
          <Field label="Team name" required>
            <input
              type="text"
              value={name}
              maxLength={120}
              onChange={(e) => {
                setName(e.target.value);
                markDirty();
              }}
              placeholder="e.g. Scouting Crew"
              className={inputClass}
              autoFocus
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              maxLength={2000}
              rows={2}
              onChange={(e) => {
                setDescription(e.target.value);
                markDirty();
              }}
              placeholder="Who's on this crew and what they cover"
              className={`${inputClass} resize-none`}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-base-content/65">Accent color</span>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((hex) => {
                const selected = color === hex;
                return (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Use color ${hex}`}
                    aria-pressed={selected}
                    onClick={() => {
                      setColor(selected ? null : hex);
                      markDirty();
                    }}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      selected
                        ? "border-neutral scale-110"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                );
              })}
              {color ? (
                <button
                  type="button"
                  onClick={() => {
                    setColor(null);
                    markDirty();
                  }}
                  className="ml-1 text-xs font-medium text-base-content/55 transition-colors hover:text-neutral"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>

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
                Delete team
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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create team"}
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
