from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, JSON

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    industry = Column(String(50), nullable=False, default="other")
    strength = Column(String(20), nullable=False, default="balanced")
    rules = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=_now)
    updated_at = Column(DateTime, nullable=False, default=_now, onupdate=_now)
