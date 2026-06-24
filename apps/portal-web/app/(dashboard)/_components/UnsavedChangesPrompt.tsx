"use client";

// An in-dialog overlay shown when the user tries to close a form modal with
// unsaved edits. Save runs the modal's save path (and stays open if it fails);
// Discard closes without saving; Keep editing dismisses the prompt. Render it
// inside a `relative` container (the modal's <form>) so it covers the content.
export function UnsavedChangesPrompt({
  open,
  saving,
  onSave,
  onDiscard,
  onKeepEditing
}: {
  open: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-base-100/85 p-6">
      <div className="w-full max-w-sm rounded-xl border border-base-content/10 bg-base-100 p-5 shadow-lg">
        <h3 className="text-base font-semibold text-neutral">Save changes?</h3>
        <p className="mt-1 text-sm text-base-content/65">
          You have unsaved changes. Save them before closing?
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onKeepEditing}
            disabled={saving}
            className="rounded-md px-3 py-2 text-sm font-medium text-base-content/65 transition-colors hover:text-neutral disabled:opacity-50"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="rounded-md px-3 py-2 text-sm font-medium text-base-content/70 transition-colors hover:bg-base-content/[0.06] disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
