from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    vision_host: str = "0.0.0.0"
    vision_port: int = 8081
    vision_log_level: str = "info"
    vision_max_image_bytes: int = 20 * 1024 * 1024
    # Recordings are videos and run heavier than a still — allow a bigger upload.
    vision_max_video_bytes: int = 200 * 1024 * 1024
    vision_provider_timeout_seconds: float = 30.0

    plantnet_api_key: str | None = None
    plantnet_api_base_url: str = "https://my-api.plantnet.org"
    plantnet_project: str = "all"
    plantnet_default_organs: str = "auto"

    # RT-DETR detection stage.
    rtdetr_model_id: str = "PekingU/rtdetr_r50vd_coco_o365"
    rtdetr_device: str = "cpu"  # "cpu" | "cuda" (auto-falls-back to cpu if unavailable)

    # Agronomic summary stage (Claude). Optional: when the key is unset the
    # stage reports unconfigured and the pipeline still succeeds. The concrete
    # model id is overridable per pipeline_stages.config.model; this is the
    # fallback default.
    anthropic_api_key: str | None = None
    anthropic_summary_model: str = "claude-sonnet-4-6"
    # v2 returns the brief + a findings[] array, so it needs more room than the
    # v1 brief-only 200. Overridable per pipeline_stages.config.max_tokens.
    anthropic_summary_max_tokens: int = 700

    # Video summary stage (Claude multimodal over sampled frames). Shares the
    # ANTHROPIC_API_KEY; model + token budget + frame count overridable per
    # pipeline_stages.config.
    anthropic_video_model: str = "claude-sonnet-4-6"
    anthropic_video_max_tokens: int = 600
    vision_video_frames: int = 4

    @property
    def plantnet_configured(self) -> bool:
        return bool(self.plantnet_api_key)

    @property
    def anthropic_configured(self) -> bool:
        return bool(self.anthropic_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
