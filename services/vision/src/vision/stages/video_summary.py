"""Video summary stage — a short whole-clip description + plant-issue flags.

A `summary`-role stage for session recordings (media_type=video). Unlike the
photo summary stage (which reads upstream detections), this reads the raw video
bytes directly: it samples a few frames evenly across the clip and sends them to
Claude as a single multimodal message, asking for one short description of the
whole clip plus best-effort plant-issue tags. It produces NO detections — it
writes `ctx.summary`, `ctx.details`, `ctx.observation_type`, `ctx.severity`,
which the worker stamps onto the capture.

Optional by design: when ANTHROPIC_API_KEY is unset the stage reports
unconfigured and the PipelineExecutor skips it (the recording still finalizes,
just without a description).

Per-stage config keys (pipeline_stages.config):
  model        — Claude model id; defaults to settings.anthropic_video_model
  max_tokens   — int; defaults to settings.anthropic_video_max_tokens
  frames       — frames to sample; defaults to settings.vision_video_frames
"""

from __future__ import annotations

import base64
import io
import logging
import tempfile
from typing import Any

from ..schemas import StageRole
from .agronomic_summary import _parse_response  # shared JSON+enum parser
from .base import Stage, StageContext, StageError, StageNotConfigured

logger = logging.getLogger(__name__)

# Cap the longest frame edge before encoding — keeps the per-image token cost
# bounded while leaving plenty of detail for plant assessment.
_FRAME_MAX_DIM = 768

_SYSTEM_PROMPT = (
    "You are an agronomist assisting a field-scouting platform. You receive a "
    "few still frames sampled in order from a single short field VIDEO (one "
    "continuous scene). Treat them together as ONE clip, not separate photos. "
    "Respond with ONLY a JSON object (no prose, no markdown) with exactly these "
    "keys:\n"
    '  "summary": 2-3 plain-language sentences describing what the clip shows '
    "(the crop/plants and setting) and the overall condition worth a scout's "
    "attention. Ground every claim in what is visible across the frames; never "
    "invent findings; if the frames are unclear or conflict, say so.\n"
    '  "details": 3-5 sentences that flag any issues with the plants in the '
    "video (pests, disease, weeds, nutrient or water stress, physical damage, "
    "growth stage) AND note what looks healthy. Ground every claim in the "
    "frames; call out low confidence or conflicting signals explicitly. If "
    "nothing notable, say the planting appears unremarkable and why.\n"
    '  "observation_type": the single most relevant issue category, one of '
    '["pest","disease","weed","nutrient","irrigation","damage","growth_stage",'
    '"other"], or null if nothing notable.\n'
    '  "severity": your best estimate of how urgent any issue is, one of '
    '["low","medium","high"], or null if there is no issue or it can\'t be '
    "judged from the frames.\n"
    "Output the JSON object only."
)


