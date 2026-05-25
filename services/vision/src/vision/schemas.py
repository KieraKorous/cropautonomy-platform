"""Request and response schemas for the inference API.

These mirror the analysis_results table shape so the worker can write rows
directly from the response. Bounding boxes are normalized 0..1 to match the
schema. Classification-only providers (PlantNet) return detections with
bbox=null; detection providers (YOLO, Roboflow) populate bbox.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Task = Literal[
    "plant_classification",
    "stand_count",
    "tree_count",
    "weed_detection",
    "disease_detection",
    "stage_classification",
]


class BoundingBox(BaseModel):
    """Normalized 0..1 bounding box. None when the model is classification-only."""

    model_config = ConfigDict(extra="forbid")

    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    w: float = Field(gt=0.0, le=1.0)
    h: float = Field(gt=0.0, le=1.0)


class Detection(BaseModel):
    """One detection / classification. Maps 1:1 to an analysis_results row."""

    model_config = ConfigDict(extra="forbid")

    category: str = Field(description="Species or class label, e.g. 'Citrus sinensis'.")
    subcategory: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    bounding_box: BoundingBox | None = None
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Provider-specific raw fields (common names, IDs, etc.). Preserved verbatim.",
    )


class InferenceRequest(BaseModel):
    """The worker posts this to /v1/inference.

    Image is sent as multipart upload alongside this JSON metadata; see the
    route handler for the multipart contract.
    """

    model_config = ConfigDict(extra="forbid")

    capture_id: str
    model_name: str = Field(description="Matches model_versions.name in the registry.")
    model_version: str = Field(description="Matches model_versions.version.")
    task: Task
    max_results: int = Field(default=10, ge=1, le=100)


class InferenceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    capture_id: str
    model_name: str
    model_version: str
    task: Task
    detections: list[Detection]
    duration_ms: int
    provider_metadata: dict[str, Any] = Field(default_factory=dict)


class ModelDescriptor(BaseModel):
    """Listed by GET /v1/models so callers know what's available."""

    model_config = ConfigDict(extra="forbid")

    name: str
    version: str
    task: Task
    provider: str
    is_classification_only: bool = Field(
        description="True for providers like PlantNet that return whole-image labels without bounding boxes."
    )
    configured: bool = Field(
        description="False when required credentials are missing; calls will 503."
    )


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str
    providers_configured: list[str]
