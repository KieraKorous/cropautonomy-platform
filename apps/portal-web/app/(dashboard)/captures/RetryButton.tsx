"use client";

import { capture } from "@gaia/analytics";
import { useTransition } from "react";
import { reanalyzeCaptureAction } from "./actions";

// Retry control shown beside a failed capture's status. Re-queues the AI
// analysis (the image is already in Storage), flipping the capture back to
// "Analyzing". Single click with an inline pending state, matching DiscardButton.
export function RetryButton({ captureId }: { captureId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        capture("scan_analysis_requested", { captureId });
        startTransition(() => reanalyzeCaptureAction(captureId));
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-base-content/55 transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-50"
      aria-label="Retry analysis"
    >
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={pending ? "animate-spin" : ""}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      {pending ? "Retrying…" : "Retry"}
    </button>
  );
}
