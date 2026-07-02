-- 0024_analysis_finding_type.sql
--
-- Phase 1 of the capture-analysis-intelligence layer: expand analysis beyond
-- "plant type" to typed, multi-domain findings (pests, disease/virus, weeds,
-- nutrient, soil-surface, damage, growth stage). See
-- docs/architecture/capture-analysis-intelligence.md.
--
-- This migration is the DATA-MODEL half of Phase 1:
--   1. analysis_results gains a finding_type discriminator + a measured
--      severity (severity_pct, % tissue affected) + a coarse severity class +
--      an optional segmentation mask. category stays open-vocabulary text.
--   2. capture_annotations gains finding_type so a confirmed finding records
--      its domain in the corpus.
--   3. captures gains a modality (rgb now; multispectral/thermal-ready) and
--      denormalized rollups (finding_types[], top_findings) for fast list
--      filtering ("captures with detected aphids in this field").
--   4. Registers agronomic_summary@v2 (the multimodal findings generator) and
--      repoints default-plant@v2's summary stage from v1 -> v2.
--
-- The vision-service code change (agronomic_summary -> v2, multimodal, emits
-- findings) ships WITH this migration: the executor hard-fails an unknown
-- (name, version), so deploy the vision image and this migration together.
--
-- finding_type vocabulary is a superset of captures.observation_type (0016)
-- plus 'plant' and 'soil':
--   plant | disease | pest | weed | nutrient | irrigation | soil | damage |
--   growth_stage | other
--
-- Idempotent: safe to re-run.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0024_analysis_finding_type.sql
------------------------------------------------------------------------------

------------------------------------------------------------------------
-- 1. analysis_results: finding_type + severity + segmentation.
--    finding_type is NOT NULL default 'plant' so the ~existing rows (all plant
--    classifications) backfill automatically.
------------------------------------------------------------------------

alter table public.analysis_results
  add column if not exists finding_type text not null default 'plant'
    check (finding_type in (
      'plant', 'disease', 'pest', 'weed', 'nutrient',
      'irrigation', 'soil', 'damage', 'growth_stage', 'other'
    )),
  -- Coarse urgency, mirrors captures.severity. Best-effort from the model.
  add column if not exists severity text
    check (severity is null or severity in ('low', 'medium', 'high')),
  -- Measured severity: % of tissue affected (plant-pathology standard). Coarse
  -- estimate from the LLM seed today; measured by the segmentation model later.
  add column if not exists severity_pct numeric(5, 2)
    check (severity_pct is null or (severity_pct >= 0 and severity_pct <= 100)),
  -- Optional segmentation mask (normalized polygon / RLE, image space). Null for
  -- bbox-only or whole-image findings; populated by the Phase 4 seg model.
  add column if not exists segmentation jsonb;

-- "all <finding_type> findings on this capture" and the per-domain rollup.
create index if not exists analysis_results_capture_finding_idx
  on public.analysis_results (capture_id, finding_type);

-- "most-confident <finding_type> findings across the org" (heat maps, queues).
create index if not exists analysis_results_org_finding_conf_idx
  on public.analysis_results (org_id, finding_type, confidence desc);

------------------------------------------------------------------------
-- 2. capture_annotations: finding_type (nullable — Phase 3 populates it).
------------------------------------------------------------------------

alter table public.capture_annotations
  add column if not exists finding_type text
    check (finding_type is null or finding_type in (
      'plant', 'disease', 'pest', 'weed', 'nutrient',
      'irrigation', 'soil', 'damage', 'growth_stage', 'other'
    ));

create index if not exists capture_annotations_finding_type_idx
  on public.capture_annotations (org_id, finding_type)
  where finding_type is not null;

------------------------------------------------------------------------
-- 3. captures: sensor modality + denormalized finding rollups.
--    modality is rgb today; the column exists so multispectral/thermal GAIA
--    inputs slot in without a later capture-model rewrite.
--    finding_types[] powers "captures where a pest was detected" via GIN;
--    top_findings holds the top finding per domain for list display.
------------------------------------------------------------------------

alter table public.captures
  add column if not exists modality text not null default 'rgb'
    check (modality in ('rgb', 'multispectral', 'thermal', 'hyperspectral', 'other')),
  add column if not exists finding_types text[],
  add column if not exists top_findings jsonb not null default '{}'::jsonb;

create index if not exists captures_finding_types_gin
  on public.captures using gin (finding_types);

------------------------------------------------------------------------
-- 4. Register agronomic_summary@v2 and repoint default-plant@v2's summary
--    stage. v2 is the same Claude stage evolved to be multimodal (sees the
--    image) and to emit typed findings as detections in addition to the
--    capture-level brief. The concrete model id + token budget live in
--    pipeline_stages.config (swappable without a migration).
------------------------------------------------------------------------

insert into public.model_versions (
  name, version, task, framework, external_provider,
  artifact_uri, training_data_snapshot_id, eval_metrics,
  status, promoted_at, notes
) values (
  'agronomic_summary',
  'v2',
  'plant_classification',
  'external_api',
  'anthropic',
  null,
  null,
  '{}'::jsonb,
  'production',
  now(),
  'Multimodal findings generator (Claude). Sees the capture image + upstream RT-DETR/PlantNet detections and returns (1) the capture-level agronomic brief (summary/details/observation_type/severity, as v1 did) AND (2) a typed findings[] array (pest/disease/weed/nutrient/soil/damage/growth_stage) appended as analysis_results detections. LLM SEED per docs/decisions/0003 — suggestions, not truth; replaced per-domain by trained models over time. Optional: skips when ANTHROPIC_API_KEY is unset.'
)
on conflict (name, version) do nothing;

-- Retire v1: it is no longer referenced once the stage is repointed below.
update public.model_versions
  set status = 'retired'
  where name = 'agronomic_summary' and version = 'v1'
    and status <> 'retired';

do $$
declare
  v_pipeline_id uuid;
  v_v1_id       uuid;
  v_v2_id       uuid;
begin
  select id into v_pipeline_id
    from public.pipelines
    where name = 'default-plant' and version = 'v2';
  if v_pipeline_id is null then
    raise exception 'expected default-plant@v2 in pipelines';
  end if;

  select id into v_v2_id
    from public.model_versions
    where name = 'agronomic_summary' and version = 'v2';
  if v_v2_id is null then
    raise exception 'expected agronomic_summary@v2 in model_versions';
  end if;

  select id into v_v1_id
    from public.model_versions
    where name = 'agronomic_summary' and version = 'v1';

  -- Repoint the summary stage v1 -> v2 and give it the larger token budget the
  -- findings JSON needs. Idempotent: if already on v2 (re-run), the WHERE on the
  -- v1 id matches nothing.
  if v_v1_id is not null then
    update public.pipeline_stages
      set model_version_id = v_v2_id,
          config = coalesce(config, '{}'::jsonb)
                   || '{"model": "claude-sonnet-4-6", "max_tokens": 900}'::jsonb
      where pipeline_id = v_pipeline_id
        and role = 'summary'
        and model_version_id = v_v1_id;
  end if;
end$$;
