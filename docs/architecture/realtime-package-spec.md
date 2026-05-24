# `packages/realtime` Spec

This document specifies the **concrete API contract** for `packages/realtime`. It is the source of truth that the portal, the field PWA, and any future device SDK code against.

For the principles, transport abstraction reasoning, and migration strategy, see [Realtime Strategy](./realtime-strategy.md). This doc is the API — what functions exist, what events are typed, what channel names get constructed.

## Status

`packages/realtime` is **not yet implemented**. This spec is the binding contract that the first implementer must satisfy. If you're writing the first consumer (the portal Live page, or the field PWA capture session), either:

1. **Build the package** against this spec as part of your work, or
2. **Stub it** behind the documented API so your code already imports from `@gaia/realtime` and the stub gets replaced later

**Do not** call `@supabase/supabase-js` realtime APIs directly from application code. That's the anti-pattern the abstraction exists to prevent (see [Realtime Strategy § Anti-patterns](./realtime-strategy.md#anti-patterns-to-avoid)).

## Package shape

```
packages/realtime/
├── package.json                      — "@gaia/realtime"
├── src/
│   ├── index.ts                      — re-exports
│   ├── channels.ts                   — channel name helpers (typed)
│   ├── events.ts                     — zod event schemas + types
│   ├── client/
│   │   ├── useRealtimeChannel.ts     — React hook (subscribe)
│   │   └── publishFromClient.ts      — client-side publish (rare; mostly devices/PWA)
│   ├── server/
│   │   └── publish.ts                — server-side publish (server actions, workers)
│   └── transports/
│       └── supabase.ts               — v0 transport implementation
```

Both Vite (field PWA) and Next.js (portal, future workers) consume the same package. Build output must be ESM. No Next-specific primitives in any path the field PWA pulls in.

## Channel name helpers

All channel names are constructed by helper functions in `channels.ts`. **Do not hand-write channel name strings in consumers.** That breaks the abstraction and makes the future transport swap painful.

```ts
// channels.ts

export const channels = {
  // Device channels
  deviceHeartbeat: (orgId: string, deviceId: string) =>
    `org.${orgId}.device.${deviceId}.heartbeat`,
  deviceTelemetry: (orgId: string, deviceId: string) =>
    `org.${orgId}.device.${deviceId}.telemetry`,

  // Scan channels (one in-flight analysis job)
  scanProgress: (orgId: string, scanId: string) =>
    `org.${orgId}.scan.${scanId}.progress`,
  scanDetection: (orgId: string, scanId: string) =>
    `org.${orgId}.scan.${scanId}.detection`,

  // Capture session channels (live field operator session)
  captureSessionState: (orgId: string, sessionId: string) =>
    `org.${orgId}.capture.${sessionId}.state`,
  captureSessionSignal: (orgId: string, sessionId: string) =>
    `org.${orgId}.capture.${sessionId}.signal`,

  // Org-wide fanout channels
  orgNotifications: (orgId: string) =>
    `org.${orgId}.notifications`,
  orgActiveSessions: (orgId: string) =>
    `org.${orgId}.capture.active`  // index of currently-live sessions
} as const;
```

Naming rules (already documented in the strategy doc, restated here as enforcement):

- Always lead with `org.{orgId}` — tenant scoping is structural
- Dot-separated segments (NATS-compatible)
- Singular resource type (`device`, not `devices`)
- Action/concern is the last segment

## Event envelope

Every event carries the same envelope. Validated with zod at publish and at receive.

```ts
// events.ts

export type RealtimeEventEnvelope<T extends string, P> = {
  type: T;
  version: number;        // bump when payload schema changes incompatibly
  payload: P;
  emittedAt: string;      // ISO 8601, set by publisher
  emittedBy?: string;     // optional clerk user id or device id
};
```

## v0 event catalog

These are the events that need to exist for portal Live page + field PWA v0 to function. Adding new event types is fine; **changing the payload shape of an existing version is not** — bump the version instead.

