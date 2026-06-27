"use client";

import { useTransition } from "react";
import { RotateCcwIcon, TrashIcon } from "@gaia/ui";
import type { CaptureSummary } from "../../../lib/api";
import {
  deleteCaptureAction,
  purgeDiscardedAction,
  recoverCaptureAction
} from "./actions";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const isRecording = (item: CaptureSummary) => item.kind === "session_recording";

// Manages discarded captures AND recordings in one list (both are captures).
// Each row can be recovered (clears discarded_at, reversible) or permanently
// deleted (row + Storage object, irreversible — gated behind window.confirm).
export function DiscardedCaptures({ captures }: { captures: CaptureSummary[] }) {
  const [pending, startTransition] = useTransition();

  if (captures.length === 0) {
    return (
      <p className="text-sm text-base-content/55">
        Nothing discarded. Captures and recordings you discard show up here — recover them or
        delete them permanently.
      </p>
    );
  }

  const recover = (id: string) => {
    startTransition(() => recoverCaptureAction(id));
  };

  const deleteOne = (item: CaptureSummary) => {
    const noun = isRecording(item) ? "recording" : "capture";
    if (!window.confirm(`Permanently delete this ${noun}? This cannot be undone.`)) return;
    startTransition(() => deleteCaptureAction(item.id));
  };

  const purgeAll = () => {
    if (
      !window.confirm(
        `Permanently delete all ${captures.length} discarded ${
          captures.length === 1 ? "item" : "items"
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
          {captures.length} discarded {captures.length === 1 ? "item" : "items"}
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
            {captures.map((capture) => {
              const recording = isRecording(capture);
              return (
                <tr
                  key={capture.id}
                  className="border-t border-base-content/10 align-middle first:border-t-0"
                >
                  <td className="px-3 py-2.5">
                    <div
                      className={`relative h-12 overflow-hidden rounded-md ${
                        recording ? "w-16 bg-neutral" : "w-12 bg-base-content/[0.04]"
                      }`}
                    >
                      {capture.imageUrl ? (
                        recording ? (
                          // eslint-disable-next-line jsx-a11y/media-has-caption -- field recording, no caption track
                          <video
                            preload="metadata"
                            src={capture.imageUrl}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                          <img
                            alt={capture.plantType ?? "Capture"}
                            className="h-full w-full object-cover"
                            src={capture.imageUrl}
                          />
                        )
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-neutral">
                        {recording
                          ? capture.fieldId
                            ? "Field session"
                            : "Live session"
                          : capture.plantType ?? "Unidentified"}
                      </span>
                      <span className="text-xs text-base-content/55">
                        {recording ? "Recorded" : "Captured"}{" "}
                        {dateFormat.format(new Date(capture.capturedAt))}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => recover(capture.id)}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-base-content/55 transition-colors hover:bg-base-content/10 hover:text-neutral disabled:opacity-50"
                        aria-label={`Recover ${recording ? "recording" : "capture"}`}
                      >
                        <RotateCcwIcon size={14} />
                        Recover
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => deleteOne(capture)}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-base-content/55 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                        aria-label={`Permanently delete ${recording ? "recording" : "capture"}`}
                      >
                        <TrashIcon size={14} />
                        Delete permanently
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
