"""Pipeline executor.

Runs each StageSpec in order against a shared StageContext, recording timing
and per-stage metadata. Failures in `required=False` stages are logged and
the pipeline continues; failures in required stages abort the pipeline.

The executor is the entire pipeline behavior — there is no DAG yet (the v0
pipeline is linear). When stages need branching ("if confidence < X, run the
fallback stage"), add it here behind a clear interface rather than letting
each stage know about its successors.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from .schemas import (
    Detection,
    InferenceResponse,
    PipelineSpec,
    StageReport,
    StageSpec,
    Task,
)
from .stages import (
    Stage,
    StageContext,
    StageError,
    StageNotConfigured,
    StageRegistry,
)

logger = logging.getLogger(__name__)


@dataclass
class StageNotRegisteredError(Exception):
    """Raised when a StageSpec references a (name, version) not in the registry."""

    name: str
    version: str

    def __str__(self) -> str:
        return f"stage '{self.name}@{self.version}' is not registered in this vision instance"


class PipelineExecutor:
    def __init__(self, registry: StageRegistry) -> None:
        self._registry = registry

    async def execute(
        self,
        *,
        capture_id: str,
        task: Task,
        image_bytes: bytes,
        mime_type: str,
        pipeline: PipelineSpec,
    ) -> InferenceResponse:
        started = time.perf_counter()

        ctx = StageContext(
            capture_id=capture_id,
            task=task,
            image_bytes=image_bytes,
            mime_type=mime_type,
        )

        reports: list[StageReport] = []

        for spec in pipeline.stages:
            report = await self._run_stage(spec, ctx)
            reports.append(report)

        duration_ms = int((time.perf_counter() - started) * 1000)

        return InferenceResponse(
            capture_id=capture_id,
            pipeline_name=pipeline.name,
            pipeline_version=pipeline.version,
            task=task,
            detections=ctx.detections,
            duration_ms=duration_ms,
            stage_reports=reports,
            summary=ctx.summary,
        )

    async def _run_stage(self, spec: StageSpec, ctx: StageContext) -> StageReport:
        stage = self._registry.get(spec.model_name, spec.model_version)
        if stage is None:
            raise StageNotRegisteredError(spec.model_name, spec.model_version)

        if stage.role != spec.role:
            raise ValueError(
                f"stage {stage.key} is role '{stage.role}', "
                f"but pipeline_stages requested role '{spec.role}'"
            )

        if not spec.enabled:
            return StageReport(
                role=spec.role,
                model_name=stage.name,
                model_version=stage.version,
                skipped=True,
                skip_reason="stage disabled by pipeline config",
            )

        if not stage.configured:
            # StageNotConfigured propagates as 503 from required stages; for
            # optional stages we skip and continue.
            if spec.required:
                raise StageNotConfigured(
                    f"stage {stage.key} is not configured (missing credentials)"
                )
            return StageReport(
                role=spec.role,
                model_name=stage.name,
                model_version=stage.version,
                skipped=True,
                skip_reason="stage not configured (missing credentials)",
            )

        started = time.perf_counter()
        try:
            await stage.process(ctx, spec.config)
        except StageError as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            if spec.required:
                logger.warning("required stage %s failed: %s", stage.key, exc)
                raise
            logger.warning(
                "optional stage %s failed, continuing: %s", stage.key, exc
            )
            return StageReport(
                role=spec.role,
                model_name=stage.name,
                model_version=stage.version,
                skipped=True,
                skip_reason=f"stage failed (optional): {exc}",
                duration_ms=duration_ms,
            )

        duration_ms = int((time.perf_counter() - started) * 1000)
        return StageReport(
            role=spec.role,
            model_name=stage.name,
            model_version=stage.version,
            duration_ms=duration_ms,
            output_metadata=ctx.output_metadata.get(stage.key, {}),
        )
