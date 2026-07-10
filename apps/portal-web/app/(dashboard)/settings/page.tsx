import Link from "next/link";

import {
  ApiError,
  listDiscardedCaptures,
  listNotifications,
  type CaptureSummary
} from "../../../lib/api";
import { DiscardedCaptures } from "./DiscardedCaptures";
import { PlantNameSetting } from "./PlantNameSetting";

// First real settings surface. Organized as stacked sections so more settings
// (org, members, integrations) can be added later without restructuring.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let discarded: CaptureSummary[] = [];
  let loadError: string | null = null;

  try {
    const result = await listDiscardedCaptures();
    discarded = result.captures;
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : "Could not reach the captures service.";
  }

  // Unread badge on the Notifications link — non-fatal.
  let unreadCount = 0;
  try {
    unreadCount = (await listNotifications({ limit: 1 })).unreadCount;
  } catch {
    unreadCount = 0;
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-1.5 border-b border-base-content/10 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral">Settings</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
          Manage your organization&apos;s data and preferences.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-neutral">Notifications</h2>
          <p className="max-w-2xl text-sm text-base-content/65">
            Task completions, live requests, analysis results, and roster changes. The bell in the
            top bar shows unread alerts; the full history lives on its own page.
          </p>
        </div>
        <Link
          className="flex items-center justify-between gap-4 rounded-xl border border-base-content/10 bg-base-100 px-4 py-3.5 transition-colors hover:bg-base-content/[0.03]"
          href="/notifications"
        >
          <span className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-full bg-base-content/[0.06] text-base-content/55"
            >
              <svg
                fill="none"
                height="17"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.7"
                viewBox="0 0 24 24"
                width="17"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-medium text-neutral">View all notifications</span>
              <span className="text-xs text-base-content/55">
                {unreadCount > 0
                  ? `${unreadCount} unread`
                  : "You're all caught up"}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-2 text-base-content/40">
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-content">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            <svg
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </span>
        </Link>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-neutral">Display</h2>
          <p className="max-w-2xl text-sm text-base-content/65">
            Choose which plant name to show as the primary label across the captures list and
            detail views. Both names are always shown on a capture&apos;s detail page; this picks
            which one leads.
          </p>
        </div>
        <PlantNameSetting />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-neutral">Discarded items</h2>
          <p className="max-w-2xl text-sm text-base-content/65">
            Captures and recordings you discard are hidden from their lists but kept in storage.
            Recover them, or permanently delete them here to free up space — deletion removes the
            file and cannot be undone.
          </p>
        </div>

        {loadError ? (
          <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
            <span className="rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
              Off the grid
            </span>
            <h2 className="text-base font-semibold text-neutral">
              We&apos;ve lost the line to the field.
            </h2>
            <p className="max-w-xl text-sm text-base-content/65">
              Discarded items aren&apos;t loading right now. Refresh in a moment — if it keeps
              happening, make sure you have an active organization or try again shortly.
            </p>
            <p className="text-xs text-base-content/40">{loadError}</p>
          </section>
        ) : (
          <DiscardedCaptures captures={discarded} />
        )}
      </section>
    </div>
  );
}
