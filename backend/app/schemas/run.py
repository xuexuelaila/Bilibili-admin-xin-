from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict


class RunOut(BaseModel):
    id: str
    task_id: str
    trigger: str
    status: str
    start_at: datetime
    end_at: datetime | None
    duration_ms: int | None
    counts: dict[str, Any]
    error_summary: str | None
    error_detail: str | None

    model_config = ConfigDict(from_attributes=True)