class VideoSummaryStage(Stage):
    name = "video_summary"
    version = "v1"
    role: StageRole = "summary"

    def __init__(
        self,
        api_key: str | None,
        default_model: str,
        default_max_tokens: int,
        default_frames: int,
        timeout_seconds: float,
    ) -> None:
        self._api_key = api_key
        self._default_model = default_model
        self._default_max_tokens = default_max_tokens
        self._default_frames = default_frames
        self._timeout_seconds = timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def process(self, ctx: StageContext, config: dict[str, Any]) -> None:
        if not self._api_key:
            # Optional stage: PipelineExecutor turns this into a skip.
            raise StageNotConfigured(
                "ANTHROPIC_API_KEY is not set; skipping video summary."
            )

        model = str(config.get("model", self._default_model))
        max_tokens = int(config.get("max_tokens", self._default_max_tokens))
        frame_count = max(1, int(config.get("frames", self._default_frames)))

        try:
            frames = _sample_frames(ctx.image_bytes, ctx.mime_type, frame_count)
        except Exception as exc:  # decode/ffmpeg failures
            raise StageError(f"video frame extraction failed: {exc}") from exc

        if not frames:
            ctx.output_metadata[self.key] = {"skipped": "no_frames"}
            return

        content: list[dict[str, Any]] = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64.standard_b64encode(frame).decode("ascii"),
                },
            }
            for frame in frames
        ]
        content.append(
            {
                "type": "text",
                "text": (
                    f"Here are {len(frames)} frames sampled in order from the "
                    "recording. Describe the clip and flag any plant issues."
                ),
            }
        )

        try:
            from anthropic import AsyncAnthropic

            client = AsyncAnthropic(api_key=self._api_key, timeout=self._timeout_seconds)
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
        except Exception as exc:
            raise StageError(f"Claude video summary request failed: {exc}") from exc

        text = "".join(
            block.text for block in message.content if block.type == "text"
        ).strip()

        parsed = _parse_response(text)
        ctx.summary = parsed["summary"]
        ctx.details = parsed["details"]
        ctx.observation_type = parsed["observation_type"]
        ctx.severity = parsed["severity"]

        usage = getattr(message, "usage", None)
        ctx.output_metadata[self.key] = {
            "model": model,
            "frames": len(frames),
            "observation_type": ctx.observation_type,
            "severity": ctx.severity,
            "parsed": parsed["ok"],
            "input_tokens": getattr(usage, "input_tokens", None),
            "output_tokens": getattr(usage, "output_tokens", None),
        }


def _sample_frames(data: bytes, mime_type: str, count: int) -> list[bytes]:
    """Sample up to `count` frames evenly across the clip, as JPEG bytes.

    Uses imageio's ffmpeg plugin (imageio-ffmpeg bundles a static ffmpeg). Tries
    random access by frame index from the clip's frame count; falls back to a
    strided sequential read when the container doesn't report a length (common
    for streamed webm).
    """
    import imageio.v2 as imageio
    from PIL import Image

    with tempfile.NamedTemporaryFile(suffix=_suffix_for(mime_type)) as tmp:
        tmp.write(data)
        tmp.flush()
        reader = imageio.get_reader(tmp.name, format="ffmpeg")
        try:
            nframes = _frame_count(reader)
            frames: list[bytes] = []
            if nframes > 0:
                indices = _even_indices(nframes, count)
                for idx in indices:
                    try:
                        arr = reader.get_data(idx)
                    except (IndexError, RuntimeError):
                        continue
                    frames.append(_encode_jpeg(arr, Image))
            else:
                # Unknown length: read sequentially, keeping a spread of frames.
                stride = 15
                for i, arr in enumerate(reader):
                    if i % stride == 0:
                        frames.append(_encode_jpeg(arr, Image))
                    if len(frames) >= count:
                        break
            return frames
        finally:
            reader.close()


def _frame_count(reader: Any) -> int:
    """Best-effort frame count from reader metadata; 0 when unknown."""
    try:
        meta = reader.get_meta_data()
    except Exception:
        return 0
    nframes = meta.get("nframes")
    if isinstance(nframes, int) and nframes > 0:
        return nframes
    fps = meta.get("fps") or 0
    duration = meta.get("duration") or 0
    if fps and duration:
        return int(fps * duration)
    return 0


def _even_indices(nframes: int, count: int) -> list[int]:
    if nframes <= count:
        return list(range(nframes))
    step = nframes / count
    # Sample at the midpoint of each of `count` equal segments.
    return [min(int(step * i + step / 2), nframes - 1) for i in range(count)]


def _encode_jpeg(arr: Any, image_module: Any) -> bytes:
    img = image_module.fromarray(arr).convert("RGB")
    img.thumbnail((_FRAME_MAX_DIM, _FRAME_MAX_DIM))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _suffix_for(mime_type: str) -> str:
    mt = (mime_type or "").lower()
    if "webm" in mt:
        return ".webm"
    if "quicktime" in mt or "mov" in mt:
        return ".mov"
    if "mp4" in mt:
        return ".mp4"
    return ".mp4"
