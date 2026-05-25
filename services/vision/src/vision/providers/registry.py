"""Provider registry — the (name, version) → provider lookup.

This is the only place that knows which concrete provider implementations
exist. The FastAPI route uses it to dispatch /v1/inference requests; the
/v1/models endpoint uses it to describe available providers.

When adding a new provider, instantiate it here. The HTTP API does not change.
"""

from __future__ import annotations

from functools import lru_cache

from ..config import get_settings
from .base import InferenceProvider
from .plantnet import PlantNetProvider


class ProviderRegistry:
    def __init__(self, providers: list[InferenceProvider]) -> None:
        self._by_key: dict[tuple[str, str], InferenceProvider] = {
            (p.name, p.version): p for p in providers
        }

    def get(self, name: str, version: str) -> InferenceProvider | None:
        return self._by_key.get((name, version))

    def all(self) -> list[InferenceProvider]:
        return list(self._by_key.values())


@lru_cache(maxsize=1)
def get_registry() -> ProviderRegistry:
    settings = get_settings()
    providers: list[InferenceProvider] = [
        PlantNetProvider(
            api_key=settings.plantnet_api_key,
            base_url=settings.plantnet_api_base_url,
            project=settings.plantnet_project,
            default_organs=settings.plantnet_default_organs,
            timeout_seconds=settings.vision_provider_timeout_seconds,
        ),
    ]
    return ProviderRegistry(providers)
