"""Agronomic summary stage — a short brief + structured tags via Claude.

This is a `summary`-role stage: it runs after detection + classification and
synthesizes the structured detections (RT-DETR objects + PlantNet species) into
(1) a 1-2 sentence agronomic brief, (2) a best-effort observation type, and
(3) a best-effort severity. It produces NO detections — it reads
`ctx.detections` and writes `ctx.summary`, `ctx.observation_type`,
`ctx.severity`, which the worker stamps onto the capture. This replaces operator
hand-annotation: capture metadata is filled automatically.

Optional by design: when ANTHROPIC_API_KEY is unset the stage reports
unconfigured and the PipelineExecutor skips it (the pipeline still succeeds with
species + detections). It builds ON the full v2 output; it is not a
classification shortcut.

Per-stage config keys (pipeline_stages.config):
  model        — Claude model id; defaults to settings.anthropic_summary_model
  max_tokens   — int; defaults to settings.anthropic_summary_max_tokens
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from ..schemas import Detection, StageRole
from .base import Stage, StageContext, StageError, StageNotConfigured

logger = logging.getLogger(__name__)

# Mirror the captures.observation_type / captures.severity check constraints in
# packages/db/migrations/0016_capture_annotations_and_recordings.sql. Invalid or
# unknown model output is coerced to None (the column stays null).
_OBSERVATION_TYPES = {
    "pest",
    "disease",
    "weed",
    "nutrient",
    "irrigation",
    "damage",
    "growth_stage",
    "other",
}
_SEVERITIES = {"low", "medium", "high"}

# Stable system prompt → cache it (claude-api guidance). The variable per-call
# input is the detection digest, which rides in the user turn.
_SYSTEM_PROMPT = (
    "You are an agronomist assisting a field-scouting platform. You receive the "
    "structured output of a computer-vision pipeline (object detections and a "
    "whole-image plant species identification) for a single field photo. Respond "
    "with ONLY a JSON object (no prose, no markdown) with exactly these keys:\n"
    '  "summary": a 1-2 sentence plain-language note (max ~45 words) on what the '
    "plant likely is and any agronomic cues worth a scout's attention (likely "
    "pest/disease symptoms, growth stage, stress). Ground every claim in the "
    "provided detections and confidence; never invent findings; if confidence is "
    "low or signals conflict, say so.\n"
    '  "observation_type": the single most relevant category, one of '
    '["pest","disease","weed","nutrient","irrigation","damage","growth_stage",'
    '"other"], or null if nothing notable.\n'
    '  "severity": your best estimate of how urgent any issue is, one of '
    '["low","medium","high"], or null if there is no issue or it can\'t be '
    "judged from the image.\n"
    "Do not restate raw scores or bounding boxes. Output the JSON object only."
)


class AgronomicSummaryStage(Stage):
    name = "agronomic_summary"
    version = "v1"
    role: StageRole = "summary"

    def __init__(
        self,
        api_key: str | None,
        default_model: str,
        default_max_tokens: int,
        timeout_seconds: float,
    ) -> None:
        self._api_key = api_key
        self._default_model = default_model
        self._default_max_tokens = default_max_tokens
        self._timeout_seconds = timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def process(self, ctx: StageContext, config: dict[str, Any]) -> None:
        if not self._api_key:
            # Optional stage: PipelineExecutor turns this into a skip.
            raise StageNotConfigured(
                "ANTHROPIC_API_KEY is not set; skipping agronomic summary."
            )

        model = str(config.get("model", self._default_model))
        max_tokens = int(config.get("max_tokens", self._default_max_tokens))

        digest = _summarize_detections(ctx.detections)
        if not digest:
            # Nothing identified — no point spending a model call.
            ctx.output_metadata[self.key] = {"skipped": "no_detections"}
            return

        try:
            # Imported lazily so the service still imports when the SDK is absent
            # in a stripped environment; the dependency is normally installed.
            from anthropic import AsyncAnthropic

            client = AsyncAnthropic(
                api_key=self._api_key, timeout=self._timeout_seconds
            )
            message = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=[
                    {
                        "type": "text",
                        "text": _SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[{"role": "user", "content": digest}],
            )
        except Exception as exc:  # SDK raises a variety of error types
            raise StageError(f"Claude summary request failed: {exc}") from exc

        text = "".join(
            block.text for block in message.content if block.type == "text"
        ).strip()

        parsed = _parse_response(text)
        ctx.summary = parsed["summary"]
        ctx.observation_type = parsed["observation_type"]
        ctx.severity = parsed["severity"]

        usage = getattr(message, "usage", None)
        ctx.output_metadata[self.key] = {
            "model": model,
            "observation_type": ctx.observation_type,
            "severity": ctx.severity,
            "parsed": parsed["ok"],
            "input_tokens": getattr(usage, "input_tokens", None),
            "output_tokens": getattr(usage, "output_tokens", None),
            "cache_read_input_tokens": getattr(
                usage, "cache_read_input_tokens", None
            ),
        }


def _parse_response(text: str) -> dict[str, Any]:
    """Extract {summary, observation_type, severity} from the model text.

    Tolerant: pulls the first JSON object out of the text and validates the
    structured fields against the allowed enums (invalid → None). Falls back to
    using the whole text as the summary if JSON parsing fails.
    """
    obj: dict[str, Any] | None = None
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            candidate = json.loads(match.group(0))
            if isinstance(candidate, dict):
                obj = candidate
        except json.JSONDecodeError:
            obj = None

    if obj is None:
        return {
            "summary": text or None,
            "observation_type": None,
            "severity": None,
            "ok": False,
        }

    summary = obj.get("summary")
    summary = summary.strip() if isinstance(summary, str) and summary.strip() else None

    obs = obj.get("observation_type")
    obs = obs if isinstance(obs, str) and obs in _OBSERVATION_TYPES else None

    sev = obj.get("severity")
    sev = sev if isinstance(sev, str) and sev in _SEVERITIES else None

    return {
        "summary": summary,
        "observation_type": obs,
        "severity": sev,
        "ok": True,
    }


def _summarize_detections(detections: list[Detection]) -> str:
    """Compose a compact, model-friendly digest of the pipeline output.

    Separates whole-image species predictions (classification, no bbox) from
    located objects (detection, with bbox) so Claude can weigh them.
    """
    species: list[str] = []
    objects: dict[str, int] = {}

    for det in detections:
        if det.bounding_box is None:
            common = det.payload.get("common_names") or []
            common_str = f" ({', '.join(common[:2])})" if common else ""
            family = det.payload.get("family")
            family_str = f", family {family}" if family else ""
            species.append(
                f"{det.category}{common_str}{family_str} "
                f"— confidence {det.confidence:.2f}"
            )
        else:
            label = det.category or "object"
            objects[label] = objects.get(label, 0) + 1

    lines: list[str] = []
    if species:
        lines.append("Species predictions (whole image):")
        lines.extend(f"  - {s}" for s in species[:5])
    if objects:
        obj_str = ", ".join(f"{count}× {label}" for label, count in objects.items())
        lines.append(f"Detected objects: {obj_str}")

    return "\n".join(lines)
