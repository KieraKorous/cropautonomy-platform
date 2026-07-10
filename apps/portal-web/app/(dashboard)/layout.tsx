import { currentUser } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

import { getMe, listNotifications } from "../../lib/api";
import { initialsFrom } from "../../lib/initials";
import { EMPTY_NAV_COUNTS, loadNavCounts } from "../../lib/nav-counts";
import { RealtimeProvider } from "../realtime-provider";
import { DashboardShell } from "./DashboardShell";

const EMPTY_NOTIFICATIONS = { notifications: [], unreadCount: 0, hasMore: false };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Name/email/avatar come straight from Clerk; the org name lives in the
  // platform DB, so /v1/me supplies it. Tolerate the API being down — fall back
  // to Clerk-only identity rather than blanking the whole shell. Nav counts seed
  // the sidebar; DashboardShell then keeps them live (realtime + 30s poll). The
  // bell seeds from the inbox and goes live over the notifications channel.
  const [clerkUser, me, navCounts, notifications] = await Promise.all([
    currentUser(),
    getMe().catch(() => null),
    loadNavCounts().catch(() => EMPTY_NAV_COUNTS),
    // The bell shows only unread — reading one clears it from the tray (the full
    // /notifications page is where history lives).
    listNotifications({ limit: 8, unread: true }).catch(() => EMPTY_NOTIFICATIONS)
  ]);

  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? me?.user.email ?? null;
  const fullName =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    me?.user.displayName ||
    "";
  const userName = clerkUser?.firstName ?? me?.user.displayName ?? "Account";
  const orgName = me?.org.name ?? "Your organization";
  const orgId = me?.orgId ?? "";
  const userId = me?.userId ?? "";

  return (
    <RealtimeProvider>
      <DashboardShell
        initialCounts={navCounts}
        initialNotifications={notifications.notifications}
        initialUnreadCount={notifications.unreadCount}
        org={{ initials: initialsFrom(orgName), name: orgName }}
        orgId={orgId}
        user={{ initials: initialsFrom(fullName, email), name: userName, href: "/profile" }}
        userId={userId}
      >
        {children}
      </DashboardShell>
    </RealtimeProvider>
  );
}
