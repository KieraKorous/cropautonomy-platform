"""Stage interface — the unit of inference work.

A stage takes a running PipelineContext, reads what it needs (the original
image, detections produced by upstream stages, its per-instance config), and
adds its contribution. The PipelineExecutor calls process() on each stage in
order, recording timing and per-stage output metadata.

Stages are typed by role:
  detection      — produces bounding-box detections from the raw image
  classification — produces or refines category labels (whole-image or per-bbox)
  refinement     — post-processes detections (NMS, dedup, merge)
  filter         — drops detections by confidence or category

A stage's role determines what the executor expects it to read/write on the
context, but the interface is the same. New stage types are new files in this
directory; nothing else changes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from ..schemas import Detection, StageRole, Task


class StageError(RuntimeError):
    """Recoverable failure (network, 5xx). PipelineExecutor decides whether to
    fail the pipeline or continue based on the stage's `required` flag."""


class StageNotConfigured(StageError):
    """Required credentials missing. Surfaced as 503 from the inference API."""


@dataclass
class StageContext:
    """Running state shared across stages in a single inference.

    detections is mutated in place by stages. Each stage records its
    per-instance metadata into output_metadata under f"{name}@{version}".
    """

    capture_id: str
    task: Task
    image_bytes: bytes
    mime_type: str
    detections: list[Detection] = field(default_factory=list)
    output_metadata: dict[str, dict[str, Any]] = field(default_factory=dict)
    # Set by a summary-role stage: a short natural-language brief surfaced on
    # the capture as inferred_summary, plus best-effort structured tags
    # (observation_type / severity). Left None when no summary stage runs.
    summary: str | None = None
    observation_type: str | None = None
    severity: str | None = None


class Stage(ABC):
    """Abstract stage. Subclass per inference backend.

    name/version match a model_versions row in the database. role decides
    where in a pipeline this stage is legal.
    """

    name: str
    version: str
    role: StageRole

    @property
    @abstractmethod
    def configured(self) -> bool:
        """Whether this stage has the credentials/config needed to run."""

    @abstractmethod
    async def process(self, ctx: StageContext, config: dict[str, Any]) -> None:
        """Run the stage against ctx, mutating ctx.detections and recording
        per-stage metadata into ctx.output_metadata[self.key].

        config is the per-pipeline-stage config dict (from
        pipeline_stages.config in the DB); it can carry stage-specific
        knobs like `max_results`, `confidence_threshold`, `prompt`.
        """

    @property
    def key(self) -> str:
        """Stable identifier used as the provenance attribution string and
        as the lookup key in StageContext.output_metadata. Matches
        analysis_jobs.pipeline_version's per-stage component."""
        return f"{self.name}@{self.version}"
