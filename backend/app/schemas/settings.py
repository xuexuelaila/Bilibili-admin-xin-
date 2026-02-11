from pydantic import BaseModel, ConfigDict


class SettingsOut(BaseModel):
    rate_limit_per_sec: int
    retry_times: int
    timeout_seconds: int
    alert_consecutive_failures: int

    model_config = ConfigDict(from_attributes=True)


class SettingsUpdate(BaseModel):
    rate_limit_per_sec: int | None = None
    retry_times: int | None = None
    timeout_seconds: int | None = None
    alert_consecutive_failures: int | None = None
