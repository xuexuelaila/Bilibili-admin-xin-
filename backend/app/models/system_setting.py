from datetime import datetime
from sqlalchemy import Column, DateTime, Integer

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, default=1)
    rate_limit_per_sec = Column(Integer, nullable=False, default=1)
    retry_times = Column(Integer, nullable=False, default=2)
    timeout_seconds = Column(Integer, nullable=False, default=10)
    alert_consecutive_failures = Column(Integer, nullable=False, default=3)
    created_at = Column(DateTime, nullable=False, default=_now)
    updated_at = Column(DateTime, nullable=False, default=_now, onupdate=_now)
