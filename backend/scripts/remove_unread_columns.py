from __future__ import annotations

from sqlalchemy import MetaData, Table, create_engine, inspect, text

from app.core.config import settings
from app.models.video import Video


def _drop_columns_sqlite(engine) -> None:
    inspector = inspect(engine)
    if "videos" not in inspector.get_table_names():
        print("videos table not found, skip")
        return

    columns = [c["name"] for c in inspector.get_columns("videos")]
    if "is_unread" not in columns and "seen_at" not in columns:
        print("columns already removed, skip")
        return

    new_meta = MetaData()
    new_table = Table("videos_new", new_meta, *[c.copy() for c in Video.__table__.columns])
    new_meta.create_all(engine)

    keep_cols = [c.name for c in new_table.columns]
    cols_sql = ", ".join(keep_cols)

    with engine.begin() as conn:
        conn.execute(text(f"INSERT INTO videos_new ({cols_sql}) SELECT {cols_sql} FROM videos"))
        conn.execute(text("DROP TABLE videos"))
        conn.execute(text("ALTER TABLE videos_new RENAME TO videos"))

    print("removed columns is_unread/seen_at from sqlite videos table")


def _drop_columns_generic(engine) -> None:
    with engine.begin() as conn:
        for col in ["is_unread", "seen_at"]:
            try:
                conn.execute(text(f"ALTER TABLE videos DROP COLUMN {col}"))
                print(f"dropped column {col}")
            except Exception as exc:  # noqa: BLE001
                print(f"skip drop {col}: {exc}")


def main() -> None:
    engine = create_engine(settings.database_url, future=True)
    if engine.dialect.name == "sqlite":
        _drop_columns_sqlite(engine)
    else:
        _drop_columns_generic(engine)


if __name__ == "__main__":
    main()
