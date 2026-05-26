# services/vision

CropAutonomy's inference service. Python + FastAPI. **Stateless pipeline executor**: the worker resolves the production pipeline from the database, vision runs the stages in order. New stages = one new file. New pipelines = DB rows. The worker, the API, and the schema never need to know which model produced which detection.

## Why this exists as its own service

`services/api` (Fastify, Node) is browser-facing and stays small. `services/workers` (pg-boss, Node) is orchestration. The actual model math is Python — that's where PyTorch, scikit-learn, ONNX Runtime, and Triton live. Splitting them keeps orchestration in Node where it belongs and lets the inference service scale independently (eventually on GPU nodes).

See [`docs/architecture/capture-pipeline.md`](../../docs/architecture/capture-pipeline.md) for the full pipeline and the `project-pipeline-architecture` memory for the why-it's-shaped-this-way.

## Pipeline architecture (in one diagram)

```
worker                            vision (stateless)
------                            ------------------
read pipelines + pipeline_stages
  for task                ------>  POST /v1/inference
build StageSpec[]                  (multipart: pipeline spec + image bytes)
                                   ↓
                                   PipelineExecutor runs each stage in order
                                   ↓
                                   • detection      → may produce bboxes
                                   • classification → may produce/refine class labels
                                   • refinement     → post-process (NMS, merge, dedup)
                                   • filter         → drop by confidence/category
                                   ↓
                          <------  Detection[] + per-stage StageReport[]
write analysis_results
  with provenance per detection
  ({bbox_from: "...", class_from: "..."})
publish scan.detection events
```

The vision instance never queries the database. The worker is the orchestrator; vision is a compute layer. Every detection records `provenance` (which stage produced its bbox, which produced its class label) so when something is wrong we know exactly which stage to blame and which to retrain.

## HTTP surface

| Method | Path             | Purpose                                                                       |
|--------|------------------|-------------------------------------------------------------------------------|
| GET    | `/v1/health`     | Liveness + which stage implementations have credentials configured            |
| GET    | `/v1/stages`     | Registered stage implementations (match `model_versions` rows in the DB)      |
| POST   | `/v1/inference`  | Multipart: `request` (JSON `InferenceRequest` with full PipelineSpec) + `image` |
| GET    | `/v1/docs`       | OpenAPI / Swagger UI                                                          |

Response shape carries `detections[]` (with provenance) plus `stage_reports[]` (per-stage timing + skip reasons + output metadata) so the worker can populate `analysis_results.provenance` and `analysis_jobs.metadata` directly.

No auth in v0 — the service is cluster-internal. Add a shared-secret header or mTLS before it's reachable outside the cluster.

## Local development

Requires Python 3.12+. Verify with `python --version`; if it's older, use the `py` launcher: `py -3.12 -m venv .venv`.

```powershell
cd services\vision
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
copy .env.example .env
# fill in PLANTNET_API_KEY in .env

# Use `python -m uvicorn` rather than bare `uvicorn` — works even when the
# venv's Scripts directory isn't on PATH (common cause of "uvicorn: term not
# recognized" errors).
python -m uvicorn vision.main:app --reload --port 8081
```

If `Activate.ps1` errors with execution-policy refusal, allow it for the current shell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

Health check:

```powershell
curl http://localhost:8081/v1/health
```

Smoke test against the production pipeline (`default-plant@v1`, currently a single PlantNet stage). Replace `image.jpg`:

```powershell
$req = '{
  "capture_id": "smoke-test",
  "task": "plant_classification",
  "pipeline": {
    "name": "default-plant",
    "version": "v1",
    "stages": [{
      "role": "classification",
      "model_name": "plantnet_api",
      "model_version": "v2",
      "config": {"max_results": 5},
      "enabled": true,
      "required": true
    }]
  }
}'
curl -X POST http://localhost:8081/v1/inference `
  -F "request=$req;type=application/json" `
  -F 'image=@image.jpg'
```

## Stage registry vs pipeline registry

Two registries, two scopes:

