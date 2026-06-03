"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateCaptureDescriptionAction } from "../actions";

// Editable description / observation notes for a capture. Optimistic-ish: the
// textarea is the source of truth while editing; Save persists through the
// server action and rebases the "saved" baseline so the dirty check is accurate.
export function CaptureDescriptionEditor({
  captureId,
  initial
}: {
  captureId: string;
  initial: string | null;
}) {
  const [value, setValue] = useState(initial ?? "");
  // The last successfully-persisted value, used to detect unsaved edits.
  const [saved, setSaved] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // If the server-rendered value changes (e.g. after revalidate), adopt it as
  // the new baseline unless the user has unsaved local edits.
  useEffect(() => {
    if (value === saved) {
      setValue(initial ?? "");
      setSaved(initial ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to incoming server value
  }, [initial]);

  const dirty = value.trim() !== saved.trim();

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateCaptureDescriptionAction(captureId, value);
        const next = result.description ?? "";
        setValue(next);
        setSaved(next);
      } catch {
        setError("Couldn't save. Try again.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor="capture-description"
          className="text-xs font-medium uppercase tracking-wide text-base-content/55"
        >
          Description
        </label>
        {dirty ? (
          <span className="text-xs text-base-content/45">Unsaved changes</span>
        ) : null}
      </div>
      <textarea
        id="capture-description"
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={5}
        maxLength={4000}
        placeholder="Add observation notes — symptoms, location details, follow-up actions…"
        className="w-full resize-y rounded-lg border border-base-content/15 bg-base-100 px-3 py-2.5 text-sm leading-relaxed text-neutral outline-none transition-colors placeholder:text-base-content/35 focus:border-accent focus:ring-1 focus:ring-accent"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-error">{error}</span>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="inline-flex items-center justify-center rounded-lg bg-neutral px-4 py-2 text-sm font-semibold text-base-100 transition-colors hover:bg-neutral/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
