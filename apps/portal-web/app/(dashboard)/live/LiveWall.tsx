"use client";

import { capture } from "@gaia/analytics";
import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { useEffect, useState } from "react";

import type { LiveSessionSummary } from "../../../lib/api";
import { listLiveSessionsAction } from "./actions";
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

  // One live_page_viewed per mount of the wall (the page's client entry point).
  useEffect(() => {
    capture("live_page_viewed");
  }, []);

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
                // in on the next full page load. Show neutral labels meanwhile.
                operatorName: "Operator",
                deviceName: "Unknown",
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

  // Reconcile against the server roster every 20s: drops cameras that stopped
  // streaming (their session goes stale once the phone stops heartbeating) and
  // self-heals any add/remove realtime event we may have missed. Existing tiles
  // keep their position (and their peer/stream) — only metadata is refreshed.
  useEffect(() => {
    let alive = true;
    const reconcile = async () => {
      let fetched: LiveSessionSummary[];
      try {
        fetched = await listLiveSessionsAction();
      } catch {
        return; // transient — keep the current wall rather than blanking it
      }
      if (!alive) return;
      const fetchedMap = new Map(fetched.map((s) => [s.sessionId, s]));
      setSessions((prev) => {
        const kept = prev
          .filter((s) => fetchedMap.has(s.sessionId))
          .map((s) => fetchedMap.get(s.sessionId)!);
        const keptIds = new Set(kept.map((s) => s.sessionId));
        const added = fetched.filter((s) => !keptIds.has(s.sessionId));
        return [...added, ...kept];
      });
      setFocusedId((cur) => (cur && !fetchedMap.has(cur) ? null : cur));
    };
    void reconcile();
    const interval = setInterval(reconcile, 10_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

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
              onToggleFocus={() =>
                setFocusedId((cur) =>
                  cur === session.sessionId ? null : session.sessionId
                )
              }
              onRemove={() => {
                setSessions((prev) =>
                  prev.filter((s) => s.sessionId !== session.sessionId)
                );
                setFocusedId((cur) =>
                  cur === session.sessionId ? null : cur
                );
              }}
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
