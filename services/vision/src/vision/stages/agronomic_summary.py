"""Agronomic summary + findings stage (v2) — multimodal, via Claude.

A `summary`-role stage that runs after detection + classification. Unlike v1
(which only read the text digest of upstream detections), **v2 also sees the
capture image** and returns two things:

  1. The capture-level brief — `ctx.summary`, `ctx.details`,
     `ctx.observation_type`, `ctx.severity` — which the worker stamps onto the
     capture (unchanged from v1, for back-compat with the portal UI).
  2. A typed **findings** array — one `Detection` per distinct issue it can see
     (pest / disease / weed / nutrient / soil-surface / damage / growth stage),
     appended to `ctx.detections`. The worker persists these as
     `analysis_results` rows with their `finding_type`.

This is the LLM **seed** for the multi-domain crop-intelligence layer (see
docs/architecture/capture-analysis-intelligence.md and docs/decisions/0003):
findings are suggestions, not truth — they feed the portal confirm loop and are
replaced per-domain by trained models over time.

Optional by design: when ANTHROPIC_API_KEY is unset the stage reports
unconfigured and the PipelineExecutor skips it (the pipeline still succeeds with
species + detections, just no brief or findings).

Per-stage config keys (pipeline_stages.config):
  model        — Claude model id; defaults to settings.anthropic_summary_model
  max_tokens   — int; defaults to settings.anthropic_summary_max_tokens
"""

from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

from ..schemas import BoundingBox, Detection, StageRole
from .base import Stage, StageContext, StageError, StageNotConfigured

logger = logging.getLogger(__name__)

# Cap the longest image edge before encoding — bounds per-image token cost while
# leaving plenty of detail for plant assessment.
_IMAGE_MAX_DIM = 1024

# Mirror the captures.observation_type / captures.severity check constraints in
# packages/db/migrations/0016. Invalid model output is coerced to None.
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

# Mirror the analysis_results.finding_type check constraint in 0024. The model
# is told to emit only issue findings (not 'plant'), but 'plant' is accepted for
# completeness.
_FINDING_TYPES = {
    "plant",
    "disease",
    "pest",
    "weed",
    "nutrient",
    "irrigation",
    "soil",
    "damage",
    "growth_stage",
    "other",
}

# Stable system prompt → cache it (claude-api guidance). The per-call input (the
# image + the detection digest) rides in the user turn.
_SYSTEM_PROMPT = (
    "You are an agronomist assisting a field-scouting platform. You are given a "
    "single field PHOTO and, when available, the structured output of a "
    "computer-vision pipeline (object detections + a whole-image species "
    "identification). Assess the plant(s) directly from the image; use the "
    "detections as hints, not ground truth. Respond with ONLY a JSON object (no "
    "prose, no markdown) with exactly these keys:\n"
    '  "summary": a 1-2 sentence plain-language note (max ~45 words) on what the '
    "plant likely is and any agronomic cues worth a scout's attention. Ground "
    "every claim in what is visible; never invent findings; if unclear, say so.\n"
    '  "details": a deeper 3-6 sentence analysis covering BOTH what looks '
    "healthy AND what looks wrong, with agronomic reasoning (likely cause, what "
    "to check, growth-stage context). Call out low confidence or conflicting "
    "signals explicitly.\n"
    '  "observation_type": the single most relevant issue category, one of '
    '["pest","disease","weed","nutrient","irrigation","damage","growth_stage",'
    '"other"], or null if nothing notable.\n'
    '  "severity": overall urgency, one of ["low","medium","high"], or null.\n'
    '  "findings": an ARRAY of the distinct ISSUES you can see, each a JSON '
    "object. Emit one finding per distinct problem (a disease, a pest, a "
    "deficiency, a soil-surface issue, damage, a weed, an off-normal growth "
    "stage). Do NOT emit a finding for a healthy plant or for plain species "
    "identity. Return an empty array [] when nothing is wrong. Each finding "
    "object has:\n"
    '    "finding_type": one of ["disease","pest","weed","nutrient",'
    '"irrigation","soil","damage","growth_stage","other"].\n'
    '    "category": a short snake_case label for the specific thing, e.g. '
    '"powdery_mildew", "aphids", "nitrogen_deficiency", "soil_crusting". Use '
    '"unknown_<finding_type>" if you can see the issue but cannot name it.\n'
    '    "subcategory": optional finer label, or null.\n'
    '    "severity": one of ["low","medium","high"], or null.\n'
    '    "severity_pct": your best estimate of the % of visible tissue affected '
    "(0-100), or null when not applicable (e.g. a whole-plant or soil issue).\n"
    '    "confidence": 0-1, how sure you are the issue is present.\n'
    '    "bbox": {"x","y","w","h"} normalized 0-1 locating the issue, or null '
    "if whole-image / not localizable.\n"
    '    "note": a short (max ~15 word) reason, or omit.\n'
    "Ground every finding in the image; never invent one; prefer fewer, "
    "confident findings over speculative ones. Output the JSON object only."
)


