from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.base import Base


def _make_engine():
    if settings.database_url.startswith("sqlite"):
        return create_engine(
            settings.database_url,
            connect_args={"check_same_thread": False},
            future=True,
        )
    return create_engine(settings.database_url, future=True)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
