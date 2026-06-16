"""Request and response schemas for the inference API.

Vision is a stateless pipeline executor: the worker resolves the production
pipeline from the database and passes the full StageSpec list inline. Vision
runs each stage in order against a shared PipelineContext, then returns the
aggregated detections plus per-stage telemetry.

The response shape mirrors analysis_results: each detection has a category,
bounding box (nullable for classification-only outputs), confidence, and a
provenance dict that records which stage produced which field (`bbox_from`,
`class_from`). When a stage refines a prior detection — e.g. PlantNet adds a
species label to a YOLO bbox — provenance carries both attributions.
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

StageRole = Literal[
    "detection",
    "classification",
    "refinement",
    "filter",
    "summary",
]


class BoundingBox(BaseModel):
    """Normalized 0..1 bounding box. None when the stage didn't produce one."""

    model_config = ConfigDict(extra="forbid")

    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    w: float = Field(gt=0.0, le=1.0)
    h: float = Field(gt=0.0, le=1.0)


class Detection(BaseModel):
    """One detection as it flows through the pipeline.

    A stage may add new detections (a detection stage producing bboxes) or
    refine existing ones (a classification stage adding/updating the category
    on a previously-detected region). Provenance tracks which stage owns each
    contribution so we know what to retrain when a detection is wrong.
    """

    model_config = ConfigDict(extra="forbid")

    category: str | None = None
    subcategory: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    bounding_box: BoundingBox | None = None
    provenance: dict[str, str] = Field(
        default_factory=dict,
        description="Per-field attribution, e.g. {'bbox_from': 'yolo@v1', 'class_from': 'plantnet_api@v2'}.",
    )
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Stage-specific raw fields (common names, IDs, etc.). Preserved verbatim.",
    )


class StageSpec(BaseModel):
    """One stage in the pipeline as passed by the worker.

    The worker resolves the production pipeline from the database and expands
    it into this shape. The vision service does not query the database.
    """

    model_config = ConfigDict(extra="forbid")

    role: StageRole
    model_name: str = Field(description="Matches model_versions.name in the registry.")
    model_version: str = Field(description="Matches model_versions.version.")
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    required: bool = True


class PipelineSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    version: str
    stages: list[StageSpec]


class InferenceRequest(BaseModel):
    """Multipart 'request' field for POST /v1/inference."""

    model_config = ConfigDict(extra="forbid")

    capture_id: str
    task: Task
    pipeline: PipelineSpec


class StageReport(BaseModel):
    """Per-stage execution telemetry. Rolled up into analysis_jobs.metadata
    by the worker so we can measure per-stage latency, confidence drops,
    and short-circuit behavior over time."""

    model_config = ConfigDict(extra="forbid")

    role: StageRole
    model_name: str
    model_version: str
    skipped: bool = False
    skip_reason: str | None = None
    duration_ms: int = 0
    output_metadata: dict[str, Any] = Field(default_factory=dict)


class InferenceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    capture_id: str
    pipeline_name: str
    pipeline_version: str
    task: Task
    detections: list[Detection]
    duration_ms: int
    stage_reports: list[StageReport]
    # Outputs of the optional summary stage (short agronomic brief, longer
    # in-depth details, + best-effort structured tags). None when no summary
    # stage ran or it was skipped/unconfigured.
    summary: str | None = None
    details: str | None = None
    observation_type: str | None = None
    severity: str | None = None


class StageDescriptor(BaseModel):
    """Listed by GET /v1/stages so callers know what stage implementations
    this vision instance can execute. (name, version) must match a row in
    model_versions for the pipeline to use this stage."""

    model_config = ConfigDict(extra="forbid")

    name: str
    version: str
    role: StageRole
    implementation: str = Field(description="The Python class name implementing this stage.")
    configured: bool = Field(
        description="False when required credentials are missing; calls return 503 from the stage."
    )


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"]
    version: str
    stages_configured: list[str]
