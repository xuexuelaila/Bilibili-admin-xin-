from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, JSON

from app.models.base import Base


def _now() -> datetime:
    return datetime.utcnow()


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True)
    product_key = Column(String(200), nullable=False, unique=True, index=True)
    platform = Column(String(32), nullable=False, index=True)
    item_id = Column(String(128), nullable=False, index=True)
    sku_id = Column(String(128), nullable=True)
    category_tags = Column(JSON, nullable=False, default=list)
    first_seen_at = Column(DateTime, nullable=False, default=_now)
    last_seen_at = Column(DateTime, nullable=False, default=_now)
    created_at = Column(DateTime, nullable=False, default=_now)
    updated_at = Column(DateTime, nullable=False, default=_now, onupdate=_now)
