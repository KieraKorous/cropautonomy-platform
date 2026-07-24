"use client";

import { useOnlineStatus } from "@gaia/plant-analysis/react";

// Offline-state messaging (PRD Phase 14). The analysis feature is fully local:
// observations, analysis, and history all work without a network once the page is
// loaded, and everything persists on-device. This just tells the user that when
// the connection drops.
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-neutral">
      <span className="h-2 w-2 flex-shrink-0 rounded-full bg-warning" aria-hidden />
      <span>
        You&apos;re offline. Plant analysis keeps working — observations and results are saved on
        this device and will still be here when you reconnect.
      </span>
    </div>
  );
}
