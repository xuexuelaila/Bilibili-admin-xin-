from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, Integer, String

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


def _uuid() -> str:
    return str(uuid4())


class VideoFrame(Base):
    __tablename__ = "video_frames"

    id = Column(String(36), primary_key=True, default=_uuid)
    job_id = Column(String(36), nullable=False)
    bvid = Column(String(32), nullable=False)
    idx = Column(Integer, nullable=False)
    timestamp_ms = Column(Integer, nullable=True)
    frame_url = Column(String(500), nullable=False)
    thumb_url = Column(String(500), nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_now)
