# services/vision

CropAutonomy's inference service. Python + FastAPI. Provider-abstracted so PlantNet today, Roboflow / YOLO tomorrow, and our own PyTorch models later all sit behind the same `/v1/inference` contract — the worker, the API, and the schema never need to know which model produced a result.

## Why this exists as its own service

`services/api` (Fastify, Node) is browser-facing and stays small. `services/workers` (pg-boss, Node) is orchestration. The actual model math is Python — that's where PyTorch, scikit-learn, ONNX Runtime, and Triton live. Splitting them keeps orchestration in Node where it belongs and lets the inference service scale independently (eventually on GPU nodes).

See [`docs/architecture/capture-pipeline.md`](../../docs/architecture/capture-pipeline.md) for the full pipeline and `docs/architecture/queueing-email-analytics.md` for the queue contract.

## HTTP surface

| Method | Path             | Purpose                                                            |
|--------|------------------|--------------------------------------------------------------------|
| GET    | `/v1/health`     | Liveness + which providers have credentials                        |
| GET    | `/v1/models`     | Registered providers (matches `model_versions` rows in the DB)     |
| POST   | `/v1/inference`  | Multipart: `request` (JSON `InferenceRequest`) + `image` (binary)  |
| GET    | `/v1/docs`       | OpenAPI / Swagger UI                                               |

Response shape mirrors the `analysis_results` table so the worker can write rows directly.

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
python -m uvicorn vision.main:app --reload --port 8080
```

If `Activate.ps1` errors with execution-policy refusal, allow it for the current shell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

Health check:

```powershell
curl http://localhost:8080/v1/health
```

Smoke test against PlantNet (replace `image.jpg`):

```powershell
curl -X POST http://localhost:8080/v1/inference `
  -F 'request={"capture_id":"test","model_name":"plantnet_api","model_version":"v2","task":"plant_classification","max_results":5};type=application/json' `
  -F 'image=@image.jpg'
```

## Provider registry

Concrete providers live under `src/vision/providers/`. Each subclasses `InferenceProvider` (see `providers/base.py`) and is instantiated in `providers/registry.py`. Adding a new model = one new file + one line in `registry.py`. The HTTP API does not change.

Current providers:

| name          | version | task                    | type                  |
|---------------|---------|-------------------------|-----------------------|
| `plantnet_api`| `v2`    | `plant_classification`  | external (HTTP API)   |

`(name, version)` matches `model_versions.name` / `model_versions.version` in the database. The DB is the source of truth for status (shadow/production/retired); the in-service registry is just the dispatch table for what can actually be called.

## PlantNet specifics

PlantNet is **classification-only**: it returns whole-image species scores, not bounding boxes. `Detection.bounding_box` is `null` for PlantNet results. The portal labeling UI shows the suggestion against the whole image; humans confirm/correct in the suggest-then-confirm pattern (per `project-ml-phase2-strategy` memory and [`docs/architecture/capture-pipeline.md`](../../docs/architecture/capture-pipeline.md)).

Free tier: 500 requests/day. Sufficient for backyard testing and early labeling-loop validation. Production volume needs a paid plan or a self-hosted detection model (next provider to add).

## What's next

- Wire `services/workers` to call `/v1/inference` from the `scan.analysis.requested` job handler.
- Add a Roboflow / YOLO provider for actual detection (bounding boxes, multi-plant per image).
- Add our own PyTorch fine-tune once we have ~1k labeled captures.
