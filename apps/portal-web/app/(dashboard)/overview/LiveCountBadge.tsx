"use client";

import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { useEffect, useRef, useState } from "react";

export interface LiveCountBadgeProps {
  orgId: string;
  initialCount: number;
}

// Count of live capture sessions, seeded from the server and pushed in real time
// over the org-wide active-sessions channel — the same channel the Live wall
// uses. This is the visible "it updates without a refresh" signal on Overview.
export function LiveCountBadge({ orgId, initialCount }: LiveCountBadgeProps) {
  const [count, setCount] = useState(initialCount);
  const started = useRef<Set<string>>(new Set());
  const ended = useRef<Set<string>>(new Set());

  const { latest } = useRealtimeChannel(channels.orgActiveSessions(orgId), {
    historyLimit: 1,
    enabled: Boolean(orgId)
  });

  useEffect(() => {
    if (!latest) return;
    if (latest.type === "capture.session.started") {
      const id = latest.payload.sessionId;
      if (started.current.has(id)) return;
      started.current.add(id);
      setCount((c) => c + 1);
    } else if (latest.type === "capture.session.ended") {
      const id = latest.payload.sessionId;
      if (ended.current.has(id)) return;
      ended.current.add(id);
      setCount((c) => Math.max(0, c - 1));
    }
  }, [latest]);

  const live = count > 0;
  return (
    <span
      className={`flex items-center gap-1.5 ${live ? "text-success" : "text-base-content/55"}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-success" : "bg-base-content/30"}`}
      />
      {live ? `${count} ${count === 1 ? "camera" : "cameras"} live` : "Nothing live right now"}
    </span>
  );
}
