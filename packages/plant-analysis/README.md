# @gaia/plant-analysis

Local-first, **rule-based (non-AI)** plant analysis for the Virtual Field. Fields →
plants → observations → a deterministic rule engine → explainable health scores,
stored in the browser via **IndexedDB (Dexie)**. Implements
`plant_analysis_database_prd.md`.

This package is a **deliberate departure** from the platform's server-side AI
analysis pipeline (RT-DETR + PlantNet + Claude → Supabase). It is an explicit
cheaper, offline, no-AI alternative and touches **no** Supabase / `services` code.
See `docs/decisions/0005-local-rule-based-plant-analysis.md`.

## Module map (PRD §7.6 separation)

| Subpath | What |
|---------|------|
| `@gaia/plant-analysis` | SSR-safe: data `types` + pure `utilities` only |
| `@gaia/plant-analysis/database` | **Browser-only** Dexie DB + repositories |
| `@gaia/plant-analysis/analysis` | Rule engine — pure evaluators + the `analyzePlant` orchestrator (browser-only) |
| `@gaia/plant-analysis/history` | SSR-safe pure trend calcs (growth rate, deltas, repeated-condition detection) |
| `@gaia/plant-analysis/image-processing` | **Browser-only** canvas compression + non-AI color analysis (pure classifier exported for tests) |
| `@gaia/plant-analysis/react` | **Browser-only** live-query hooks + `useEnsureSeeded` |
| `@gaia/plant-analysis/knowledge/tomato` | Tomato crop profile, stages, rules, sources, `tomatoSeed()` |

## Consumer contract (IMPORTANT)

The `/database` layer touches `indexedDB`, so it must **never** be imported into a
server component or run during SSR. In the Next.js portal, load it behind
`dynamic(ssr:false)` inside a `"use client"` boundary:

```tsx
"use client";
import dynamic from "next/dynamic";
const PlantDb = dynamic(() => import("@gaia/plant-analysis/database"), { ssr: false });
```

`getDb()` is lazy (never constructs the DB at import time), so importing a type
from the root barrel on the server is safe — only calling a repository function
opens the database.

## Status

- **Milestone 1** (Database Foundation, PRD Phases 1–3): data models, Dexie schema
  v1 + repositories, tomato knowledge base. ✅
- **Milestone 2** (Manual Analysis Flow, PRD Phases 4–8): field/plant management UI,
  observation entry + validation, the rule engine (`analyzePlant`), and explainable
  results (status, health score, evidence). ✅
- **Milestone 3** (Plant History, PRD Phase 9): trend calculations (growth rate,
  deltas, repeated-condition detection) and the height / soil-moisture / health-score
  charts (Apache ECharts, in the portal). ✅
- **Milestone 4** (Images, PRD Phases 10–11): canvas compression, a capture/upload
  gallery with storage-limit handling, and non-AI color analysis (green/yellow/brown
  % + canopy coverage) shown as supporting evidence. ✅
- **Milestone 5** (Admin Knowledge Editor, PRD Phase 12): full CRUD for rules,
  sources, and the crop profile (versioned edits, enable/disable, inline rule
  tester) at `/virtual-field/analysis/admin`. ✅

Backup/restore (13) and offline support (14) land in later phases.

Tests: `pnpm --filter @gaia/plant-analysis test` (Vitest + `fake-indexeddb`, the
repo's only test runner; scoped to this package).

## Conventions

- `id` = prefixed UUID string; `cropId` = stable slug (`"tomato"`).
- All timestamps are ISO-8601 strings.
- Dexie schema is **additive-only** — never edit `SCHEMA_V1`; add a new
  `version(n).stores().upgrade()` block. See `src/database/schema.ts`.
- Relative imports are extensionless (Turbopack/portal requirement).
