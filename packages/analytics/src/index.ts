// @gaia/analytics — typed PostHog wrapper for the workspace.
//
//   import { capture } from "@gaia/analytics";              // event helpers (browser)
//   import { AnalyticsProvider } from "@gaia/analytics/next"; // App Router provider
//   import type { EventName } from "@gaia/analytics/events";  // contract types
//
// See docs/architecture/queueing-email-analytics.md § Analytics for the event
// catalogue and principles. events.ts is the typed source of truth for names.

export * from "./events";
export * from "./client";
