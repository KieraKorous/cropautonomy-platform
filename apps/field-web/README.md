# `apps/field-web` — Field Capture PWA

Operator-facing PWA at `field.cropautonomy.com`. Vite + React + Workbox.
Different runtime model than the rest of the workspace — see
[`docs/architecture/monorepo-strategy.md`](../../docs/architecture/monorepo-strategy.md)
and [`docs/product/field-capture-prd.md`](../../docs/product/field-capture-prd.md).

## What it does

- Operator signs in via the portal — `field.cropautonomy.com` shares the
  `.cropautonomy.com`-scoped Clerk session cookie with
  `app.cropautonomy.com` (no Clerk satellite domain involved). Then starts a
  session, captures photos / bursts / videos. Each capture is tagged with
  org / field / GPS / operator / timestamp.
- Captures save to IndexedDB **immediately** regardless of connectivity.
- An upload worker drains the queue when online: reserve a capture row via
  the portal API → upload bytes direct to Supabase Storage → finalize.
- A live session opens a WebRTC mesh — supervisors in the portal's `/live`
  surface watch the feed and see each capture appear instantly via the
  `capture.recorded` realtime event.
- HUD strip shows connectivity, GPS fix, battery, queue depth, session state.

## Local dev

```powershell
pnpm install
pnpm --filter @gaia/field-web dev    # http://field.lvh.me:5173
pnpm --filter @gaia/portal-web dev   # http://app.lvh.me:3002 (separate terminal)
```

`lvh.me` is a public DNS name that resolves to `127.0.0.1`. Using
`app.lvh.me` and `field.lvh.me` lets the Clerk session cookie set on
`.lvh.me` flow across the two ports — which is what the cross-surface SSO
hand-off requires.

You will need:

- `.env.local` in `apps/portal-web` populated per
  [`apps/portal-web/.env.example`](../portal-web/.env.example)
- `.env.local` in `apps/field-web` populated per
  [`apps/field-web/.env.example`](./.env.example)
- A Clerk app with `app.lvh.me:3002` as the primary application domain and
  `http://field.lvh.me:5173` in Authorized Origins (no satellite domain —
  see [`CLERK_SETUP.md`](../../CLERK_SETUP.md))
- A Supabase project with the migrations from `packages/db/migrations/`
  applied and a `scan-originals` bucket (see [`CAPTURES_SETUP.md`](../../CAPTURES_SETUP.md))

## Routes

- `/` — session picker (or auto-redirects to `/capture` if a session is live)
- `/capture` — full-bleed camera with overlay controls (mode, shutter, library, pause/end)
- `/map` — full-bleed Mapbox view with field boundaries, GPS dot, capture pins
- `/queue` — IndexedDB queue with retry/drop controls
- `/settings` — operator + env summary + sign-out

`/capture` and `/map` are the two primary surfaces — both use a floating
`SurfaceSwitcher` (bottom-center segmented toggle) to flip between them.

## UI posture

Camera-app style. Every page is edge-to-edge content with floating overlay
chrome — no solid header bars, no dock. `OverlayChrome` renders three pieces
absolutely positioned over the page:

- **Top-left**: status dots (connectivity, GPS, battery, queue depth).
  Dot-only by default; expand to show details only when degraded. Battery
  and queue indicators disappear entirely when healthy / empty.
- **Top-center**: session pill (Live / Paused) — only visible during an
  active session.
- **Top-right**: `AccountChip` — initials button → popover with name, email,
  Settings link, Sign out.

Two visual variants: `dark` for floating over camera/map (translucent black +
white text); `light` for sitting on the cream content surfaces (translucent
white + neutral text).

## Source layout

```
src/
├── App.tsx                       — router; signed-out users get redirected to portal sign-in
├── main.tsx                      — bootstrap; configures @gaia/realtime + ClerkProvider
├── env.ts                        — env var access (all VITE_* prefixed)
├── components/
│   ├── OverlayChrome.tsx         — floating top-left status dots + top-right AccountChip + session pill
│   ├── SurfaceSwitcher.tsx       — bottom-center camera/map segmented toggle
│   ├── AccountChip.tsx           — initials button + name/email/Settings/SignOut popover (light + dark variants)
│   └── MissingEnvScreen.tsx      — diagnostic screen when required VITE_* env is unset
├── pages/                        — SessionPicker, Capture, Map, Queue, Settings
└── lib/
    ├── db.ts                     — IndexedDB queue (idb wrapper)
    ├── api.ts                    — typed calls into services/api /v1/captures, /v1/capture-sessions, /v1/fields, /v1/realtime/publish
    ├── upload.ts                 — drain worker: reserve → PUT to Storage → finalize
    ├── session.ts                — useActiveSession hook (module-level store, survives page changes)
    ├── capture-camera.ts         — useCameraStream + captureFrame + thumbnail generation
    ├── webrtc.ts                 — useLivePublisher (mesh: one peer per portal viewer)
    ├── ice.ts                    — getIceServers() from env (STUN-only by default)
    └── hud-signals.ts            — useConnectivity, useGps, useBattery
```

## Realtime contract

All channel names + event schemas come from `@gaia/realtime`. The PWA is the
first concrete publisher of:

- `capture.session.{started,paused,resumed,ended,location}` — lifecycle
- `capture.recorded` — published the moment a capture is reserved (the
  portal Live page can show it before bytes finish uploading)
- `signal.{offer,answer,ice_candidate}` — WebRTC mesh signaling

Publishes proxy through `POST app.cropautonomy.com/api/realtime/publish`
in v0 (see [`docs/architecture/realtime-strategy.md`](../../docs/architecture/realtime-strategy.md)).
When the Clerk → Supabase JWT bridge lands, `configurePublishFromClient`
in `src/main.tsx` flips from `{ kind: "proxy" }` to
`{ kind: "supabase" }` and direct browser publishes take over without
touching the call sites.

## What's stubbed for v0

- **Resumable upload (TUS).** v0 does single-shot `PUT` to the Supabase
  Storage signed URL. The TUS implementation lives in
  `lib/upload.ts:uploadBinaryTus` and gets switched in once Storage policy
  + Clerk JWT bridge are in place.
- **Farm picker on session start.** Sessions start with GPS-only context; the
  /map view shows field boundaries fetched from `/v1/fields` for situational
  awareness, but the session-picker UI doesn't yet let the operator pre-select
  a specific field. Captures still attach via GPS; re-attribute later in the
  portal.
- **Push notifications.** Out of scope for v0 per the PRD.
- **TURN.** STUN-only by default. WebRTC live preview will fail behind
  symmetric NAT until `VITE_TURN_URL` + credentials are set.
- **Mapbox token soft-required.** If `VITE_MAPBOX_TOKEN` is unset, the /map
  view shows a "needs Mapbox token" panel; the rest of the PWA (capture,
  queue, settings) keeps working.

## Hosting

Vercel (consistent with portal v0). The build output is a fully static
SPA + service worker; CDN distribution matters for cold-load on marginal
LTE. Configure `field.cropautonomy.com` as a custom domain on the
Vercel project.
