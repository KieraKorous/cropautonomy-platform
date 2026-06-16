"use client";

import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import {
  AppShell,
  CameraIcon,
  ChartIcon,
  ChecklistIcon,
  CogIcon,
  FarmIcon,
  FilmIcon,
  GridIcon,
  HomeIcon,
  LiveIcon,
  RoverIcon,
  SidebarPulseCard,
  UsersIcon,
  type AppShellOrg,
  type AppShellProps,
  type AppShellUser
} from "@gaia/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { getNavCountsAction } from "./nav-actions";
import type { NavCounts } from "../../lib/nav-counts";

export interface DashboardShellProps {
  org: AppShellOrg;
  user: AppShellUser;
  orgId: string;
  initialCounts: NavCounts;
  children: ReactNode;
}

// Client shell that keeps the sidebar live. The Live badge updates instantly over
// the org-wide active-sessions channel; the slower counts (farms/fields/devices)
// refresh on a 30s poll, since the server layout stays mounted across client
// navigations and would otherwise go stale until a full reload.
export function DashboardShell({
  org,
  user,
  orgId,
  initialCounts,
  children
}: DashboardShellProps) {
  const [counts, setCounts] = useState<NavCounts>(initialCounts);

  // Instant live-session count over realtime — same channel the Live wall uses.
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
      setCounts((c) => ({ ...c, liveSessions: c.liveSessions + 1 }));
    } else if (latest.type === "capture.session.ended") {
      const id = latest.payload.sessionId;
      if (ended.current.has(id)) return;
      ended.current.add(id);
      setCounts((c) => ({ ...c, liveSessions: Math.max(0, c.liveSessions - 1) }));
    }
  }, [latest]);

  // Reconcile every 30s: refreshes farms/fields/devices and self-heals the live
  // count against the authoritative server snapshot. Resets the realtime dedupe
  // sets so a session id can be re-counted after the snapshot moves past it.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      let next: NavCounts;
      try {
        next = await getNavCountsAction();
      } catch {
        return; // transient — keep the current counts rather than zeroing them
      }
      if (!alive) return;
      started.current.clear();
      ended.current.clear();
      setCounts(next);
    };
    const interval = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const navGroups: AppShellProps["navGroups"] = [
    {
      items: [
        { label: "Overview", href: "/", icon: <HomeIcon /> },
        {
          label: "Live",
          href: "/live",
          icon: <LiveIcon size={16} />,
          ...(counts.liveSessions > 0
            ? { badge: { tone: "success" as const, label: String(counts.liveSessions) } }
            : {})
        },
        { label: "Captures", href: "/captures", icon: <CameraIcon size={16} /> },
        { label: "Recordings", href: "/recordings", icon: <FilmIcon size={16} /> },
        { label: "Farms", href: "/farms", icon: <FarmIcon />, meta: String(counts.farms) },
        {
          label: "Fields",
          href: "/fields",
          icon: <GridIcon size={16} />,
          meta: String(counts.fields)
        },
        {
          label: "Devices",
          href: "/devices",
          icon: <RoverIcon size={16} />,
          meta: `${counts.devicesActive} / ${counts.devicesTotal}`
        },
        { label: "Reports", href: "/reports", icon: <ChartIcon /> }
      ]
    },
    {
      title: "Operations",
      items: [
        { label: "Today's scout list", href: "/scout-list", icon: <ChecklistIcon /> },
        { label: "Team", href: "/team", icon: <UsersIcon size={16} /> },
        { label: "Settings", href: "/settings", icon: <CogIcon /> }
      ]
    }
  ];

  return (
    <AppShell
      brand="cropautonomy"
      hasNotifications
      navGroups={navGroups}
      org={org}
      search={{ placeholder: "Search captures, fields, devices…", shortcut: "⌘K" }}
      sidebarFooter={<FleetPulse counts={counts} />}
      user={user}
    >
      {children}
    </AppShell>
  );
}

function FleetPulse({ counts }: { counts: NavCounts }) {
  if (counts.devicesTotal === 0) {
    return (
      <SidebarPulseCard
        body="No devices registered yet. Register a rover, drone, or phone to see fleet activity here."
        title="Fleet idle"
        tone="muted"
      />
    );
  }
  const maint =
    counts.devicesMaintenance > 0
      ? `, ${counts.devicesMaintenance} in maintenance`
      : "";
  return (
    <SidebarPulseCard
      body={`${counts.devicesActive} of ${counts.devicesTotal} ${
        counts.devicesTotal === 1 ? "device" : "devices"
      } active${maint}.`}
      title={counts.devicesActive > 0 ? "Fleet operational" : "Fleet quiet"}
      tone={counts.devicesActive > 0 ? "success" : "muted"}
    />
  );
}
