// Browser-side PostHog wrapper. The only place app code touches posthog-js
// directly — everything else goes through `capture()` / `identify()` so the
// event contract (events.ts) is enforced and the transport stays swappable.
//
// Every function is a safe no-op until `initAnalytics()` runs with a key. Env is
// intentionally empty in dev (NEXT_PUBLIC_POSTHOG_KEY unset), so calling
// capture() before/without init must never throw — it just drops the event.

import posthog from "posthog-js";

import type { EventName, EventProperties } from "./events";

export type InitAnalyticsOptions = {
  /** PostHog project API key (NEXT_PUBLIC_POSTHOG_KEY). Empty/undefined disables analytics. */
  apiKey?: string;
  /** PostHog ingestion host (NEXT_PUBLIC_POSTHOG_HOST). Defaults to US cloud. */
  apiHost?: string;
  /** Forwarded to posthog.init — e.g. capture_pageview overrides. */
  debug?: boolean;
};

let initialized = false;

/**
 * Initialize PostHog once. Browser-only and idempotent: safe to call from a
 * client provider on every render — subsequent calls are ignored. Returns true
 * if analytics is active (key present + in browser), false if running as a no-op.
 */
export function initAnalytics(options: InitAnalyticsOptions): boolean {
  if (typeof window === "undefined") return false;
  if (initialized) return true;
  if (!options.apiKey) return false;

  posthog.init(options.apiKey, {
    api_host: options.apiHost || "https://us.i.posthog.com",
    // We emit semantic pageviews ourselves (public_page_viewed, live_page_viewed,
    // etc.) from the provider, so disable posthog's automatic $pageview to avoid
    // double-counting. Pageleave still useful for session duration.
    capture_pageview: false,
    capture_pageleave: true,
    debug: options.debug ?? false,
    persistence: "localStorage+cookie"
  });

  initialized = true;
  return true;
}

export function isAnalyticsReady(): boolean {
  return initialized;
}

/** Type-safe event capture. No-op until initAnalytics() succeeds. */
export function capture<E extends EventName>(
  event: E,
  ...args: EventProperties<E> extends Record<string, never>
    ? []
    : [properties: EventProperties<E>]
): void {
  if (!initialized) return;
  posthog.capture(event, args[0]);
}

/**
 * Associate the current browser identity with a known user (portal sign-in).
 * `distinctId` should be the stable platform user id (Clerk user id).
 */
export function identify(distinctId: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.identify(distinctId, properties);
}

/**
 * Tag the active session with an organization group so portal events can be
 * rolled up per-tenant in PostHog. Mirrors the org-scoping that channel names
 * give @gaia/realtime.
 */
export function setOrganization(orgId: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.group("organization", orgId, properties);
}

/** Clear identity on sign-out so the next user starts a fresh distinct id. */
export function reset(): void {
  if (!initialized) return;
  posthog.reset();
}

/** Escape hatch for the rare case app code needs the raw client. Prefer the helpers above. */
export function getPosthog(): typeof posthog | null {
  return initialized ? posthog : null;
}
