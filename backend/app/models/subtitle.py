from datetime import datetime
from sqlalchemy import Column, DateTime, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


class Subtitle(Base):
    __tablename__ = "subtitles"

    bvid = Column(String(32), ForeignKey("videos.bvid"), primary_key=True)
    status = Column(String(20), nullable=False, default="none")
    text = Column(Text, nullable=True)
    format = Column(String(20), nullable=False, default="txt")
    updated_at = Column(DateTime, nullable=False, default=_now, onupdate=_now)
    error = Column(String(500), nullable=True)

    video = relationship("Video", back_populates="subtitle")
