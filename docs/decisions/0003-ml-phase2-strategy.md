# 0003 — ML pipeline strategy for the August 2026 prototype

- **Status:** Accepted
- **Decided:** 2026-05-25 (first problem revised twice the same day)

## Context

The platform's defensibility is a labeled imagery corpus and a real ML pipeline, not a vision-API wrapper. The August 2026 prototype is the first surface where we have to commit to an actual approach. Four orthogonal questions had to be answered together: *what* first problem to attack, *how* to bootstrap labels, *who* owns the training data, and *when* inference happens relative to capture.

Local context: the user is in Visalia / Tulare County CA — citrus, almond, pistachio, grape, stone fruit, cotton country. No row corn nearby. Initial testing happens in the user's backyard, not a field. That constrains what "first problem" can mean in practice.

## Decision

### 1. First narrow problem: plant detection + species classification

Not stand count, not tree counting. Plant detection + species classification, because:

- Initial testing is in a backyard. Tree counting requires an orchard; stand count requires a row crop; classification just requires *a plant*.
- Plant classification is the most mature public CV domain in ag-adjacent space — PlantNet (~1.5M images + free API), iNaturalist research-grade, Pl@ntNet-300K, PlantVillage, BIOSCAN. Pretrained models exist and are easy to host.
- Labels are the cheapest format: one species string per detection. Bounding boxes still help for detection but aren't required for classification-only labels.
- It's the foundation everything else builds on. Counting = "detect + count class X." Weed detection = "detect + classify crop-or-not." Disease detection = "classify leaf as healthy-or-diseased." Specialization layers on top; the trunk model stays the same.

Output shape:

```ts
{
  detections: [
    { bbox: [...], species: "citrus_sinensis", confidence: 0.91 },
    { bbox: [...], species: "weed_unknown",   confidence: 0.43 }
  ]
}
```

Counting falls out as a derived view: `count = detections.filter(d => d.species === "almond").length`.

**Schema implications:** zero. `analysis_results.category` holds species, `bounding_box` holds the box, `confidence` exists. Already shape-correct.

**`field_id` is nullable at capture time.** Backyard captures have no field polygon. The portal review surface assigns context (or leaves it `unassigned`) after the fact. Same code path as field captures — GPS auto-assigns when location ∈ a known `field.boundary`, otherwise `null`.

### 2. Bootstrap = external API seeds + human verification

External API output is **never** truth — only suggestion.

Pipeline modes in `services/vision`:

1. `external_seed` — PlantNet API (plant-specific, well-trained, free tier) returns rough detections.
2. Portal UI shows bounding boxes with confirm / reject / adjust actions.
3. Only the human-verified record enters the training corpus.

External calls are scaffolding that lights up the loop *before* our model exists; our model replaces them surface-by-surface as it matures. Backyard testing validates the loop *and* produces real training data — every backyard plant is a real labelable example.

### 3. Data ownership: raw is tenant-owned, derived corpus is platform asset

- **Raw captures** (original images + field metadata) belong to the org that produced them. Same RLS, same tenant isolation as today.
- **Derived artifacts** (cropped plant patches, embeddings, anonymized feature vectors) are extracted into a global `training_corpus` after an anonymization pass: fuzz GPS, strip org / field identifiers.

Cross-tenant training is the moat ("more users → more data → better model → more users") but it requires the anonymization layer up front. Eventually gated by contractual opt-in baked into pricing — design the schema now so the consent flag and extraction pipeline exist from v0 even if everyone is opted in during the prototype. This is a direct consequence of [0001 — Build for the system, not the MVP](./0001-build-for-the-system.md).

### 4. Inference latency: async, event-driven, never blocking

PWA does fire-and-forget upload. Portal shows the live raw feed immediately, then an "Analyzing…" placeholder, then results appear via realtime events. No GPU dependency early, no synchronous inference, no UX coupled to model latency. This matches real ag connectivity and lets us scale on CPU until we need otherwise.

### 5. Field app is dumb capture-only — all classification lives in the portal

Field PWA payload at capture time = image/video + GPS + timestamp + operator id. No crop selection, no stage selection, no session-level classification metadata. `field_id` is auto-assigned server-side from GPS ∈ `field.boundary`. The portal handles all crop/stage assignment, review, and labeling. "Doers vs watchers" extends to "doers don't classify."

