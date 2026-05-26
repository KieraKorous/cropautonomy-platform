"""PlantNet identification API v2 as a classification stage.

PlantNet is classification-only: it returns whole-image species scores, no
bounding boxes. In a pipeline, this stage either:
  - Runs first and produces the only detections (current default-plant@v1).
  - Runs after a detection stage and adds species labels to each upstream
    detection (planned default-plant@v2). The "per-bbox" mode is implemented
    by iterating detected regions, cropping the source image, and calling
    PlantNet on each crop. That requires Pillow; not enabled in v0.

Per-stage config keys:
  max_results          — int, default 10. PlantNet nb-results.
  organs               — str, default "auto". PlantNet organs param.
  project              — str, default "all". PlantNet project name.

Free tier: 500 requests/day. The transition path is documented in
project memory project-ml-phase2-strategy.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..schemas import Detection, StageRole
from .base import Stage, StageError, StageNotConfigured, StageContext

logger = logging.getLogger(__name__)


class PlantNetStage(Stage):
    name = "plantnet_api"
    version = "v2"
    role: StageRole = "classification"

    def __init__(
        self,
        api_key: str | None,
        base_url: str,
        project: str,
        default_organs: str,
        timeout_seconds: float,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._project = project
        self._default_organs = default_organs
        self._timeout_seconds = timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def process(self, ctx: StageContext, config: dict[str, Any]) -> None:
        if not self._api_key:
            raise StageNotConfigured(
                "PLANTNET_API_KEY is not set; cannot call PlantNet."
            )

        max_results = int(config.get("max_results", 10))
        organs = str(config.get("organs", self._default_organs))
        project = str(config.get("project", self._project))

        url = f"{self._base_url}/v2/identify/{project}"
        params = {"api-key": self._api_key, "nb-results": str(max_results)}
        files = {
            "images": ("capture", ctx.image_bytes, ctx.mime_type or "image/jpeg")
        }
        data = {"organs": organs}

        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.post(url, params=params, files=files, data=data)
        except httpx.HTTPError as exc:
            raise StageError(f"PlantNet request failed: {exc}") from exc

        if response.status_code == 401:
            raise StageNotConfigured("PlantNet rejected the API key (401).")
        if response.status_code == 404:
            ctx.output_metadata[self.key] = {"plantnet_status": 404, "note": "no_results"}
            return
        if response.status_code >= 500:
            raise StageError(
                f"PlantNet upstream error: {response.status_code} {response.text[:200]}"
            )
        if response.status_code >= 400:
            raise StageError(
                f"PlantNet client error: {response.status_code} {response.text[:200]}"
            )

        body = response.json()
        results = body.get("results", []) or []

        for entry in results:
            score = float(entry.get("score", 0.0))
            species = entry.get("species") or {}
            scientific = (
                species.get("scientificNameWithoutAuthor")
                or species.get("scientificName")
                or "unknown"
            )
            common_names = species.get("commonNames") or []
            genus = (species.get("genus") or {}).get("scientificNameWithoutAuthor")
            family = (species.get("family") or {}).get("scientificNameWithoutAuthor")

            ctx.detections.append(
                Detection(
                    category=scientific,
                    subcategory=genus,
                    confidence=max(0.0, min(score, 1.0)),
                    bounding_box=None,
                    provenance={"class_from": self.key},
                    payload={
                        "common_names": common_names,
                        "family": family,
                        "gbif_id": (entry.get("gbif") or {}).get("id"),
                        "powo_id": (entry.get("powo") or {}).get("id"),
                    },
                )
            )

        ctx.output_metadata[self.key] = {
            "plantnet_status": response.status_code,
            "plantnet_request_id": response.headers.get("X-Request-Id"),
            "remaining_identification_requests": body.get(
                "remainingIdentificationRequests"
            ),
            "best_match": body.get("bestMatch"),
            "results_count": len(results),
        }
