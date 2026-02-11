from datetime import datetime
from pydantic import BaseModel, ConfigDict


class SubtitleOut(BaseModel):
    bvid: str
    status: str
    text: str | None
    format: str
    updated_at: datetime
    error: str | None

    model_config = ConfigDict(from_attributes=True)
