# CropAutonomy Platform

Monorepo for [cropautonomy.com](https://cropautonomy.com) (autonomous agricultural intelligence) and [gaiabots.ai](https://gaiabots.ai) (the GAIA device family). The current code is the first slice toward an August 2026 multi-tenant prototype.

**Authoritative reading order:** [`docs/project-vision.md`](docs/project-vision.md) → [`docs/product-roadmap.md`](docs/product-roadmap.md) → [`docs/architecture/architecture-overview.md`](docs/architecture/architecture-overview.md). [`CLAUDE.md`](CLAUDE.md) is the canonical engineering-conventions reference (read it once even if you're not using an AI agent — it captures decisions that won't be obvious from the code).

## Workspaces

| Workspace | Stack | Port | Purpose |
|---|---|---|---|
| [`apps/cropautonomy-web`](apps/cropautonomy-web/) | Next.js 16 / React 19 | 3000 | `cropautonomy.com` marketing landing |
| [`apps/gaiabots-web`](apps/gaiabots-web/) | Next.js 16 / React 19 | 3001 | `gaiabots.ai` marketing landing |
| [`apps/portal-web`](apps/portal-web/) | Next.js 16 / React 19 | 3002 | `app.cropautonomy.com` — authenticated operator portal |
| [`apps/field-web`](apps/field-web/) | Vite + React + Workbox | 5173 | `field.cropautonomy.com` — offline-first Field Capture PWA |
| [`services/api`](services/api/) | Fastify 5 (Node) | 8080 | `api.cropautonomy.com` — single browser-facing data surface |
| [`services/workers`](services/workers/) | pg-boss (Node) | n/a | Background jobs (analysis pipeline, etc.) |
| [`services/vision`](services/vision/) | **Python 3.12 + FastAPI** | 8080 | ML inference (cluster-internal; PlantNet today, our own models later) |
| [`packages/*`](packages/) | TypeScript libraries | n/a | `@gaia/config`, `@gaia/db`, `@gaia/domain`, `@gaia/leads`, `@gaia/realtime`, `@gaia/ui` |

Architecture: browser → `services/api` (Fastify, GKE) → Supabase Postgres. `services/vision` is reached only by `services/workers`. See [`docs/architecture/api-architecture.md`](docs/architecture/api-architecture.md) and [`docs/architecture/capture-pipeline.md`](docs/architecture/capture-pipeline.md).

## Prerequisites

- **Node.js** 22.12+ (the toolchain is pinned in `.nvmrc` / CI; any 22.x works locally)
- **pnpm 10.12.1** — `corepack enable && corepack prepare pnpm@10.12.1 --activate`
- **Python 3.12+** — required only if working on [`services/vision`](services/vision/). Check with `python --version`; if older, use the `py` launcher on Windows (`py -3.12 -m venv .venv`).
- **Supabase project** — see [Database](#database) below
- **Clerk application** — see [`CLERK_SETUP.md`](CLERK_SETUP.md)

## Quickstart

```powershell
# 1. Clone and install Node dependencies
git clone <repo>
cd cropautonomy-platform
pnpm install

# 2. Populate .env files for each workspace you'll run (see workspace READMEs).
#    The marketing apps need no env to render; the portal, field PWA, api,
#    and workers each have an .env.example to copy from.

# 3. Run the Node side
pnpm dev                       # cropautonomy + gaiabots + portal + api in parallel
```

Field PWA and Python vision service are not in `pnpm dev` because they have different runtime models. Run them separately as needed (see below).

## Common commands

```powershell
pnpm install                                  # bootstrap workspaces
pnpm dev                                      # cropautonomy + gaiabots + portal + api in parallel
pnpm dev:cropautonomy                         # cropautonomy-web only (localhost:3000)
pnpm dev:gaiabots                             # gaiabots-web only     (localhost:3001)
pnpm dev:portal                               # portal-web only       (app.lvh.me:3002)
pnpm dev:field                                # field-web only        (field.lvh.me:5173)
pnpm dev:api                                  # services/api          (localhost:8080)
pnpm dev:workers                              # services/workers      (pg-boss consumer)
pnpm build                                    # pnpm -r build
pnpm typecheck                                # pnpm -r typecheck (alias: pnpm lint)
```

Run a single workspace script with `pnpm --filter @gaia/<name> <script>` (e.g. `pnpm --filter @gaia/api typecheck`).

There is no test runner, ESLint, or formatter wired up yet. `lint` runs `tsc --noEmit` per workspace.

## Python: setting up `services/vision`

`services/vision` is the only non-Node workspace. It does not get installed by `pnpm install` — you bootstrap it with a Python virtualenv.

```powershell
cd services\vision
python -m venv .venv
.venv\Scripts\Activate.ps1                  # prompt should now start with (.venv)
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
copy .env.example .env
# fill in PLANTNET_API_KEY in .env (https://my.plantnet.org → register)

# Use `python -m uvicorn` rather than bare `uvicorn` — works even when the
# venv's Scripts directory isn't on PATH (avoids "uvicorn: term not recognized"
# in fresh PowerShell sessions).
python -m uvicorn vision.main:app --reload --port 8080
```

If `Activate.ps1` errors with execution-policy refusal, allow it once per shell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

`.venv/`, `__pycache__/`, and other Python build noise are git-ignored at the repo root.

See [`services/vision/README.md`](services/vision/README.md) for the inference contract, provider abstraction, and how to add new ML models.

## Database

Postgres + Storage + Realtime come from **Supabase**. SQL migrations live in [`packages/db/migrations/`](packages/db/migrations/) and are applied manually (or via the Supabase MCP tool from an agent). There is no migrate Job in the deploy pipeline yet.

Initial setup notes:

- [`CAPTURES_SETUP.md`](CAPTURES_SETUP.md) — capture pipeline storage bucket + RLS
- [`CLERK_SETUP.md`](CLERK_SETUP.md) — Clerk dashboard one-time config (cross-subdomain SSO at `.cropautonomy.com`)

## Pipeline: end-to-end capture → analysis flow

The analysis pipeline is wired but inert until `PLANTNET_API_KEY` is set. To run it locally end-to-end:

```powershell
# Terminal 1 — vision (Python)
cd services\vision; .venv\Scripts\Activate.ps1
python -m uvicorn vision.main:app --reload --port 8080

# Terminal 2 — workers (Node, consumes pg-boss jobs)
pnpm dev:workers

# Terminal 3 — api (Node, enqueues jobs from finalize)
pnpm dev:api

# Terminal 4 — field-web (Vite, the capture producer)
pnpm dev:field
```

Capture → `POST /v1/captures` (reserve) → direct upload to Supabase Storage → `POST /v1/captures/{id}/finalize` (enqueues `scan.analysis.requested`) → worker resolves the production pipeline from `public.pipelines` + `public.pipeline_stages`, downloads the image, POSTs `{pipeline_spec, image}` to vision `/v1/inference` → vision executes each stage in order (detection / classification / refinement / filter) and returns detections with per-stage provenance → worker writes `analysis_results` rows (each with `provenance` recording which stage produced bbox vs class label) → publishes `scan.detection` / `scan.completed` events on `org.{orgId}.scan.{scanId}.progress`.

Inference is **stage-composed and DB-defined**. Vision is a stateless executor; pipelines (`default-plant@v1` at v0, single PlantNet classification stage) are rows in `pipelines` + `pipeline_stages`. Swapping PlantNet for our own model later is a row update, not a code change. See [`services/vision/README.md`](services/vision/README.md) for the architecture and [`docs/architecture/capture-pipeline.md`](docs/architecture/capture-pipeline.md) for the full capture → analysis spec.

## Deployment

GKE + Artifact Registry + GitHub Actions. See [`deploy/README.md`](deploy/README.md) for the full topology, one-time setup (Terraform additions, Cloudflare DNS, cert-manager token), required GitHub Actions secrets, and rollback procedure.

Marketing apps (`cropautonomy.com`, `gaiabots.ai`) stay on Vercel and are not part of the GKE deploy.

## Documentation

- **Engineering conventions and project decisions:** [`CLAUDE.md`](CLAUDE.md)
- **Docs index:** [`docs/README.md`](docs/README.md)
- **Architecture:** [`docs/architecture/`](docs/architecture/)
- **Product PRDs:** [`docs/product/`](docs/product/)
- **Brand:** [`docs/brand/`](docs/brand/)
- **Deploy:** [`deploy/README.md`](deploy/README.md)
- **Vision service:** [`services/vision/README.md`](services/vision/README.md)
- **Field Capture PWA:** [`apps/field-web/README.md`](apps/field-web/README.md)

When you make decisions that affect repo structure, env vars, API boundaries, schema, auth, deployment, design tokens, brand messaging, device taxonomy, or background jobs — update the corresponding doc under [`docs/`](docs/) (this is enforced by convention, see [`CLAUDE.md`](CLAUDE.md)).

## License Scope

| Artifact | License |
|---|---|
| **Source code** (this repository) | **Apache 2.0** — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) |
| **Training data** (captures, annotations, derived training_corpus) | **Proprietary** — tenant-owned raw; platform-owned anonymized derivatives gated by `organizations.training_corpus_opt_in` |
| **Trained model weights** produced by this platform | **Proprietary** |
| **Third-party model weights** (PlantNet API, RT-DETR pretrained checkpoints, etc.) | Each per their own license — see [`NOTICE`](NOTICE) |
| **Brand assets** (logos, wordmark, marketing copy, GAIA device names) | **All rights reserved** |
| **Documentation** in [`docs/`](docs/) | All rights reserved (likely CC-BY-4.0 later) |

**ML Dependency Policy.** Every model, framework, and pretrained checkpoint on the inference or training path must be **Apache 2.0 / MIT / BSD / HPND**, no exceptions. AGPL (Ultralytics YOLOv8/v11), GPL, source-available-but-restricted, and "research-only" licenses are **prohibited for core ML**. The full policy with rationale, allowlist, and prohibited list lives in [`docs/dependency-policy.md`](docs/dependency-policy.md) — read it before adding any new ML dep.
