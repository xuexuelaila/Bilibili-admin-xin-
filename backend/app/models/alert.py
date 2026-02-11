from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=True)
    type = Column(String(50), nullable=False, default="task_failure")
    level = Column(String(20), nullable=False, default="warning")
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=True)
    meta = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=_now)
    read_at = Column(DateTime, nullable=True)

    task = relationship("Task", lazy="joined")
