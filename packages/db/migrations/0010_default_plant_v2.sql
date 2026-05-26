-- default-plant@v2: detection + classification.
--
-- v1 was a single PlantNet classification stage (whole-image species ID).
-- v2 adds RT-DETR as the detection stage in front, producing bounding boxes
-- with COCO+Objects365 class labels for each detected object. PlantNet
-- still runs as the classification stage in parallel (whole-image species
-- prediction), so the worker ends up with:
--   - per-bbox detections from RT-DETR (where things are, generic class
--     names like 'potted plant', 'tree', 'apple', 'orange'),
--   - plus whole-image species detections from PlantNet (what the dominant
--     subject is, scientific name).
--
-- Each detection carries provenance recording which stage produced it.
-- The portal labeling UI shows both signals; humans confirm/correct.
--
-- RT-DETR (PekingU/rtdetr_r50vd_coco_o365) is Apache 2.0, the only
-- license compatible with our docs/dependency-policy.md. YOLOv8/YOLO11
-- are NOT used (AGPL).

------------------------------------------------------------------------
-- 1. Register the RT-DETR model_version.
------------------------------------------------------------------------

insert into public.model_versions (
  name, version, task, framework, external_provider,
  artifact_uri, training_data_snapshot_id, eval_metrics,
  status, promoted_at, notes
) values (
  'rtdetr_coco_o365',
  'r50vd',
  'plant_classification',  -- pipeline-level task; this stage is detection within it
  'pytorch',
  null,
  'https://huggingface.co/PekingU/rtdetr_r50vd_coco_o365',
  null,
  '{}'::jsonb,
  'production',
  now(),
  'RT-DETR R50vd pretrained on COCO + Objects365. Apache 2.0. Used as the detection stage in default-plant@v2 — produces bboxes with generic plant/produce class labels; PlantNet refines at the whole-image level. Replace with a fine-tuned model once we have ~1k labeled captures. NEVER replace with Ultralytics YOLO (AGPL) — see docs/dependency-policy.md.'
)
on conflict (name, version) do nothing;

------------------------------------------------------------------------
-- 2. Demote default-plant@v1 to shadow (kept around for fallback / comparison).
------------------------------------------------------------------------

update public.pipelines
  set status = 'shadow'
  where name = 'default-plant' and version = 'v1' and status = 'production';

------------------------------------------------------------------------
-- 3. Create default-plant@v2 as production, with two stages.
------------------------------------------------------------------------

do $$
declare
  v_pipeline_id   uuid;
  v_rtdetr_id     uuid;
  v_plantnet_id   uuid;
begin
  select id into v_rtdetr_id
    from public.model_versions
    where name = 'rtdetr_coco_o365' and version = 'r50vd';
  if v_rtdetr_id is null then
    raise exception 'expected rtdetr_coco_o365@r50vd in model_versions';
  end if;

  select id into v_plantnet_id
    from public.model_versions
    where name = 'plantnet_api' and version = 'v2';
  if v_plantnet_id is null then
    raise exception 'expected plantnet_api@v2 in model_versions';
  end if;

  insert into public.pipelines (
    name, version, task, description, status, promoted_at, notes
  ) values (
    'default-plant',
    'v2',
    'plant_classification',
    'v0 production pipeline: RT-DETR detection (bboxes + COCO/Objects365 classes) + PlantNet classification (whole-image species). Detections carry provenance recording which stage produced bbox vs class label.',
    'production',
    now(),
    'Evolution path: v3 swaps the detection stage for our own fine-tuned model once we have ~1k labeled captures from the suggest-then-confirm loop. PlantNet remains as the classification stage until our own classifier beats it on the frozen eval set.'
  )
  returning id into v_pipeline_id;

  insert into public.pipeline_stages (
    pipeline_id, stage_order, role, model_version_id, config, enabled, required
  ) values
    -- Stage 1: RT-DETR detection. Required: pipeline fails if torch +
    -- transformers can't load. This surfaces config issues immediately
    -- instead of silently degrading to PlantNet-only.
    (
      v_pipeline_id, 1, 'detection', v_rtdetr_id,
      '{"confidence_threshold": 0.3, "max_detections": 100}'::jsonb,
      true, true
    ),
    -- Stage 2: PlantNet classification. Optional: if PlantNet's free tier
    -- is exhausted or the key isn't set, we still get RT-DETR detections.
    (
      v_pipeline_id, 2, 'classification', v_plantnet_id,
      '{"max_results": 10}'::jsonb,
      true, false
    );
end$$;
