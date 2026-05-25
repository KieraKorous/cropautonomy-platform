"""Provider interface. Every inference backend implements this contract.

Adding a new provider (YOLO, Roboflow, our PyTorch model) means writing one
file that subclasses InferenceProvider and registering it in registry.py.
The HTTP API does not change.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..schemas import Detection, Task


class ProviderError(RuntimeError):
    """Raised when a provider call fails for a recoverable reason (network, 5xx)."""


class ProviderNotConfigured(ProviderError):
    """Raised when required credentials are missing. Should surface as 503, not 500."""


class InferenceProvider(ABC):
    name: str
    version: str
    task: Task
    is_classification_only: bool

    @property
    @abstractmethod
    def configured(self) -> bool:
        """Whether this provider has the credentials/config needed to run."""

    @abstractmethod
    async def infer(
        self,
        image_bytes: bytes,
        mime_type: str,
        max_results: int,
    ) -> tuple[list[Detection], dict[str, object]]:
        """Run inference on the image. Returns (detections, provider_metadata).

        provider_metadata captures vendor-specific info (request ID, model
        variant, latency breakdown) that's useful to retain on analysis_jobs
        but doesn't fit the analysis_results schema.
        """
