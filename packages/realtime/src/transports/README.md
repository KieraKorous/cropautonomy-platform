# Realtime transports

The implementations below sit behind the `client/` and `server/` entrypoints.
**Application code never imports from this directory.**

## `supabase.ts`

v0 transport that speaks to Supabase Realtime broadcast channels.

- `broadcastFromClient` — direct browser publish. Requires the Supabase client
  to be authenticated with a JWT that satisfies the project's broadcast policy.
  Not used by the field PWA in v0 (see `proxy.ts`); kept here so the swap is
  a config change.
- `subscribe` — used by `useRealtimeChannel`. Subscribes with the project's
  anon key for v0; channel name structure (`org.{orgId}.…`) carries the
  tenant scoping.

## `proxy.ts`

v0 client-publish posture. The field PWA POSTs envelopes to a portal API
endpoint (`/api/realtime/publish`); the portal validates auth + schema and
re-broadcasts via the service role.

This exists because the field PWA's Clerk session isn't yet bridged into a
Supabase-authenticated client. When the JWT template + Supabase third-party
provider config land (see
`docs/architecture/authentication-and-tenancy.md § Cross-Surface SSO`), swap
`publishFromClient`'s default transport to `supabase.broadcastFromClient`.

## Future transports

When Supabase Realtime is outgrown, add `transports/telemetry.ts` (Go broker
gateway) and route channels via the per-channel-namespace map in
`client/publishFromClient.ts` and `server/publish.ts`. UI code does not change.
