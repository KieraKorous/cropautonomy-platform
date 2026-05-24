# Captures setup (Supabase Storage + DB)

The capture pipeline is fully specified in
[`docs/architecture/capture-pipeline.md`](docs/architecture/capture-pipeline.md).
This file is the one-time human setup for a fresh Supabase project.

## 1. Apply the SQL migrations

Migrations live in [`packages/db/migrations`](packages/db/migrations) and are
applied in order:

```
0001_public_leads.sql                — marketing lead capture
0002_platform_core.sql               — extensions, users, organizations, roles
0003_geography_and_devices.sql       — farms, fields, zones, crop_types, devices
0004_captures_and_analysis.sql       — captures, capture_sessions, analysis_jobs, analysis_results
0005_telemetry_notifications_audit.sql
0006_rls_policies.sql
```

For local dev: paste each into the Supabase SQL editor in order. A future
`pnpm db:migrate` script lands when pg-boss + a proper migration runner
arrive — for now the SQL editor is the deploy path.

## 2. Create the `scan-originals` storage bucket

Supabase dashboard → **Storage** → **+ New bucket**.

- Name: `scan-originals` (this name is hard-coded in
  [`apps/portal-web/lib/supabase.ts`](apps/portal-web/lib/supabase.ts) as
  `CAPTURES_BUCKET` and in the captures table default — keep it lowercase,
  with a dash).
- Public: **OFF**. All access must be via service-role-signed URLs.
- File size limit: 2 GB (matches the validation ceiling in `/api/captures`).
- Allowed MIME types: leave blank to accept everything (the API validates
  per-call).

### Bucket policies

The MVP posture is the simplest correct one: service-role does all reads
and writes; users get short-lived signed URLs per request.

**Policies → New policy → For full customization**:

```sql
-- Block any authenticated user from directly listing / reading / writing.
-- Force everything through the portal's /api/captures endpoints.
create policy "service role only on scan-originals"
  on storage.objects
  for all
  using (false)
  with check (false);
```

> The service-role key bypasses RLS, so this policy doesn't block the
> portal API — only direct browser calls.

When you later wire the Clerk → Supabase JWT bridge and want direct browser
uploads via TUS, replace the above with policies keyed on
`(storage.foldername(name))[2] = (auth.jwt() ->> 'org_id')`.

## 3. Verify the path convention

All capture paths follow `org/{orgId}/capture/{captureId}.{ext}`. The path
is set by the server in [`apps/portal-web/app/api/captures/route.ts`](apps/portal-web/app/api/captures/route.ts);
the field PWA never picks the path. This is what makes cross-tenant
access structurally impossible (the server signs URLs scoped to specific
paths, never broader prefixes).

## 4. Seed a test operator

Until the portal exposes onboarding UI, the dev workflow for getting a
real capture into the pipeline is manual:

```sql
-- 1. After your Clerk webhook fires, find your user row:
select id, clerk_user_id, email from public.users;

-- 2. Create an org + membership.
insert into public.organizations (name, slug) values ('Dev Org', 'dev-org')
returning id;
-- ^ copy the org id

insert into public.organization_memberships
  (organization_id, user_id, role_id, status)
select
  '<org-id-from-above>',
  u.id,
  r.id,
  'active'
from public.users u
cross join public.roles r
where u.clerk_user_id = '<your-clerk-user-id>'
  and r.key = 'owner';

-- 3. Set the user's active org.
update public.users
set active_organization_id = '<org-id-from-above>'
where clerk_user_id = '<your-clerk-user-id>';
```

You now have a Clerk identity + a `public.users` row + an active org + a
membership with the `owner` role. The `/api/captures` endpoint will accept
requests from this user.

## 5. Smoke test

Once everything's wired:

```powershell
pnpm --filter @gaia/portal-web dev    # http://app.lvh.me:3002
pnpm --filter @gaia/field-web dev     # http://field.lvh.me:5173
```

Open `http://field.lvh.me:5173`, sign in, tap **Start session**, then the
shutter. Expected state changes within a few seconds:

| Layer | Expected |
|---|---|
| `public.capture_sessions` | one row, `status = 'live'` |
| `public.captures` | one row, transitions `pending_upload` → `uploading` → `uploaded` → `analysis_queued` |
| `public.analysis_jobs` | one row, `status = 'queued'` |
| `scan-originals` bucket | one file at `org/{orgId}/capture/{captureId}.jpg` |
| Field PWA queue (`/queue`) | empty after sync; failed items show error inline |

If the capture sits in `pending_upload` forever, the upload worker isn't
draining — open DevTools, check `Network` for the PUT to the Supabase
Storage signed URL, and check the bucket's policies.
