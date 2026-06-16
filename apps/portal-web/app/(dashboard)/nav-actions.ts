"use server";

import { loadNavCounts, type NavCounts } from "../../lib/nav-counts";

// Polled by DashboardShell to keep the sidebar counts fresh while the layout
// stays mounted across client navigations (layouts don't re-run on SPA nav).
export async function getNavCountsAction(): Promise<NavCounts> {
  return loadNavCounts();
}
