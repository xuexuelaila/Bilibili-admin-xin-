from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


class ProductMention(Base):
    __tablename__ = "product_mentions"
    __table_args__ = (
        UniqueConstraint("product_id", "bvid", "user_id", "raw_url", "keyword", name="uq_product_mention"),
    )

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    bvid = Column(String(32), ForeignKey("videos.bvid"), nullable=False, index=True)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False, index=True)
    keyword = Column(String(200), nullable=True, index=True)
    user_id = Column(String(64), nullable=True, index=True)
    mentioned_at = Column(DateTime, nullable=True, index=True)
    raw_url = Column(String(1000), nullable=True)
    job_id = Column(String(36), ForeignKey("comment_crawl_jobs.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=_now)
