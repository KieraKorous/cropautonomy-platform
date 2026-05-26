-- Pipeline architecture: composable inference stages.
--
-- Replaces the "one production model per task" rule with a "one production
-- pipeline per task" rule. Pipelines are DB-defined compositions of ordered
-- pipeline_stages, each referencing a model_versions row + per-stage config.
-- See project memory project-pipeline-architecture for the full rationale.
--
-- Concretely, this migration:
--   1. Drops the unique partial index that limited model_versions to one
--      production row per task. Canonicality now lives on pipelines.
--   2. Creates pipelines + pipeline_stages tables.
--   3. Adds analysis_jobs.pipeline_id (links a job to the pipeline that ran it)
--      and analysis_results.provenance jsonb (per-detection: which stage
--      produced bbox vs class label).
--   4. Seeds the v0 default-plant@v1 pipeline (single PlantNet classification
--      stage) and promotes both the pipeline and the underlying model_version
--      to production.

------------------------------------------------------------------------
-- 1. Drop the old "one prod model per task" constraint.
--    Pipelines own canonicality now; a model_version can be referenced by
--    multiple non-production pipelines for shadow comparison, or live as a
--    fallback stage in a production pipeline while another model is primary.
------------------------------------------------------------------------

drop index if exists public.model_versions_task_production_uidx;

------------------------------------------------------------------------
-- 2a. pipelines
------------------------------------------------------------------------

create table public.pipelines (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  version         text not null,
  task            text not null check (task in (
                    'plant_classification',
                    'stand_count',
                    'tree_count',
                    'weed_detection',
                    'disease_detection',
                    'stage_classification'
                  )),
  description     text,
  status          text not null default 'shadow' check (status in (
                    'draft', 'shadow', 'production', 'retired'
                  )),
  promoted_at     timestamptz,
  notes           text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index pipelines_name_version_uidx
  on public.pipelines (name, version);

-- At most one production pipeline per task. Promote a new pipeline by
-- demoting the current production one first (or run both in a transaction).
create unique index pipelines_task_production_uidx
  on public.pipelines (task)
  where status = 'production';

create index pipelines_task_status_idx
  on public.pipelines (task, status);

create trigger pipelines_set_updated_at
  before update on public.pipelines
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- 2b. pipeline_stages
--
-- Ordered stages within a pipeline. Each stage points at a model_versions
-- row (the "what's running here") and carries config (the "how to run it").
-- on delete restrict on model_version_id: deleting a model that's still
-- referenced by a pipeline_stages row should be intentional.
------------------------------------------------------------------------

create table public.pipeline_stages (
  id                uuid primary key default gen_random_uuid(),
  pipeline_id       uuid not null references public.pipelines(id) on delete cascade,
  stage_order       integer not null,
  role              text not null check (role in (
                      'detection',
                      'classification',
                      'refinement',
                      'filter'
                    )),
  model_version_id  uuid not null references public.model_versions(id) on delete restrict,
  config            jsonb not null default '{}'::jsonb,
  enabled           boolean not null default true,
  -- When required=false, the pipeline continues if this stage fails (logs
  -- the error in analysis_jobs.metadata). Use for optional fallback stages.
  required          boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index pipeline_stages_order_uidx
  on public.pipeline_stages (pipeline_id, stage_order);

create index pipeline_stages_pipeline_idx
  on public.pipeline_stages (pipeline_id);

create index pipeline_stages_model_version_idx
  on public.pipeline_stages (model_version_id);

create trigger pipeline_stages_set_updated_at
  before update on public.pipeline_stages
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- 3. Link analysis_jobs to the pipeline that produced it, and add
--    per-detection provenance on analysis_results.
------------------------------------------------------------------------

alter table public.analysis_jobs
  add column pipeline_id uuid references public.pipelines(id) on delete set null;

create index analysis_jobs_pipeline_idx
  on public.analysis_jobs (pipeline_id)
  where pipeline_id is not null;

alter table public.analysis_results
  add column provenance jsonb not null default '{}'::jsonb;

------------------------------------------------------------------------
-- 4. RLS for new tables (platform-global readable: anyone authenticated
--    can see what the system is composed of; mutations only via service
--    role).
------------------------------------------------------------------------

alter table public.pipelines        enable row level security;
alter table public.pipeline_stages  enable row level security;

create policy pipelines_service_role_all
  on public.pipelines as permissive for all to service_role
  using (true) with check (true);

create policy pipeline_stages_service_role_all
  on public.pipeline_stages as permissive for all to service_role
  using (true) with check (true);

create policy pipelines_select_all
  on public.pipelines for select to authenticated using (true);

create policy pipeline_stages_select_all
  on public.pipeline_stages for select to authenticated using (true);

------------------------------------------------------------------------
-- 5. Seed the v0 production pipeline: default-plant@v1.
--    One classification stage backed by plantnet_api@v2.
--    Promotes both the pipeline and the underlying model to production.
------------------------------------------------------------------------

do $$
declare
  v_pipeline_id uuid;
  v_plantnet_id uuid;
begin
  select id into v_plantnet_id
    from public.model_versions
    where name = 'plantnet_api' and version = 'v2';

  if v_plantnet_id is null then
    raise exception 'expected plantnet_api@v2 in model_versions; run 0008 + seed_plantnet_model_version first';
  end if;

  insert into public.pipelines (
    name, version, task, description, status, promoted_at, notes
  ) values (
    'default-plant',
    'v1',
    'plant_classification',
    'v0 baseline pipeline: single PlantNet classification stage. Whole-image species ID; no bounding boxes.',
    'production',
    now(),
    'Evolution path (no schema changes needed, just new pipeline rows): v2 adds a YOLO detection stage in front (per-plant bboxes), v3 swaps the primary stage for our own fine-tuned model with YOLO/PlantNet as fallbacks. See project memory project-pipeline-architecture.'
  )
  returning id into v_pipeline_id;

  insert into public.pipeline_stages (
    pipeline_id, stage_order, role, model_version_id, config, enabled, required
  ) values (
    v_pipeline_id, 1, 'classification', v_plantnet_id,
    '{"max_results": 10}'::jsonb,
    true, true
  );

  -- Promote PlantNet to production; it's now actively used by a production
  -- pipeline. (model_versions.status is informational lifecycle; pipelines.status
  -- is the canonicality source of truth.)
  update public.model_versions
    set status = 'production', promoted_at = coalesce(promoted_at, now())
    where id = v_plantnet_id;
end$$;
