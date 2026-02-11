from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Alert
from app.schemas.alert import AlertOut
from app.schemas.pagination import Page

router = APIRouter()


@router.get("/alerts", response_model=Page)

def list_alerts(
    db: Session = Depends(get_db),
    unread: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = select(Alert)
    if unread is True:
        query = query.where(Alert.read_at.is_(None))
    if unread is False:
        query = query.where(Alert.read_at.is_not(None))

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar()
    rows = (
        db.execute(query.order_by(Alert.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
        .scalars()
        .all()
    )
    items = [AlertOut.model_validate(a) for a in rows]
    return {"items": items, "page": page, "page_size": page_size, "total": total}


@router.post("/alerts/{alert_id}/read")

def mark_read(alert_id: int, db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if not alert:
        return {"ok": False}
    alert.read_at = datetime.utcnow()
    db.add(alert)
    db.commit()
    return {"ok": True}


@router.post("/alerts/mark_all_read")

def mark_all_read(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    alerts = db.execute(select(Alert).where(Alert.read_at.is_(None))).scalars().all()
    for alert in alerts:
        alert.read_at = now
    db.commit()
    return {"ok": True, "count": len(alerts)}


@router.get("/alerts/unread_count")

def unread_count(db: Session = Depends(get_db)):
    count = db.execute(select(func.count()).select_from(Alert).where(Alert.read_at.is_(None))).scalar()
    return {"count": int(count or 0)}
