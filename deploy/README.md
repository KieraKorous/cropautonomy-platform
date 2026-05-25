# Deploy

GKE + Artifact Registry + GitHub Actions, with Cloudflare DNS + nginx-ingress
+ cert-manager. The pipeline builds 3 images (portal, field, services), pushes
to `us-west1-docker.pkg.dev/agconn/cropautonomy/*`, then rolls out portal +
field + api + workers in the `cropautonomy` namespace of the shared
`agconn-prod` GKE cluster.

This is **co-tenancy** with [AgConnect](../../../AgConnect): same cluster,
same cluster-wide controllers (nginx-ingress, cert-manager, KEDA), separate
namespace, separate Artifact Registry repo, separate GitHub deploy SA.
Marketing apps (`cropautonomy.com`, `gaiabots.ai`) stay on Vercel and are not
part of this deploy.

## Topology

```
app.cropautonomy.com   →  Cloudflare  →  nginx-ingress  →  portal   (Next.js, app pool)
field.cropautonomy.com →  Cloudflare  →  nginx-ingress  →  field    (nginx static, app pool)
api.cropautonomy.com   →  Cloudflare  →  nginx-ingress  →  api      (Fastify, app pool)
                                                          workers   (pg-boss, spot pool)
```

All four workloads run in namespace `cropautonomy` on the existing
`agconn-prod` cluster (us-west1-a). `portal`, `field`, `api` schedule on the
shared `pool=app` taint; `workers` schedules on the shared `pool=worker` spot
taint.

Postgres + Storage + Realtime come from Supabase (managed). SQL migrations in
[`packages/db/migrations/`](../packages/db/migrations/) are applied manually
to Supabase — no migrate Job in this deploy yet.

## One-time setup

### 1. Provision the GCP-side resources via Terraform

Three additions to the AgConnect Terraform that already owns the cluster.
Copy [terraform-additions.tf](./terraform-additions.tf) → `G:/code/@wizeworks/AgConnect/infra/terraform/cropautonomy.tf`
and run `terraform apply` from the AgConnect terraform/ directory. After
apply you'll have:

- Artifact Registry repo `cropautonomy` in `us-west1` (same project `agconn`)
- Deploy service account `cropautonomy-deploy@agconn.iam.gserviceaccount.com`
- WIF binding scoped to this GitHub repository

The cluster controllers are already installed by the AgConnect bootstrap —
**no nginx-ingress / cert-manager / KEDA install needed.**

### 2. Add Cloudflare A records (manual)

cropautonomy.com lives in a different Cloudflare account than agconn.com,
so this is a manual one-time step rather than Terraform. In the cropautonomy
Cloudflare dashboard → cropautonomy.com → DNS → Records, add three A records
pointing at the shared nginx-ingress static IP (Terraform output
`shared_ingress_ip`, or `kubectl -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'`):

| Type | Name  | Content              | Proxy status        | TTL  |
|------|-------|----------------------|---------------------|------|
| A    | app   | `<ingress IP>`       | Proxied (orange)    | Auto |
| A    | field | `<ingress IP>`       | Proxied (orange)    | Auto |
| A    | api   | `<ingress IP>`       | Proxied (orange)    | Auto |

### 3. Create the cert-manager Cloudflare token + Secret (manual)

Again, cropautonomy.com is in a separate Cloudflare account, so cert-manager
needs its own API token + Secret. The Secret is referenced by the
`letsencrypt-cropautonomy` ClusterIssuer in
[`deploy/k8s/base/cluster-issuer.yaml`](./k8s/base/cluster-issuer.yaml).

1. **Create the token** in the cropautonomy Cloudflare account → My Profile
   → API Tokens → Create Token → Custom token with:
   - Permissions: `Zone — DNS — Edit`, `Zone — Zone — Read`
   - Zone Resources: Include — Specific zone — `cropautonomy.com`

2. **Create the Secret** in the cert-manager namespace (never commit the
   token):

   ```powershell
   kubectl -n cert-manager create secret generic `
     cropautonomy-cloudflare-api-token `
     --from-literal=api-token='<PASTE_TOKEN_HERE>'
   ```

3. The first deploy applies the ClusterIssuer manifest and cert-manager
   picks it up automatically. First cert issuance takes ~2 minutes (DNS01
   propagation); subsequent renewals are silent.

### 4. Set GitHub Actions secrets

Required for the deploy workflow:

