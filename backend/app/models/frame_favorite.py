from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, String, Text, UniqueConstraint

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


def _uuid() -> str:
    return str(uuid4())


class FrameFavorite(Base):
    __tablename__ = "frame_favorites"
    __table_args__ = (UniqueConstraint("bvid", "frame_id", name="uniq_frame_fav"),)

    id = Column(String(36), primary_key=True, default=_uuid)
    bvid = Column(String(32), nullable=False)
    frame_id = Column(String(36), nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_now)
