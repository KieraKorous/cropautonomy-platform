# Authentication and Tenancy

## Decision

Use Clerk for authentication identity. Use CropAutonomy-owned database tables for organization membership, roles, and application authorization.

Do not use Supabase Auth.

Do not treat Clerk embedded organization objects as the source of truth for portal membership.

## Cross-Surface SSO

The CropAutonomy platform has two authenticated surfaces today and will likely have more (see [Deployment Strategy](./deployment-strategy.md)):

- `app.cropautonomy.com` — portal (Next.js)
- `field.cropautonomy.com` — Field Capture PWA (Vite + React)

A single Clerk sign-in must work across both. The user who signs in to the portal in the morning should not be prompted again when they open the field PWA in the afternoon.

**Implementation posture (shared-cookie subdomains, no Clerk satellite):**

Clerk's satellite-domain feature is paid and only required for SSO across **different root domains** (e.g. `cropautonomy.com` ↔ `gaiabots.ai`). Both surfaces here live under the same root, so the session cookie scoped to `.cropautonomy.com` is read directly by both subdomains and SSO works on the free tier.

- **Primary domain:** `app.cropautonomy.com`. The portal hosts Clerk's sign-in, sign-up, account, and password reset routes. `<ClerkProvider publishableKey={…} />` with no `isSatellite`.
- **Subdomain peer:** `field.cropautonomy.com`. The field PWA wraps its app in `<ClerkProvider publishableKey={…} signInUrl="https://app.cropautonomy.com/sign-in" />`. Same publishable key as the portal. No `isSatellite`, no `domain`. When a signed-out user opens the field PWA, the `<RedirectToSignIn />` fallback navigates to the portal's sign-in route; after auth, Clerk sets the `.cropautonomy.com` cookie and the redirect back to the PWA sees an authenticated session immediately.
- **Session cookie scope:** `.cropautonomy.com` (leading dot) so the cookie is sent to both subdomains. This is the default behavior when the Clerk Frontend API is hosted at `clerk.cropautonomy.com` for the primary domain. Marketing sites (`cropautonomy.com`, `gaiabots.ai`) do not read the cookie but it being present is harmless.
- **Clerk dashboard config:** the production instance has `app.cropautonomy.com` as the single primary application domain. Both `https://app.cropautonomy.com` and `https://field.cropautonomy.com` are added to authorized origins / CORS. The portal's `/sign-in` and `/sign-up` are the canonical auth routes. **Do not** add `field.cropautonomy.com` as a satellite — that requires extra DNS (`clerk.field.cropautonomy.com` CNAME) and Clerk's paid plan.
- **JWT bridge to Supabase:** the same Clerk JWT carries `org_id` and identity context into Supabase Realtime subscriptions and Supabase Storage signed-URL fetches (so the field PWA can publish to `org.{orgId}.…` channels and read its own storage without minting a separate session). See [§ Supabase JWT Bridge](#supabase-jwt-bridge) below for the template payload, the active-org mirroring mechanism, and the Supabase config side.
- **Local dev:** both apps run under `*.lvh.me` so the dev session cookie is scoped to `.lvh.me` and shared without certificate gymnastics — portal at `app.lvh.me:3002`, field PWA at `field.lvh.me:5173`. `lvh.me` is a public DNS name that always resolves to `127.0.0.1`.

**Sign-out posture:** signing out from either surface clears the `.cropautonomy.com`-scoped session cookie and signs the user out of the other.

**Future SSO to a different root** (e.g. shared identity with `gaiabots.ai`) is when satellite-domain mode becomes necessary. Until then we deliberately stay on the free shared-cookie path.

**What we don't ship in v0:** organization-scoped sign-in pages (the user picks org after sign-in), magic-link-only flows (we want passwordless OAuth available), and SSO/SCIM (later).

## Supabase JWT Bridge

Supabase is configured to accept Clerk-issued JWTs as the auth source (Supabase "Third Party Auth" → Clerk). The same Clerk session token works for:

- Supabase Realtime subscriptions (authenticated broadcast channels via `@gaia/realtime`)
- Supabase Storage signed URL access by the `authenticated` role
- RLS policies via `auth.jwt()` (a backstop; not the primary access control)

### Client posture: no browser Supabase database client

Browser code does **not** talk to Postgres directly. There is no `@gaia/db/client` and no anon-key Supabase database client in any app. All Postgres reads and writes go through `services/api` at `api.cropautonomy.com` — Fastify, long-lived containers on GKE — which authenticates the Clerk session, resolves permissions via `@gaia/db/permissions`, and uses `@gaia/db/server` (service role) to hit the database. See [API Architecture](./api-architecture.md) for the full architectural statement.

`apps/portal-web` is a UI runtime, not the API. Even its server-side renders (RSCs, server actions) fetch from `api.cropautonomy.com` rather than importing `@gaia/db/server` directly. The only consumers of `@gaia/db/server` are `services/api` and `services/workers`.

Two narrow exceptions ride directly on the Clerk JWT, both architecturally contained:

- **Realtime subscriptions** — `@gaia/realtime` (and only `@gaia/realtime`) imports the Supabase realtime SDK. The hook authenticates with the anon key + Clerk JWT to subscribe to `org.{orgId}.…` broadcast channels. See [Realtime Strategy § Anti-patterns](./realtime-strategy.md#anti-patterns-to-avoid).
- **Storage uploads** — the browser PUTs / TUSes file bytes to a presigned URL that `services/api` minted. No Supabase SDK auth on the browser side; the URL itself is the capability.

Why no database client: the only thing the browser would gain is bypassing one API hop. The cost is that permission logic spreads across two layers (RLS in Postgres + `@gaia/db/permissions` on the server) and stays in sync only by discipline. Funneling everything through `services/api` gives one authorization layer to audit and a clean place to log, rate-limit, and shape responses.

### JWT template (Clerk → Supabase)

A named JWT template `supabase` lives in the Clerk dashboard. The portal calls `clerk.session.getToken({ template: "supabase" })` and passes the result to the realtime transport (`@gaia/realtime` accepts a `getToken` option) and to storage signed-URL fetches.

Template payload:

```json
{
  "sub":      "{{user.id}}",
  "iss":      "{{org.frontend_api_url | default: env.CLERK_FRONTEND_API_URL}}",
  "exp":      "{{exp}}",
  "aud":      "authenticated",
  "role":     "authenticated",
  "user_id":  "{{user.public_metadata.platform_user_id}}",
  "org_id":   "{{user.public_metadata.active_org_id}}"
}
```

Claim semantics:

- `sub` — Clerk user id. Server code resolves the internal `users.id` uuid from this via `users.clerk_user_id`. The RLS helper `public.current_user_id()` does exactly this lookup.
- `user_id` — convenience copy of the internal `users.id` uuid, mirrored into Clerk public metadata when the Clerk webhook fires. Optional; `sub` plus the helper function suffices.
- `org_id` — uuid of the user's **currently-active** CropAutonomy organization. Source of truth is `public.users.active_organization_id`; mirrored into Clerk public metadata on sign-in and on every org switch.
- `role` — set to `authenticated` so Supabase treats the request with the `authenticated` Postgres role. We do **not** put our application role (`owner`/`admin`/...) here — the RLS layer is intentionally org-scoped, not role-scoped. Permission decisions are app-side, resolved against the `roles`/`permissions` tables by `@gaia/db/permissions`.

### Active-org mirroring

CropAutonomy is the source of truth for org membership; Clerk publicMetadata is a render cache for the JWT template. The contract:

1. On Clerk user creation (webhook), portal API creates the `users` row and (when applicable) joins them to their invited org. The first membership becomes the active org. Portal API then patches Clerk user metadata: `{ active_org_id, platform_user_id }`. A user who signs up **without** an invite has no membership and no active org — they land in the "blank" state (see below).
2. On org switch in the portal, portal API updates `public.users.active_organization_id`, validates the user has an active membership there, then patches Clerk user metadata with the new `active_org_id`. The client refreshes the Clerk session token; the next Supabase request carries the new `org_id` claim.
3. On membership removal, portal API revokes membership, clears `users.active_organization_id` if it pointed at that org, and patches Clerk publicMetadata to clear `active_org_id`. The next token refresh stops carrying the claim; RLS denies further reads of that org.

The field PWA does not switch orgs — it operates on whatever org the user had active when they signed in. If a tech needs a different org, they go to the portal to switch.

### Blank-org state and self-serve onboarding

A user with `active_organization_id = null` (uninvited signup, or removed from their only org) is the **blank** state. Every `requireAuth`-gated API route returns 403 `auth.no_active_org` for them, and the portal tolerates a null `getMe()` (renders the shell, panels empty). To let such a user get unblocked without an invite, the org onboarding endpoints authenticate with **`requireUser`** (a lighter auth path in `services/api/src/plugins/auth.ts` that resolves the platform user but does **not** require an active org):

- `GET /v1/me/organizations` — orgs the caller is an active member of, each flagged `isActive` (empty for a blank user).
- `POST /v1/me/active-organization` `{ orgId }` — switch active org to one the caller already belongs to (the flow in step 2 above).
- `POST /v1/organizations` `{ name }` — self-serve create: inserts the org (unique slug from the name), makes the caller **Owner**, and sets it active. Same two-sided write as an invite (DB `active_organization_id` + Clerk `active_org_id`).

The portal surfaces all three in the profile page's Organization section (`apps/portal-web/app/(dashboard)/profile/`), and the Overview shows a setup banner until the user has both an active org and a chosen avatar (uploaded photo, or an explicit "use initials" flag stored in Clerk `unsafeMetadata.useInitials`). "Join an existing org you weren't invited to" is **not** self-serve — that still goes through an admin email invite.

### Supabase configuration

In `packages/db/supabase/config.toml`:

```toml
[auth.third_party.clerk]
enabled = true
domain = "env(CLERK_FRONTEND_API_DOMAIN)"
```

Set `CLERK_FRONTEND_API_DOMAIN` to the Clerk instance's frontend API host (e.g. `clerk.cropautonomy.com` in production, `<dev-instance>.accounts.dev` locally). Supabase fetches the JWKS from `https://<domain>/.well-known/jwks.json` and validates incoming tokens against it. No shared secret is exchanged.

The `authenticated` role gets only `SELECT` via RLS on tenant data; all mutations go through portal API routes that use the service role after `@gaia/db/permissions` resolves the permission check.

## Identity vs Membership

Identity answers:

- Who is this person?
- Has this person authenticated?
- What verified email or identity provider is associated with them?

Membership answers:

- Which organizations can this person access?
- What role do they have?
- Which farms, fields, devices, or scans can they interact with?
- Who invited them?
- Is their membership active, pending, suspended, or removed?

Clerk should solve identity. CropAutonomy should solve membership.

## Initial Domain Model

Recommended entities:

- `users`
- `organizations`
- `organization_memberships`
- `organization_invitations`
- `roles`
- `permissions`
- `farms`
- `fields`
- `zones`
- `crop_types`
- `devices`
- `captures` (the unified capture record — see [Capture Pipeline](./capture-pipeline.md). Replaces the older `crop_scans` + `scan_assets` split.)
- `capture_sessions` (operator live sessions; see capture pipeline)
- `analysis_jobs`
- `analysis_results`
- `telemetry_events`
- `notifications`
- `audit_events`

## Initial Roles

- `owner`
- `admin`
- `manager`
- `technician`
- `viewer`

### Roles and Permissions Schema

Authorization uses **roles and permissions tables**, not a Postgres enum on `organization_memberships`. The schema:

- `roles` — id, key (`owner`, `admin`, `manager`, `technician`, `viewer`), name, description, `is_system` boolean, nullable `org_id` (null for the five platform-wide system roles; non-null for org-specific custom roles in a future phase)
- `permissions` — id, key (e.g. `farms.create`, `captures.delete`, `org.billing.manage`), description, optional resource grouping
- `role_permissions` — junction table linking roles to permissions
- `organization_memberships.role_id` — FK to `roles.id` (no enum column)

**Why tables over an enum:** the platform will grow beyond five roles and beyond binary role-based access. Enums are cheap to add to but expensive to refactor away from once application code branches on enum values. Starting with the relational shape gives:

- a clean path to per-org custom roles without a schema migration
- granular permission grants (e.g. a custom role that can `captures.create` but not `captures.delete`)
- a single source of truth for "what can this user do here?" instead of scattered `if role === 'manager'` checks throughout app code
- easier admin tooling (CRUD on roles/permissions) versus shipping a migration each time

For v0 only the five system roles exist and they have fixed permission sets seeded into `role_permissions` at migration time. The tables exist so granular changes are a data migration, not a schema migration.

## Tenancy Rules

- Every farm belongs to one organization.
- Every field belongs to one farm.
- Every capture belongs to one organization and should usually belong to a field.
- Every capture session belongs to one organization.
- Every device belongs to one organization.
- Every telemetry event belongs to one device and organization.
- Every realtime channel name leads with `org.{orgId}.…` so tenant scoping is structural (see [`packages/realtime` spec](./realtime-package-spec.md)).
- Every storage path leads with `org/{orgId}/…` so cross-tenant object access is structurally impossible.
- Every query that reads tenant-owned data must be scoped to organization access.

## Authorization Requirements

The app should centralize authorization checks.

Examples:

- owners can manage billing and delete organizations when that exists
- admins manage farms org-wide; any user can invite members and create teams, and fully manages what they create (see Ownership-based management below)
- managers can edit fields and assign work
- technicians can create scans, add and edit zones, and view assigned field data (but cannot create/edit/delete farms or fields)
- viewers can read data but not mutate operational records

**Members roster visibility.** `GET /v1/members` is scoped per-caller: a user sees
only the members they **personally added** (memberships whose
`invited_by_user_id` is the caller) plus **themselves**. This has **no bypass** —
it holds for every role including the owner, so no single account sees the entire
org roster from this endpoint. Attribution is set at add time: the direct-add and
reactivation paths write `invited_by_user_id = caller` inline; the emailed-invite
path threads the inviter's platform user id through the Clerk invitation's
`public_metadata.invited_by_platform_user_id`, which the Clerk webhook
([`route.ts`](../../apps/portal-web/app/api/webhooks/clerk/route.ts)) writes onto
the membership on acceptance. Team rosters are exempt: `GET /v1/teams/:id` lists
**everyone** on a team the caller can see (a caller can only open a team they
belong to — see below), so selecting a team still shows its full membership.
Note: memberships created before this rule have a null `invited_by_user_id` and
are visible only to the member themselves until re-attributed.

**Ownership-based management (members + teams).** Authorization for member and
team writes is **role-permission OR ownership** — a caller can act if they hold
the relevant permission *or* they own the resource:

- **Anyone can invite members** (`POST /v1/members/invitations`) and **create
  teams** (`POST /v1/teams`) — the invite is attributed via `invited_by_user_id`,
  the team via `created_by_user_id`.
- A caller gets **full control over what they created**, independent of base
  role: they can change role/status, remove, and manage the team memberships of
  **members they added** (`invited_by_user_id === caller`), and can
  edit/delete/roster/assign **teams they created** (`created_by_user_id ===
  caller`). Enforced in-route (`members.ts` / `teams.ts`) with `invitedByCaller` /
  `teamCreatedByCaller` / `assertTeamManageable`, and surfaced to the UI as a
  **per-resource `canManage`** on each `OrgMember` / `TeamSummary`.
- Team visibility includes **teams you created** (not just teams you're on), so a
  creator sees and can open their team even before adding themselves to it.
- **Guardrail retained:** only an owner may grant the `owner` role (via invite,
  base-role change, or team role). Assigning `admin`/`manager` is *not* gated, so
  an inviter can grant org-wide roles to their invitees — a deliberate escalation
  surface of the "full control" model; revisit if org isolation tightens.

## Teams (sub-organization access boundary)

An org can carve its entities into **teams** — a sub-org grouping that acts as a
real access boundary, not just a label. See migration
[`0026_teams.sql`](../../packages/db/migrations/0026_teams.sql) and
[`services/api/src/routes/teams.ts`](../../services/api/src/routes/teams.ts).

Model:
- **`teams`** — a named group within one org.
- **`team_memberships`** — user ↔ team, many-to-many, each carrying a **per-team
  role** (`role_id`, added in `0030`). Effective permissions are the union of the
  member's org base role and every team role they hold; the team also governs
  *which rows* they see.
- **`team_assignments`** — a single polymorphic table (`resource_type`,
  `resource_id`) linking teams to the six assignable entity types: `farm`,
  `field`, `device`, `capture_session` (Live + Recordings), `capture`, and
  `scout_task` (added in `0027`). Many-to-many and per-entity — assignment does
  **not** cascade implicitly (an explicit `cascade: 'farm_descendants'` bulk
  action is offered for convenience).

Permissions (system-role grants seeded in `0026`): `teams.read` (all roles),
`teams.assign` (manager+), `teams.create` / `teams.update` / `teams.delete` /
`team_members.manage` (admin + owner). Scout-task grants (seeded in `0027`):
`scout_tasks.read` (all roles), `scout_tasks.create` / `.update` / `.delete`
(manager + admin + owner), `scout_tasks.complete` (also technician, so a scout
can check off their own walk-out).

**Visibility rule** (canonical). A caller may see an entity row R iff **(A)** the
caller holds `team_members.manage` (admin/owner org-wide bypass), OR **(B)** R has
zero team assignments (unassigned = org-visible — makes rollout non-breaking,
since all pre-existing rows have zero assignments), OR **(C)** R shares at least
one team with the caller. Always AND-scoped by `org_id`.

**Teams themselves** are scoped by membership + ownership, with **no bypass** —
the rule holds for every role, admins and owners included. `GET /v1/teams` and
`GET /v1/teams/:id` return a team only if the caller **belongs to it** or
**created it** (`created_by_user_id`); a member cannot see or open any other team
(detail 404s rather than 403s, so team existence never leaks). There is no rule
(B) analog: a team is defined by its membership, so an "unassigned" team is just
an empty one, visible only to its creator. The detail response also carries the
**creator** (`createdBy`) and each roster member's **per-team role** for display.

Note: this differs from the entity visibility rule above, which *does* keep the
`team_members.manage` admin/owner bypass — admins still see every farm/field/
device/capture, they just don't see teams they aren't on or didn't create.

**Devices — stricter than rule (B).** The Devices registry (`GET /v1/devices`)
narrows rule (B) for `device` rows: an unassigned device is **not** org-visible;
a non-admin caller sees a device only if they **registered it**
(`registered_by_user_id`) OR it's **attached to a team they're on** (rule C
unchanged). Admins/owners keep the (A) bypass and see the whole fleet; the
`?teamId=` header filter still narrows to one team. Rationale: a paired phone is
personal kit — an operator shouldn't see everyone else's phones cluttering their
registry — whereas shared GAIA hardware is made visible to a crew by attaching it
to a team. This override lives only in the devices route, not in `team-scope.ts`
or RLS; the other entity types keep the canonical rule (B).

Enforcement is **primarily in the API query layer**
([`services/api/src/lib/team-scope.ts`](../../services/api/src/lib/team-scope.ts)),
with RLS mirroring rules (B)+(C) as the secondary net (the admin bypass lives only
in app code — the JWT carries no permission claims). Technicians self-file
captures/sessions under a team they belong to via an optional `teamId` on
`POST /v1/captures` and `POST /v1/capture-sessions`; the field PWA picks the team
at session start.

## Open Design Questions

- Will users be allowed to create organizations freely, or will early accounts be invite-only?
- ~~Will organizations support sub-teams or locations?~~ **Resolved** — teams are a
  sub-org access boundary (see *Teams* above). Locations/hierarchy below the team
  remain open.
- Will teams ever need a per-team role (e.g. a "team lead" who manages that team's
  roster without org-admin)? Deferred — `team_memberships` carries no role today.
- Will research partners need special cross-organization access?
- Will external collaborators need time-limited access to scans or reports?

