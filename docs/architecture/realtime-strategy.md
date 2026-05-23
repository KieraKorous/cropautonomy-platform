# Realtime Strategy

## Principle

Real-time is a **core platform capability**, not a feature that gets bolted on once a few surfaces need it. The portal is an operations console for autonomous agricultural intelligence — operators must see what their devices and Field Capture sessions are doing **now**, not 30 seconds ago. Every new surface (dashboard, Live page, scan progress, device fleet, mission monitor) gets designed against a live data contract from day one.

If real-time is added later, three things have to be reworked: the device protocol (devices that batch-upload every 15 min can't suddenly stream), the data model (tables built for "scan completed" events have nowhere to put "scan in progress, current frame N"), and the UI (components built around `useEffect → fetch` don't gracefully become subscriptions). Committing to it now is cheaper than retrofitting it once the first few surfaces calcify around stale data.

## The portability problem

Supabase is the right Postgres + Storage + Realtime layer for v0 — fast to ship against, integrated, free at our current scale. But Supabase Realtime is Postgres-backed pub/sub and will eventually be outgrown:

- WebSocket connection counts are bounded by plan tier
- High-frequency telemetry (per-second GPS, per-frame inference signals) is not its design center
- Cross-region / on-prem / edge-broker scenarios are out of scope for Supabase

The mitigation is **architectural**, not "pick a different vendor on day one." The transport is an implementation detail. The **event contract** and the **consumer/publisher API** are the stable interfaces. As long as those are clean, swapping Supabase Realtime for NATS, Redis Streams, Kafka, or the in-house `services/telemetry` Go broker is a service-layer change — the UI and device code don't move.

## The abstraction

A dedicated workspace package owns the realtime contract. UI code and device code import from this package; **nothing else imports `@supabase/supabase-js` realtime APIs directly**.

```
packages/realtime/
├── src/
│   ├── channels.ts       — logical channel name helpers (typed, versioned)
│   ├── events.ts         — zod-validated event schemas (versioned)
│   ├── client/
│   │   ├── useRealtimeChannel.ts   — React hook (subscribe)
│   │   └── publish.ts              — server-side publisher
│   └── transports/
│       ├── supabase.ts             — v0 transport (Supabase Realtime)
│       └── README.md               — migration notes for future transports
```

### Consumer API (UI)

```ts
const { latest, status } = useRealtimeChannel(channels.deviceHeartbeat(orgId, deviceId));
```

The hook returns the latest validated event and a connection status. UI code never touches `supabase.channel(...)` directly. The day we swap transports, the hook implementation changes; consumers don't.

### Publisher API (server / device gateway)

```ts
await publish(channels.scanProgress(orgId, scanId), {
  type: "scan.progress",
  version: 1,
  payload: { framesProcessed: 142, framesTotal: 800, detections: 3 }
});
```

Same story — devices and server jobs publish to logical channel names with typed events. The transport is hidden behind `publish`.

## Channel naming

Channels use a stable, transport-neutral naming convention that works as Supabase channel topics today and as NATS subjects, Redis pub/sub channels, or Kafka `topic+key` tomorrow:

```
org.{orgId}.device.{deviceId}.heartbeat
org.{orgId}.device.{deviceId}.telemetry
org.{orgId}.scan.{scanId}.progress
org.{orgId}.scan.{scanId}.detection
org.{orgId}.capture.{sessionId}.state
org.{orgId}.mission.{missionId}.status
```

Rules:

- Always lead with `org.{orgId}` so tenant scoping is structural, not a filter applied after the fact
- Use dot-separated segments (NATS-compatible)
- Resource type is singular (`device`, not `devices`)
- Action/concern is the last segment (`heartbeat`, `progress`, `state`) — this becomes the natural unit for transport-level fan-out
- No verbs like `update` or `change` — the channel **is** the stream of changes; events describe what kind

The channel name helpers in `channels.ts` are the only place these strings are constructed. Don't hand-write channel names in consumers — that breaks the abstraction.

## Event contracts

Every event is a typed, versioned record:

```ts
type RealtimeEvent<T extends string, P> = {
  type: T;
  version: number;
  payload: P;
  emittedAt: string;     // ISO 8601, set by publisher
};
```

Events are validated with zod at publish time and at receive time. The `version` field lets us evolve the payload without breaking older consumers — bump the version, ship the new schema, let old consumers ignore unknown versions until they're updated.

Event schemas live in `packages/realtime/src/events.ts` and are imported by both the portal and the device SDK (when that exists). A device publishing an event it can't validate against the current schema is a bug we want to catch immediately, not paper over.

## v0 transport stack

For v0, two transports cover the actual capture method (Field Capture) and the future device fleet's metadata needs:

