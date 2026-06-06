"use client";

// Next.js App Router analytics provider. Initializes PostHog once on mount and
// emits a semantic pageview on every client navigation. App Router does soft
// navigations (no full reload), so pageviews must be tracked off the router, not
// posthog's default load-time capture (which we disable in initAnalytics).
//
// `pageviewEvent` lets each app pick the documented name it should emit:
//   - marketing apps  → "public_page_viewed" with their LeadSource
//   - portal          → omit (no app-wide pageview event in the spec; the portal
//                        emits specific in-page events like live_page_viewed)
// Mount this in the root layout, inside any auth provider so identify() can run.

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";

import { capture, initAnalytics } from "./client";
import type { EventName, EventProperties } from "./events";

type PageviewEvent = {
  [E in EventName]: EventProperties<E> extends { path: string } ? E : never;
}[EventName];

export type AnalyticsProviderProps = {
  apiKey?: string;
  apiHost?: string;
  /** Documented pageview event to emit on navigation, e.g. "public_page_viewed". */
  pageviewEvent?: PageviewEvent;
  /** Extra static properties merged into every pageview (e.g. { source }). */
  pageviewProperties?: Record<string, unknown>;
  debug?: boolean;
  children: ReactNode;
};

export function AnalyticsProvider({
  apiKey,
  apiHost,
  pageviewEvent,
  pageviewProperties,
  debug,
  children
}: AnalyticsProviderProps) {
  useEffect(() => {
    initAnalytics({ apiKey, apiHost, debug });
  }, [apiKey, apiHost, debug]);

  return (
    <>
      {pageviewEvent ? (
        <Suspense fallback={null}>
          <PageviewTracker event={pageviewEvent} properties={pageviewProperties} />
        </Suspense>
      ) : null}
      {children}
    </>
  );
}

// useSearchParams forces a Suspense boundary in App Router; isolating the tracker
// keeps the rest of the tree out of that boundary.
function PageviewTracker({
  event,
  properties
}: {
  event: PageviewEvent;
  properties?: Record<string, unknown>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const query = searchParams?.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    // `event` is constrained to pageview events (those carrying a `path`), so the
    // merged object satisfies the registry; the cast bridges the generic boundary.
    capture(event, { path, ...properties } as never);
  }, [event, pathname, searchParams, properties]);

  return null;
}
