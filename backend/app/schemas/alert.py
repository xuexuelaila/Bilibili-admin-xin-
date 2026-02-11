from datetime import datetime
from pydantic import BaseModel, ConfigDict


class AlertOut(BaseModel):
    id: int
    task_id: str | None
    type: str
    level: str
    title: str
    message: str | None
    meta: dict
    created_at: datetime
    read_at: datetime | None

    model_config = ConfigDict(from_attributes=True)
