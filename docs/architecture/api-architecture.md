# API Architecture

How browsers, server-side renderers, devices, and background workers reach platform data. This document is the parent contract for the more specific surfaces: [Authentication and Tenancy](./authentication-and-tenancy.md) describes who is on the other end of a request; [Database Schema](./database-schema.md) describes what they touch; [Realtime Strategy](./realtime-strategy.md) describes the push channel that lives alongside this pull API; [Deployment Strategy](./deployment-strategy.md) describes where each piece runs.

The standards section at the bottom — request envelope, error shape, auth header, pagination, idempotency — is normative for every endpoint on `api.cropautonomy.com`.

## Decision

**Browsers do not touch databases, mail providers, or other third-party APIs directly. Every browser data path goes:**

```
browser ─ HTTPS ─▶  services/api  ─▶  Postgres / Supabase Storage / Resend / Clerk / etc.
```

`services/api` is the single browser-facing data surface. It holds the only Supabase service-role credential in the platform, runs Clerk JWT validation once, and resolves permissions against `@gaia/db/permissions` before issuing a mutation. Next.js route handlers in `apps/portal-web` are **not** the API — portal-web is a UI runtime, full stop.

Two narrow browser-to-Supabase paths remain, both architecturally contained and explicitly documented elsewhere:

- **Realtime subscriptions** via `@gaia/realtime` (the only legal importer of the Supabase realtime SDK). See [Realtime Strategy § Anti-patterns](./realtime-strategy.md#anti-patterns-to-avoid).
- **Storage uploads/downloads** via signed URLs minted by `services/api`. The browser PUTs/TUSes to the signed URL; no Supabase SDK auth lives on the browser side. See [Capture Pipeline](./capture-pipeline.md).

Everything else — including lead capture from the marketing sites — calls `services/api`.

## Surfaces and runtimes

| Surface | Code | Runtime | Host |
|---|---|---|---|
| CropAutonomy marketing | `apps/cropautonomy-web` | Next.js | Vercel |
| GAIAbots marketing | `apps/gaiabots-web` | Next.js | Vercel |
| Portal | `apps/portal-web` | Next.js (long-lived container) | GKE — `app.cropautonomy.com` |
| Field Capture PWA | `apps/field-web` (planned) | Vite + React + Workbox | GKE — `field.cropautonomy.com` |
| **HTTP API** | `services/api` | **Fastify (long-lived container)** | **GKE — `api.cropautonomy.com`** |
| **Background workers** | `services/workers` | **Node long-lived (pg-boss consumer)** | **GKE — no public hostname** |
| Vision inference (later) | `services/vision` | Python | GKE — internal only, called by workers |
| Device telemetry ingest (later) | `services/telemetry` | Go | GKE — `telemetry.cropautonomy.com` (devices, not browsers) |

`services/api` and `services/workers` share most of the dependency graph (`@gaia/db/server`, `@gaia/db/permissions`, `@gaia/domain`, `pg-boss`). In v0 they build from one Dockerfile with two entrypoints, deploy as two GKE Deployments differing only in `command`. They split into separate images when their dep graphs meaningfully diverge.

## Why this shape

**Single credential blast radius.** The Supabase service-role key bypasses RLS. The fewer processes that hold it, the fewer audits, secret rotations, and code review surfaces are load-bearing. `services/api` and `services/workers` hold it; portal-web, field-web, and the marketing apps do not.

**Single authorization layer.** Permission checks happen in exactly one place — `@gaia/db/permissions` running inside `services/api`. If permission logic also lived in Next route handlers it would have to stay in sync by discipline. RLS exists as a defense-in-depth backstop, not as primary authorization (see [Database Schema § RLS](./database-schema.md#rls)).

**Symmetric clients.** portal-web client islands, portal-web RSC server renders, field-web, and the marketing apps all call the same base URL with the same auth header. No "internal vs external" API split, no Next-specific server actions for data, no privileged code paths that bypass the wire format. Anything you can do server-side in portal-web you can do from the field PWA, modulo permission.

**No extraction migration.** The alternative — write the API as Next route handlers, extract to a service later — costs a caller migration when extraction happens. Starting with `services/api` separate means callers code against the contract from day one. The contract is the API; the runtime is replaceable.

**Worker realities.** pg-boss requires a long-lived process holding a Postgres `LISTEN/NOTIFY` connection. That can't be serverless. Since v0 needs durable jobs (analysis pipeline, email retries, Clerk webhook side-effects), a long-lived runtime is needed anyway. Once you have one, putting the API there too is free.

## What lives in `services/api` vs elsewhere

`services/api` owns synchronous request/response work that completes within HTTP timeout budgets (target: <5s P99 for mutations, <2s for reads). Concretely:

- All CRUD against tenant data (`farms`, `fields`, `zones`, `crop_plantings`, `devices`, `captures`, `capture_sessions`, `analysis_jobs`, `analysis_results`, `notifications`, `audit_events`, `organizations`, `organization_memberships`, `organization_invitations`)
- Identity sync entrypoints: Clerk webhook receiver (verifies signature, enqueues `user.sync`)
- Permission checks via `@gaia/db/permissions`
- Storage signed URL minting (presign for capture upload, presign for download)
- Lead capture endpoints (POST from marketing sites)
- Auth context resolution from Clerk JWT
- Enqueueing pg-boss jobs

Work moves out of `services/api` when it has any of:

- Execution time that doesn't fit in a request (analysis inference, batch operations, scheduled work) → enqueue a pg-boss job; the worker does the work; the client polls or subscribes via `@gaia/realtime` for completion.
- A different runtime fit (Python ML inference → `services/vision`; high-concurrency device ingest with non-HTTP protocols or sustained connections → `services/telemetry`).
- A different consumer (device firmware posting telemetry shouldn't share a TLS terminator or rate-limit pool with the operator UI → `services/telemetry` on its own hostname).

## CORS

`services/api` allows credentialed requests from:

- `https://app.cropautonomy.com`
- `https://field.cropautonomy.com`
- `https://cropautonomy.com`
- `https://gaiabots.ai`

Plus the corresponding dev origins (`http://localhost:3000`, `:3001`, `:3002`, `http://field.localhost:5173`). The list is explicit — no wildcards — because credentialed CORS with `Access-Control-Allow-Origin: *` is invalid and because the explicit list doubles as documentation of who is allowed to call us.

`Access-Control-Allow-Credentials: true` is set so the Clerk session cookie (scoped to `.cropautonomy.com`) is sent on cross-origin requests from the authenticated surfaces. Marketing apps don't need credentials (lead capture is unauthenticated) but the same CORS handler covers them.

## Container strategy (GKE)

At ~1 user for ~1 year, runtime cost dominates and small images schedule fast on small nodes. Default discipline:

- **Multi-stage builds** with `gcr.io/distroless/nodejs22-debian12` runtime (~75MB base; full image typically ~120MB).
- **`pnpm deploy --filter=@gaia/api`** in the builder stage to produce a pruned, prod-only `node_modules`. Same for `--filter=@gaia/workers`.
- **Single Dockerfile, two entrypoints** for `services/api` + `services/workers` in v0. Two GKE Deployments differ only in `command`. Splits when warranted.
- **Next.js standalone output** (`output: 'standalone'` in `next.config.mjs`) for `portal-web` so `node_modules` is replaced with a traced subset.
- **Resource sizing**: `requests: { cpu: 100m, memory: 128Mi }`, `limits: { cpu: 500m, memory: 512Mi }`, `replicas: 1`. No HPA in v0 — autoscaling for one user is theater.
- **Shared base image** across our Node services so the distroless layer caches once in the cluster.

## Standards

The following conventions are normative for every endpoint on `api.cropautonomy.com`. Internal worker → vision/telemetry RPC may diverge; browser-facing API may not.

### URL shape

`https://api.cropautonomy.com/v1/{resource}[/{id}][/{sub-resource}]`

- `v1` is the major version prefix from day one. Breaking changes get `v2` alongside, not in-place modification.
- Resources are plural nouns: `/v1/farms`, `/v1/captures`, `/v1/organizations/{orgId}/members`.
- No verbs in URLs. Verbs are HTTP methods. Exceptional non-CRUD operations use a sub-resource: `POST /v1/captures/{id}/finalize`, `POST /v1/analysis-jobs/{id}/cancel`.

### Auth

Every authenticated request carries `Authorization: Bearer <clerk-session-token>`. `services/api` validates against Clerk's JWKS (no shared secret), resolves `users.id` from `sub` (Clerk user id), and reads `org_id` from the JWT (mirrored from `users.active_organization_id`; see [Authentication and Tenancy § JWT template](./authentication-and-tenancy.md#jwt-template-clerk--supabase)). Permission checks run via `@gaia/db/permissions` before any mutation.

Unauthenticated endpoints (lead capture, healthcheck) are explicit allowlist, not the default.

### Response envelope

Successful responses return the resource representation directly (no wrapping `{ data: ... }`):

```json
{ "id": "...", "name": "...", "createdAt": "..." }
```

Collection responses wrap items in `{ items, page }`:

```json
{
  "items": [ ... ],
  "page": { "cursor": "opaque-string", "hasMore": true }
}
```

Mutations that don't return a representation return `204 No Content`, not an empty `{}`.

### Errors

Errors return a standard shape regardless of status code:

```json
{
  "error": {
    "code": "captures.not_found",
    "message": "Capture abc-123 does not exist or is not in your organization.",
    "details": { "captureId": "abc-123" }
  }
}
```

- `code` is a stable machine-readable identifier in `resource.reason` form. Clients switch on `code`, never on `message`.
- `message` is human-readable English suitable for surfacing to a logged-in operator. Do not surface to public/marketing pages.
- `details` is optional, schema-free, useful for field-level validation errors.

Status code conventions:

| Code | Meaning |
|---|---|
| 200 | OK with body |
| 201 | Created (mutation returned the new resource) |
| 204 | OK no body |
| 400 | Client sent malformed/invalid input |
| 401 | Missing/invalid auth token |
| 403 | Authenticated but lacks permission |
| 404 | Resource doesn't exist OR isn't in the caller's org (we don't distinguish — leaks tenancy) |
| 409 | Conflict (idempotency replay with different body, version mismatch) |
| 422 | Semantic validation failure (passed schema but business rule rejected) |
| 429 | Rate-limited |
| 500 | Server error — never surface internals; log and return a request id |

### Pagination

Cursor-based, not offset-based. `?cursor=opaque-string&limit=50`. The cursor is opaque to clients — server may encode whatever it needs (PK + sort key, jsonb token, etc.). Default `limit` is 50; max is 200; over-limit clamps with a warning header.

### Idempotency

Mutating endpoints (`POST`, `PATCH`, `DELETE`) accept `Idempotency-Key: <client-generated-uuid>`. If the same key arrives twice within 24 hours, the second request returns the first response without re-executing. Different body with the same key returns `409 Conflict`. Required for capture creation, payment-adjacent mutations, and anywhere a duplicate would be visible to the operator.

### Versioning of representations

Resource representations may add fields freely (additive changes). Removing or renaming a field requires a new major version (`/v2/...`). Clients ignore unknown fields.

### Timestamps and IDs

- All timestamps are RFC 3339 with UTC offset (`2026-05-23T14:30:00Z`). No locale-specific or epoch formats.
- All ids are UUID v7 (sortable, timestamp-prefixed). Generated by `services/api` on insert, not the client.

### Field naming

`camelCase` on the wire. The Postgres schema uses `snake_case`; the serialization layer in `services/api` converts. No client-side conversion code, no mixed conventions in the same payload.

### Request size and rate

Default request body limit: 1 MB. Capture upload bytes don't pass through `services/api` — they go to Storage via signed URL, so the API only handles small JSON metadata. Default rate limit: 100 requests / minute per Clerk user id, 600 / minute per org. Overrides per endpoint where the workload justifies it.

### Health and observability

Every service exposes:

- `GET /healthz` — liveness; returns 200 if the process is up. No auth.
- `GET /readyz` — readiness; returns 200 if DB and downstream dependencies are reachable. No auth.
- `GET /v1/_meta/build` — returns `{ commit, builtAt, version }`. Authenticated. Useful for confirming a deploy reached the cluster.

Every response carries `X-Request-Id` (generated if not provided by the caller). Logs and pg-boss jobs propagate it for end-to-end tracing.

## Anti-patterns

- **Database access from `apps/portal-web` server code.** Even though Next can technically import `@gaia/db/server`, the dependency graph forbids it — `@gaia/db/server` is only consumed by `services/api` and `services/workers`. Portal RSCs fetch via `api.cropautonomy.com` like every other client.
- **Next route handlers as a permanent API surface.** A route handler exists only when the runtime is the right place for it (e.g., a Stripe webhook receiver if Vercel's edge is genuinely the right TLS terminator — and even that is preferable in `services/api`). Default answer: no route handlers.
- **"Internal" endpoints that skip auth.** All endpoints validate the Clerk JWT, including ones only the portal calls. Symmetry is the point.
- **Long-running endpoints.** Anything that might exceed 5 seconds is a pg-boss job, not a synchronous HTTP call. The client gets a job id and subscribes via `@gaia/realtime` or polls.
- **Direct browser → Supabase database client.** Reaffirming the rule in [Authentication and Tenancy § Client posture](./authentication-and-tenancy.md#client-posture-no-browser-supabase-database-client): there is no `@gaia/db/client` and there will not be one.
