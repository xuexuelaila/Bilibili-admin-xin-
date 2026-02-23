from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, String, Text, JSON

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


def _uuid() -> str:
    return str(uuid4())


class CoverFavorite(Base):
    __tablename__ = "cover_favorites"

    id = Column(String(36), primary_key=True, default=_uuid)
    bvid = Column(String(32), nullable=False)
    cover_url = Column(String(500), nullable=False)
    cover_hash = Column(String(64), nullable=False)
    category = Column(JSON, nullable=False, default=list)
    layout_type = Column(String(50), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_now)
    updated_at = Column(DateTime, nullable=False, default=_now, onupdate=_now)
