"use client";

import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { useEffect, useState } from "react";

import type { LiveSessionSummary } from "../../../lib/api";
import { CameraTile } from "./CameraTile";

export interface LiveWallProps {
  orgId: string;
  viewerUserId: string;
  initialSessions: LiveSessionSummary[];
}

// The camera wall. Seeds from the server, then keeps the roster fresh over the
// org-wide active-sessions channel. Equal grid by default; clicking a camera
// widens it (full-width, first) and collapses the rest into a strip below.
//
// All tiles render in one stable, single-parent list — focus only swaps CSS
// classes (flex-basis + order), never the DOM position — so peer connections
// and live streams survive focus changes.
export function LiveWall({ orgId, viewerUserId, initialSessions }: LiveWallProps) {
  const [sessions, setSessions] = useState<LiveSessionSummary[]>(initialSessions);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const { latest } = useRealtimeChannel(channels.orgActiveSessions(orgId), {
    historyLimit: 1
  });

  useEffect(() => {
    if (!latest) return;
    if (latest.type === "capture.session.started") {
      const p = latest.payload;
      setSessions((prev) =>
        prev.some((s) => s.sessionId === p.sessionId)
          ? prev
          : [
              {
                sessionId: p.sessionId,
                status: "live",
                operatorUserId: p.operatorUserId,
                // The realtime event carries ids, not display names — those fill
                // in on the next full page load. Show a neutral label meanwhile.
                operatorName: "Operator",
                fieldName: null,
                farmName: null,
                startedAt: p.startedAt,
                disconnectedAt: null
              },
              ...prev
            ]
      );
    } else if (latest.type === "capture.session.ended") {
      const endedId = latest.payload.sessionId;
      setSessions((prev) => prev.filter((s) => s.sessionId !== endedId));
      setFocusedId((cur) => (cur === endedId ? null : cur));
    }
  }, [latest]);

  if (sessions.length === 0) {
    return <EmptyState />;
  }

  const hasFocus = focusedId != null && sessions.some((s) => s.sessionId === focusedId);

  return (
    <div className="flex flex-wrap gap-4">
      {sessions.map((session) => {
        const isFocused = hasFocus && session.sessionId === focusedId;
        const wrapperClass = !hasFocus
          ? "grow basis-80"
          : isFocused
            ? "order-first basis-full"
            : "basis-44 grow-0";
        return (
          <div key={session.sessionId} className={wrapperClass}>
            <CameraTile
              session={session}
              orgId={orgId}
              viewerUserId={viewerUserId}
              focused={isFocused}
              compact={hasFocus && !isFocused}
              onToggleFocus={() =>
                setFocusedId((cur) =>
                  cur === session.sessionId ? null : session.sessionId
                )
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
      <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
        Nothing live right now
      </span>
      <h2 className="text-base font-semibold text-neutral">All quiet in the field.</h2>
      <p className="max-w-xl text-sm text-base-content/65">
        When an operator starts a capture session in the field app, their camera appears here in real
        time.
      </p>
    </section>
  );
}
