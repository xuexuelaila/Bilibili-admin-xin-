from datetime import datetime, timedelta
from sqlalchemy import func, select, case
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.models import Video, Run, Task, TaskVideo

router = APIRouter()


@router.get("/overview")

def overview(db: Session = Depends(get_db)):
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)

    today_new = db.execute(select(func.count()).select_from(Video).where(Video.fetch_time >= today)).scalar()
    today_basic = db.execute(
        select(func.count()).select_from(Video).where(Video.fetch_time >= today, Video.basic_hot == True)  # noqa: E712
    ).scalar()
    today_low = db.execute(
        select(func.count()).select_from(Video).where(Video.fetch_time >= today, Video.low_fan_hot == True)  # noqa: E712
    ).scalar()

    failed_tasks = db.execute(
        select(func.count()).select_from(Task).where(Task.consecutive_failures > 0)
    ).scalar()

    total_runs = db.execute(select(func.count()).select_from(Run).where(Run.start_at >= week_ago)).scalar()
    success_runs = db.execute(
        select(func.count()).select_from(Run).where(Run.start_at >= week_ago, Run.status == "success")
    ).scalar()
    success_rate = 0 if total_runs == 0 else round(success_runs / total_runs * 100, 2)

    last_run_time = db.execute(select(func.max(Run.end_at))).scalar()

    return {
        "today_new_videos": int(today_new or 0),
        "today_basic_hot": int(today_basic or 0),
        "today_low_fan_hot": int(today_low or 0),
        "failed_tasks": int(failed_tasks or 0),
        "success_rate": success_rate,
        "last_run_time": last_run_time,
    }


@router.get("/trends")
def trends(days: int = 7, db: Session = Depends(get_db)):
    days = max(3, min(int(days), 30))
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=days - 1)

    video_rows = (
        db.execute(
            select(
                func.date(Video.fetch_time).label("d"),
                func.count().label("new_videos"),
                func.sum(case((Video.basic_hot == True, 1), else_=0)).label("basic_hot"),  # noqa: E712
                func.sum(case((Video.low_fan_hot == True, 1), else_=0)).label("low_fan_hot"),  # noqa: E712
            )
            .where(Video.fetch_time >= start)
            .group_by(func.date(Video.fetch_time))
        )
        .all()
    )
    run_rows = (
        db.execute(
            select(
                func.date(Run.start_at).label("d"),
                func.count().label("runs"),
                func.sum(case((Run.status == "success", 1), else_=0)).label("success_runs"),
            )
            .where(Run.start_at >= start)
            .group_by(func.date(Run.start_at))
        )
        .all()
    )

    video_map = {str(r.d): r for r in video_rows}
    run_map = {str(r.d): r for r in run_rows}

    series = []
    for i in range(days):
        day = start + timedelta(days=i)
        key = day.date().isoformat()
        v = video_map.get(key)
        r = run_map.get(key)
        series.append(
            {
                "date": key,
                "new_videos": int(getattr(v, "new_videos", 0) or 0),
                "basic_hot": int(getattr(v, "basic_hot", 0) or 0),
                "low_fan_hot": int(getattr(v, "low_fan_hot", 0) or 0),
                "runs": int(getattr(r, "runs", 0) or 0),
                "success_runs": int(getattr(r, "success_runs", 0) or 0),
            }
        )
    return {"days": days, "series": series}


@router.get("/task_rank")
def task_rank(days: int = 7, db: Session = Depends(get_db)):
    days = max(3, min(int(days), 30))
    start = datetime.utcnow() - timedelta(days=days)

    rows = (
        db.execute(
            select(
                Task.id,
                Task.name,
                func.count(TaskVideo.id).label("videos"),
                func.sum(case((Video.basic_hot == True, 1), else_=0)).label("basic_hot"),  # noqa: E712
                func.sum(case((Video.low_fan_hot == True, 1), else_=0)).label("low_fan_hot"),  # noqa: E712
            )
            .join(TaskVideo, TaskVideo.task_id == Task.id)
            .join(Video, Video.bvid == TaskVideo.bvid)
            .where(Video.fetch_time >= start)
            .group_by(Task.id, Task.name)
            .order_by(func.count(TaskVideo.id).desc())
        )
        .all()
    )

    items = []
    for r in rows:
        items.append(
            {
                "task_id": r.id,
                "task_name": r.name,
                "videos": int(r.videos or 0),
                "basic_hot": int(r.basic_hot or 0),
                "low_fan_hot": int(r.low_fan_hot or 0),
            }
        )
    return {"days": days, "items": items}
