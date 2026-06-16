import { currentUser } from "@clerk/nextjs/server";
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

import { getMe } from "../../lib/api";
import { initialsFrom } from "../../lib/initials";
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

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Name/email/avatar come straight from Clerk; the org name lives in the
  // platform DB, so /v1/me supplies it. Tolerate the API being down — fall back
  // to Clerk-only identity rather than blanking the whole shell.
  const [clerkUser, me] = await Promise.all([
    currentUser(),
    getMe().catch(() => null)
  ]);

  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? me?.user.email ?? null;
  const fullName =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    me?.user.displayName ||
    "";
  const userName = clerkUser?.firstName ?? me?.user.displayName ?? "Account";
  const orgName = me?.org.name ?? "Your organization";

  return (
    <AppShell
      brand="cropautonomy"
      hasNotifications
      navGroups={navConfig}
      org={{ initials: initialsFrom(orgName), name: orgName }}
      search={{ placeholder: "Search captures, fields, devices…", shortcut: "⌘K" }}
      sidebarFooter={
        <SidebarPulseCard
          body="Five devices running, one in scheduled maintenance. Last telemetry 18 seconds ago."
          title="Fleet operational"
          tone="success"
        />
      }
      user={{ initials: initialsFrom(fullName, email), name: userName }}
    >
      <RealtimeProvider>{children}</RealtimeProvider>
    </AppShell>
  );
}
