# 0002 — GKE co-tenancy in `agconn-prod` for v0

- **Status:** Accepted
- **Decided:** 2026-05-25

## Context

[CLAUDE.md](../../CLAUDE.md) and `docs/architecture/deployment-strategy.md` commit the portal, field PWA, API, and workers to GKE from v0 (marketing apps stay on Vercel). The open question was whether v0 should stand up a dedicated GKE cluster for CropAutonomy or co-tenant inside the existing `agconn-prod` cluster (us-west1-a) shared with the AgConnect product.

At 1–2 users (the prototype scale through August 2026), a dedicated control plane plus a minimal node pool runs ~$24–$74/mo and buys us nothing operationally — `agconn-prod` already has spare capacity on its app and spot-worker pools, plus the production fixtures we'd otherwise rebuild: nginx-ingress, cert-manager (DNS01 via Cloudflare API token in the `cert-manager` namespace), KEDA, Workload Identity Federation, and a proven kustomize + GitHub Actions deploy pattern.

`G:/code/@wizeworks/AgConnect` is the canonical reference for that pattern — its `infra/terraform`, `deploy/k8s`, and `.github/workflows` are what we copy from.

## Decision

Deploy v0 into the existing `agconn-prod` GKE cluster as a co-tenant. Locked specifics:

- **Namespace:** `cropautonomy`
- **Artifact Registry:** `us-west1-docker.pkg.dev/agconn/cropautonomy` (new AR repo in the same `agconn` GCP project)
- **TLS / DNS:** Cloudflare orange-cloud, DNS01 ACME via the existing `cloudflare-api-token` Secret in the `cert-manager` namespace. The Cloudflare API token's permission scope must be extended to include the `cropautonomy.com` zone.
- **Workloads on the cluster:** `portal-web`, `field-web` (nginx-static), `services/api`, `services/workers`.
- **Workloads off the cluster:** `cropautonomy-web` and `gaiabots-web` stay on Vercel.

Operational shape:

- Pods inherit the cluster's `restricted` Pod Security Standards: `runAsNonRoot: true`, dropped capabilities, `seccompProfile: RuntimeDefault`, no privilege escalation.
- Worker pods run on the existing spot pool with `cloud.google.com/gke-spot=true:NoSchedule` toleration.
- Portal/field/API pods run on the app pool with `pool=app:NoSchedule` toleration and `nodeSelector: { pool: app }`.
- Resource sizing for 1–2 users: portal `100m/384Mi` req · `500m/768Mi` limit; field `25m/64Mi` · `100m/128Mi`; api `50m/256Mi` · `500m/1Gi` (mirrors AgConnect's api); workers `25m/128Mi` · `200m/512Mi`.
- **No HPA on any workload.** Replicas = 1. Add HPA when sustained load actually shows up; at this scale it's cognitive overhead with no benefit.

Deliberately **not** brought over from AgConnect:

- Prisma migrate Job — we apply SQL manually to Supabase.
- KEDA `ScaledObject`s — workers are always-on pg-boss LISTEN/NOTIFY, not bursty.
- Sentry / IndexNow wiring.
- NetworkPolicy enforcement — the cluster doesn't have a policy provider enabled.

## Consequences

- ~$0/mo marginal infra cost for v0 versus standing up a second cluster.
- Cropautonomy and AgConnect share fate on cluster-wide issues (control plane upgrades, node pool outages, IAM bindings). This is acceptable while both products are pre-revenue.
- The spot worker pool is shared. If AgConnect load grows enough to evict CropAutonomy workers, that's the migration trigger.
- Cluster-wide Pod Security Standards constrain every container we ship — no `root` images, no privileged containers, no exceptions.

## Migration trigger

Move CropAutonomy to its own cluster when **either** product has real users or the spot worker pool starts evicting CropAutonomy workers under AgConnect load. Expected effort: one day of Terraform + DNS swap. Not a "rewrite," because we copied AgConnect's structure to begin with.

## Alternatives considered

- **Dedicated cluster from day one.** Rejected. Clean blast-radius isolation, but pays $24–$74/mo plus the operational tax of running a second control plane for zero users.
- **Cloud Run / serverless containers.** Rejected. Doesn't match the long-term GKE target, would mean throwing the infra away once we migrate, and doesn't host the workers (pg-boss needs a long-lived connection).
- **Stay on Vercel for the portal too.** Rejected per [CLAUDE.md](../../CLAUDE.md) and the broader hosting decision: portal-web, field-web, services/api, services/workers all run on GKE because they share the data path with future device telemetry.
