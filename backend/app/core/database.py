from sqlalchemy import create_engine, text
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
    if settings.database_url.startswith("sqlite"):
        _ensure_sqlite_columns()


def _ensure_sqlite_columns() -> None:
    with engine.begin() as conn:
        tables = {
            "tasks": ["tags"],
            "videos": ["tags"],
        }
        for table, columns in tables.items():
            exists = conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"),
                {"name": table},
            ).first()
            if not exists:
                continue
            rows = conn.execute(text(f"PRAGMA table_info({table})")).mappings().all()
            existing = {row["name"] for row in rows}
            for column in columns:
                if column not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} TEXT DEFAULT '[]'"))
            if "tags" in columns and "tags" in existing:
                conn.execute(text(f"UPDATE {table} SET tags='[]' WHERE tags IS NULL"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
