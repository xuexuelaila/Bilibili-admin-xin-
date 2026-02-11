import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, String, JSON, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class Run(Base):
    __tablename__ = "runs"

    id = Column(String(36), primary_key=True, default=_uuid)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False)
    trigger = Column(String(20), nullable=False, default="manual")
    status = Column(String(20), nullable=False, default="running")
    start_at = Column(DateTime, nullable=False, default=_now)
    end_at = Column(DateTime, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    counts = Column(JSON, nullable=False, default=dict)
    error_summary = Column(String(500), nullable=True)
    error_detail = Column(Text, nullable=True)

    task = relationship("Task", back_populates="runs")
