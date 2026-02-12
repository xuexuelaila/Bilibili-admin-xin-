import json
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Task, Video

router = APIRouter()


def _coerce_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            data = json.loads(value)
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            return [value]
    return []


@router.get("/tags")

def list_tags(db: Session = Depends(get_db)):
    tags: set[str] = set()
    for row in db.execute(select(Task.tags)).all():
        for item in _coerce_list(row[0]):
            text = str(item).strip()
            if text:
                tags.add(text)
    for row in db.execute(select(Video.tags)).all():
        for item in _coerce_list(row[0]):
            text = str(item).strip()
            if text:
                tags.add(text)
    items = sorted(tags)
    return {"items": items}
