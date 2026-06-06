"use client";

// Portal analytics wiring. Initializes PostHog (via @gaia/analytics) and ties the
// browser identity to the signed-in Clerk user so portal events attribute to a
// real person. Mount inside <ClerkProvider> so the Clerk hooks resolve.
//
// No app-wide pageview event: the analytics spec defines specific portal events
// (live_page_viewed, device_viewed, …) rather than a generic portal pageview, so
// AnalyticsProvider runs without `pageviewEvent`. Org grouping is intentionally
// omitted here — Clerk organizations are not the platform's source of truth for
// tenancy (see CLAUDE.md), and the platform orgId isn't surfaced to the client at
// this layer yet. Attach orgId per-event where it's already known instead.

import { capture, identify, reset } from "@gaia/analytics";
import { AnalyticsProvider } from "@gaia/analytics/next";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, type ReactNode } from "react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

export function PortalAnalyticsProvider({ children }: { children: ReactNode }) {
  return (
    <AnalyticsProvider apiKey={POSTHOG_KEY} apiHost={POSTHOG_HOST}>
      <ClerkIdentity />
      {children}
    </AnalyticsProvider>
  );
}

function ClerkIdentity() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  // Tracks who we last identified so we identify/portal_signed_in exactly once
  // per session and reset cleanly on sign-out.
  const identifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && userId) {
      if (identifiedRef.current !== userId) {
        identify(userId);
        capture("portal_signed_in", {});
        identifiedRef.current = userId;
      }
    } else if (!isSignedIn && identifiedRef.current) {
      reset();
      identifiedRef.current = null;
    }
  }, [isLoaded, isSignedIn, userId]);

  return null;
}
