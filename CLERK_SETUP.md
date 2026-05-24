# Clerk setup for cross-surface SSO

Two surfaces share one Clerk identity:

- **Primary** — `app.cropautonomy.com` (`apps/portal-web`). Hosts the canonical
  `/sign-in[[...]]` and `/sign-up[[...]]` routes.
- **Satellite** — `field.cropautonomy.com` (`apps/field-web`). Redirects
  signed-out users to the primary's sign-in route, then comes back.

The session cookie is scoped to `.cropautonomy.com` so it flows to both. Local
dev uses `app.lvh.me:3002` + `field.lvh.me:5173` (cookie scoped to `.lvh.me`)
so the same handoff works without certificate gymnastics.

This file is the **one-time human setup**. Once the Clerk dashboard +
environment files match what's below, both apps just work.

---

## 1. Create a Clerk application

[dashboard.clerk.com](https://dashboard.clerk.com) → **+ Create application**.

- Name: `CropAutonomy`
- Sign-in options: pick whatever you want (email + Google is a sensible
  default). Magic-link-only is *not* recommended — we may want OAuth for
  the field PWA later.
- After creation, copy the development instance's **Publishable Key** and
  **Secret Key**. Note the **frontend API domain** under "API Keys" — it
  looks like `<slug>.accounts.dev`.

## 2. Configure satellite domain

In the Clerk dashboard for this application:

**Domains** → **Add satellite domain**.

| Stage | Primary | Satellite |
|---|---|---|
| Local dev | `app.lvh.me:3002` | `field.lvh.me:5173` |
| Production | `app.cropautonomy.com` | `field.cropautonomy.com` |

`lvh.me` is a public DNS name that always resolves to `127.0.0.1`. No
host-file edits required.

You will be prompted to confirm that the satellite shares the same Clerk
instance. Yes.

## 3. Configure paths

Under **Paths** in the dashboard:

| Setting | Value |
|---|---|
| Sign-in URL | `/sign-in` |
| Sign-up URL | `/sign-up` |
| After sign-in URL | `/` |
| After sign-up URL | `/` |
| Home URL | `/` |

These match the routes implemented at
[`apps/portal-web/app/(auth)/sign-in/[[...sign-in]]/page.tsx`](apps/portal-web/app/(auth)/sign-in/%5B%5B...sign-in%5D%5D/page.tsx)
and
[`apps/portal-web/app/(auth)/sign-up/[[...sign-up]]/page.tsx`](apps/portal-web/app/(auth)/sign-up/%5B%5B...sign-up%5D%5D/page.tsx).

## 4. Create a JWT template for Supabase

This is what makes the same Clerk session work for Supabase Realtime
subscriptions and (later) RLS-enforced queries.

**JWT templates** → **+ New template** → **Custom**.

- Template name: `supabase`
- Token lifetime: default (60s) is fine
- Signing algorithm: `RS256`
- Custom claims:
  ```json
  {
    "aud": "authenticated",
    "role": "authenticated",
    "org_id": "{{user.public_metadata.active_organization_id}}",
    "user_id": "{{user.id}}",
    "role_key": "{{user.public_metadata.active_org_role}}"
  }
  ```

The `public_metadata.active_organization_id` and `active_org_role` are
populated by the portal application — your platform sets them when an
operator switches active orgs.

In Supabase: **Authentication → JWT Settings → Third-party providers →
Add provider → Clerk**, and paste the frontend API domain
(`<slug>.accounts.dev` for dev, `clerk.cropautonomy.com` for production
after you wire the production DNS). Supabase fetches the JWKS from
`https://{domain}/.well-known/jwks.json` automatically.

> v0 note: the field PWA's realtime publishes still proxy through the
> portal API because the JWT bridge isn't required for the proxy path.
> Subscribes use the anon key with channel-name tenancy. The JWT template
> still needs to exist so the portal can mint user-scoped Supabase queries.

## 5. Configure the webhook (mirror identity into `public.users`)

**Webhooks** → **+ Add endpoint**.

- Endpoint URL:
  - Dev: tunnel `app.lvh.me:3002/api/webhooks/clerk` through ngrok / cloudflared and paste the public URL.
  - Production: `https://app.cropautonomy.com/api/webhooks/clerk`
- Events to subscribe: `user.created`, `user.updated`, `user.deleted`
- Copy the **Signing Secret**; this becomes `CLERK_WEBHOOK_SECRET`.

The handler at
[`apps/portal-web/app/api/webhooks/clerk/route.ts`](apps/portal-web/app/api/webhooks/clerk/route.ts)
upserts each user into `public.users` keyed by `clerk_user_id`. Every other
table FK-references `public.users(id)` (a uuid), never the Clerk id
directly — see [`docs/architecture/authentication-and-tenancy.md`](docs/architecture/authentication-and-tenancy.md).

## 6. Populate env files

### `apps/portal-web/.env.local`

Copy from [`.env.example`](apps/portal-web/.env.example) and fill in:

```ini
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
CLERK_FRONTEND_API_DOMAIN=<your-slug>.accounts.dev   # or clerk.cropautonomy.com in prod
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_MAPBOX_TOKEN=pk....
```

### `apps/field-web/.env.local`

Copy from [`.env.example`](apps/field-web/.env.example):

```ini
VITE_PORTAL_API_BASE=http://app.lvh.me:3002
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...            # same as portal
VITE_CLERK_SATELLITE_DOMAIN=field.lvh.me:5173
VITE_CLERK_SIGN_IN_URL=http://app.lvh.me:3002/sign-in

VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=...

VITE_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
# TURN intentionally blank; leave until a TURN provider is provisioned
VITE_TURN_URL=
VITE_TURN_USERNAME=
VITE_TURN_CREDENTIAL=
```

## 7. Verify the flow

```powershell
pnpm --filter @gaia/portal-web dev    # http://app.lvh.me:3002
pnpm --filter @gaia/field-web dev     # http://field.lvh.me:5173
```

1. Open `http://app.lvh.me:3002` — you should be redirected to `/sign-in`. Sign up.
2. Open `http://field.lvh.me:5173` in the same browser — should land you straight on the session picker, no auth prompt. That's the satellite SSO working.
3. In Supabase, check `select * from public.users` — your Clerk user should be there. If not, the webhook didn't reach the local app (check ngrok / your tunnel).
4. Start a session in the field PWA. It will POST to
   `http://app.lvh.me:3002/api/capture-sessions` and you should see a new row in `public.capture_sessions` with `status = 'live'`.

If step 4 fails with a 403, the user has no `organization_memberships` row
with the `technician` role for an active org. The platform doesn't yet have
a UI for creating that — for dev, insert one by hand against `public.organizations`,
`public.organization_memberships`, and patch `public.users.active_organization_id`.

## Production checklist (not for v0 — for when you cut the prod Clerk instance)

- [ ] Create production Clerk instance, point custom domain (`clerk.cropautonomy.com`).
- [ ] Add `app.cropautonomy.com` (primary) and `field.cropautonomy.com` (satellite).
- [ ] Update Authorized Origins: `https://app.cropautonomy.com`, `https://field.cropautonomy.com`.
- [ ] Re-issue webhook signing secret; update `CLERK_WEBHOOK_SECRET` on Vercel.
- [ ] Set production env vars on Vercel for both apps.
- [ ] Verify the Supabase third-party auth provider URL points to
      `https://clerk.cropautonomy.com/.well-known/jwks.json`.
