"""FastAPI app for services/vision.

Pipeline-aware contract:
  GET  /v1/health     — liveness + which stage implementations are configured
  GET  /v1/stages     — list registered stage implementations (the things a
                        pipeline_stages row can point at via model_name/version)
  POST /v1/inference  — multipart: 'request' (JSON InferenceRequest carrying a
                        full PipelineSpec) + 'image' (binary)

Vision is a stateless executor. The worker resolves the production pipeline
from the database and passes the full StageSpec list inline. Vision does NOT
hold database credentials or cache pipeline definitions.

The worker is the only intended caller. No auth in v0 (cluster-internal).
Add a shared-secret header or mTLS before this is reachable outside the
cluster.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from . import __version__
from .config import get_settings
from .pipeline import PipelineExecutor, StageNotRegisteredError
from .schemas import (
    HealthResponse,
    InferenceRequest,
    InferenceResponse,
    StageDescriptor,
)
from .stages import StageNotConfigured, StageError, get_registry

logger = logging.getLogger(__name__)

app = FastAPI(
    title="GAIA Vision",
    version=__version__,
    docs_url="/v1/docs",
    openapi_url="/v1/openapi.json",
)


@app.get("/v1/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    registry = get_registry()
    configured = [s.key for s in registry.all() if s.configured]
    return HealthResponse(status="ok", version=__version__, stages_configured=configured)


@app.get("/v1/stages", response_model=list[StageDescriptor])
async def list_stages() -> list[StageDescriptor]:
    registry = get_registry()
    return [
        StageDescriptor(
            name=s.name,
            version=s.version,
            role=s.role,
            implementation=type(s).__name__,
            configured=s.configured,
        )
        for s in registry.all()
    ]


@app.post("/v1/inference", response_model=InferenceResponse)
async def infer(
    request: Annotated[str, Form(description="JSON-encoded InferenceRequest with full PipelineSpec")],
    image: Annotated[UploadFile, File(description="The capture image to analyze")],
) -> InferenceResponse:
    settings = get_settings()

    try:
        req = InferenceRequest.model_validate(json.loads(request))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid request payload: {exc}") from exc

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image upload.")
    content_type = image.content_type or "image/jpeg"
    max_bytes = (
        settings.vision_max_video_bytes
        if content_type.startswith("video/")
        else settings.vision_max_image_bytes
    )
    if len(image_bytes) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Upload exceeds {max_bytes} bytes.",
        )
    if not req.pipeline.stages:
        raise HTTPException(
            status_code=400,
            detail="Pipeline must have at least one stage.",
        )

    executor = PipelineExecutor(get_registry())
    try:
        return await executor.execute(
            capture_id=req.capture_id,
            task=req.task,
            image_bytes=image_bytes,
            mime_type=content_type,
            pipeline=req.pipeline,
        )
    except StageNotRegisteredError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except StageNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except StageError as exc:
        logger.warning("stage error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
