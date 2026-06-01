"use client";

import { useTransition } from "react";
import { TrashIcon } from "@gaia/ui";
import type { CaptureSummary } from "../../../lib/api";
import { deleteCaptureAction, purgeDiscardedAction } from "./actions";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

// Manages permanent deletion of discarded captures. Deletion is irreversible
// (row + Storage object), so every action is gated behind window.confirm.
export function DiscardedCaptures({ captures }: { captures: CaptureSummary[] }) {
  const [pending, startTransition] = useTransition();

  if (captures.length === 0) {
    return (
      <p className="text-sm text-base-content/55">
        No discarded captures. Captures you discard from the Captures page show up here for
        permanent deletion.
      </p>
    );
  }

  const deleteOne = (id: string) => {
    if (!window.confirm("Permanently delete this capture? This cannot be undone.")) return;
    startTransition(() => deleteCaptureAction(id));
  };

  const purgeAll = () => {
    if (
      !window.confirm(
        `Permanently delete all ${captures.length} discarded ${
          captures.length === 1 ? "capture" : "captures"
        }? This cannot be undone.`
      )
    )
      return;
    startTransition(() => purgeDiscardedAction());
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-base-content/55">
          {captures.length} discarded {captures.length === 1 ? "capture" : "captures"}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={purgeAll}
          className="inline-flex items-center gap-1.5 rounded-md border border-error/30 px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error/10 disabled:opacity-50"
        >
          <TrashIcon size={14} />
          Delete all
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-base-content/10 bg-base-100">
        <table className="w-full min-w-[560px] text-left text-sm">
          <tbody>
            {captures.map((capture) => (
              <tr key={capture.id} className="border-t border-base-content/10 align-middle first:border-t-0">
                <td className="px-3 py-2.5">
                  <div className="relative h-12 w-12 overflow-hidden rounded-md bg-base-content/[0.04]">
                    {capture.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                      <img
                        alt={capture.plantType ?? "Capture"}
                        className="h-full w-full object-cover"
                        src={capture.imageUrl}
                      />
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral">
                      {capture.plantType ?? "Unidentified"}
                    </span>
                    <span className="text-xs text-base-content/55">
                      Captured {dateFormat.format(new Date(capture.capturedAt))}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => deleteOne(capture.id)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-base-content/55 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                    aria-label="Permanently delete capture"
                  >
                    <TrashIcon size={14} />
                    Delete permanently
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
