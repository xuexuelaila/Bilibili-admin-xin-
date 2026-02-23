from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict


class CoverFavoriteOut(BaseModel):
    id: str
    bvid: str
    cover_url: str
    cover_hash: str
    category: list[str]
    layout_type: str | None = None
    note: str | None = None
    created_at: datetime
    updated_at: datetime
    video_title: str | None = None
    up_name: str | None = None
    views: int | None = None
    views_delta_1d: int | None = None

    model_config = ConfigDict(from_attributes=True)


class CoverFavoriteUpdate(BaseModel):
    category: list[str] | None = None
    layout_type: str | None = None
    note: str | None = None


class CoverFavoriteCreate(BaseModel):
    bvid: str | None = None
    cover_url: str | None = None
    category: list[str] | None = None
    layout_type: str | None = None
    note: str | None = None


class CoverFavoriteList(BaseModel):
    items: list[CoverFavoriteOut]
    page: int
    page_size: int
    total: int
