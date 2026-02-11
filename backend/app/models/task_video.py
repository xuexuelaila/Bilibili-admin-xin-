from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


class TaskVideo(Base):
    __tablename__ = "task_videos"
    __table_args__ = (UniqueConstraint("task_id", "bvid", name="uq_task_video"),)

    id = Column(Integer, primary_key=True)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False)
    bvid = Column(String(32), ForeignKey("videos.bvid"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=_now)

    task = relationship("Task", back_populates="task_videos")
    video = relationship("Video", back_populates="task_videos")
