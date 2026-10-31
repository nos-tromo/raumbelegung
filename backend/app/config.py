from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEFAULT_SECRET = "change-me-in-production"  # noqa: S105 - refused in production


class Settings(BaseSettings):
    """All settings come from environment variables (or a local .env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://raumbelegung:raumbelegung@localhost:5432/raumbelegung"
    SECRET_KEY: str = INSECURE_DEFAULT_SECRET
    FRONTEND_URL: str = "http://localhost:5173"
    COOKIE_SECURE: bool = False

    MAIL_BACKEND: Literal["smtp", "console", "memory"] = "console"
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_STARTTLS: bool = True
    SMTP_SSL: bool = False
    MAIL_FROM: str = "Raumbelegung <noreply@localhost>"

    RATE_LIMIT_ENABLED: bool = True
    DEFAULT_TIMEZONE: str = "Europe/Berlin"
    ENABLE_DOCS: bool = True

    @property
    def frontend_base(self) -> str:
        return self.FRONTEND_URL.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
