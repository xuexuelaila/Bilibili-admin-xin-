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
    refresh_all_enabled: bool = True
    refresh_all_time: str = "03:00"
    refresh_all_batch_size: int = 50
    asr_provider: str = ""
    asr_model: str = "base"
    asr_language: str = "zh"
    asr_device: str = "cpu"
    asr_compute_type: str = "int8"
    asr_ffmpeg_path: str | None = None
    asr_max_audio_mb: int = 100
    asr_transcode: bool = True
    doubao_app_key: str | None = None
    doubao_access_key: str | None = None
    doubao_resource_id: str = "volc.bigasr.auc_turbo"
    doubao_endpoint: str = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
    doubao_submit_endpoint: str = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit"
    doubao_query_endpoint: str = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query"
    baidu_api_key: str | None = None
    baidu_secret_key: str | None = None
    baidu_token_endpoint: str = "https://aip.baidubce.com/oauth/2.0/token"
    baidu_asr_endpoint: str = "https://vop.baidu.com/server_api"
    baidu_dev_pid: int = 1537
    baidu_cuid: str = "bili-admin"
    baidu_segment_seconds: int = 55
    tos_access_key: str | None = None
    tos_secret_key: str | None = None
    tos_endpoint: str | None = None
    tos_region: str | None = None
    tos_bucket: str | None = None
    tos_prefix: str = "asr"
    tos_public_base: str | None = None
    tos_url_expires: int = 3600
    frames_dir: str = "frames"

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
