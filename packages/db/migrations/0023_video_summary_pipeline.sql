-- 0023_video_summary_pipeline.sql
--
-- Give session recordings (kind='session_recording', a video capture) an AI
-- description, mirroring what photos get. Videos used to skip analysis entirely
-- (finalize returned early). Now a recording is enqueued like a photo, but onto
-- a video-specific task + pipeline:
--
--   task  'video_summary'      (new — pipelines.task check widened below)
--   pipeline  default-video@v1 (one stage)
--   stage  video_summary@v1, role 'summary'
--
-- The vision stage samples a few frames from the clip and asks Claude for a
-- short whole-clip description + flagged plant issues (observation_type /
-- severity), reusing the existing inferred_summary / inferred_details /
-- observation_type / severity columns. No detections are produced.
--
-- Idempotent: safe to re-run.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0023_video_summary_pipeline.sql
------------------------------------------------------------------------------

------------------------------------------------------------------------
-- 1. Widen pipelines.task to allow the new 'video_summary' task.
--    The inline check from 0009 is auto-named pipelines_task_check.
------------------------------------------------------------------------

alter table public.pipelines
  drop constraint if exists pipelines_task_check;

alter table public.pipelines
  add constraint pipelines_task_check check (task in (
    'plant_classification',
    'stand_count',
    'tree_count',
    'weed_detection',
    'disease_detection',
    'stage_classification',
    'video_summary'   -- whole-clip description + plant-issue flags for recordings
  ));

------------------------------------------------------------------------
-- 2. Register the video-summary model.
--    Like agronomic_summary@v1, the concrete Claude model id lives in the
--    stage config (swappable without a migration); this row is the registry
--    handle the vision StageRegistry resolves (name, version) against.
------------------------------------------------------------------------

insert into public.model_versions (
  name, version, task, framework, external_provider,
  artifact_uri, training_data_snapshot_id, eval_metrics,
  status, promoted_at, notes
) values (
  'video_summary',
  'v1',
  'plant_classification',  -- registry handle reuses an existing task value; the
                           -- pipeline-level task ('video_summary') is what routes.
  'external_api',
  'anthropic',
  null,
  null,
  '{}'::jsonb,
  'production',
  now(),
  'Summary stage for session recordings (default-video@v1). Samples a few frames from the clip and asks Claude (multimodal) for a short whole-clip description + best-effort plant-issue tags. Optional: when ANTHROPIC_API_KEY is unset the stage reports unconfigured and the pipeline still succeeds (empty summary). Concrete model id is in pipeline_stages.config.model.'
)
on conflict (name, version) do nothing;

------------------------------------------------------------------------
-- 3. Create default-video@v1 as the production pipeline for 'video_summary'.
--    Single summary-role stage; no detection/classification (those decode
--    a still image and would choke on video bytes).
------------------------------------------------------------------------

do $$
declare
  v_pipeline_id  uuid;
  v_model_id     uuid;
begin
  select id into v_model_id
    from public.model_versions
    where name = 'video_summary' and version = 'v1';
  if v_model_id is null then
    raise exception 'expected video_summary@v1 in model_versions';
  end if;

  -- Idempotent: skip if the pipeline already exists.
  if exists (
    select 1 from public.pipelines where name = 'default-video' and version = 'v1'
  ) then
    return;
  end if;

  insert into public.pipelines (
    name, version, task, description, status, promoted_at, notes
  ) values (
    'default-video',
    'v1',
    'video_summary',
    'v0 recording pipeline: one summary stage that samples frames from the clip and asks Claude for a short whole-clip description + flagged plant issues. No bounding-box detection.',
    'production',
    now(),
    'Frame count + model id live in pipeline_stages.config. Optional stage (required=false) so a deploy without ANTHROPIC_API_KEY still finalizes recordings — they just get no description.'
  )
  returning id into v_pipeline_id;

  insert into public.pipeline_stages (
    pipeline_id, stage_order, role, model_version_id, config, enabled, required
  ) values (
    v_pipeline_id, 1, 'summary', v_model_id,
    '{"model": "claude-sonnet-4-6", "max_tokens": 600, "frames": 4}'::jsonb,
    true, false
  );
end$$;