### Capture session lifecycle (`captureSessionState` channel)

Published by the field PWA. Consumed by the portal's Live page.

```ts
{ type: "capture.session.started", version: 1, payload: {
    sessionId: string;
    orgId: string;
    operatorUserId: string;     // clerk user id
    farmId?: string;            // resolved at session start
    fieldId?: string;
    cropTypeId?: string;
    startedAt: string;          // ISO 8601
    initialLocation?: { lat: number; lng: number; accuracyMeters?: number };
    plannedDurationMinutes?: number;
}}

{ type: "capture.session.location", version: 1, payload: {
    sessionId: string;
    location: { lat: number; lng: number; accuracyMeters?: number };
    headingDegrees?: number;
    speedMps?: number;
    at: string;
}}  // emit at most ~1Hz; throttle on the publisher

{ type: "capture.session.paused", version: 1, payload: {
    sessionId: string;
    pausedAt: string;
    reason?: "operator" | "low_battery" | "connectivity_lost" | "other";
}}

{ type: "capture.session.resumed", version: 1, payload: {
    sessionId: string;
    resumedAt: string;
}}

{ type: "capture.session.ended", version: 1, payload: {
    sessionId: string;
    endedAt: string;
    totalCaptures: number;
    reason: "operator" | "battery_critical" | "error";
}}

{ type: "capture.recorded", version: 1, payload: {
    sessionId: string;
    captureId: string;          // the captures.id this resolves to
    mediaType: "photo" | "burst_frame" | "video";
    capturedAt: string;
    location?: { lat: number; lng: number; accuracyMeters?: number };
    thumbnailDataUrl?: string;  // optional small (<10KB) preview for instant portal display
}}
```

### WebRTC signaling (`captureSessionSignal` channel)

The signaling layer for the live camera peer. Publisher = field PWA; viewers = portal Live page sessions watching the feed. Both publish and subscribe on the same channel; recipients filter by `to`.

```ts
{ type: "signal.viewer.join", version: 1, payload: {
    viewerId: string;           // ephemeral id generated by viewer
    viewerUserId: string;       // clerk user id of the watcher
    joinedAt: string;
}}

{ type: "signal.viewer.leave", version: 1, payload: {
    viewerId: string;
    leftAt: string;
}}

{ type: "signal.offer", version: 1, payload: {
    from: string;               // publisher session id or viewer id
    to: string;                 // target viewer id or publisher session id
    sdp: string;                // SDP offer
}}

{ type: "signal.answer", version: 1, payload: {
    from: string;
    to: string;
    sdp: string;                // SDP answer
}}

{ type: "signal.ice_candidate", version: 1, payload: {
    from: string;
    to: string;
    candidate: RTCIceCandidateInit;
}}

{ type: "signal.publisher.terminate", version: 1, payload: {
    reason: "session_ended" | "error" | "operator";
}}
```

Topology for v0: **one publisher (the PWA), N viewers (portal users)**. The publisher creates a separate peer connection per viewer (mesh). When the viewer count grows past a handful, swap in an SFU — but that's a transport-side change, not a signaling protocol change.

### Scan analysis progress (`scanProgress` / `scanDetection` channels)

Published by the analysis worker (pg-boss job). Consumed by the portal scan detail view and Live page.

```ts
{ type: "scan.started", version: 1, payload: {
    scanId: string;
    captureId: string;
    startedAt: string;
}}

{ type: "scan.progress", version: 1, payload: {
    scanId: string;
    framesProcessed: number;
    framesTotal: number;
    percentComplete: number;    // redundant but cheap; clients prefer this
}}

{ type: "scan.detection", version: 1, payload: {
    scanId: string;
    detectionId: string;
    category: string;           // e.g., "tar_spot", "volunteer_corn", "stress_zone"
    confidence: number;         // 0..1
    location?: { lat: number; lng: number };
    thumbnailUrl?: string;
}}

{ type: "scan.completed", version: 1, payload: {
    scanId: string;
    completedAt: string;
    detectionCount: number;
    durationMs: number;
}}

{ type: "scan.failed", version: 1, payload: {
    scanId: string;
    failedAt: string;
    error: string;
    retryable: boolean;
}}
```

