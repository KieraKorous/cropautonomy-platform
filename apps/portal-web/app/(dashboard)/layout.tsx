import { currentUser } from "@clerk/nextjs/server";
import type { ReactNode } from "react";

import { getMe } from "../../lib/api";
import { initialsFrom } from "../../lib/initials";
import { EMPTY_NAV_COUNTS, loadNavCounts } from "../../lib/nav-counts";
import { RealtimeProvider } from "../realtime-provider";
import { DashboardShell } from "./DashboardShell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Name/email/avatar come straight from Clerk; the org name lives in the
  // platform DB, so /v1/me supplies it. Tolerate the API being down — fall back
  // to Clerk-only identity rather than blanking the whole shell. Nav counts seed
  // the sidebar; DashboardShell then keeps them live (realtime + 30s poll).
  const [clerkUser, me, navCounts] = await Promise.all([
    currentUser(),
    getMe().catch(() => null),
    loadNavCounts().catch(() => EMPTY_NAV_COUNTS)
  ]);

  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? me?.user.email ?? null;
  const fullName =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    me?.user.displayName ||
    "";
  const userName = clerkUser?.firstName ?? me?.user.displayName ?? "Account";
  const orgName = me?.org.name ?? "Your organization";
  const orgId = me?.orgId ?? "";

  return (
    <RealtimeProvider>
      <DashboardShell
        initialCounts={navCounts}
        org={{ initials: initialsFrom(orgName), name: orgName }}
        orgId={orgId}
        user={{ initials: initialsFrom(fullName, email), name: userName, href: "/profile" }}
      >
        {children}
      </DashboardShell>
    </RealtimeProvider>
  );
}
