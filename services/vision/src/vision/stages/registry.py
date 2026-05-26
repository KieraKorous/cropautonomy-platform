"""Stage registry — the (name, version) → Stage instance lookup.

This is the only place that knows which concrete stage implementations exist
in this vision instance. The PipelineExecutor resolves each StageSpec it
receives against this registry. /v1/stages introspects it.

Adding a new stage = one new file in this directory + one line here. The
HTTP API and the database schema do not change.
"""

from __future__ import annotations

from functools import lru_cache

from ..config import get_settings
from .base import Stage
from .plantnet import PlantNetStage
from .rtdetr import RTDetrStage


class StageRegistry:
    def __init__(self, stages: list[Stage]) -> None:
        self._by_key: dict[tuple[str, str], Stage] = {
            (s.name, s.version): s for s in stages
        }

    def get(self, name: str, version: str) -> Stage | None:
        return self._by_key.get((name, version))

    def all(self) -> list[Stage]:
        return list(self._by_key.values())


@lru_cache(maxsize=1)
def get_registry() -> StageRegistry:
    settings = get_settings()
    stages: list[Stage] = [
        RTDetrStage(
            model_id=settings.rtdetr_model_id,
            device=settings.rtdetr_device,
        ),
        PlantNetStage(
            api_key=settings.plantnet_api_key,
            base_url=settings.plantnet_api_base_url,
            project=settings.plantnet_project,
            default_organs=settings.plantnet_default_organs,
            timeout_seconds=settings.vision_provider_timeout_seconds,
        ),
    ]
    return StageRegistry(stages)