| Group | Secrets |
|---|---|
| **GCP (from Terraform)** | `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT` |
| **Clerk (portal + api)** | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET` |
| **Clerk (field PWA)** | `VITE_CLERK_PUBLISHABLE_KEY` |
| **Supabase (api server-side)** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Supabase (portal + field browser)** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| **Resend (leads)** | `RESEND_API_KEY`, `LEADS_NOTIFY_TO` |
| **Postgres (workers)** | `DATABASE_URL` (Supabase pooler connection string) |
| **Mapbox (portal)** | `NEXT_PUBLIC_MAPBOX_TOKEN` |

### 5. Verify the ops email in the ClusterIssuer

[`deploy/k8s/base/cluster-issuer.yaml`](./k8s/base/cluster-issuer.yaml) uses
`ops@cropautonomy.com` for Let's Encrypt expiry notices. If that mailbox
doesn't exist yet, change it to a real address before the first deploy —
otherwise renewal failure notices go nowhere.

## Routine deploys

Every push to `main` that touches a watched path triggers
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml):

1. Authenticate to GCP via Workload Identity Federation.
2. Build all 3 images in parallel, push to Artifact Registry with the commit
   SHA + `latest`.
3. Pull cluster credentials for `agconn-prod`.
4. Apply namespace + ServiceAccount + ConfigMap.
5. Rebuild the `cropautonomy-env` Secret from GH secrets (rotation = redeploy).
6. Pin kustomize image tags to the commit SHA.
7. `kubectl apply -k deploy/k8s/overlays/prod`.
8. Wait on `portal`, `field`, `api`, `workers` rollouts to finish.

Watched paths (the `paths:` filter on the workflow): `apps/portal-web/**`,
`apps/field-web/**`, `services/api/**`, `services/workers/**`,
`services/Dockerfile`, `packages/**`, `deploy/k8s/**`,
`.github/workflows/deploy.yml`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.

## Local testing of the docker images

```bash
# Build any image to verify the Dockerfile (run from the repo root):
docker build -f apps/portal-web/Dockerfile -t cropautonomy-portal:dev .
docker build -f apps/field-web/Dockerfile -t cropautonomy-field:dev .
docker build -f services/Dockerfile         -t cropautonomy-services:dev .

# Run with envs from local .env:
docker run --rm -p 3002:3002 --env-file apps/portal-web/.env cropautonomy-portal:dev
docker run --rm -p 8080:8080 cropautonomy-field:dev
docker run --rm -p 8080:8080 --env-file services/api/.env cropautonomy-services:dev
# Workers:
docker run --rm --env-file services/workers/.env \
  --entrypoint /nodejs/bin/node cropautonomy-services:dev /app/workers/dist/index.js
```

## Rollback

```bash
kubectl -n cropautonomy rollout undo deployment/portal
kubectl -n cropautonomy rollout undo deployment/field
kubectl -n cropautonomy rollout undo deployment/api
kubectl -n cropautonomy rollout undo deployment/workers
```

Database rollback: Supabase provides automated backups. SQL migrations in
`packages/db/migrations/` are forward-only; if a migration breaks production,
write a follow-up migration that reverses it.

## What's NOT in this scaffold

- **Preview environments per PR** — would need a `preview` overlay + per-PR
  namespace + DNS automation. Trivially added when needed.
- **Staging** — `overlays/staging/` is a placeholder; see its README.
- **DB migrate Job** — cropautonomy uses raw SQL applied to Supabase manually.
  Add a one-shot Job + `psql` container when migrations grow beyond ~10.
- **KEDA ScaledObjects** — cropautonomy workers are always-on pg-boss
  LISTEN/NOTIFY consumers, not bursty. KEDA stays unused for now (already
  installed cluster-wide, costs nothing to leave dormant).
- **Sentry, IndexNow, Twilio wiring** — none integrated yet for cropautonomy.
- **NetworkPolicy enforcement** — the shared cluster doesn't have a policy
  provider (Calico/Dataplane V2) enabled, so NetworkPolicy resources are
  silently ignored. Inherit AgConnect's deferral.
- **Cluster Terraform** — not in this repo; the cluster is owned by
  [AgConnect](../../../AgConnect/infra/terraform/). When cropautonomy grows
  past co-tenancy ([memory: project-gke-hosting](#)), spin up a dedicated
  cluster in cropautonomy's own Terraform module.
