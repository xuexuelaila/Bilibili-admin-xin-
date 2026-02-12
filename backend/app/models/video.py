from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, JSON, Float
from sqlalchemy.orm import relationship

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


class Video(Base):
    __tablename__ = "videos"

    bvid = Column(String(32), primary_key=True)
    title = Column(String(500), nullable=False)
    up_id = Column(String(64), nullable=False)
    up_name = Column(String(200), nullable=False)
    follower_count = Column(Integer, nullable=False, default=0)
    publish_time = Column(DateTime, nullable=True)
    fetch_time = Column(DateTime, nullable=False, default=_now)
    cover_url = Column(String(500), nullable=True)

    views = Column(Integer, nullable=False, default=0)
    like = Column(Integer, nullable=False, default=0)
    fav = Column(Integer, nullable=False, default=0)
    coin = Column(Integer, nullable=False, default=0)
    reply = Column(Integer, nullable=False, default=0)
    share = Column(Integer, nullable=False, default=0)

    fav_rate = Column(Float, nullable=False, default=0.0)
    coin_rate = Column(Float, nullable=False, default=0.0)
    reply_rate = Column(Float, nullable=False, default=0.0)
    fav_fan_ratio = Column(Float, nullable=False, default=0.0)

    basic_hot = Column(Boolean, nullable=False, default=False)
    basic_hot_reason = Column(JSON, nullable=False, default=list)
    low_fan_hot = Column(Boolean, nullable=False, default=False)
    low_fan_hot_reason = Column(JSON, nullable=False, default=list)

    process_status = Column(String(20), nullable=False, default="todo")
    note = Column(Text, nullable=True)

    tags = Column(JSON, nullable=False, default=list)

    source_task_ids = Column(JSON, nullable=False, default=list)

    task_videos = relationship("TaskVideo", back_populates="video", cascade="all, delete-orphan")
    subtitle = relationship("Subtitle", back_populates="video", uselist=False, cascade="all, delete-orphan")
