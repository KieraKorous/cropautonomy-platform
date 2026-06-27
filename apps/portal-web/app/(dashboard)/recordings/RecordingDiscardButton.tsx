"use client";

import { useTransition } from "react";
import { TrashIcon } from "@gaia/ui";
import { discardRecordingAction } from "./actions";

// Quiet discard control for a recording card. Discard is reversible (the row is
// only hidden), so a single click with an inline pending state is enough — no
// confirmation modal, mirroring the captures DiscardButton.
export function RecordingDiscardButton({ recordingId }: { recordingId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => discardRecordingAction(recordingId))}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-base-content/55 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
      aria-label="Discard recording"
    >
      <TrashIcon size={14} />
      {pending ? "Discarding…" : "Discard"}
    </button>
  );
}
