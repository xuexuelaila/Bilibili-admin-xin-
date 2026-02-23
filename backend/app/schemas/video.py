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
    video_url: str | None = None
    views_delta_1d: int | None = None
    is_favorited: bool = False
    favorited_at: datetime | None = None
    status_updated_at: datetime | None = None
    is_cover_favorited: bool = False
    cover_favorite_id: str | None = None
    stats: dict[str, Any]
    tags: dict[str, Any]
    labels: list[str]
    source_task_ids: list[str]
    source_task_names: list[str]
    process_status: str
    note: str | None

    model_config = ConfigDict(from_attributes=True)
