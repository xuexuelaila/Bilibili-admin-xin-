import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, JSON, ForeignKey, UniqueConstraint

from app.models.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class CommentCrawlJob(Base):
    __tablename__ = "comment_crawl_jobs"
    __table_args__ = (UniqueConstraint("task_id", "bvid", name="uq_comment_job_task_bvid"),)

    id = Column(String(36), primary_key=True, default=_uuid)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False, index=True)
    bvid = Column(String(32), ForeignKey("videos.bvid"), nullable=False, index=True)
    keywords = Column(JSON, nullable=False, default=list)
    limit = Column(Integer, nullable=False, default=500)
    status = Column(String(20), nullable=False, default="queued")
    error_msg = Column(Text, nullable=True)
    comment_count = Column(Integer, nullable=False, default=0)
    mention_count = Column(Integer, nullable=False, default=0)
    product_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=_now)
    updated_at = Column(DateTime, nullable=False, default=_now, onupdate=_now)
    finished_at = Column(DateTime, nullable=True)
