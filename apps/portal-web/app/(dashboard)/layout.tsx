import type { ReactNode } from "react";
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
  type AppShellProps
} from "@gaia/ui";

import { RealtimeProvider } from "../realtime-provider";

const navConfig: AppShellProps["navGroups"] = [
  {
    items: [
      { label: "Overview", href: "/", icon: <HomeIcon /> },
      {
        label: "Live",
        href: "/live",
        icon: <LiveIcon size={16} />,
        badge: { tone: "success", label: "5" }
      },
      { label: "Recordings", href: "/recordings", icon: <FilmIcon size={16} /> },
      { label: "Farms", href: "/farms", icon: <FarmIcon />, meta: "7" },
      { label: "Fields", href: "/fields", icon: <GridIcon size={16} />, meta: "33" },
      {
        label: "Captures",
        href: "/captures",
        icon: <CameraIcon size={16} />,
        badge: { tone: "accent", label: "3" }
      },
      { label: "Devices", href: "/devices", icon: <RoverIcon size={16} />, meta: "5 / 6" },
      { label: "Reports", href: "/reports", icon: <ChartIcon size={16} /> }
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

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      brand="cropautonomy"
      hasNotifications
      navGroups={navConfig}
      org={{ initials: "KF", name: "Korous Family Operations" }}
      search={{ placeholder: "Search captures, fields, devices…", shortcut: "⌘K" }}
      sidebarFooter={
        <SidebarPulseCard
          body="Five devices running, one in scheduled maintenance. Last telemetry 18 seconds ago."
          title="Fleet operational"
          tone="success"
        />
      }
      user={{ initials: "BK", name: "Brandon" }}
    >
      <RealtimeProvider>{children}</RealtimeProvider>
    </AppShell>
  );
}