### Supabase Realtime — for state and metadata

Carries everything that fits a "row changed" or "small JSON event" pattern:

- Device heartbeats and online/offline state
- Scan started / progress / completed / failed
- Detection events (AI flagged something interesting)
- Mission status changes
- Notification fan-out
- Capture session lifecycle

This is the bulk of what the Live page needs. It's also what the dashboard's stat cards, map device pins, and scan tables subscribe to so they stay current without polling.

### WebRTC — for Field Capture live preview

The phone running a Field Capture session is the only "device" that exists today. When an operator starts a session, the phone opens a WebRTC peer connection to the portal so other operators / supervisors can watch the live camera feed in the Live page. Signaling rides on the Supabase Realtime channel (`org.{orgId}.capture.{sessionId}.signal`); media itself is direct peer-to-peer or via a TURN server when NAT traversal fails.

This is intentionally separate from the metadata transport — media streams have wildly different bandwidth, latency, and infrastructure characteristics than JSON events. Conflating them would compromise both.

### What NOT in v0

- A standalone Go telemetry service. `services/telemetry` stays a placeholder until real rovers/drones ship. Building it now is infrastructure for devices that don't exist.
- Per-event AWS Kinesis / Kafka / NATS. Premature.
- Server-Sent Events. WebSocket via Supabase Realtime is fine; SSE adds a parallel transport with no current benefit.

## Migration path off Supabase Realtime

When Supabase Realtime becomes a bottleneck — connection count, frequency, latency, or pricing — the migration is a transport swap, not a rewrite. In order of likelihood:

1. **Stand up `services/telemetry` (Go) as the canonical event broker.** It speaks NATS or Redis Streams internally. Provides a WebSocket gateway for browsers and an HTTP/gRPC ingest endpoint for devices.
2. **Add `transports/telemetry.ts`** to `packages/realtime` implementing the same publish/subscribe API against the new broker.
3. **Flip transports per channel namespace.** High-volume telemetry channels move first; low-volume state channels can stay on Supabase Realtime until convenient. The abstraction supports per-channel transport routing.
4. **Retire Supabase Realtime** when no channel routes through it anymore.

UI components never change. Device code only changes if the wire protocol changes (e.g., HTTP → gRPC), not because the broker changed.

The Postgres database stays on Supabase regardless. This is **only** a swap of the pub/sub layer, not a database migration.

## Boundaries

Real-time, queued jobs, and request/response each have a job. Mixing them creates the kind of architecture that needs the rewrite this doc is designed to prevent.

| Concern | Mechanism | Example |
|---------|-----------|---------|
| "Tell every watching operator that X just happened" | Realtime | scan progress, device heartbeat, detection alert |
| "Run this work reliably, even if no one is watching, with retries and idempotency" | pg-boss | AI analysis job, email send, report generation |
| "I need an answer to a specific question right now" | HTTP / RPC | fetch a field, save an edit, sign in |
| "Stream raw media frames between peers" | WebRTC | Field Capture live preview |

Rule of thumb: if losing the message would silently break something (a job didn't run, an email never sent, a scan never analyzed), it belongs in pg-boss. If losing the message just means an operator sees stale data for a few seconds until the next event arrives, it belongs in Realtime.

## Anti-patterns to avoid

These are the patterns that would lock us into Supabase Realtime and force the rewrite this strategy exists to prevent:

- Importing `@supabase/supabase-js` realtime APIs in components, pages, or device code. The only legal importer is `packages/realtime/src/transports/supabase.ts`.
- Using Supabase RLS to filter realtime subscriptions. RLS-on-Realtime is a Postgres-specific feature; no other transport reproduces it. Filter at the channel naming layer (`org.{orgId}.…`) instead.
- Subscribing to raw `postgres_changes` events on application tables. That couples the realtime layer to the schema, which means every schema migration becomes a realtime breakage. Publish explicit events from server code or triggers into channels instead.
- Treating Realtime as the durable record. Events are ephemeral; the durable record is in Postgres. A consumer that misses an event recovers by re-reading state, not by replaying the channel.
- Streaming media frames through Supabase Realtime. Use WebRTC. Realtime is for JSON events.

## Operator experience expectations

When the Live page and dashboard meet the "real-time is core" bar:

- Device pins on the map update position within ~1s of a telemetry event
- A Field Capture session appears in the Live grid within ~500ms of the operator starting it
- Scan progress bars increment as detections arrive, not after the whole scan completes
- The "needs attention" panel surfaces new alerts without a refresh
- Connection status is visible — operators always know whether the data they're seeing is live or stale

These are product commitments, not stretch goals. The architecture above is what makes them achievable without painting ourselves into a corner.
