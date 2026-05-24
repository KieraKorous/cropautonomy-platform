# Field Capture PRD

## Product Summary

**Field Capture** is the operator-facing field application — a focused, installable PWA used in the field to capture crop imagery, run live observation sessions, and feed everything back into the CropAutonomy platform for analysis.

It is **a separate product surface from the CropAutonomy portal**, not "the portal on a phone." The portal is for people watching operations; Field Capture is for people doing them. Different user, different posture, different runtime constraints.

Hosted at `field.cropautonomy.com`. Lives in `apps/field-web` (planned).

## Why a Separate Surface

Forcing field techs to use the full portal on a phone is the wrong product. The portal carries map layers, fleet dashboards, sidebars, multi-pane layouts — none of which belong in dust and gloves between rows of corn. A purpose-built field PWA gives:

- **Small bundle** — no Mapbox, no dashboards, no DataTables. Loads on bad LTE.
- **Offline-first** — captures queue to local storage and upload when connectivity returns. The portal is online-or-broken; the field app has to be online-optional.
- **Installable identity** — Add to Home Screen, app icon, splash screen, runs full-screen. Field worker taps an icon, sees the camera, captures, done.
- **One-handed, glove-friendly** — large tap targets, high-contrast in glare, minimal navigation.
- **Permissions UX** — camera + location + notifications asked once on first run because the app needs all of them.
- **Independent update cadence** — capture flow changes are rare and high-stakes; portal dashboard tweaks ship daily.

## Target Users

- field technicians
- scouts
- agronomists in the field
- crop managers walking fields
- anyone with the platform's `technician` role or above doing field work

The same identity (Clerk) signs into both surfaces. A manager who's also in the field uses whichever fits the task — they don't need separate accounts.

## Core Capabilities (v0)

The v0 scope is intentionally narrow but complete enough that the app is useful from day one — not a toy demo.

### Authentication and Context

- Clerk sign-in (SSO with the portal via cookie scoped to `.cropautonomy.com`)
- Pick organization (if user is in multiple)
- Pick farm and field for the current session, or auto-suggest based on GPS
- Optional crop type / zone tagging

### Capture

- **Photo capture** — single tap to capture, tagged with org / farm / field / GPS / timestamp / capturing user / crop type
- **Burst capture** — hold the capture button for rapid sequential photos (for row sampling, stand counts, etc.)
- **Video capture** — record video clips, same tagging. Resumable upload is mandatory because clips are large.

All captures are written to local storage immediately. Upload is a separate step (see Offline Queue).

### Live Preview Session

The capture-while-live workflow that makes "Field Captures that are live" real in the portal's Live page:

- Operator starts a session — emits `capture.session.started` on `org.{orgId}.capture.{sessionId}.state`
- Opens a WebRTC peer connection for the live camera feed; signaling rides on `org.{orgId}.capture.{sessionId}.signal`
- Supervisors in the portal's Live page can watch the feed, see the operator's position on the map, and see captures arrive as they happen
- Operator can pause / resume / end the session; lifecycle events publish on the same channel
- Ending the session does not delete the captures — they continue uploading durably

### Offline Queue and Resumable Upload

This is the minimum-viable behavior for actual field use — without it, the app is a toy.

- All captures saved to IndexedDB on capture, regardless of connectivity
- Upload worker drains the queue when connectivity is available
- Uploads are **resumable** — interrupted uploads pick up where they left off, not from scratch
- Failed uploads retry with exponential backoff
- Background Sync API used where supported (Chrome, Edge); polling fallback elsewhere
- User can see the queue (count + total size + current upload progress) and force a retry

### Operator HUD

A minimal status strip is always visible:

- connectivity (online / degraded / offline)
- GPS status (fix / searching / unavailable)
- battery (low warning when applicable)
- pending uploads (count + size)
- live session status (off / live / paused)

That's it. No nav menu. No tabs. The whole UI is: HUD strip on top, camera view in the middle, capture button on the bottom, queue/settings reachable via a single icon.

## Out of Scope for v0

- Viewing analysis results (use the portal)
- Editing past captures (use the portal)
- Managing farms, fields, organizations, devices (use the portal)
- Push notifications (later phase)
- Multi-device fleet awareness (this is one operator with one phone)
- Native camera APIs beyond what the web platform exposes (revisit if Capacitor wrap becomes necessary)

## Architecture

### Toolchain

**Vite + React + Workbox.** This is a deliberate exception to the Next.js consistency of the rest of the workspace. Justified because:

- A real offline-first PWA wants service worker, manifest, and asset caching as first-class concerns — Vite gives this without ceremony
- Next 16's App Router and RSC model is built around server rendering, which is the opposite of what a PWA wants
- Bundle size matters more here than anywhere else in the platform
- The field app is genuinely a different runtime model from the portal; pretending they're the same causes friction

The exception is documented in `docs/architecture/monorepo-strategy.md` so future contributors don't try to "normalize" it.

### Shared Workspace Code

Even with a different toolchain, the field PWA reuses the workspace's shared code:

- `packages/realtime` — same channel naming, same event schemas as the portal. The field app is the first concrete publisher.
- `packages/domain` — same `Capture`, `Field`, `Organization`, `Membership` types
- `packages/ui` — primitives that make sense for mobile (icons, basic tokens, perhaps a few small components). Most portal-specific components don't apply.
- Clerk integration — shared session via `.cropautonomy.com` cookie scope

### Edge Client Posture

The field PWA is the first concrete realization of the patterns in `docs/architecture/robotics-and-edge-architecture.md`:

- It publishes typed events through `packages/realtime`, not against `@supabase/supabase-js` directly. Future GAIA-R, GAIA-D firmware inherits the same contract.
- It uploads captures durably (resumable, signed); the durable record is the source of truth, the live channel is operator awareness.
- It tolerates offline and intermittent connectivity by design.
- It signs upload requests so the platform can attribute captures to a specific operator + device.

This is what makes the architecture exercise itself before we have rovers and drones: the field PWA proves the contract.

### Hosting

`field.cropautonomy.com` on Vercel or Cloudflare Pages. Static asset hosting is fine since the app is purely client-side after the initial HTML/JS/CSS load. CDN distribution matters for the cold-load case (a tech opening the app on a fresh phone in a field with marginal LTE).

## Success Criteria

- A field tech can install the PWA to their home screen, sign in once, and stay signed in
- They can pick a field and start capturing within ~10 seconds of opening the app
- Captures work with no connectivity — they queue locally and upload later without operator intervention
- A live session is watchable in the portal's Live page within ~1 second of starting
- The full first-load bundle stays under 300KB gzipped (excluding the camera/WebRTC code paths which lazy-load)
- Battery drain during an hour-long capture session is comparable to the native camera app (within ~20%)

## Phasing Notes

The field PWA is part of the August 2026 prototype scope — Field Capture is the v1 input method and it ships as this app, not as a route inside the portal. See `docs/product-roadmap.md` Phase 2.

Future phases may add:

- Push notifications (scan complete, supervisor request, alert)
- Voice notes attached to captures
- Quick-tag presets per field (pest, disease, water, weed, etc.)
- AR overlay showing recent detection locations in the current field
- Capacitor wrap for native camera + background upload APIs if web platform limits become binding
