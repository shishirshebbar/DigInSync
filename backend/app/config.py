from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Any


class Settings(BaseSettings):
    # App
    environment: str = "development"
    secret_key: str = "change-me-in-production"
    backend_cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.backend_cors_origins.split(",")]

    # Database
    database_url: str = "postgresql+asyncpg://digsync:password@localhost:5432/digsync"
    database_sync_url: str = "postgresql://digsync:password@localhost:5432/digsync"

    # LLM
    llm_provider: str = "gemini"  # gemini
    llm_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"

    # Map
    map_api_key: str = ""

    # ML
    ml_model_path: str = "ml/models/risk_model.joblib"
    ml_model_version: str = "1.0.0"

    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
