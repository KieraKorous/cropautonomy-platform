"""RT-DETR detection stage (Real-Time DEtection TRansformer).

Apache 2.0. Pretrained checkpoint hosted on Hugging Face:
  https://huggingface.co/PekingU/rtdetr_r50vd_coco_o365

Trained on COCO + Objects365, which gives ~445 object classes — including a
useful spread of plant / produce / outdoor objects ('potted plant', 'tree',
'apple', 'orange', 'broccoli', 'carrot', 'flower', etc.). This is the v0
detection baseline; we fine-tune on our own labeled captures once we have
~1k of them ([[project-ml-phase2-strategy]]).

Why RT-DETR, not YOLO:
  Ultralytics YOLOv5 / YOLOv8 / YOLO11 are AGPL-3.0, incompatible with our
  Apache 2.0 release. RT-DETR is Apache 2.0 and competitive — see
  docs/dependency-policy.md for the policy and the rationale.

Per-stage config keys (passed via pipeline_stages.config):
  confidence_threshold  — float 0..1, default 0.3
  max_detections        — int, default 100
  device                — 'cpu' | 'cuda', default 'cpu' (auto-upgrades to
                          cuda if torch.cuda.is_available())
  model_id              — Hugging Face model id; defaults to
                          'PekingU/rtdetr_r50vd_coco_o365'

This stage is HEAVY at first call: torch + transformers must be importable,
and the model is downloaded from Hugging Face Hub on first use (~110MB to
~/.cache/huggingface). Subsequent calls reuse the cached model.
"""

from __future__ import annotations

import asyncio
import io
import logging
from functools import cached_property
from typing import Any

from ..schemas import BoundingBox, Detection, StageRole
from .base import Stage, StageError, StageNotConfigured, StageContext

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ID = "PekingU/rtdetr_r50vd_coco_o365"
DEFAULT_THRESHOLD = 0.3
DEFAULT_MAX_DETECTIONS = 100


class RTDetrStage(Stage):
    name = "rtdetr_coco_o365"
    version = "r50vd"
    role: StageRole = "detection"

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        device: str = "cpu",
    ) -> None:
        self._model_id = model_id
        self._requested_device = device
        self._import_error: ImportError | None = None
        self._load_error: Exception | None = None

    @cached_property
    def _bundle(self) -> tuple[Any, Any, Any, str]:
        """Lazily import torch + transformers and load the model.

        Returns (torch_module, processor, model, resolved_device).
        Raises StageNotConfigured if the heavy deps aren't installed.
        Raises StageError if the model can't load (network / corrupt cache).
        """
        try:
            import torch  # type: ignore[import-not-found]
            from transformers import (  # type: ignore[import-not-found]
                RTDetrForObjectDetection,
                RTDetrImageProcessor,
            )
        except ImportError as exc:
            self._import_error = exc
            raise StageNotConfigured(
                "RT-DETR stage requires `torch` and `transformers` to be installed. "
                "Run `pip install -e \".[dev]\"` in services/vision."
            ) from exc

        device = self._requested_device
        if device == "cuda" and not torch.cuda.is_available():
            logger.warning("CUDA requested but unavailable; falling back to CPU.")
            device = "cpu"

        try:
            processor = RTDetrImageProcessor.from_pretrained(self._model_id)
            model = RTDetrForObjectDetection.from_pretrained(self._model_id).to(device)
            model.eval()
        except Exception as exc:
            self._load_error = exc
            raise StageError(
                f"failed to load RT-DETR model '{self._model_id}': {exc}"
            ) from exc

        return torch, processor, model, device

    @property
    def configured(self) -> bool:
        """True when torch + transformers are importable.

        We don't trigger model load here — that's lazy on first request to
        avoid blocking startup or healthcheck endpoints. If imports work,
        the stage is considered configured; load failure surfaces as a
        StageError (502) at inference time.
        """
        if self._import_error is not None:
            return False
        try:
            import torch  # noqa: F401
            import transformers  # noqa: F401
        except ImportError:
            return False
        return True

    async def process(self, ctx: StageContext, config: dict[str, Any]) -> None:
        confidence_threshold = float(
            config.get("confidence_threshold", DEFAULT_THRESHOLD)
        )
        max_detections = int(config.get("max_detections", DEFAULT_MAX_DETECTIONS))

        # Run synchronous torch inference in a worker thread so we don't
        # block the FastAPI event loop. transformers + torch are not
        # async-native.
        detections, metadata = await asyncio.to_thread(
            self._infer_sync,
            ctx.image_bytes,
            ctx.mime_type,
            confidence_threshold,
            max_detections,
        )

        ctx.detections.extend(detections)
        ctx.output_metadata[self.key] = metadata

    def _infer_sync(
        self,
        image_bytes: bytes,
        mime_type: str,
        confidence_threshold: float,
        max_detections: int,
    ) -> tuple[list[Detection], dict[str, Any]]:
        from PIL import Image  # type: ignore[import-not-found]

        torch, processor, model, device = self._bundle

        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as exc:
            raise StageError(f"failed to decode image (mime={mime_type}): {exc}") from exc

        width, height = image.size

        inputs = processor(images=image, return_tensors="pt").to(device)
        with torch.no_grad():
            outputs = model(**inputs)

        target_sizes = torch.tensor([[height, width]], device=device)
        results = processor.post_process_object_detection(
            outputs,
            target_sizes=target_sizes,
            threshold=confidence_threshold,
        )[0]

        scores = results["scores"].detach().cpu().tolist()
        labels = results["labels"].detach().cpu().tolist()
        boxes = results["boxes"].detach().cpu().tolist()

        id2label = model.config.id2label

        detections: list[Detection] = []
        # Sort by confidence descending so the top detections survive the
        # max_detections cap.
        ranked = sorted(
            zip(scores, labels, boxes, strict=True),
            key=lambda t: t[0],
            reverse=True,
        )[:max_detections]

        for score, label_id, box in ranked:
            x1, y1, x2, y2 = box
            # Convert absolute xyxy to normalized xywh, clamped to [0, 1].
            nx = max(0.0, min(x1 / width, 1.0))
            ny = max(0.0, min(y1 / height, 1.0))
            nw = max(0.0, min((x2 - x1) / width, 1.0 - nx))
            nh = max(0.0, min((y2 - y1) / height, 1.0 - ny))

            if nw <= 0.0 or nh <= 0.0:
                continue

            label_name = id2label.get(int(label_id), f"class_{int(label_id)}")

            detections.append(
                Detection(
                    category=label_name,
                    subcategory=None,
                    confidence=max(0.0, min(float(score), 1.0)),
                    bounding_box=BoundingBox(x=nx, y=ny, w=nw, h=nh),
                    provenance={"bbox_from": self.key, "class_from": self.key},
                    payload={
                        "model_id": self._model_id,
                        "class_id": int(label_id),
                    },
                )
            )

        metadata: dict[str, Any] = {
            "model_id": self._model_id,
            "device": device,
            "image_size": {"width": width, "height": height},
            "raw_detection_count": len(scores),
            "kept_detection_count": len(detections),
            "confidence_threshold": confidence_threshold,
        }
        return detections, metadata
