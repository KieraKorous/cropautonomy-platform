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

Milestone 1 (Database Foundation, PRD Phases 1–3): data models, Dexie schema v1 +
repositories, tomato knowledge base. The analysis engine, UI, charts, images,
backup, and offline support land in later phases. No test runner yet — Vitest +
`fake-indexeddb` arrive in Phase 7.

## Conventions

- `id` = prefixed UUID string; `cropId` = stable slug (`"tomato"`).
- All timestamps are ISO-8601 strings.
- Dexie schema is **additive-only** — never edit `SCHEMA_V1`; add a new
  `version(n).stores().upgrade()` block. See `src/database/schema.ts`.
- Relative imports are extensionless (Turbopack/portal requirement).
