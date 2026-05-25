-- ML pipeline: annotations, model registry, training-corpus consent,
-- and capture-level inferred classification fields.
--
-- Locked decisions (see project memory project-ml-phase2-strategy):
--   - First task is plant detection + species classification (not corn stand
--     count; not tree counting). Trunk model; counting / weed / disease are
--     derived views that filter on category.
--   - Suggest-then-confirm: external/pretrained model produces seed detections;
--     humans confirm/correct/reject in the portal; only human-verified records
--     enter the training corpus. External output is NEVER truth.
--   - Field app is dumb capture-only. All crop/stage classification lives in
--     the portal. Captures.field_id is already nullable (backyard testing has
--     no field polygon).
--   - Raw captures are tenant-owned; derived training corpus is platform asset
--     gated by per-org opt-in.

------------------------------------------------------------------------
-- model_versions
--
-- Registry of every model that has produced an analysis_results row.
-- analysis_jobs.pipeline_version already exists as a text field; values there
-- should match (name, version) here. We don't add an FK because pipeline_version
-- is denormalized for queryability and may reference retired/deleted versions.
--
-- Includes external providers (PlantNet, Roboflow, OpenAI Vision, etc.) so the
-- registry is the single source of truth for "what produced this detection,"
-- regardless of whether it was our model or a vendor API.
------------------------------------------------------------------------

