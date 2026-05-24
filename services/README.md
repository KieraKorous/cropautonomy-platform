# Services

Standalone backend services. See [API Architecture](../docs/architecture/api-architecture.md) for how these fit together, who calls what, and the standards every browser-facing endpoint must conform to. See [Deployment Strategy](../docs/architecture/deployment-strategy.md) for where each runs.

| Folder | Runtime | Purpose | Caller |
|---|---|---|---|
| `api/` | Fastify (Node) | Browser-facing HTTP API at `api.cropautonomy.com`. Holds the Supabase service-role credential and runs all permission checks. | portal-web, field-web, marketing apps |
| `workers/` | Node long-lived | pg-boss job consumers — analysis pipeline, email retries, Clerk webhook side-effects, scheduled work. No public ingress. | pg-boss queue (jobs enqueued by `api/`) |
| `vision/` | Python | Model inference and computer vision pipelines. Internal-only ClusterIP. | `workers/` (HTTP) |
| `telemetry/` | Go | Device ingestion at `telemetry.cropautonomy.com`. High-concurrency, devices push here directly. | Devices (GAIA-R/D/S) — not browsers |

`api/` and `workers/` share most of their dependency graph (`@gaia/db/server`, `@gaia/db/permissions`, `@gaia/domain`, `pg-boss`). In v0 they build from one Dockerfile with two entrypoints; they split when warranted.

Do not add Express services. Do not put the browser-facing API in Next.js route handlers — `apps/portal-web` is a UI runtime, not the API. See [API Architecture § Anti-patterns](../docs/architecture/api-architecture.md#anti-patterns).
