// Typed PostHog event registry — the single source of truth for analytics event
// names across the workspace. Names mirror docs/architecture/queueing-email-analytics.md
// § Analytics exactly. When you add an event there, add it here; `capture()` is
// typed against this map so app code can't emit an undeclared event or the wrong
// property shape.
//
// Property guidance (docs § Analytics Principles): include org context where it
// helps, but never send crop imagery, private notes, emails, or other sensitive
// payloads as properties. Keep properties to identifiers and small enums.

import type { LeadInterest, LeadSource } from "@gaia/domain";

/** Marketing-site events (cropautonomy.com, gaiabots.ai). */
export type PublicEvents = {
  public_page_viewed: { path: string; source: LeadSource };
  public_cta_clicked: { cta: string; location: string; source: LeadSource };
  lead_form_started: { source: LeadSource };
  lead_form_submitted: { source: LeadSource; interest: LeadInterest };
  lead_form_failed: { source: LeadSource; reason: "validation" | "server" | "network" };
};

/** Authenticated portal events (app.cropautonomy.com). */
export type PortalEvents = {
  portal_signed_in: { orgId?: string };
  // Creation flows below are documented but not yet wired — the portal pages are
  // ComingSoon stubs and org/farm/field/scan creation does not happen here yet.
  // They stay declared so the contract is complete and wiring later is type-safe.
  organization_created: { orgId: string };
  farm_created: { farmId: string };
  field_created: { fieldId: string };
  scan_created: { captureId: string };
  scan_analysis_requested: { captureId: string };
  scan_analysis_viewed: { captureId: string };
  device_viewed: { deviceId?: string };
  live_page_viewed: Record<string, never>;
  live_stream_opened: { sessionId: string };
  live_stream_closed: { sessionId: string; reason?: string };
};

/** Every analytics event known to the platform, keyed by name → property shape. */
export type AnalyticsEvents = PublicEvents & PortalEvents;

export type EventName = keyof AnalyticsEvents;

export type EventProperties<E extends EventName> = AnalyticsEvents[E];
