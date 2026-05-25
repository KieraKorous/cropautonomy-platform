"""FastAPI app for services/vision.

Contract:
  GET  /v1/health       — liveness + which providers are configured
  GET  /v1/models       — list registered providers (model_versions in registry)
  POST /v1/inference    — multipart: 'request' (JSON InferenceRequest) + 'image' (binary)

The worker is the only intended caller. No auth in v0 (cluster-internal).
Add a shared-secret header or mTLS before this is reachable outside the
cluster.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from . import __version__
from .config import get_settings
from .providers import ProviderNotConfigured, get_registry
from .providers.base import ProviderError
from .schemas import (
    HealthResponse,
    InferenceRequest,
    InferenceResponse,
    ModelDescriptor,
)

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
    configured = [f"{p.name}@{p.version}" for p in registry.all() if p.configured]
    return HealthResponse(status="ok", version=__version__, providers_configured=configured)


@app.get("/v1/models", response_model=list[ModelDescriptor])
async def list_models() -> list[ModelDescriptor]:
    registry = get_registry()
    return [
        ModelDescriptor(
            name=p.name,
            version=p.version,
            task=p.task,
            provider=type(p).__name__,
            is_classification_only=p.is_classification_only,
            configured=p.configured,
        )
        for p in registry.all()
    ]


@app.post("/v1/inference", response_model=InferenceResponse)
async def infer(
    request: Annotated[str, Form(description="JSON-encoded InferenceRequest")],
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
    if len(image_bytes) > settings.vision_max_image_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds {settings.vision_max_image_bytes} bytes.",
        )

    provider = get_registry().get(req.model_name, req.model_version)
    if provider is None:
        raise HTTPException(
            status_code=404,
            detail=f"No provider registered for {req.model_name}@{req.model_version}.",
        )
    if provider.task != req.task:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Provider {req.model_name}@{req.model_version} serves task '{provider.task}', "
                f"not '{req.task}'."
            ),
        )

    started = time.perf_counter()
    try:
        detections, metadata = await provider.infer(
            image_bytes=image_bytes,
            mime_type=image.content_type or "image/jpeg",
            max_results=req.max_results,
        )
    except ProviderNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProviderError as exc:
        logger.warning("provider error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    duration_ms = int((time.perf_counter() - started) * 1000)

    return InferenceResponse(
        capture_id=req.capture_id,
        model_name=provider.name,
        model_version=provider.version,
        task=provider.task,
        detections=detections,
        duration_ms=duration_ms,
        provider_metadata=metadata,
    )
