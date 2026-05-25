import { useEffect, useState, type ReactNode } from "react";

import { AccountChip } from "./AccountChip.js";
import { FieldDock } from "./FieldDock.js";
import { listQueued } from "../lib/db.js";
import {
  useConnectivity,
  useGps,
  type GpsState
} from "../lib/hud-signals.js";
import { useActiveSession } from "../lib/session.js";

// Standard chrome for the "list/form" pages — session picker, queue, settings.
// Sticky header on top, scrolling content in the middle, glove-friendly dock
// on the bottom. The camera and map pages skip this and render full-bleed with
// floating OverlayChrome instead.

export interface ChromeLayoutProps {
  title: string;
  eyebrow?: string;
  /** Optional right-side content rendered before the AccountChip (e.g. "Done" button). */
  headerAction?: ReactNode;
  children: ReactNode;
}

export function ChromeLayout({
  title,
  eyebrow,
  headerAction,
  children
}: ChromeLayoutProps) {
  const { session } = useActiveSession();
  const queueCount = useQueueCount();
  const connectivity = useConnectivity();
  const gps = useGps(true);

  return (
    <div className="flex h-full flex-col bg-base-100">
      <header className="safe-top sticky top-0 z-20 flex flex-shrink-0 items-center justify-between gap-3 border-b border-base-content/10 bg-base-100/95 px-4 backdrop-blur">
        <div className="min-w-0 py-3">
          {eyebrow && (
            <p className="text-[11px] font-medium uppercase tracking-wider text-base-content/55">
              {eyebrow}
            </p>
          )}
          <h1 className="truncate text-lg font-semibold text-neutral">{title}</h1>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <StatusCluster
            connectivity={connectivity}
            gps={gps}
            sessionStatus={session?.status ?? "off"}
          />
          {headerAction}
          <AccountChip variant="light" />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">{children}</main>

      <FieldDock queueCount={queueCount} />
    </div>
  );
}

// ─── Status cluster (compact, inline, header-resident) ────────────────────
// Same idea as OverlayChrome's dots — invisible when healthy, expand when
// degraded — but anchored to the header instead of floating.

function StatusCluster({
  connectivity,
  gps,
  sessionStatus
}: {
  connectivity: "online" | "degraded" | "offline";
  gps: GpsState;
  sessionStatus: "off" | "live" | "paused";
}) {
  const items: ReactNode[] = [];

  if (sessionStatus !== "off") {
    items.push(
      <StatusPill
        key="session"
        tone={sessionStatus === "live" ? "success" : "warning"}
        label={sessionStatus === "live" ? "Live" : "Paused"}
      />
    );
  }

  if (connectivity !== "online") {
    items.push(
      <StatusPill
        key="conn"
        tone={connectivity === "degraded" ? "warning" : "danger"}
        label={connectivity === "degraded" ? "Spotty" : "Offline"}
      />
    );
  }

  if (gps.status === "denied") {
    items.push(<StatusPill key="gps" tone="danger" label="GPS off" />);
  } else if (gps.status === "unavailable") {
    items.push(<StatusPill key="gps" tone="warning" label="No GPS" />);
  } else if (gps.status === "fix" && gps.position) {
    const accuracy = Math.round(gps.position.coords.accuracy);
    if (accuracy > 25) {
      items.push(
        <StatusPill key="gps" tone="warning" label={`GPS ±${accuracy}m`} />
      );
    }
  } else if (gps.status === "searching") {
    items.push(<StatusPill key="gps" tone="muted" label="GPS…" />);
  }

  if (items.length === 0) return null;
  return <div className="flex items-center gap-1.5">{items}</div>;
}

function StatusPill({
  tone,
  label
}: {
  tone: "success" | "warning" | "danger" | "muted";
  label: string;
}) {
  const dot = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-error",
    muted: "bg-base-content/40"
  }[tone];

  return (
    <span className="flex h-11 items-center gap-2 rounded-full border border-base-content/10 bg-base-100/85 px-3.5 text-sm font-semibold text-neutral tabular-nums">
      <span className={`block h-2.5 w-2.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ─── Queue count hook ─────────────────────────────────────────────────────
// Polls IndexedDB so the dock badge stays current without each page wiring
// its own subscription. 2s cadence is fast enough for queue feedback without
// thrashing the worker thread.

function useQueueCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    async function refresh() {
      const all = await listQueued();
      if (!alive) return;
      setCount(all.filter((r) => r.status !== "synced").length);
    }
    void refresh();
    const interval = setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);
  return count;
}
