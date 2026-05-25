"""PlantNet identification API v2.

Docs: https://my.plantnet.org/doc

Classification-only: returns whole-image species scores, no bounding boxes.
For our suggest-then-confirm pipeline, PlantNet output becomes seed Detection
records with bbox=None; humans confirm/correct in the portal. The PlantNet
score is mapped to Detection.confidence.

Free tier: 500 requests/day with registration. Sufficient for backyard
testing and early labeling-loop validation. Production volume will need a
paid plan or a transition to a self-hosted model.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..schemas import Detection, Task
from .base import InferenceProvider, ProviderError, ProviderNotConfigured

logger = logging.getLogger(__name__)


class PlantNetProvider(InferenceProvider):
    name = "plantnet_api"
    version = "v2"
    task: Task = "plant_classification"
    is_classification_only = True

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

    async def infer(
        self,
        image_bytes: bytes,
        mime_type: str,
        max_results: int,
    ) -> tuple[list[Detection], dict[str, Any]]:
        if not self._api_key:
            raise ProviderNotConfigured(
                "PLANTNET_API_KEY is not set; cannot call PlantNet."
            )

        url = f"{self._base_url}/v2/identify/{self._project}"
        params = {"api-key": self._api_key, "nb-results": str(max_results)}

        files = {"images": ("capture", image_bytes, mime_type or "image/jpeg")}
        data = {"organs": self._default_organs}

        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.post(url, params=params, files=files, data=data)
        except httpx.HTTPError as exc:
            raise ProviderError(f"PlantNet request failed: {exc}") from exc

        if response.status_code == 401:
            raise ProviderNotConfigured("PlantNet rejected the API key (401).")
        if response.status_code == 404:
            return [], {"plantnet_status": 404, "note": "no_results"}
        if response.status_code >= 500:
            raise ProviderError(
                f"PlantNet upstream error: {response.status_code} {response.text[:200]}"
            )
        if response.status_code >= 400:
            raise ProviderError(
                f"PlantNet client error: {response.status_code} {response.text[:200]}"
            )

        body = response.json()
        results = body.get("results", []) or []

        detections: list[Detection] = []
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

            detections.append(
                Detection(
                    category=scientific,
                    subcategory=genus,
                    confidence=max(0.0, min(score, 1.0)),
                    bounding_box=None,
                    payload={
                        "common_names": common_names,
                        "family": family,
                        "gbif_id": (entry.get("gbif") or {}).get("id"),
                        "powo_id": (entry.get("powo") or {}).get("id"),
                    },
                )
            )

        metadata: dict[str, Any] = {
            "plantnet_status": response.status_code,
            "plantnet_request_id": response.headers.get("X-Request-Id"),
            "remaining_identification_requests": body.get(
                "remainingIdentificationRequests"
            ),
            "best_match": body.get("bestMatch"),
            "query": body.get("query"),
        }

        return detections, metadata
