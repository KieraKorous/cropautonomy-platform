import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { AccountChip } from "./AccountChip.js";
import {
    useBattery,
    useConnectivity,
    useGps,
    type GpsState
} from "../lib/hud-signals.js";

// Floating chrome shared by every page. Positioned absolutely so the page
// content can render edge-to-edge underneath. Status pills are dot-only by
// default and only expand to show details when degraded — same posture as
// Snapchat / Instagram, where chrome is invisible when everything is fine.
//
// Variant tunes contrast: "dark" sits on camera/map (translucent black + white
// text); "light" sits on cream/base surfaces (translucent white + neutral text).

export type OverlayVariant = "dark" | "light";

export interface OverlayChromeProps {
    variant?: OverlayVariant;
    queueCount: number;
    sessionStatus: "off" | "live" | "paused";
    trackGps?: boolean;
}

export function OverlayChrome({
    variant = "light",
    queueCount,
    sessionStatus,
    trackGps = true
}: OverlayChromeProps) {
    const connectivity = useConnectivity();
    const gps = useGps(trackGps);
    const battery = useBattery();

    return (
        <>
            {/* Top-left status cluster */}
            <div className="safe-top pointer-events-none fixed left-0 top-0 z-30 flex items-center gap-2 px-4 py-4 mt-4">
                <ConnectivityDot status={connectivity} variant={variant} />
                <GpsDot state={gps} variant={variant} />
                <BatteryDot
                    level={battery.level}
                    charging={battery.charging}
                    variant={variant}
                />
                <QueueDot count={queueCount} variant={variant} />
            </div>

            {/* Top-center session pill — only when a session is running */}
            {sessionStatus !== "off" && (
                <div className="safe-top pointer-events-none fixed left-1/2 top-0 z-30 -translate-x-1/2 px-4 py-4 mt-4">
                    <SessionPill status={sessionStatus} variant={variant} />
                </div>
            )}

            {/* Top-right account */}
            <div className="safe-top pointer-events-none fixed right-0 top-0 z-30 px-4 py-4 mt-4">
                <div className="pointer-events-auto">
                    <AccountChip variant={variant} />
                </div>
            </div>
        </>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Dot primitives — collapsed (just a colored dot) by default, expanded
// (pill with label) when status warrants attention.
// ──────────────────────────────────────────────────────────────────────────

interface DotProps {
    tone: "success" | "warning" | "danger" | "muted";
    variant: OverlayVariant;
    expanded?: boolean;
    label?: string;
    children?: ReactNode;
    ariaLabel: string;
    href?: string;
}

function Dot({
    tone,
    variant,
    expanded,
    label,
    children,
    ariaLabel,
    href
}: DotProps) {
    const toneColor = {
        success: "bg-success",
        warning: "bg-warning",
        danger: "bg-error",
        muted: variant === "dark" ? "bg-white/60" : "bg-base-content/40"
    }[tone];

    const surface =
        variant === "dark"
            ? "bg-black/45 text-white backdrop-blur-md"
            : "bg-base-100/85 text-neutral border border-base-content/10 backdrop-blur";

    const className = expanded
        ? `pointer-events-auto flex h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold ${surface}`
        : `pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full ${surface}`;

    const dot = <span className={`block h-2.5 w-2.5 rounded-full ${toneColor}`} />;

    const content = (
        <>
            {dot}
            {expanded && (
                <span className="flex items-center gap-1 tabular-nums">
                    {children ?? label}
                </span>
            )}
        </>
    );

    if (href) {
        return (
            <Link to={href} aria-label={ariaLabel} className={className}>
                {content}
            </Link>
        );
    }

    return (
        <span aria-label={ariaLabel} className={className}>
            {content}
        </span>
    );
}

function ConnectivityDot({
    status,
    variant
}: {
    status: "online" | "degraded" | "offline";
    variant: OverlayVariant;
}) {
    if (status === "online") {
        return (
            <Dot
                tone="success"
                variant={variant}
                ariaLabel="Connectivity online"
            />
        );
    }
    return (
        <Dot
            tone={status === "degraded" ? "warning" : "danger"}
            variant={variant}
            expanded
            ariaLabel={`Connectivity ${status}`}
        >
            {status === "degraded" ? "Spotty" : "Offline"}
        </Dot>
    );
}

function GpsDot({
    state,
    variant
}: {
    state: GpsState;
    variant: OverlayVariant;
}) {
    if (state.status === "fix" && state.position) {
        const accuracy = Math.round(state.position.coords.accuracy);
        // Decent fix = dot only. Soft fix = expand with accuracy.
        if (accuracy <= 25) {
            return <Dot tone="success" variant={variant} ariaLabel={`GPS fix ±${accuracy}m`} />;
        }
        return (
            <Dot
                tone="warning"
                variant={variant}
                expanded
                ariaLabel={`GPS fix ±${accuracy}m`}
            >
                ±{accuracy}m
            </Dot>
        );
    }
    if (state.status === "searching") {
        return (
            <Dot tone="muted" variant={variant} expanded ariaLabel="GPS searching">
                GPS
            </Dot>
        );
    }
    if (state.status === "denied") {
        return (
            <Dot tone="danger" variant={variant} expanded ariaLabel="GPS denied">
                GPS off
            </Dot>
        );
    }
    return (
        <Dot tone="warning" variant={variant} expanded ariaLabel="GPS unavailable">
            No GPS
        </Dot>
    );
}

function BatteryDot({
    level,
    charging,
    variant
}: {
    level?: number;
    charging?: boolean;
    variant: OverlayVariant;
}) {
    if (level === undefined) return null;
    const pct = Math.round(level * 100);
    if (pct > 30) {
        // Healthy battery = invisible (icon-less). No chrome unless needed.
        return null;
    }
    const tone = pct <= 15 ? "danger" : "warning";
    return (
        <Dot
            tone={tone}
            variant={variant}
            expanded
            ariaLabel={`Battery ${pct}%${charging ? " (charging)" : ""}`}
        >
            {pct}%{charging ? "+" : ""}
        </Dot>
    );
}

function QueueDot({ count, variant }: { count: number; variant: OverlayVariant }) {
    if (count === 0) {
        // Clean queue = invisible. No noise when there's nothing to look at.
        return null;
    }
    return (
        <Dot
            tone="muted"
            variant={variant}
            expanded
            href="/queue"
            ariaLabel={`Upload queue: ${count} pending`}
        >
            <UploadIcon /> {count}
        </Dot>
    );
}

function SessionPill({
    status,
    variant
}: {
    status: "live" | "paused";
    variant: OverlayVariant;
}) {
    const tone = status === "live" ? "success" : "warning";
    const label = status === "live" ? "Live" : "Paused";
    return (
        <Dot
            tone={tone}
            variant={variant}
            expanded
            ariaLabel={`Session ${label}`}
        >
            {label}
        </Dot>
    );
}

function UploadIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
    );
}
