"use client";

import { useTransition } from "react";
import { TrashIcon } from "@gaia/ui";
import type { CaptureSummary } from "../../../lib/api";
import {
  deleteRecordingAction,
  purgeDiscardedRecordingsAction
} from "./actions";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

// Manages permanent deletion of discarded recordings. Deletion is irreversible
// (row + Storage object), so every action is gated behind window.confirm —
// mirrors DiscardedCaptures, but the thumbnail is a poster-frame video.
export function DiscardedRecordings({ recordings }: { recordings: CaptureSummary[] }) {
  const [pending, startTransition] = useTransition();

  if (recordings.length === 0) {
    return (
      <p className="text-sm text-base-content/55">
        No discarded recordings. Recordings you discard from the Recordings page show up here
        for permanent deletion.
      </p>
    );
  }

  const deleteOne = (id: string) => {
    if (!window.confirm("Permanently delete this recording? This cannot be undone.")) return;
    startTransition(() => deleteRecordingAction(id));
  };

  const purgeAll = () => {
    if (
      !window.confirm(
        `Permanently delete all ${recordings.length} discarded ${
          recordings.length === 1 ? "recording" : "recordings"
        }? This cannot be undone.`
      )
    )
      return;
    startTransition(() => purgeDiscardedRecordingsAction());
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-base-content/55">
          {recordings.length} discarded {recordings.length === 1 ? "recording" : "recordings"}
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
            {recordings.map((recording) => (
              <tr key={recording.id} className="border-t border-base-content/10 align-middle first:border-t-0">
                <td className="px-3 py-2.5">
                  <div className="relative h-12 w-16 overflow-hidden rounded-md bg-neutral">
                    {recording.imageUrl ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption -- field recording, no caption track
                      <video
                        preload="metadata"
                        src={recording.imageUrl}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral">
                      {recording.fieldId ? "Field session" : "Live session"}
                    </span>
                    <span className="text-xs text-base-content/55">
                      Recorded {dateFormat.format(new Date(recording.capturedAt))}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => deleteOne(recording.id)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-base-content/55 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                    aria-label="Permanently delete recording"
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
