import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, JSON
from sqlalchemy.orm import relationship

from app.models.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, default=_uuid)
    name = Column(String(200), nullable=False)
    keywords = Column(JSON, nullable=False, default=list)
    exclude_words = Column(JSON, nullable=False, default=list)
    tags = Column(JSON, nullable=False, default=list)
    scope = Column(JSON, nullable=False, default=dict)
    schedule = Column(JSON, nullable=False, default=dict)
    rules = Column(JSON, nullable=False, default=dict)
    status = Column(String(20), nullable=False, default="enabled")
    consecutive_failures = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=_now)
    updated_at = Column(DateTime, nullable=False, default=_now, onupdate=_now)

    runs = relationship("Run", back_populates="task", cascade="all, delete-orphan")
    task_videos = relationship("TaskVideo", back_populates="task", cascade="all, delete-orphan")
