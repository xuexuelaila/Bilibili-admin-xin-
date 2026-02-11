from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Bilibili Admin"
    env: str = "dev"
    database_url: str = "sqlite:///./bili_admin.db"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    cors_origins: str = "http://localhost:5173"
    bili_client: str = "mock"
    bili_cookies: str | None = None
    bili_user_agent: str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    bili_referer: str = "https://www.bilibili.com"
    default_task_schedule_time: str = "09:00"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        raw = (self.cors_origins or "").strip()
        if not raw:
            return []
        if raw.startswith("[") and raw.endswith("]"):
            raw = raw.strip("[]")
        return [item.strip() for item in raw.split(",") if item.strip()]


@lru_cache

def get_settings() -> Settings:
    return Settings()


settings = get_settings()
