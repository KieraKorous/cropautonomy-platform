# 0005 — Local, rule-based plant analysis alongside the server AI pipeline

- **Status:** Accepted
- **Decided:** 2026-07-23

## Context

The platform's committed analysis path is server-side and AI-driven: capture →
pg-boss → `services/vision` (RT-DETR + PlantNet + a Claude `agronomic_summary`
stage) → `analysis_results` in Supabase Postgres → human confirm-loop → model
training flywheel (ADR [0003](./0003-ml-phase2-strategy.md);
`docs/architecture/capture-analysis-intelligence.md`). It is powerful but has
recurring API cost, requires connectivity, and is intentionally "dumb
capture-only" on the device — no classification in the field.

`plant_analysis_database_prd.md` asks for a different thing: a transparent,
**affordable, offline, non-AI** way to record plant observations and get
explainable health results, running entirely in the browser. It is framed as an
alternative to paid AI services, not a replacement for the vision pipeline. This
is a real fork in approach (local vs. server, deterministic rules vs. learned
models, IndexedDB vs. Postgres), so it warrants a record.

## Decision

Build the rule-based plant analysis system as a **standalone, browser-local
module** — new package `@gaia/plant-analysis` — that does **not** integrate with
the server AI pipeline in v0.

- **Storage:** IndexedDB via **Dexie** (per PRD §11.1), DB `gaia-plant-analysis`.
  This is the first Dexie usage in the repo; the existing `idb` usage in
  `apps/field-web` is a transient upload queue and stays as-is.
- **Analysis:** a deterministic rule engine over crop-profile thresholds. No
  model inference, no `ANTHROPIC_API_KEY`, no network call to analyze.
- **Boundary:** the package touches **no** Supabase, `services/api`,
  `services/vision`, or the `captures` / `analysis_results` schema. It is a
  parallel, self-contained data world (fields / plants / observations / rules /
  findings) that persists locally and exports/imports as JSON.
- **Placement:** framework-agnostic core in `packages/plant-analysis` (honoring
  PRD §7.6 module separation); UI mounts in the portal alongside the Virtual
  Field. The browser-only Dexie layer loads via `dynamic(ssr:false)`.
- **Provenance for the future:** findings snapshot the rule version that produced
  them, and rules carry a `provisional` flag, so if these ever feed the server
  corpus they arrive clearly labeled as rule-derived, not model- or
  human-confirmed.

## Consequences

- **Buys:** a zero-recurring-cost, offline, fully explainable analysis path;
  fast iteration with no server round-trip; a clean teaching/prototype surface.
- **Costs:** a second "plant" data world that does not sync to Postgres — the
  documented posture is "Postgres is the durable record, local is ephemeral"
  (`docs/architecture/data-and-storage-strategy.md`), and this deliberately keeps
  a durable local store. Backup/restore (PRD Phase 13) is therefore load-bearing,
  not optional. Device-specific data loss is a real risk mitigated only by export.
- **Constrains downstream:** if we later want these observations in the platform
  proper, we need an explicit import mapping into `captures` /
  `analysis_results` — it will not happen for free. Rule thresholds are agronomic
  claims and must carry sources or a `provisional` label (PRD §16, §7.7).
- The Dexie schema is **additive-only** once shipped (see
  `packages/plant-analysis/src/database/schema.ts`).

## Alternatives considered

- **Extend the server AI pipeline with a rule stage** (emit rule findings into
  `analysis_results` with `provenance=rule_engine`). Architecturally cleaner for
  the long term and keeps one data world, but it defeats the PRD's core goals —
  affordable, offline, no server dependency — and couples a simple deterministic
  feature to the whole capture/queue/vision stack. Rejected for v0; remains the
  natural path if/when these observations need to live in the platform.
- **Reuse `idb` instead of Dexie.** Matches the one existing IndexedDB usage, no
  new dependency, but the PRD mandates Dexie and the relational, multi-table,
  indexed-query schema is exactly what Dexie's declarative versioning and compound
  indexes are for. Hand-rolling that on `idb` is more code for less safety.
- **Put it in `apps/field-web`** (already a PWA with offline infra). Rejected —
  the field PWA is the capture tool for "doers"; this analysis surface belongs
  with the Virtual Field in the portal. Offline support (PRD Phase 14) can come
  to the portal surface later without relocating the code.