Growth stage: model infers, operator corrects in the portal — same suggest-then-confirm pattern as bounding boxes. Stage can also be derived from `planting_date + GDD` on the field record when the model is uncertain. **No operator stage entry in the field app, ever.**

### 6. Model lifecycle: registry + safe rollout

- `model_versions` table — `id`, `name`, `version`, `task` (`plant_detect` / `species_classify` / …), `artifact_uri`, `training_data_snapshot_id`, `eval_metrics`, `status` (`training | shadow | production | retired`), `promoted_at`.
- **Shadow inference**: when a candidate version exists, the worker runs both prod and shadow on incoming captures, persists both result sets tagged by model version, but the portal only shows prod. Comparison dashboards drive the promote/demote decision.
- `analysis_jobs.pipeline_version` already exists — that's the link.

### 7. Active learning over random labeling

The labeling queue is sorted by **model uncertainty**, not arrival time. We label what the model is least confident about, not random captures. Each `analysis_results` row carries `confidence`; the labeling UI pulls low-confidence and disagreement-prone examples first. Multiplies labeling ROI roughly 5–10× in practice.

### 8. Dataset hygiene baked in from day one

- **Negative captures matter.** Empty rows, bare soil, weeds, edge-of-field shots. Without them the model learns "every image has plants." The labeling UI must support "no plants present" as a valid annotation, not just bounding boxes.
- **Inter-annotator agreement.** When two humans label the same capture differently, store both and flag for adjudication. Track per-labeler agreement rates as a quality signal.
- **Frozen eval set.** Carve out a held-out test set early and never train on it. Every model promotion must beat the current prod on the frozen eval before going to shadow.

### 9. Seed data sources (public ag CV datasets)

Pull these to bootstrap the model and the corpus:

- **Roboflow Universe** — primary; hosted pretrained models + downloadable YOLO weights.
- **PlantNet** — primary seed for the suggest-then-confirm loop.
- **CVPPP Plant Phenotyping Challenges** — academic counting benchmarks.
- **Global Wheat Head Detection** (Kaggle) — direct analog to stand count.
- **MTCC / Maize Tassels Counting** — corn-specific counting.
- **PlantVillage** (Penn State) — broad plant imagery, useful for later crop-type classifier.
- **iNaturalist research-grade**, **USDA AgData Commons**, **Open Plant Phenotyping Network** — long-tail.

Pragmatic kickoff: host the best Roboflow Universe model in `services/vision` and run it on every incoming capture from day one. **Not a stub** — real (imperfect) inference, real labels to correct, real training data accumulating from capture #1.

## Concrete next-step ordering

1. Schema migration: `capture_annotations`, `model_versions`, `organizations.training_corpus_opt_in`, `captures.inferred_crop_type`, `captures.inferred_crop_stage` (portal-side fields, no `declared_*` on captures or sessions because the field app doesn't classify).
2. Server-side `field_id` auto-assignment from GPS ∈ `field.boundary` in `POST /v1/captures`.
3. `services/vision` hosts a public pretrained plant-detection model (Roboflow Universe or equivalent) — real inference from day one, not a stub.
4. Wire finalize → pg-boss enqueue → worker → vision call → results → realtime events → portal.
5. Labeling UI in the portal: uncertainty-sorted queue, mobile-friendly for contractors, supports negative annotations, edit-bounding-box + confirm/reject seed detections, crop/stage assignment. **This is THE primary portal surface, not a side feature.**
6. Train v0 fine-tuned model on ~1k labeled captures + public datasets; promote to shadow; promote to prod when it beats pretrained baseline on the frozen eval.

## Consequences

- More tables and more abstraction in v0 than a vision-API wrapper would need — accepted per [0001](./0001-build-for-the-system.md).
- The portal's labeling surface is mission-critical, not optional. If it's bad, the corpus never compounds.
- `services/vision` carries real Python ML ops complexity from the start. That's the point.

## Alternatives considered

- **Wrap a vendor vision API and call it our pipeline.** Rejected. No moat, no corpus, no model improvement path. See the broader "own the ML pipeline + datastore" decision.
- **Start with stand count.** Rejected after backyard-testing constraint surfaced. Stand count requires a row crop; the user can't iterate on one in their backyard.
- **Synchronous inference at upload time.** Rejected. Couples UX to model latency, demands GPUs early, doesn't match real ag connectivity.
- **Let the field app collect crop / stage metadata.** Rejected. Doers don't classify; classification is a portal concern. Initial misstep that was corrected the same day.
