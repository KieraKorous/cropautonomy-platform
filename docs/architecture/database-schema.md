# Database Schema

Reference for the platform Postgres schema. The SQL itself is the source of truth — this doc explains shape, intent, and access patterns so reviewers and downstream code don't have to reconstruct them from migrations.

For the JWT bridge that powers RLS, see [Authentication and Tenancy § Supabase JWT Bridge](./authentication-and-tenancy.md#supabase-jwt-bridge). For capture-specific detail (upload protocol, lifecycle, storage paths), see [Capture Pipeline](./capture-pipeline.md). For RLS posture, see [§ RLS](#rls).

## Migration files

Migrations live in `packages/db/migrations/` (the Supabase CLI is configured to read from that directory via `packages/db/supabase/config.toml`). Files are zero-padded, applied in order:

| # | File | Purpose |
|---|------|---------|
| 0001 | `public_leads.sql` | Marketing-site lead capture (already shipped). |
| 0002 | `platform_core.sql` | Extensions, `users`, `organizations`, `roles`, `permissions`, `role_permissions`, `organization_memberships`, `organization_invitations`. Seeds the five system roles and the starter permission set. |
| 0003 | `geography_and_devices.sql` | `farms`, `fields`, `zones`, `crop_types`, `crop_plantings`, `devices`. PostGIS geography columns + GiST indexes. |
| 0004 | `captures_and_analysis.sql` | `capture_sessions`, `captures`, `analysis_jobs`, `analysis_results`. Schema for captures + sessions is copied verbatim from [Capture Pipeline](./capture-pipeline.md). |
| 0005 | `telemetry_notifications_audit.sql` | `telemetry_events`, `notifications`, `audit_events`. |
| 0006 | `rls_policies.sql` | Enables RLS on every tenant-scoped table and attaches the org-scoped read policies. |

Apply with `pnpm --filter @gaia/db db:reset` against a local Supabase stack, or `db:push` against a linked remote.

## Extensions

- `pgcrypto` — `gen_random_uuid()`
- `citext` — case-insensitive email columns (`users.email`, `organization_invitations.email`)
- `postgis` — `geography(point, 4326)`, `geography(polygon, 4326)`

`geography` is preferred over `geometry` so distance / containment math is correct on the sphere without picking a projection. Farms can span large distances; ag use cases routinely cross UTM zones.

## Entity overview

### Identity & tenancy

- **`users`** — thin mirror of Clerk identity, populated by webhook. Other tables reference `users.id` (uuid), never `clerk_user_id` (text). `active_organization_id` mirrors the value the JWT template reads from Clerk publicMetadata.
- **`organizations`** — name, slug (unique), status.
- **`roles`** — relational, NOT an enum. `is_system` flags the five seeded platform roles (`owner`/`admin`/`manager`/`technician`/`viewer`); custom org roles carry a non-null `org_id`. Partial unique indexes keep system keys globally unique and custom keys unique per-org.
- **`permissions`** — keyed by `resource.action` (e.g. `captures.delete`, `org.billing.manage`). `resource_group` is a coarse domain for admin UIs.
- **`role_permissions`** — junction.
- **`organization_memberships`** — `role_id` is an FK, not an enum column. A user can only have one membership per org in `(active, invited, suspended)`; historical `removed` rows may coexist.
- **`organization_invitations`** — token-based invites with explicit `expires_at`.

### Land model

- **`farms`** — org-scoped; `location` is a representative centroid; full street address columns.
- **`fields`** — belong to a farm; `boundary` polygon, derived `centroid`, `area_acres`.
- **`zones`** — sub-areas within a field (irrigation zone, low-yield block).
- **`crop_types`** — platform-wide reference data with optional `org_id` for custom varieties. Partial unique indexes prevent collision between platform (`org_id is null`) and org-custom rows.
- **`crop_plantings`** — "what is growing in this field right now?" The partial index on `(field_id) where status in ('planted', 'growing')` makes the dashboard query cheap.

### Devices

- **`devices`** — org-scoped; `device_family` ∈ `gaia_r` / `gaia_d` / `gaia_s` / `third_party` / `simulator`. The field PWA is **not** a device — operator phones identify via `captures.captured_by_user_id`, not the device registry.

### Captures & analysis

- **`capture_sessions`** — operator work span. The partial index on `(org_id, status) where status in ('starting', 'live', 'paused')` makes "show currently-live sessions" trivial.
- **`captures`** — the unit-of-observation record. Schema is the canonical copy of [Capture Pipeline](./capture-pipeline.md). Forward FK to `analysis_jobs` is added at the bottom of `0004` to break the cycle.
- **`analysis_jobs`** — one job per capture. Unique index restricts a single in-flight job per capture; historical jobs are unconstrained so re-analysis is possible.
- **`analysis_results`** — **one row per detection** (decision: high-cardinality relational shape, not jsonb array). Reasoning: the primary read pattern is "all `<category>` detections in this field this season" — a relational filter, not a jsonb unnest. Per-detection rows also give us stable ids that realtime detection events can reference.

### Telemetry, notifications, audit

- **`telemetry_events`** — append-first. `recorded_at` (device clock) and `ingested_at` (server clock) are split because device clocks drift and offline replay is real. Indexes target the live device-detail and org-wide health views; historical analytics go to a downstream store later.
- **`notifications`** — per-user inbox with partial index on the unread window.
- **`audit_events`** — write-once compliance log; `resource_id` is `text` so non-uuid resources (storage paths, external ids) fit.

## Indexing discipline

We follow the partial-index pattern shown in `capture-pipeline.md`: index hot states, not the entire table. Examples:

- `captures_status_idx` covers `(pending_upload, uploading, analysis_queued, analysis_running)` only — the always-bounded working set.
- `analysis_jobs_org_status_idx` covers `(queued, running)` only.
- `notifications_user_unread_idx` covers `where read_at is null and dismissed_at is null`.
- `devices_org_active_idx` and `crop_plantings_field_active_idx` similarly.

This keeps indexes small even as historical row counts grow.

GiST indexes on every geography column are added preemptively — they are cheap to maintain, and the Live page's map view needs spatial queries from day one. Adding them later under production load is operationally awkward.

## RLS

Posture: **belt-and-suspenders**. Application code (running with the service role) remains the primary authorization layer. Permission checks happen against the `roles`/`permissions` tables via `@gaia/db/permissions`. RLS exists to catch the case where app code forgets to scope a query.

Mechanics:

- Every tenant-scoped table has RLS enabled with default deny.
- `service_role` gets `using (true)` on everything (it already bypasses RLS as a superuser; the explicit policy is defense in depth).
- `authenticated` gets **`SELECT` only** scoped to `auth.jwt() ->> 'org_id' = org_id::text` via the `public.current_org_id()` helper.
- No `INSERT`/`UPDATE`/`DELETE` policies are granted to `authenticated`. All mutations route through server code with the service role after permission checks.
- User-scoped tables (`notifications`) additionally check `user_id = public.current_user_id()`, which resolves `users.clerk_user_id = auth.jwt() ->> 'sub'`.

Realtime: **no `postgres_changes` subscriptions** are enabled and no RLS policies grant them. All realtime traffic uses broadcast channels published from server code; tenant scoping is structural via channel naming (`org.{orgId}.…`). See [Realtime Strategy § Anti-patterns](./realtime-strategy.md#anti-patterns-to-avoid).

## Permission set (seeded)

| Role | Grants |
|------|--------|
| `owner` | Every seeded permission. |
| `admin` | Everything except `org.delete` and `org.billing.manage`. |
| `manager` | `org.read`, `members.read`, `roles.read`; create/update on `farms`/`fields`/`zones`/`crop_types`/`crop_plantings`; read on `devices`/`telemetry`; full `captures`/`capture_sessions`/`analysis` ops; `notifications.read` + `manage`. No member or device administration. |
| `technician` | Read across operational data; create/update `captures` and `capture_sessions`; `analysis.request` + `analysis.read`; `notifications.read`. No deletes, no member or device administration. |
| `viewer` | Read-only across operational data. No mutation, invite, or admin. |

App code must check permissions, not roles:

```ts
await permissions.requirePermission({ userId, orgId }, "captures.delete");
// not
if (membership.role === "admin") { ... }
```

Custom org roles (future) are why the schema is relational. The cost of changing a role's permission grants is a data migration, not a schema migration.

## Client posture

The browser does not get a Supabase database client. All Postgres reads and writes from app code go through portal API routes that use `@gaia/db/server` (service role) after running permission checks against `@gaia/db/permissions`. See [Authentication and Tenancy § Client posture](./authentication-and-tenancy.md#client-posture-no-browser-supabase-database-client) for the full rationale.

The browser does still talk to Supabase for two narrow purposes, both routed through the architecturally-permitted package boundary:

- Realtime broadcast subscriptions via `@gaia/realtime` (the only legal importer of the Supabase realtime SDK).
- Storage uploads/downloads via signed URLs minted by portal API.

This is why the package exports are `@gaia/db/server`, `@gaia/db/permissions`, and `@gaia/db/types` — no `@gaia/db/client`.

## pg-boss

pg-boss installs into the same Postgres database under its own `pgboss` schema. The library creates the schema on first run; no migration is required from us. See [Queueing § pg-boss installation](./queueing-email-analytics.md#pg-boss-installation) for the operational note.

## Generated types

```bash
pnpm --filter @gaia/db db:start
pnpm --filter @gaia/db types:generate
```

writes `packages/db/src/types/database.ts`. Consumers import it via `@gaia/db/types`. The committed file is a placeholder until the local stack runs once.
