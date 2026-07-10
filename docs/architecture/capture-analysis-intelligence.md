# Capture Analysis Intelligence

Implementation spec **and** work tracker for expanding capture analysis from "plant type only" to a full multi-domain crop-intelligence layer: pests/insects, diseases/viruses, weeds, nutrient deficiency, soil-surface issues, physical damage, and growth stage — each a first-class, localized, confidence-scored, human-verifiable finding.

- **Status:** Draft — active build
- **Last updated:** 2026-07-01
- **Builds on:** [0003 — ML pipeline strategy](../decisions/0003-ml-phase2-strategy.md), [Capture Pipeline](./capture-pipeline.md), [Realtime Package Spec](./realtime-package-spec.md)
- **Scope boundary:** [`capture-pipeline.md`](./capture-pipeline.md) owns the *mechanics* (reserve → upload → finalize → enqueue → result delivery). This doc owns the *intelligence* that runs inside the analysis step: what we detect, how it's modeled, how humans verify it, and how trained models replace the seed layer over time.

This is intentionally a **fully-featured target spec, not an MVP slice.** The [Delivery tracker](#delivery-tracker) at the bottom is the start-to-finish work breakdown; everything above it is the design those phases build toward.

---

## 1. Where we are today (baseline)

The pipeline is real and wired end-to-end — not stubbed. A photo runs the production pipeline **`default-plant@v2`**, three linear stages resolved from the DB by the worker and executed by the stateless [`services/vision`](../../services/vision) service:

1. **`rtdetr_coco_o365@r50vd`** (detection) — real RT-DETR torch inference. Emits bounding boxes over ~445 generic COCO/Objects365 classes. Not agriculture-trained.
2. **`plantnet_api@v2`** (classification) — PlantNet identify API; whole-image species. Optional.
3. **`agronomic_summary@v1`** (summary) — a Claude call that reads the detection digest and writes a 1–2 sentence brief, longer details, and **best-effort `observation_type` ∈ {pest, disease, weed, nutrient, irrigation, damage, growth_stage, other} + `severity` ∈ {low, medium, high}**. Optional. Produces **no** detections — it only stamps capture-level fields ([`agronomic_summary.py`](../../services/vision/src/vision/stages/agronomic_summary.py)).

Session-recording videos run `default-video@v1` (single Claude frame-sampling `video_summary` stage). Observation videos and the live feed have no analysis path.

**Honest read of the baseline:**

- Pest/disease/weed/nutrient signals **already exist** — but as one whole-image LLM guess per capture (`captures.observation_type` + `severity`), not localized, not per-object, not from a trained model, and only one category per capture.
- Per-detection `analysis_results` rows **are written** (open-vocab `category`, `confidence`, `bounding_box`, `location`, `provenance`, `payload`) **but are never read back by any API route or shown in the portal.** The suggest-then-confirm loop that ADR 0003 calls "THE primary portal surface" does not exist in the UI yet.
- There is no domain discriminator on a finding, no taxonomy for anything but plants (`crop_types`), and no per-domain trained model.

The good news: the machinery (`model_versions`, `pipelines`, `pipeline_stages`, `analysis_results`, `capture_annotations`, `training_snapshots/runs`, `eval_sets`, `model_evaluations`, `training_corpus_opt_in`) is already built and largely domain-agnostic. Expanding is mostly **DB rows + one vision stage per domain + surfacing the results** — not a re-architecture.

---

## 2. Target end-state

A capture is analyzed by a **combined crop-health pipeline** that produces a set of **typed findings**. Each finding is one `analysis_results` row carrying:

- `finding_type` — the domain: `plant | disease | pest | weed | nutrient | soil | damage | growth_stage | other`
- `category` / `subcategory` — the specific label within the domain (`powdery_mildew`, `aphid`, `nitrogen_deficiency`, `soil_crusting`), open-vocabulary, optionally resolved to a canonical taxonomy row
- `confidence`, optional `bounding_box` (localized) and/or ground `location`
- `severity` where meaningful, and `provenance` (which stage/model produced bbox vs class)

On top of the findings:

- The capture carries **denormalized rollups** for fast list filtering (top finding per domain, worst severity), extending today's plant-only `inferred_*` fields.
- Every finding is a **suggestion** surfaced in the portal with confirm / reject / correct controls; confirmations become `capture_annotations` — the labeled corpus.
- Each domain is produced first by the **LLM seed** stage, then progressively replaced by a **trained per-domain model** once its corpus is large enough, promoted through shadow → frozen-eval → production. External APIs and the LLM are seed/assist only; the corpus and our models are the moat (per [0003](../decisions/0003-ml-phase2-strategy.md) and project licensing).
- Reports roll findings up to field/season views (e.g. "tar spot heat map for this field this season"), and improved models can **re-analyze** historical captures.

We start on **still images**; video and live-feed specialization reuse the same per-domain models on sampled frames later.

Six design principles are **committed and baked into the phases below** (not optional add-ons): **detection → decision** (findings feed IPM economic-threshold advisories, not raw alerts), **severity as measurement** (% tissue affected via segmentation, not a coarse tag), **trajectory over snapshot** (the same subject tracked across visits), **robustness first** (field-representative local eval, calibrated abstention, open-set novelty), **sensor-aware** (RGB now, multispectral/thermal-ready), and **advisory, not prescriptive** (PCA/regulatory-safe, grounded, deferring to experts).

---

## 3. Finding domains

| `finding_type` | What it captures | Produced now (seed) | Trained-model target | Shape notes |
|---|---|---|---|---|
| `plant` | Species / crop identity | PlantNet + RT-DETR | our detector+classifier (v3) | Whole-image class and/or per-plant bbox. Existing. |
| `disease` | Fungal/bacterial/**viral** symptoms (blight, rust, mosaic, leaf curl, chlorosis) | LLM findings | **first trained model** — leaf-level classification | Viruses fold in here as symptom classes; no separate `virus` type. |
| `pest` | Insects & pest damage signatures | LLM findings | detection (small objects) | Often small/localized → benefits most from bbox detection. |
| `weed` | Crop-vs-not, weed species | LLM findings | detection + classify | Enum slot `weed_detection` already reserved. |
| `nutrient` | Deficiency symptoms (N/P/K/Mg visual cues) | LLM findings | classification | Symptom pattern classification; ground-truth needs agronomist confirm. |
| `soil` | **Visible surface** issues: crusting, erosion, ponding/standing water, residue cover, salinity crust | LLM findings | classification/segmentation | **Scope caveat below.** |
| `damage` | Mechanical/weather/animal damage | LLM findings | classification | |
| `growth_stage` | Phenological stage | LLM findings / GDD-derived | classification | Can also derive from `planting_date + GDD` when the model is unsure (per 0003 §5). |

**Soil scope caveat (set expectations honestly, per the design posture):** an RGB phone/device photo can only see *surface* phenomena. Soil chemistry — pH, N-P-K, organic matter, EC — is a **sensor/lab problem, not a vision problem**, and belongs to the future telemetry/sensor ingestion path, not this layer. `finding_type='soil'` is deliberately limited to visually-observable surface conditions. Do not market or model soil chemistry from images.

---

## 4. Data model changes

The current schema already accepts new detection labels with **zero DDL** (`analysis_results.category` is open-vocab text — the header comment anticipates `'stress_zone'` etc.). The changes below add *structure* so findings are typed, filterable, and taxonomy-backed rather than loose strings.

### 4.1 `finding_type` discriminator (new migration `0024_analysis_finding_type.sql`)

```sql
alter table public.analysis_results
  add column finding_type text not null default 'plant'
    check (finding_type in (
      'plant','disease','pest','weed','nutrient','soil','damage','growth_stage','other'
    )),
  add column severity text
    check (severity is null or severity in ('low','medium','high'));

-- existing rows are all plant classifications; default handles backfill.
create index analysis_results_capture_finding_idx
  on public.analysis_results (capture_id, finding_type);
create index analysis_results_org_finding_conf_idx
  on public.analysis_results (org_id, finding_type, confidence desc);
```

Mirror the same enum extension on `capture_annotations` (add `finding_type`) so a confirmed finding records its domain in the corpus.

### 4.2 Taxonomy reference tables (introduced with the confirm loop, Phase 3)

`crop_types` is the only taxonomy today. Add sibling reference tables so `category` can resolve to a canonical, org-scoped-or-platform-wide id with a display name, host-crop linkage, and default severity scale — same partial-unique `(key) where org_id is null` / `(org_id, key)` pattern as `crop_types`:

- `disease_types` (incl. viral; `pathogen_class`, `affected_hosts`, symptom synonyms)
- `pest_types` (`taxon`, `affected_hosts`)
- `soil_conditions`, `nutrient_disorders` (or a single `disorder_types` with a `domain` column — decide in Phase 3)

Findings stay writable as free-text `category` first (fast), then a resolver maps to `*_type_id` in `payload`/a nullable FK. Do **not** block finding creation on taxonomy existence — unknown categories are a labeling signal, not an error.

### 4.3 Capture-level rollups (Phase 1)

Extend the plant-only `inferred_*` pattern (`captures.inferred_species`, `inferred_common_name`, `inferred_summary`, `observation_type`, `severity`) with domain rollups for list filtering, e.g. `captures.top_findings jsonb` (`{disease: {category, confidence, severity}, pest: {...}}`) or discrete `worst_severity` + a GIN-indexed `finding_types text[]`. Chosen shape decided in Phase 1; the rule is *one indexed path for "show captures with detected aphids in this field."*

### 4.4 `task` enum expansion (Phase 4+, per new trained pipeline)

The `task` enum is **duplicated across `model_versions`, `pipelines`, `training_snapshots`, and `eval_sets`** (and re-declared by later migrations via `drop constraint / add constraint`). Current values: `plant_classification, stand_count, tree_count, weed_detection, disease_detection, stage_classification, video_summary`. `disease_detection` and `weed_detection` slots already exist. Adding `pest_detection`, `nutrient_analysis`, `soil_analysis` means editing **all four constraints in lockstep** plus the `Task` literal in [`schemas.py`](../../services/vision/src/vision/schemas.py). Treat this as the analysis-layer analog of CLAUDE.md's "update three/four places together" rule.

> **Coordination rule for this layer — the "five places":** a new finding domain touches (1) `analysis_results.finding_type` + `capture_annotations.finding_type` check constraints, (2) the vision `Detection`/`Task` schema + the stage that emits it, (3) the worker's persist + rollup logic, (4) the `task` check constraints across the four ML tables when a *trained* pipeline lands, and (5) the portal findings/labeling UI. Keep them in sync.

### 4.5 Severity as measurement + segmentation (promoted)

Plant pathology measures severity as **% tissue affected**, not a coarse bucket. Keep `severity` (low/med/high) as a rollup, add a measured value and a mask:

```sql
alter table public.analysis_results
  add column severity_pct  numeric(5,2)
    check (severity_pct is null or (severity_pct between 0 and 100)),  -- % tissue affected
  add column segmentation  jsonb;  -- normalized polygon / RLE mask (image space); null for bbox-only findings
```

**Incidence** (fraction of plants affected in a field) is a report-time rollup over findings, not a column. The disease model target shifts toward **segmentation** so `severity_pct` is measured, not guessed (§5.2, Phase 4).

### 4.6 Temporal linking — observation subjects (promoted)

A **subject** is a tracked real-world thing (plant, lesion, zone) observed across visits. Add an `observation_subjects` table + a nullable `analysis_results.subject_id`, populated by revisit detection (GPS + field/zone geometry now; visual re-ID later). This is what enables progression, spread, and treatment-efficacy time-series (Phase 5) — the per-capture model can't express "the same lesion five days later."

### 4.7 Advisory / decision layer (promoted)

Two new concerns above findings: `pest_thresholds` (crop × pest × growth_stage → economic-threshold parameters) and `advisories` (one-or-more findings → a recommended action with threshold reasoning, an `advisory`/observational disclaimer, and a `pca_signoff` state). Output is advisory; a licensed **PCA** signs actual pesticide recommendations (§11.A). Natural consumer of the [GaiaBots Knowledge Base](../product/gaiabots-knowledge-base-prd.md). Delivered in Phase 6.

### 4.8 Sensor / modality awareness (promoted, forward-looking)

Add `captures.modality` (`rgb | multispectral | thermal | …`, default `rgb`) and let findings reference derived indices (NDVI, thermal deltas) in `payload`. RGB-only today, but the column means GAIA multispectral inputs and pre-symptom stress detection slot in without reworking the finding model. **Risk forecasts** (weather/GDD fusion, Phase 8) live in a separate `risk_forecasts` concept — a forecast is a prediction, not an observation, so it does not belong in `analysis_results`.

### 4.9 Confirmation tiers (baked into the corpus)

Add `capture_annotations.confirmation_level` (`field_visual | expert_visual | lab_confirmed`). Visual disease ID is frequently wrong and some ground truth needs a lab assay. Models train/evaluate on the confirmed tier so corpus quality has a ceiling above best-guess field labels (Phase 3).

---

## 5. Vision service changes

### 5.1 Multi-domain findings stage (Phase 1) — the seed

Today `agronomic_summary@v1` writes only capture-level prose + one tag. Evolve it to also emit **findings as `Detection`s**:

- **Done:** bumped `agronomic_summary` → `@v2`. It now reads `ctx.detections` (RT-DETR + PlantNet) **and the image** (multimodal — v1 only saw the text digest), and returns a `findings[]` array. Each finding → a `Detection` appended to `ctx.detections` with `category`, `subcategory`, `confidence`, optional `bounding_box`, `provenance={"class_from":"agronomic_summary@v2"}`, and `finding_type` + `severity` + `severity_pct`. The parser is tolerant (drops invalid `finding_type`, clamps confidence, rejects off-range bboxes).
- Keep emitting `ctx.summary/details/observation_type/severity` for back-compat with the existing capture fields and UI.
- Extend the `Detection` pydantic model in [`schemas.py`](../../services/vision/src/vision/schemas.py) with `finding_type: FindingType | None` and `severity: Severity | None`. The executor already returns `ctx.detections` verbatim, so no executor change is needed.
- Register the new stage in `stages/registry.py` (one line) and point `default-plant@v2`'s summary stage at the new `model_versions` row (a DB update, no redeploy).

This gives **immediate multi-domain coverage across every photo, no training** — and it is explicitly a *suggestion generator* that feeds the confirm loop.

### 5.2 Per-domain trained stages (Phase 4+)

Each trained model is a new stage class + a `model_versions` row, composed into pipelines as DB rows:

- `disease_classifier@vN` (Phase 4, first), then `pest_detector@vN`, `weed_detector@vN`, etc.
- **Composition choice:** run them as **additional stages in one combined crop-health pipeline** (detection → species → disease → pest → … → summary) rather than N separate pipelines/jobs per photo. This keeps one job per capture initially and lets the summary stage synthesize across all detector outputs. Split into multiple jobs only if per-domain latency/scaling diverges (see §6).
- The executor is **linear today (no DAG)**. When a domain needs conditional branching ("only run disease classifier on crops of type X", "escalate to a fine model if coarse confidence < τ"), add branching to `pipeline.py` behind a clear interface — do not let stages know their successors.

### 5.3 Model & dataset licensing (hard constraint)

Per [project licensing policy](../decisions/0001-build-for-the-system.md) and the RT-DETR-not-YOLO11 rule: **deployed model architectures/weights must be permissively licensed (Apache/BSD/MIT).** Ultralytics YOLOv5/v8/11 weights are **AGPL-3.0 — do not ship them.** RT-DETR (Apache) is the sanctioned detector base. Seed *datasets* (PlantVillage, Roboflow Universe imagery, IP102, etc.) are fine to *train on* (data licenses differ from model-code licenses), but never fine-tune from or deploy an AGPL/GPL/source-available-restricted checkpoint. Record the license of every seed source in `model_versions.metadata`.

---

## 6. Worker changes

[`services/workers/src/handlers/analysis.ts`](../../services/workers/src/handlers/analysis.ts) already: resolves the production pipeline, calls vision, writes one `analysis_results` row per detection, stamps capture-level fields, publishes realtime events.

- **Phase 1:** map `finding_type` + `severity` through the `analysis_results` insert; compute and write the capture-level rollups (§4.3).
- **Phase 4+ (multi-job, if needed):** the current model is one in-flight `analysis_jobs` row per capture (`analysis_jobs` unique-in-flight; historical unconstrained). A combined pipeline keeps this 1:1. If we later fan out to per-domain jobs, relax to 1:many and aggregate rollups across jobs — decide when a domain's runtime justifies its own job.
- **Shadow:** when a candidate pipeline exists for a task, run prod + shadow, persist both tagged by `pipeline_id`/`pipeline_version`, surface only prod (per 0003 §6).
- **Concern notifications (shipped):** after a capture is marked `analyzed`, if the capture-level `severity` is `medium` or `high` the handler flags a crop concern — it fans out an `analysis.concern` notification (per-user inbox row + `notification.created` broadcast on `orgNotifications`) to the org's management tier (`organization_memberships` where `roles.key ∈ {owner, admin, manager}`), so a field problem surfaces to whoever can act on it, not just the capturer. Best-effort, mirrors `notifyCaptureOwner`; never fails the job. The threshold (medium+high) matches the portal's "Concerns only" filter.

---

## 7. API changes ([`services/api`](../../services/api))

- **Read findings (Phase 2):** `analysis_results` is currently write-only. Add findings to the capture detail response (or `GET /v1/captures/{id}/findings`) — the per-domain, per-object rows with bbox + confidence + finding_type + severity + confirm state.
- **Confirm loop (Phase 3):** endpoints to confirm / reject / correct a finding, writing `capture_annotations` (`source ∈ human_confirmed_seed | human_rejected_seed | human_corrected_seed`, or `human_de_novo` for reviewer-added findings; `is_negative=true` for "nothing present"). Add a `analysis.annotate` permission (the catalog already has `analysis.read/request/delete`).
- **Labeling queue (Phase 3):** `GET /v1/annotation-queue` — captures/findings ordered by model **uncertainty** (low confidence, inter-annotator disagreement) per 0003 §7, filterable by `finding_type`.
- **Taxonomy (Phase 3):** read/manage `disease_types` / `pest_types` / etc.
- **Reports (Phase 5):** field/season finding rollups powering heat maps and trend views.

- **Captured-by on the list (shipped):** `GET /v1/captures` now embeds the capturer (`captured_by:users!captured_by_user_id`) and returns `capturedById` / `capturedByName` (`display_name → email → null`) so the portal list can show and sort by who took each capture without a client-side join.

### Reviewer overrides

The existing capture `PATCH /v1/captures/{id}` reviewer override (summary/observation_type/severity) stays for the capture-level brief. The **finding-level** confirm/correct is the new, richer surface — the capture-level tags become a rollup of confirmed findings over time.

---

## 8. Portal changes ([`apps/portal-web`](../../apps/portal-web)) — the primary surface

ADR 0003 §5: *"the labeling surface is mission-critical, not optional. If it's bad, the corpus never compounds."*

- **Captures list sort/filter (shipped):** the `CapturesView` table/grid now sorts by severity, captured-by (A→Z), farm, and field (in addition to date/plant/status), shows Severity / Captured By / Farm / Field columns, and offers a filter bar — a "Concerns only" toggle (medium+high severity, matching the worker's concern threshold) plus Farm / Field / Captured-by dropdowns. Filtering is client-side over the server's team-scoped fetch. A bounded fallback poll (`router.refresh()` every 5s while any capture is non-terminal) keeps status live even if a worker `capture.changed` realtime event is missed.
- **Recordings list parity (shipped):** the Recordings page (`kind='session_recording'` captures) mirrors the same setup — `RecordingsView` with table/grid toggle, header sorting (date/status/severity/captured-by/farm/field), the same "Concerns only" + Farm/Field/Captured-by filter bar, live updates + fallback poll, and a video-player lightbox (`RecordingDetailModal`). The download button is retained in the grid card, table row, and lightbox. Recording-specific status labels ("Ready" for a playable clip) live in `recordingStatusDisplay`.
- **Multi-select + bulk actions (shipped):** both lists support selecting multiple items (row checkboxes + a select-all header checkbox in the table, a checkbox overlay on grid cards; state in the shared `_components/useSelection` hook, pruned when a row leaves the set). A shared `SelectionToolbar` runs bulk operations against the capture endpoints (`_components/bulk-actions.ts`): **Discard**, **Assign to team** (one `assignEntities` call — the list form), **Download** (client-side loop over `getCaptureDownload`, skips items without a signed URL), and **Re-analyze** (captures only, offered when the selection contains failed items). Per-item failures are tolerated via `Promise.allSettled`.
- **Findings panel (Phase 2):** on the capture detail modal, render findings grouped by domain with severity/confidence, and **bounding-box overlay on the image**. Extends today's `CaptureDetailModal` which only shows `plantType/summary/observationType/severity`.
- **Confirm loop (Phase 3):** per-finding confirm / reject / edit-bbox / correct-category; add-finding (de-novo); mark-negative ("no issue present"). Mobile-friendly for field contractors reviewing back at base.
- **Review queue (Phase 3):** uncertainty-sorted worklist across captures, filterable by domain; the daily driver for building the corpus.
- **Reports (Phase 5):** per-field / per-season finding heat maps and severity trends.

Realtime: `scan.detection` events already fire per result; findings appear live during analysis. Confirm the event schema in [`realtime-package-spec.md`](./realtime-package-spec.md) carries `finding_type`; extend if not.

---

## 9. Training & corpus loop

The flywheel (tables already exist from `0008`):

1. Seed layer (LLM / external APIs / RT-DETR) emits findings → `analysis_results`.
2. Reviewer confirms/rejects/corrects → `capture_annotations` (human-verified truth). Negatives and inter-annotator disagreement are captured (0003 §8); disagreements go to `capture_annotation_adjudications`.
3. A `training_snapshots` row freezes the exact `(capture, annotation)` set; a `training_run` trains a candidate; `model_evaluations` scores it against a **per-domain frozen `eval_set`** that is never trained on.
4. Register the candidate as a `model_versions` row (`status='shadow'`), wire into a shadow pipeline, run alongside prod, promote to `production` only when it beats prod on the frozen eval.
5. Derived corpus extraction (cropped patches, anonymized vectors, GPS fuzzed, org ids stripped) is gated by `organizations.training_corpus_opt_in` — the cross-tenant moat (0003 §3). Design it in from v0 even while everyone is opted in during the prototype.

**Disease + virus is the first domain to complete this loop** (chosen 2026-07-01): best public seed data (PlantVillage, many Roboflow disease sets), tractable as leaf-level classification, viruses fold in as symptom classes. Pests second, soil-surface last.

---

## 10. Delivery tracker

**Phases 1–4 are the committed near-term arc** (seed+label loop → first hardened disease model). **Phases 5–9 are committed but later.** Robustness, confirmation tiers, and advice guardrails are baked into the phases they touch, not a separate track. Check items off as they land.

### Phase 0 — Baseline (complete)
- [x] `default-plant@v2` (RT-DETR → PlantNet → agronomic_summary) in production
- [x] Per-detection `analysis_results` persisted with provenance
- [x] Capture-level `inferred_*` + `observation_type`/`severity` stamped and shown

### Phase 1 — Multi-domain findings + finding data model (backend, no training)
- [x] `0024_analysis_finding_type.sql`: `finding_type` + `severity` + `severity_pct` + `segmentation` on `analysis_results`; `finding_type` on `capture_annotations`; `captures.modality`; indexes; backfill to `plant`/`rgb`
- [x] Capture-level rollup shape decided + columns added (`captures.finding_types text[]` GIN + `top_findings jsonb` = top finding per domain)
- [x] Vision `Detection` schema gains `finding_type`/`severity`/`severity_pct`/`segmentation`; **`agronomic_summary@v2`** (bumped from v1) is now **multimodal** (sees the image) and emits typed findings as detections while keeping the back-compat capture brief
- [x] Stage registered (class version → v2); `default-plant@v2` summary stage repointed v1→v2 via the migration
- [x] Worker persists new fields + computes rollups (and `inferred_species` now excludes issue findings so a high-confidence disease finding can't masquerade as the species)
- [ ] **Acceptance:** a scouting photo yields ≥1 typed finding per visible issue across ≥2 domains; existing capture fields still populate; no schema break — *unit-verified (parser); pending a live end-to-end run with `ANTHROPIC_API_KEY` + migrated DB*

### Phase 2 — Surface findings (read + display)
- [x] API returns findings on capture detail (`GET /v1/captures/:id` now includes `findings[]`; closed the write-only gap)
- [x] Portal findings panel (`CaptureFindings`, domain chips + severity + `severity_pct` + note) + numbered bbox overlay on the detail image (`CaptureImage`). Mask overlay deferred — no `segmentation` masks are produced until the Phase 4 seg model; overlay is bbox-only today
- [x] `scan.detection` realtime carries `findingType` (optional; worker publishes it)
- [ ] **Acceptance:** reviewer sees every persisted finding on a capture, localized — *code-complete + type-clean; pending a live run (migrated DB + vision + worker) to view real findings*

### Phase 3 — Confirm loop + labeling + confirmation tiers (the corpus flywheel)
Core per-capture confirm loop shipped (0025); review queue / taxonomy / adjudication staged.
- [x] `analysis.annotate` permission (0025) granted to owner/admin/manager/technician (viewers read-only)
- [x] Confirm / reject / correct / add endpoints → `capture_annotations` (`POST /v1/captures/:id/annotations`, append-only; confirm/reject backfill category/finding_type/bbox from the seed). `mark-negative` (`is_negative`) is supported in the API; no dedicated UI button yet
- [x] `confirmation_level` (`field_visual | expert_visual | lab_confirmed`) on annotations (0025) + selectable in the correct/add forms
- [x] Portal review UI: per-finding Confirm / Reject / Correct + Add on the capture detail page with latest-state chips (`CaptureFindings` is now a client component); `annotations` + `canAnnotate` added to the detail response
- [ ] Taxonomy reference tables (`disease_types` first) + resolver — staged
- [ ] Uncertainty-sorted cross-capture review queue, filterable by domain — staged
- [ ] Adjudication path for inter-annotator disagreement (schema already keeps every annotation as raw signal; needs a surface) — staged
- [ ] Per-domain confirmed-label counts dashboard — staged
- [ ] **Acceptance:** confirmed findings become `capture_annotations` with a confirmation tier — *code-complete; api + db type-clean, realtime clean, portal-web builds. (Realtime relative imports stay extensionless so Turbopack can build; api/workers keep the pre-existing NodeNext TS2835 until `@gaia/realtime` ships a built dist.) Pending a live run*

### Phase 4 — First trained model: disease + virus (segmentation + domain-shift-hardened)
- [ ] Seed datasets ingested (PlantVillage / Roboflow disease sets); licenses recorded (permissive only)
- [ ] **Field-representative, local-crop eval set** (citrus / almond / pistachio / grape / stone fruit) — never trained on; do **not** trust lab-benchmark accuracy (99%→~33% cliff)
- [ ] Disease **segmentation** model (% tissue affected), background-robust, permissive architecture
- [ ] Calibrated confidence + **abstention** ("needs expert"); **open-set novelty** flag (new/invasive → unknown); saliency/explainability
- [ ] `disease_seg@vN` registered; wired as a stage in the combined crop-health pipeline (shadow)
- [ ] Shadow-vs-prod; promote only when it beats the seed baseline on the **frozen field eval**
- [ ] **Acceptance:** disease findings (with % severity) from the trained model in production; measured lift over the LLM seed on the frozen field eval; abstains on out-of-distribution input

### Phase 5 — Temporal / longitudinal intelligence
- [ ] `observation_subjects` + `analysis_results.subject_id`; revisit detection (GPS + geometry; visual re-ID later)
- [ ] Time-series findings per subject/zone; progression + spread + change detection
- [ ] Treatment-efficacy verification (before/after a treatment event)
- [ ] Weak-label back-propagation (a confirmed finding relabels prior ambiguous captures of the same subject)
- [ ] **Acceptance:** portal shows a subject/zone's finding trajectory over time

### Phase 6 — Decision / advisory layer
- [ ] `pest_thresholds` reference tables (crop × pest × growth_stage → economic threshold)
- [ ] `advisories`: findings + severity + stage → recommended action, grounded, with threshold reasoning
- [ ] Advisory/observational framing + disclaimers; `pca_signoff` state; never auto-prescribe restricted materials
- [ ] LLM advice guardrails (ground in detections + confidence, defer on uncertainty, no fabrication)
- [ ] Expert/PCA escalation route for hard/low-confidence cases
- [ ] **Acceptance:** a confirmed above-threshold finding yields a grounded, disclaimered advisory; low-confidence routes to an expert

### Phase 7 — Spatial + prioritization
- [ ] Georeferenced finding heat maps + hotspot detection (uses PostGIS `location`)
- [ ] Variable-rate / management-zone prescription maps
- [ ] Scouting-as-sampling: field-level claims carry coverage/representativeness confidence
- [ ] Triage ranking: "fields needing attention today" (severity × threshold × spread)
- [ ] **Acceptance:** field map shows finding density + a ranked attention list

### Phase 8 — Beyond RGB + risk forecasting
- [ ] Sensor-aware pipeline: multispectral/thermal capture inputs (GAIA devices) via `captures.modality`
- [ ] Derived indices (NDVI, thermal deltas) as findings/inputs
- [ ] `risk_forecasts`: weather + GDD + history fusion → pre-symptom disease-risk forecast
- [ ] Video/live-feed frame analysis reuses per-domain models
- [ ] **Acceptance:** a multispectral capture produces findings; a field shows a disease-risk forecast

### Phase 9 — Broaden trained models + lifecycle
- [ ] Pest detector (Phase-4 loop for `pest`), then weed, nutrient, soil-surface
- [ ] `task` enum extended in lockstep across the four ML tables as trained pipelines land
- [ ] Bulk re-analysis of historical captures when a model improves
- [ ] Corpus extraction/anonymization + `training_corpus_opt_in` enforcement before customer ship
- [ ] **Acceptance:** ≥2 additional domains served by trained models in production

### Continuous (cross-cutting)
- [ ] Active-learning queue ordering refinement
- [ ] Per-domain frozen eval sets + shadow comparison dashboards
- [ ] Model/dataset license provenance in `model_versions.metadata`
- [ ] Edge / on-device triage R&D (lightweight model for the offline PWA + GAIA devices)

---

## 11. Expanded scope & non-obvious considerations

Things the "extend the existing plan" framing misses — the rationale behind the design principles in §2.

> **Decision (2026-07-01):** all four **⚠ reshapes plan** items below (A decision layer, B severity-as-segmentation, C temporal tracking, D multispectral/forecasting) were **promoted into committed phases** — see the tracker (A→Phase 6, B→Phases 1+4, C→Phase 5, D→Phase 8). The robustness items (F), confirmation tiers (G), and advice guardrails (K) are baked into Phases 3–6. E (spatial) → Phase 7, H (expert tier) → Phase 6, J (triage) → Phase 7, I (edge) → Continuous. This section is retained as the *why*.

**A. From detection to *decision* — the actual product. ⚠ reshapes plan.** A grower doesn't want "aphids detected"; they want "spray / don't spray / re-scout in 5 days." That's the IPM **economic threshold (ET)** / **economic injury level (EIL)** layer: pest count × crop × growth stage × crop price × control cost → an action. Detection is the input to a recommendation, not the deliverable. This implies an advisory/recommendation layer above findings (crop×pest threshold tables, treatment knowledge — a natural tie to the [GaiaBots Knowledge Base PRD](../product/gaiabots-knowledge-base-prd.md)). **Regulatory reality:** in California (our test region) recommending a pesticide/rate is regulated — a licensed **PCA (Pest Control Adviser)** must sign agricultural pesticide recommendations. Our output must be *advisory/observational*, clearly disclaimered, and must never auto-prescribe restricted-material rates. Get this framing right before the LLM stage starts "recommending."

**B. Severity as quantification, not a 3-bucket tag. ⚠ reshapes plan.** Plant pathology measures severity as **% tissue affected** (nearest-percent estimate, ordinal 0–9 scales, Standard Area Diagrams), not `low/medium/high`. And two different metrics matter: **incidence** (fraction of plants affected in a field) vs **severity** (how bad per plant). Doing this right means **segmentation masks** (area), a numeric severity per finding, and field-level incidence rollups — not just a bbox + a coarse tag. This changes the disease model target from classification to segmentation sooner than planned.

**C. Temporal / longitudinal intelligence. ⚠ reshapes plan.** A single photo is a point; the agronomic value is the *trajectory* — is the lesion spreading, is the infestation growing, did the treatment work? Requires linking captures of the *same* plant/zone/field across visits (revisit detection via GPS + geometry), time-series findings, change detection, and treatment-efficacy verification. Also a cheap source of weak labels (a confirmed disease today back-labels yesterday's ambiguous capture). Our per-capture model has no concept of "the same lesion five days later."

**D. Beyond RGB + risk *forecasting*.** RGB only sees symptoms *after* they're visible. Multispectral/NDVI and thermal detect stress pre-visibly (>60% of large farms already use multispectral); thermal flags water stress. More powerful still: fuse image + weather + growing-degree-days + soil sensors into a **disease-risk forecast** (predict infection windows before symptoms appear) — often worth more than detection-after-the-fact. Make finding production **sensor-aware** now so GAIA multispectral device inputs slot in later without a rewrite.

**E. Spatial aggregation & prescription maps.** We already store PostGIS `location` per finding and barely use it. Point findings → hotspot/heat maps → **variable-rate management zones** (site-specific spray prescriptions). And model scouting as **sampling**: "3 spots scouted in 40 acres" — field-level claims should carry a coverage/representativeness confidence, not imply full coverage.

**F. ML robustness — the disease-first risk (research-confirmed).** Models hitting **99% on PlantVillage drop to ~33% on field images** (lab background bias + domain shift). Non-negotiable for Phase 4: a **field-representative, local-crop eval set** from day one, background handling, and *never* trusting lab-benchmark accuracy. Plus **calibrated confidence + abstention** — "I'm not sure, needs an expert" is more valuable than a confident wrong spray call — and **open-set novelty** so new/**invasive** pests are flagged as unknown (some carry mandatory regulatory reporting) instead of force-fit to a known class. And **explainability** (saliency / the lesion the model keyed on): a PCA won't trust a black box for a spray decision.

**G. Ground-truth confirmation tiers.** Visual disease ID is frequently wrong; the gold label sometimes requires a lab assay (culture/PCR). Add a **confirmation level** to annotations (`field_visual` / `expert_visual` / `lab_confirmed`) so corpus quality has a ceiling above best-guess field labels and models can be trained/evaluated on the confirmed tier.

**H. Expert / PCA-in-the-loop tier.** Above crowd labeling: route hard or low-confidence cases to a **credentialed agronomist/PCA**. This simultaneously serves the customer (trustworthy answer), produces the highest-quality labels, and is a plausible **service/revenue** surface — not just an internal ops tool.

**I. Edge / on-device triage.** The field PWA is offline-first and GAIA devices are edge compute. A lightweight on-device model can give **instant in-field feedback** ("point camera → maybe-disease highlight") while the cloud runs the heavy pipeline asynchronously. That's an architecture branch (edge inference + model export), not just another cloud stage.

**J. Prioritization / triage surface.** For an adviser managing many fields, the value isn't a findings list — it's **"which 3 fields need attention today,"** ranked by severity × economic threshold × spread risk. The intelligence to *triage across* captures is a distinct surface above per-capture analysis (notifications already exist; the ranking logic doesn't).

**K. Phenology conditioning + LLM-advice guardrails.** Growth stage is a model **input**, not just an output — a leaf at V3 looks nothing like R5, so conditioning on stage (from the model or `planting_date + GDD`) improves every other domain. And the LLM/advice stages need explicit guardrails: ground every claim in detections + confidence, defer to expert on uncertainty, never fabricate a finding or prescribe — confident wrong agronomic advice is a liability, not just a bug.

---

## 12. Open questions

- Rollup representation on `captures` (single `jsonb` vs typed columns vs `text[]`) — pick in Phase 1 by the actual filter queries the portal needs.
- Single `disorder_types` table with a `domain` column vs separate `disease_types`/`pest_types`/… — pick in Phase 3.
- When (if ever) to split from one combined job per capture to per-domain jobs — driven by real per-domain latency (§6).
- Growth-stage source blending: model vs `planting_date + GDD` precedence.
- Cross-crop transfer: does a disease model trained on PlantVillage crops generalize to Tulare-County citrus/almond/pistachio/grape/stone-fruit? Likely needs local corpus fastest — bias the active-learning queue toward local crops.

## 13. Doc-update obligations

When these land, update the referenced docs (per CLAUDE.md): [`capture-pipeline.md`](./capture-pipeline.md) § Analysis (finding_type + new stages), [`database-schema.md`](./database-schema.md) (currently stale — stops at 0006; bring the ML/pipeline tables in), [`realtime-package-spec.md`](./realtime-package-spec.md) (event schema if extended), and this tracker.
