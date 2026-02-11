from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict


class VideoOut(BaseModel):
    bvid: str
    title: str
    up_id: str
    up_name: str
    follower_count: int
    publish_time: datetime | None
    fetch_time: datetime
    cover_url: str | None
    stats: dict[str, Any]
    tags: dict[str, Any]
    source_task_ids: list[str]
    process_status: str
    note: str | None

    model_config = ConfigDict(from_attributes=True)
