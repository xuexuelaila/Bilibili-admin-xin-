from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, String, Text, JSON, Integer

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


class FollowedCreator(Base):
    __tablename__ = "followed_creators"

    up_id = Column(String(64), primary_key=True)
    up_name = Column(String(200), nullable=False, default="")
    avatar = Column(String(500), nullable=True)
    follower_count = Column(Integer, nullable=False, default=0)
    following_count = Column(Integer, nullable=False, default=0)
    like_count = Column(Integer, nullable=False, default=0)
    view_count = Column(Integer, nullable=False, default=0)
    group_tags = Column(JSON, nullable=False, default=list)
    note = Column(Text, nullable=True)
    monitor_enabled = Column(Boolean, nullable=False, default=True)
    last_checked_at = Column(DateTime, nullable=True)
    last_success_at = Column(DateTime, nullable=True)
    last_error_at = Column(DateTime, nullable=True)
    last_error_msg = Column(Text, nullable=True)