class AgronomicSummaryStage(Stage):
    name = "agronomic_summary"
    version = "v2"
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

        content: list[dict[str, Any]] = []
        image_attached = False
        try:
            image_b64, media_type = _prepare_image(ctx.image_bytes)
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_b64,
                    },
                }
            )
            image_attached = True
        except Exception as exc:  # decode/PIL failures — fall back to text-only
            logger.warning(
                "agronomic summary: image prep failed, running text-only: %s", exc
            )

        prompt_text = (
            "Assess this field photo. "
            + (
                f"The vision pipeline reported:\n{digest}\n"
                if digest
                else "The upstream detector reported nothing.\n"
            )
            + "Return the JSON object described in the system prompt."
        )
        content.append({"type": "text", "text": prompt_text})

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
                messages=[{"role": "user", "content": content}],
            )
        except Exception as exc:  # SDK raises a variety of error types
            raise StageError(f"Claude summary request failed: {exc}") from exc

        text = "".join(
            block.text for block in message.content if block.type == "text"
        ).strip()

        parsed = _parse_response(text)
        ctx.summary = parsed["summary"]
        ctx.details = parsed["details"]
        ctx.observation_type = parsed["observation_type"]
        ctx.severity = parsed["severity"]

        findings = _parse_findings(text, provenance_key=self.key)
        ctx.detections.extend(findings)

        usage = getattr(message, "usage", None)
        ctx.output_metadata[self.key] = {
            "model": model,
            "image_attached": image_attached,
            "observation_type": ctx.observation_type,
            "severity": ctx.severity,
            "findings": len(findings),
            "parsed": parsed["ok"],
            "input_tokens": getattr(usage, "input_tokens", None),
            "output_tokens": getattr(usage, "output_tokens", None),
            "cache_read_input_tokens": getattr(
                usage, "cache_read_input_tokens", None
            ),
        }


def _parse_response(text: str) -> dict[str, Any]:
    """Extract {summary, details, observation_type, severity} from the model text.

    Tolerant: pulls the first JSON object out of the text and validates the
    structured fields against the allowed enums (invalid → None). Falls back to
    using the whole text as the summary if JSON parsing fails.

    Shared with the video summary stage — keep the return contract stable.
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
            "details": None,
            "observation_type": None,
            "severity": None,
            "ok": False,
        }

    summary = obj.get("summary")
    summary = summary.strip() if isinstance(summary, str) and summary.strip() else None

    details = obj.get("details")
    details = details.strip() if isinstance(details, str) and details.strip() else None

    obs = obj.get("observation_type")
    obs = obs if isinstance(obs, str) and obs in _OBSERVATION_TYPES else None

    sev = obj.get("severity")
    sev = sev if isinstance(sev, str) and sev in _SEVERITIES else None

    return {
        "summary": summary,
        "details": details,
        "observation_type": obs,
        "severity": sev,
        "ok": True,
    }


def _parse_findings(text: str, provenance_key: str) -> list[Detection]:
    """Extract the findings[] array from the model text into Detections.

    Tolerant: pulls the first JSON object, reads its "findings" list, validates
    each entry's finding_type / severity / confidence / bbox, and drops anything
    unusable. Returns [] when there are no valid findings.
    """
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return []
    try:
        obj = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    if not isinstance(obj, dict):
        return []
    raw = obj.get("findings")
    if not isinstance(raw, list):
        return []

    findings: list[Detection] = []
    for item in raw:
        if not isinstance(item, dict):
            continue

        ftype = item.get("finding_type")
        if ftype not in _FINDING_TYPES:
            continue

        category = item.get("category")
        category = (
            category.strip() if isinstance(category, str) and category.strip() else None
        )
        if category is None:
            continue

        subcategory = item.get("subcategory")
        subcategory = (
            subcategory.strip()
            if isinstance(subcategory, str) and subcategory.strip()
            else None
        )

        try:
            confidence = float(item.get("confidence"))
        except (TypeError, ValueError):
            confidence = 0.5
        confidence = min(1.0, max(0.0, confidence))

        sev = item.get("severity")
        sev = sev if isinstance(sev, str) and sev in _SEVERITIES else None

        sev_pct: float | None
        try:
            sev_pct = float(item.get("severity_pct"))
        except (TypeError, ValueError):
            sev_pct = None
        if sev_pct is not None and not (0.0 <= sev_pct <= 100.0):
            sev_pct = None

        payload: dict[str, Any] = {}
        note = item.get("note")
        if isinstance(note, str) and note.strip():
            payload["note"] = note.strip()

        findings.append(
            Detection(
                category=category,
                subcategory=subcategory,
                confidence=confidence,
                bounding_box=_coerce_bbox(item.get("bbox")),
                finding_type=ftype,
                severity=sev,
                severity_pct=sev_pct,
                provenance={"class_from": provenance_key},
                payload=payload,
            )
        )
    return findings


def _coerce_bbox(raw: Any) -> BoundingBox | None:
    """Validate a model-supplied normalized bbox; None on anything off-range."""
    if not isinstance(raw, dict):
        return None
    try:
        x = float(raw["x"])
        y = float(raw["y"])
        w = float(raw["w"])
        h = float(raw["h"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0 and 0.0 < w <= 1.0 and 0.0 < h <= 1.0):
        return None
    try:
        return BoundingBox(x=x, y=y, w=w, h=h)
    except Exception:
        return None


def _prepare_image(data: bytes) -> tuple[str, str]:
    """Downscale + JPEG-encode the capture, returning (base64_data, media_type).

    Bounds the per-image token cost while keeping enough detail for plant
    assessment. Raises on undecodable bytes so the caller falls back to
    text-only.
    """
    import io

    from PIL import Image

    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((_IMAGE_MAX_DIM, _IMAGE_MAX_DIM))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii"), "image/jpeg"


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
