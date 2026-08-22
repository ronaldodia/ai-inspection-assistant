from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    anthropic_api_key: str
    voyage_api_key: str
    photos_dir: str = "/data/photos"
    reports_dir: str = "/data/reports"
    cors_origins: list[str] = ["http://localhost:3000"]

    storage_backend: str = "local"  # "local" ou "azure"
    azure_storage_connection_string: str | None = None
    azure_photos_container: str = "photos"
    azure_reports_container: str = "reports"

    # Limites par défaut appliquées aux inspecteurs sans limite personnalisée
    # (users.max_inspections / users.max_photos_per_inspection = NULL).
    default_max_inspections: int = 100
    default_max_photos_per_inspection: int = 50


settings = Settings()
