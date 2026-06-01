"use client";

import { useTransition } from "react";
import { TrashIcon } from "@gaia/ui";
import { discardCaptureAction } from "./actions";

// Quiet, right-aligned discard control for a captures table row. Discard is
// reversible (the row is only hidden), so a single click with an inline pending
// state is enough — no confirmation modal, in keeping with the calm/industrial
// posture in DESIGN.md.
export function DiscardButton({ captureId }: { captureId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => discardCaptureAction(captureId))}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-base-content/55 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
      aria-label="Discard capture"
    >
      <TrashIcon size={14} />
      {pending ? "Discarding…" : "Discard"}
    </button>
  );
}