| Registry                          | Lives in              | Holds                                                 |
|-----------------------------------|-----------------------|-------------------------------------------------------|
| **Stage registry** (this service) | `stages/registry.py`  | Concrete Python implementations: `(name, version) → Stage` |
| **Pipeline registry**             | DB: `pipelines` + `pipeline_stages` tables | Which stages compose which pipeline, in what order, with what config |

Adding a new stage type = one new file in `src/vision/stages/` + one line in `stages/registry.py` (instantiate it). The HTTP API does not change.

Composing a new pipeline = INSERT into `pipelines` + N INSERTs into `pipeline_stages`. No service deploy needed; the worker picks up the new pipeline the next time it queries for the production version.

Current stage implementations:

| name                | version | role             | implementation                              | License    |
|---------------------|---------|------------------|---------------------------------------------|------------|
| `rtdetr_coco_o365`  | `r50vd` | `detection`      | RT-DETR via Hugging Face `transformers`     | Apache 2.0 |
| `plantnet_api`      | `v2`    | `classification` | external HTTP API to my-api.plantnet.org    | PlantNet ToS (SaaS) |

`(name, version)` matches `model_versions.name` / `model_versions.version` in the database.

**Production pipeline: `default-plant@v2`** — RT-DETR detection → PlantNet classification. The RT-DETR stage is required; PlantNet is optional (free-tier exhaustion or missing key degrades to detection-only, doesn't fail the pipeline).

## RT-DETR specifics (detection stage)

**Apache 2.0 only.** We deliberately use RT-DETR over Ultralytics YOLOv8/YOLO11 because the YOLO family is AGPL-3.0 and would force CropAutonomy to be AGPL-licensed (or pay Ultralytics for a commercial license). See [`docs/dependency-policy.md`](../../docs/dependency-policy.md). Do not swap RT-DETR for any AGPL/GPL detector.

**Heavy dependencies.** Adding RT-DETR brings in `torch` + `transformers` + `pillow` — about **1.5 GB** total install (CPU-only PyTorch wheels). First inference call downloads the model weights (~110 MB) from Hugging Face Hub to `~/.cache/huggingface`. Subsequent calls reuse the cached model.

**Lazy load.** The `RTDetrStage` does NOT load the model at startup or healthcheck — only on the first `/v1/inference` call. This keeps boot times low and lets `/v1/health` return 200 even if the model is unavailable. If torch/transformers can't be imported, the stage reports `configured=false` and the pipeline returns 503 for required-stage requests.

**Pretrained classes.** `PekingU/rtdetr_r50vd_coco_o365` knows ~445 COCO + Objects365 classes — useful spread of plant/produce ('potted plant', 'tree', 'apple', 'orange', 'broccoli', 'flower', 'carrot', etc.). This is the v0 detection baseline; we fine-tune on labeled captures once we have ~1k, then ship `default-plant@v3` with our own detector as a new pipeline.

**CPU vs GPU.** Default device is CPU. Inference is ~300-800 ms per image on a modern laptop CPU, ~20-50 ms on GPU. Set `RTDETR_DEVICE=cuda` in `.env` if you have a CUDA-capable GPU and CUDA torch wheels installed; the stage auto-falls-back to CPU if `torch.cuda.is_available()` is false.

## PlantNet specifics

PlantNet is **classification-only**: it returns whole-image species scores, not bounding boxes. In the v0 `default-plant@v1` pipeline it's the only stage, so detections have `bounding_box: null` and the portal labeling UI shows the suggestion against the whole image. Humans confirm/correct in the suggest-then-confirm pattern (per `project-ml-phase2-strategy` memory).

Free tier: 500 requests/day. Sufficient for backyard testing and early labeling-loop validation. When we add a YOLO detection stage in `default-plant@v2`, PlantNet moves to a per-bbox classification role (only called on cropped detection regions, smaller payload, similar request count).

## What's next

- Fine-tune RT-DETR (or a successor detector) on our labeled captures once we have ~1k human-confirmed annotations. Goes in as `default-plant@v3` with our own detector as the production stage; v2 stays as shadow for comparison.
- Add a per-bbox classification mode for PlantNet (crop each detection region, classify each crop) once we hit volume that justifies it. Currently PlantNet runs whole-image alongside RT-DETR's bboxes.
