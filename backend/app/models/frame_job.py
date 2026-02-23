from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


def _uuid() -> str:
    return str(uuid4())


class FrameJob(Base):
    __tablename__ = "frame_jobs"

    id = Column(String(36), primary_key=True, default=_uuid)
    bvid = Column(String(32), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    mode = Column(String(20), nullable=False, default="scene")
    interval_sec = Column(Integer, nullable=True)
    scene_threshold = Column(Float, nullable=True)
    max_frames = Column(Integer, nullable=False, default=120)
    resolution = Column(String(10), nullable=False, default="720p")
    source_video_path = Column(String(500), nullable=True)
    output_dir = Column(String(500), nullable=True)
    generated_frames = Column(Integer, nullable=False, default=0)
    frame_count = Column(Integer, nullable=False, default=0)
    progress = Column(Float, nullable=True)
    error_msg = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_now)
    updated_at = Column(DateTime, nullable=False, default=_now, onupdate=_now)
