"use client";

import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { StatusPill } from "@gaia/ui";
import { useEffect, useState, useTransition } from "react";

import type { LiveRequestSummary } from "../../../lib/api";
import { acceptLiveRequestAction, rejectLiveRequestAction } from "./actions";

export interface PendingRequestsProps {
  orgId: string;
  initialRequests: LiveRequestSummary[];
}

// The request/accept gate. A paired phone asks to go live; the request lands here
// for any watcher to Accept or Reject. Accept spawns a live session — the camera
// then appears on the wall below via the existing capture.session.started fanout.
// Seeds from the server, then stays fresh over the org-wide live-requests channel.
export function PendingRequests({ orgId, initialRequests }: PendingRequestsProps) {
  const [requests, setRequests] = useState<LiveRequestSummary[]>(initialRequests);

  const { latest } = useRealtimeChannel(channels.liveRequests(orgId), { historyLimit: 1 });

  useEffect(() => {
    if (!latest) return;
    if (latest.type === "live.request.created") {
      const p = latest.payload;
      setRequests((prev) =>
        prev.some((r) => r.requestId === p.requestId)
          ? prev
          : [
              {
                requestId: p.requestId,
                status: "pending",
                deviceId: p.deviceId,
                deviceName: p.deviceName,
                requestedByName: "Operator",
                requestedAt: p.requestedAt,
                expiresAt: p.requestedAt
              },
              ...prev
            ]
      );
    } else if (
      latest.type === "live.request.accepted" ||
      latest.type === "live.request.rejected" ||
      latest.type === "live.request.cancelled"
    ) {
      const decidedId = latest.payload.requestId;
      setRequests((prev) => prev.filter((r) => r.requestId !== decidedId));
    }
  }, [latest]);

  if (requests.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
      <div className="flex items-center gap-2">
        <StatusPill tone="accent" label={`${requests.length} pending`} />
        <h2 className="text-sm font-semibold text-neutral">Cameras requesting to go live</h2>
      </div>
      <ul className="flex flex-col gap-2">
        {requests.map((request) => (
          <RequestRow key={request.requestId} request={request} />
        ))}
      </ul>
    </section>
  );
}

function RequestRow({ request }: { request: LiveRequestSummary }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);

  const decide = (action: "accepted" | "rejected") =>
    startTransition(async () => {
      try {
        if (action === "accepted") await acceptLiveRequestAction(request.requestId);
        else await rejectLiveRequestAction(request.requestId);
        setDone(action);
      } catch {
        // The realtime event will reconcile if another watcher decided first.
      }
    });

  return (
    <li className="flex items-center gap-3 rounded-lg border border-base-content/10 bg-base-100 px-3.5 py-2.5">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-neutral">{request.deviceName}</span>
        <span className="truncate text-xs text-base-content/55">{request.requestedByName}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled={pending || done != null}
          onClick={() => decide("rejected")}
          className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-base-content/60 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={pending || done != null}
          onClick={() => decide("accepted")}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "…" : done === "accepted" ? "Accepted" : "Accept"}
        </button>
      </div>
    </li>
  );
}