### Device heartbeat / telemetry

Not needed for v0 (no devices yet). Schemas land alongside the first device. Channel helpers are already exported so the surfaces are ready.

## Consumer API

### React hook (`useRealtimeChannel`)

```ts
import { useRealtimeChannel } from "@gaia/realtime/client";
import { channels } from "@gaia/realtime/channels";

const { latest, history, status } = useRealtimeChannel(
  channels.captureSessionState(orgId, sessionId),
  { historyLimit: 50 }  // optional; default 1
);

// latest: the most recent validated event, or null
// history: array of recent events (newest first), bounded by historyLimit
// status: "connecting" | "connected" | "reconnecting" | "disconnected" | "error"
```

The hook handles subscribe/unsubscribe on mount/unmount, automatic reconnect, and zod validation on every received event. Invalid events are logged and dropped (do not crash the consumer).

### Server-side publish

```ts
import { publish } from "@gaia/realtime/server";
import { channels } from "@gaia/realtime/channels";

await publish(channels.scanProgress(orgId, scanId), {
  type: "scan.progress",
  version: 1,
  payload: { scanId, framesProcessed: 142, framesTotal: 800, percentComplete: 17.75 }
});
```

`publish` validates the event against the registered zod schema for `type+version` before sending. Throws on invalid events — devices and workers publishing bad data should fail loud, not silently.

### Client-side publish (field PWA, future device JS SDKs)

```ts
import { publishFromClient } from "@gaia/realtime/client";

await publishFromClient(channels.captureSessionState(orgId, sessionId), {
  type: "capture.session.location",
  version: 1,
  payload: { sessionId, location: { lat, lng, accuracyMeters }, at: new Date().toISOString() }
});
```

Same validation. Note that Supabase Realtime requires authenticated clients to broadcast — the field PWA's Clerk session must be wired into the Supabase client (see [Authentication and Tenancy](./authentication-and-tenancy.md) for the JWT bridge).

## v0 transport implementation notes

The first implementation lives in `src/transports/supabase.ts` and uses Supabase Realtime broadcast channels.

- One Supabase `channel(name)` per logical channel name
- Events go through `channel.send({ type: 'broadcast', event: envelope.type, payload: envelope })`
- Subscribers listen via `channel.on('broadcast', { event: '*' }, ...)` and re-validate with zod
- Reconnect handled by the Supabase client; the hook surfaces status

Do **not** use `channel.on('postgres_changes', ...)` for anything. That's the schema-coupling anti-pattern called out in the strategy doc.

## Versioning policy

- Adding a new `type` is non-breaking. Add it.
- Adding an optional field to an existing payload is non-breaking. Same version.
- Removing a field, changing a field's type, or making an optional field required is breaking. **Bump the version**, register both schemas, support both during the transition.
- Publishers always emit the latest version. Consumers should accept any version they have a schema for and fall back gracefully on unknown versions (log + drop).

## What this spec doesn't cover yet

- Authorization at the transport level (who can subscribe to which org's channels). For v0, rely on the fact that Supabase Realtime requires an authenticated client with a JWT containing the org context; channel name structure makes tenant filtering trivial. When the transport changes, the same JWT context can be passed to the new broker.
- Replay / catch-up after a viewer reconnects. Realtime events are ephemeral; for state recovery, the consumer should re-read the durable record (Postgres) on reconnect. This is intentional — see [Realtime Strategy § Anti-patterns](./realtime-strategy.md#anti-patterns-to-avoid).
- Per-channel transport routing (the eventual hybrid where some channels go through the Go telemetry broker and some stay on Supabase). Land when needed.
