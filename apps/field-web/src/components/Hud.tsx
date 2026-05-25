import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { AccountChip } from "./AccountChip.js";
import {
  useBattery,
  useConnectivity,
  useGps,
  type GpsState
} from "../lib/hud-signals.js";

export interface HudProps {
  queueCount: number;
  sessionStatus: "off" | "live" | "paused";
  trackGps?: boolean;
}

// HUD strip lives across the top of every screen. Five signals, no nav, no
// chrome. Tap targets are large; tone is calm; copy is terse so it reads
// cleanly in glare.
export function Hud({ queueCount, sessionStatus, trackGps = true }: HudProps) {
  const connectivity = useConnectivity();
  const gps = useGps(trackGps);
  const battery = useBattery();

  return (
    <header className="safe-top sticky top-0 z-30 border-b border-base-content/10 bg-base-100/95 backdrop-blur">
      <div className="flex items-center gap-1 px-3 py-2 text-xs font-medium">
        <ConnectivityPill status={connectivity} />
        <GpsPill state={gps} />
        <BatteryPill level={battery.level} charging={battery.charging} />
        <Link
          to="/queue"
          className="ml-auto flex h-9 items-center gap-1.5 rounded-md border border-base-content/15 px-2.5 hover:bg-base-content/[0.04]"
          aria-label={`Upload queue: ${queueCount} pending`}
        >
          <UploadIcon />
          <span className="tabular-nums text-neutral">{queueCount}</span>
        </Link>
        <SessionPill status={sessionStatus} />
        <AccountChip />
      </div>
    </header>
  );
}

function Pill({
  tone,
  children,
  label
}: {
  tone: "success" | "warning" | "muted" | "danger";
  children: ReactNode;
  label?: string;
}) {
  const toneMap = {
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/15 text-warning border-warning/30",
    muted: "bg-base-content/[0.06] text-base-content/70 border-base-content/15",
    danger: "bg-error/15 text-error border-error/30"
  };
  return (
    <span
      className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 ${toneMap[tone]}`}
      aria-label={label}
    >
      {children}
    </span>
  );
}

function ConnectivityPill({ status }: { status: "online" | "degraded" | "offline" }) {
  const tone = status === "online" ? "success" : status === "degraded" ? "warning" : "danger";
  const label = status === "online" ? "Online" : status === "degraded" ? "Spotty" : "Offline";
  return (
    <Pill tone={tone} label={`Connectivity ${label}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      <span>{label}</span>
    </Pill>
  );
}

function GpsPill({ state }: { state: GpsState }) {
  if (state.status === "fix" && state.position) {
    const accuracy = Math.round(state.position.coords.accuracy);
    return (
      <Pill tone="success" label={`GPS fix, ±${accuracy}m`}>
        <PinIcon />
        <span className="tabular-nums">±{accuracy}m</span>
      </Pill>
    );
  }
  if (state.status === "searching") {
    return (
      <Pill tone="muted" label="GPS searching">
        <PinIcon />
        <span>Searching</span>
      </Pill>
    );
  }
  if (state.status === "denied") {
    return (
      <Pill tone="danger" label="GPS denied">
        <PinIcon />
        <span>Denied</span>
      </Pill>
    );
  }
  return (
    <Pill tone="warning" label="GPS unavailable">
      <PinIcon />
      <span>No GPS</span>
    </Pill>
  );
}

function BatteryPill({ level, charging }: { level?: number; charging?: boolean }) {
  if (level === undefined) {
    return null;
  }
  const pct = Math.round(level * 100);
  const tone = pct <= 15 ? "danger" : pct <= 30 ? "warning" : "muted";
  return (
    <Pill tone={tone} label={`Battery ${pct}%`}>
      <BatteryIcon />
      <span className="tabular-nums">
        {pct}%{charging ? "+" : ""}
      </span>
    </Pill>
  );
}

function SessionPill({ status }: { status: "off" | "live" | "paused" }) {
  if (status === "off") return null;
  const tone = status === "live" ? "success" : "warning";
  const label = status === "live" ? "Live" : "Paused";
  return (
    <Pill tone={tone} label={`Session ${label}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      <span>{label}</span>
    </Pill>
  );
}

// --- Inline icons (kept local so this component has no external dependencies)

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function BatteryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="16" height="10" rx="2" />
      <line x1="22" y1="11" x2="22" y2="13" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
