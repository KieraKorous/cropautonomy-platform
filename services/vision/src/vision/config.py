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
    vision_port: int = 8080
    vision_log_level: str = "info"
    vision_max_image_bytes: int = 20 * 1024 * 1024
    vision_provider_timeout_seconds: float = 30.0

    plantnet_api_key: str | None = None
    plantnet_api_base_url: str = "https://my-api.plantnet.org"
    plantnet_project: str = "all"
    plantnet_default_organs: str = "auto"

    @property
    def plantnet_configured(self) -> bool:
        return bool(self.plantnet_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