create table public.model_versions (
  id                          uuid primary key default gen_random_uuid(),

  name                        text not null,                 -- e.g. 'plant_classifier'
  version                     text not null,                 -- semver, git sha, or vendor version
  task                        text not null check (task in (
                                'plant_classification',
                                'stand_count',
                                'tree_count',
                                'weed_detection',
                                'disease_detection',
                                'stage_classification'
                              )),

  framework                   text not null check (framework in (
                                'pytorch',
                                'onnx',
                                'triton',
                                'external_api'
                              )),
  external_provider           text,                          -- 'plantnet','roboflow','openai','google_vision', null for own models
  artifact_uri                text,                          -- where the weights live; null for external_api

  training_data_snapshot_id   uuid,                          -- nullable; references a future training_snapshots table

  eval_metrics                jsonb not null default '{}'::jsonb,   -- frozen-eval results: precision, recall, mAP, etc.

  status                      text not null default 'shadow' check (status in (
                                'training',
                                'shadow',
                                'production',
                                'retired'
                              )),
  promoted_at                 timestamptz,

  notes                       text,
  metadata                    jsonb not null default '{}'::jsonb,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index model_versions_name_version_uidx
  on public.model_versions (name, version);

-- Exactly one production model per task at any time. Demote the current prod
-- before promoting a new one.
create unique index model_versions_task_production_uidx
  on public.model_versions (task)
  where status = 'production';

create index model_versions_task_status_idx
  on public.model_versions (task, status);

create trigger model_versions_set_updated_at
  before update on public.model_versions
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- capture_annotations
--
-- Human ground truth. Every row is one annotation event on one capture.
--
-- source semantics:
--   human_de_novo          — labeler added this from scratch; no seed existed
--   human_confirmed_seed   — labeler agreed with a model detection
--   human_corrected_seed   — labeler modified bbox / category from a seed
--   human_rejected_seed    — labeler said the seed detection was wrong
--
-- A "no plants present in this image" annotation is is_negative=true with
-- analysis_result_id and bounding_box both null. These are critical for
-- training balanced models that don't hallucinate plants in empty soil.
--
-- Inter-annotator disagreement is preserved by allowing multiple annotations
-- per (capture_id, analysis_result_id, annotator_user_id) tuple — annotators
-- only get unique constraints if we ever decide to enforce one-vote-per-person;
-- for now we want the raw disagreement signal.
------------------------------------------------------------------------

create table public.capture_annotations (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  capture_id                  uuid not null references public.captures(id) on delete cascade,

  -- when this annotation acts on a specific model detection, link to it
  analysis_result_id          uuid references public.analysis_results(id) on delete set null,
  -- denormalized for queryability when analysis_result_id is null or the row is deleted
  seed_model_version_id       uuid references public.model_versions(id) on delete set null,

  annotator_user_id           uuid not null references public.users(id) on delete restrict,

  source                      text not null check (source in (
                                'human_de_novo',
                                'human_confirmed_seed',
                                'human_corrected_seed',
                                'human_rejected_seed'
                              )),

  -- what the annotator said
  category                    text,                          -- species / class label, e.g. 'citrus_sinensis', 'weed'
  subcategory                 text,
  bounding_box                jsonb,                         -- { x, y, w, h } normalized 0..1
  location                    geography(point, 4326),

  is_negative                 boolean not null default false,  -- "no plants present" annotation
  annotator_confidence        numeric(5, 4) check (annotator_confidence is null or (annotator_confidence >= 0 and annotator_confidence <= 1)),
  notes                       text,
  payload                     jsonb not null default '{}'::jsonb,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- An annotation must say something: either a positive label (category) or
  -- an explicit negative. Pure no-ops are not allowed.
  constraint capture_annotations_has_signal check (
    is_negative = true or category is not null
  ),
  -- A negative annotation does not carry a bounding box or analysis_result_id.
  constraint capture_annotations_negative_shape check (
    is_negative = false or (bounding_box is null and analysis_result_id is null)
  )
);

create index capture_annotations_capture_id_idx
  on public.capture_annotations (capture_id);

create index capture_annotations_org_category_idx
  on public.capture_annotations (org_id, category)
  where category is not null;

create index capture_annotations_annotator_idx
  on public.capture_annotations (annotator_user_id, created_at desc);

create index capture_annotations_seed_model_idx
  on public.capture_annotations (seed_model_version_id)
  where seed_model_version_id is not null;

-- Gold-label query: every human-corrected seed becomes high-value training data.
create index capture_annotations_corrections_idx
  on public.capture_annotations (org_id, category, created_at desc)
  where source = 'human_corrected_seed';

create index capture_annotations_location_gix
  on public.capture_annotations using gist (location);

create trigger capture_annotations_set_updated_at
  before update on public.capture_annotations
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- training_snapshots
--
-- Immutable record of what data went into a training run. Without this,
-- "what data trained model v0.3?" is unanswerable, which breaks reproducibility.
--
-- manifest holds the exact (capture_id, annotation_id) set used. Stored as
-- jsonb for atomic snapshot semantics — a join table would be huge and we
-- never need the reverse query "which snapshots used this annotation."
-- For very large snapshots, manifest_uri points to an externalized manifest
-- in object storage and manifest holds a summary.
------------------------------------------------------------------------

create table public.training_snapshots (
  id                          uuid primary key default gen_random_uuid(),

  name                        text not null,
  task                        text not null check (task in (
                                'plant_classification',
                                'stand_count',
                                'tree_count',
                                'weed_detection',
                                'disease_detection',
                                'stage_classification'
                              )),

  -- Reproducibility: exact (capture_id, annotation_id) set used.
  manifest                    jsonb not null,
  manifest_uri                text,                          -- externalized manifest for huge sets

  train_count                 integer not null,
  val_count                   integer not null,
  test_count                  integer not null,

  -- Construction criteria (min_confidence, categories, date_range, opt_in_only, etc.)
  filter_criteria             jsonb not null default '{}'::jsonb,

  -- Anonymization pipeline version applied to derived artifacts in this snapshot
  anonymization_version       text not null,

  created_by_user_id          uuid references public.users(id) on delete set null,
  created_at                  timestamptz not null default now()
);

create unique index training_snapshots_name_uidx
  on public.training_snapshots (name);

create index training_snapshots_task_created_idx
  on public.training_snapshots (task, created_at desc);

------------------------------------------------------------------------
-- training_runs
--
-- The execution of a training job. Separate from training_snapshots: a
-- snapshot is WHAT you trained on, a run is HOW (hyperparameters, machine,
-- duration). A snapshot can power many runs (hyperparam sweeps, retrains);
-- a run uses exactly one snapshot.
------------------------------------------------------------------------

create table public.training_runs (
  id                          uuid primary key default gen_random_uuid(),

  training_snapshot_id        uuid not null references public.training_snapshots(id) on delete restrict,

  status                      text not null default 'queued' check (status in (
                                'queued',
                                'running',
                                'succeeded',
                                'failed',
                                'cancelled'
                              )),

  hyperparameters             jsonb not null default '{}'::jsonb,   -- lr, batch_size, epochs, optimizer, augmentations, etc.
  framework                   text not null,                         -- 'pytorch', 'tensorflow', 'jax', 'external'
  base_model                  text,                                  -- starting weights: 'yolov8n', 'plantnet-v2', etc.

  -- Execution metadata
  machine_spec                jsonb,                                 -- gpu_type, gpu_count, ram, etc.
  artifact_uri                text,                                  -- where the trained weights landed
  log_uri                     text,                                  -- training logs / tensorboard
  loss_curve                  jsonb,                                 -- compact loss history for charting

  -- Outcome
  final_metrics               jsonb,                                 -- last-epoch training+val metrics
  error                       text,

  queued_at                   timestamptz not null default now(),
  started_at                  timestamptz,
  completed_at                timestamptz,

  created_by_user_id          uuid references public.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index training_runs_snapshot_idx
  on public.training_runs (training_snapshot_id);

create index training_runs_status_queued_idx
  on public.training_runs (status, queued_at)
  where status in ('queued', 'running');

create trigger training_runs_set_updated_at
  before update on public.training_runs
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- eval_sets
--
-- Frozen, immutable labeled sets used to benchmark every model. Versioned
-- because "model beat the frozen eval" loses meaning the moment we change
-- the eval set; we never mutate an eval_set after frozen_at.
--
-- Eval sets are platform-internal (not org-scoped). They draw from
-- anonymized data across opted-in orgs and curated public datasets.
------------------------------------------------------------------------

create table public.eval_sets (
  id                          uuid primary key default gen_random_uuid(),

  name                        text not null,
  task                        text not null check (task in (
                                'plant_classification',
                                'stand_count',
                                'tree_count',
                                'weed_detection',
                                'disease_detection',
                                'stage_classification'
                              )),
  description                 text,

  manifest                    jsonb not null,                        -- { items: [{ captureId, expected: {...} }] }
  manifest_uri                text,
  item_count                  integer not null,

  is_frozen                   boolean not null default true,
  frozen_at                   timestamptz not null default now(),

  created_by_user_id          uuid references public.users(id) on delete set null,
  created_at                  timestamptz not null default now()
);

create unique index eval_sets_name_uidx on public.eval_sets (name);
create index eval_sets_task_idx on public.eval_sets (task);

------------------------------------------------------------------------
-- model_evaluations
--
-- Per-(model, eval_set) results. Every model promotion must beat the current
-- production model on the relevant eval_set. This table is the durable record
-- of those comparisons.
------------------------------------------------------------------------

create table public.model_evaluations (
  id                          uuid primary key default gen_random_uuid(),

  model_version_id            uuid not null references public.model_versions(id) on delete cascade,
  eval_set_id                 uuid not null references public.eval_sets(id) on delete cascade,

  metrics                     jsonb not null,                        -- { precision, recall, mAP_50, mAP_95, per_class: {...} }
  notes                       text,
  evaluated_at                timestamptz not null default now()
);

-- A model is evaluated against an eval_set at most once. Re-evaluation means
-- new metrics — we overwrite via update, not insert.
create unique index model_evaluations_unique_uidx
  on public.model_evaluations (model_version_id, eval_set_id);
create index model_evaluations_eval_set_idx
  on public.model_evaluations (eval_set_id);

------------------------------------------------------------------------
-- capture_annotation_adjudications
--
-- Resolves inter-annotator disagreement into a canonical label for training.
-- capture_annotations preserves the raw opinions; this table records which
-- interpretation wins (and why), so the training pipeline can pull a clean
-- ground-truth label without majority-vote heuristics.
------------------------------------------------------------------------

create table public.capture_annotation_adjudications (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  capture_id                  uuid not null references public.captures(id) on delete cascade,

  -- Snapshot of disagreeing annotations at adjudication time. Array (not join
  -- table) because adjudications are immutable once created and we query in
  -- one direction: "what adjudicates this capture?"
  annotation_ids              uuid[] not null,

  resolution                  text not null check (resolution in (
                                'accept_one',       -- one of the existing annotations is canonical truth
                                'compose_new',      -- adjudicator wrote a new annotation
                                'all_wrong',        -- no annotation correct; capture flagged out of training
                                'unresolvable'      -- escalated; not used for training until resolved
                              )),

  -- The winning annotation (resolution='accept_one') or the newly composed
  -- annotation (resolution='compose_new'). Null for all_wrong / unresolvable.
  canonical_annotation_id     uuid references public.capture_annotations(id) on delete set null,

  adjudicator_user_id         uuid not null references public.users(id) on delete restrict,
  notes                       text,

  created_at                  timestamptz not null default now()
);

create index capture_annotation_adjudications_capture_idx
  on public.capture_annotation_adjudications (capture_id);
create index capture_annotation_adjudications_org_idx
  on public.capture_annotation_adjudications (org_id, created_at desc);
create index capture_annotation_adjudications_annotations_gin_idx
  on public.capture_annotation_adjudications using gin (annotation_ids);

------------------------------------------------------------------------
-- Close the cycle: model_versions.training_data_snapshot_id now resolves
-- to a real table. Also add training_run_id so we can answer "which run
-- produced these weights?"
------------------------------------------------------------------------

alter table public.model_versions
  add constraint model_versions_training_snapshot_fkey
  foreign key (training_data_snapshot_id)
  references public.training_snapshots(id)
  on delete set null;

alter table public.model_versions
  add column training_run_id uuid references public.training_runs(id) on delete set null;

------------------------------------------------------------------------
-- organizations.training_corpus_opt_in
--
-- Per-org consent for derived training data (anonymized embeddings, cropped
-- patches) to enter the platform-global training_corpus. Defaults to true for
-- v0 since we're pre-customer; flip to default false (and require explicit
-- opt-in) before the first real customer ships.
------------------------------------------------------------------------

alter table public.organizations
  add column training_corpus_opt_in boolean not null default true;

comment on column public.organizations.training_corpus_opt_in is
  'When true, derived/anonymized artifacts from this org''s captures may enter the platform-wide training corpus. Raw captures remain tenant-owned regardless. Default true for v0; flip before customer ship.';

------------------------------------------------------------------------
-- captures.inferred_crop_type / inferred_crop_stage
--
-- Capture-level dominant classification, denormalized from analysis_results
-- for fast filtering ("show all citrus captures in this field"). Set by the
-- worker after analysis: highest-confidence detection's category becomes the
-- inferred type; stage is either model-predicted or derived from
-- crop_plantings.planting_date + GDD when a field is assigned.
--
-- Both are nullable: backyard captures may have no resolved type until human
-- review; new captures are null until the worker writes them.
------------------------------------------------------------------------

alter table public.captures
  add column inferred_species text,                          -- raw model output, e.g. 'citrus_sinensis'
  add column inferred_crop_type_id uuid references public.crop_types(id) on delete set null,
  add column inferred_crop_stage text;

create index captures_inferred_crop_type_idx
  on public.captures (org_id, inferred_crop_type_id)
  where inferred_crop_type_id is not null;

create index captures_inferred_species_idx
  on public.captures (org_id, inferred_species)
  where inferred_species is not null;

------------------------------------------------------------------------
-- RLS: new tables follow the same posture as the rest of 0006.
--
-- Platform-global (authenticated can SELECT all):
--   model_versions, model_evaluations
--     — anyone authenticated needs to know what version produced a detection.
--
-- Platform-internal (service_role only, no authenticated SELECT):
--   training_snapshots, training_runs, eval_sets
--     — these reference data across opted-in orgs after anonymization. Direct
--       authenticated access would leak cross-tenant information. Portal UI
--       surfaces summary views through service-role app code.
--
-- Org-scoped:
--   capture_annotations, capture_annotation_adjudications
--     — scoped via current_org_id(); same pattern as captures / analysis_results.
--
-- All writes go through service-role app code regardless.
------------------------------------------------------------------------

alter table public.model_versions                       enable row level security;
alter table public.capture_annotations                  enable row level security;
alter table public.training_snapshots                   enable row level security;
alter table public.training_runs                        enable row level security;
alter table public.eval_sets                            enable row level security;
alter table public.model_evaluations                    enable row level security;
alter table public.capture_annotation_adjudications     enable row level security;

-- service_role bypass on all new tables (belt-and-suspenders).
do $$
declare
  t text;
  tables text[] := array[
    'model_versions','capture_annotations',
    'training_snapshots','training_runs','eval_sets','model_evaluations',
    'capture_annotation_adjudications'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on public.%I as permissive for all to service_role using (true) with check (true);',
      t || '_service_role_all', t
    );
  end loop;
end$$;

-- Platform-global SELECT for authenticated.
create policy model_versions_select_all
  on public.model_versions for select to authenticated
  using (true);

create policy model_evaluations_select_all
  on public.model_evaluations for select to authenticated
  using (true);

-- Org-scoped SELECT for authenticated.
create policy capture_annotations_select_org
  on public.capture_annotations for select to authenticated
  using (org_id = public.current_org_id());

create policy capture_annotation_adjudications_select_org
  on public.capture_annotation_adjudications for select to authenticated
  using (org_id = public.current_org_id());

-- training_snapshots, training_runs, eval_sets: deny-all to authenticated.
-- No SELECT policy granted; default-deny applies.
