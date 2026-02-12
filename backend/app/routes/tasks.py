from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, func, case
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Task, Run, TaskVideo, Video
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate
from app.schemas.run import RunOut
from app.schemas.pagination import Page
from app.services.defaults import default_rules, default_scope, default_schedule
from app.services.task_runner import TaskRunner
from app.workers.tasks import run_task as celery_run_task

router = APIRouter()


@router.get("", response_model=Page)

def list_tasks(
    db: Session = Depends(get_db),
    status: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = select(Task)
    if status:
        query = query.where(Task.status == status)
    if q:
        query = query.where(or_(Task.name.ilike(f"%{q}%")))

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar()
    tasks = (
        db.execute(query.order_by(Task.updated_at.desc()).offset((page - 1) * page_size).limit(page_size))
        .scalars()
        .all()
    )

    if q:
        q_lower = q.lower()
        tasks = [t for t in tasks if q_lower in t.name.lower() or any(q_lower in k.lower() for k in (t.keywords or []))]
        total = len(tasks)

    items = [TaskOut.model_validate(t) for t in tasks]
    return {"items": items, "page": page, "page_size": page_size, "total": total}


@router.get("/summary")
def task_summary(ids: str | None = None, db: Session = Depends(get_db)):
    if ids:
        task_ids = [i.strip() for i in ids.split(",") if i.strip()]
    else:
        task_ids = [row[0] for row in db.execute(select(Task.id)).all()]
    if not task_ids:
        return {"items": []}

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = datetime.utcnow() - timedelta(days=7)

    video_rows = (
        db.execute(
            select(
                TaskVideo.task_id,
                func.count().label("today_new"),
                func.sum(case((Video.basic_hot == True, 1), else_=0)).label("today_basic"),  # noqa: E712
                func.sum(case((Video.low_fan_hot == True, 1), else_=0)).label("today_low"),  # noqa: E712
            )
            .join(Video, Video.bvid == TaskVideo.bvid)
            .where(TaskVideo.task_id.in_(task_ids), Video.fetch_time >= today)
            .group_by(TaskVideo.task_id)
        )
        .all()
    )
    video_map = {r.task_id: r for r in video_rows}

    run_rows = (
        db.execute(
            select(
                Run.task_id,
                func.count().label("runs"),
                func.sum(case((Run.status == "success", 1), else_=0)).label("success_runs"),
            )
            .where(Run.task_id.in_(task_ids), Run.start_at >= week_ago)
            .group_by(Run.task_id)
        )
        .all()
    )
    run_map = {r.task_id: r for r in run_rows}

    last_runs = (
        db.execute(
            select(Run)
            .where(Run.task_id.in_(task_ids))
            .order_by(Run.task_id, Run.end_at.desc().nullslast())
        )
        .scalars()
        .all()
    )
    last_map = {}
    for r in last_runs:
        if r.task_id not in last_map:
            last_map[r.task_id] = r

    items = []
    for task_id in task_ids:
        v = video_map.get(task_id)
        r = run_map.get(task_id)
        last = last_map.get(task_id)
        total_runs = int(getattr(r, "runs", 0) or 0)
        success_runs = int(getattr(r, "success_runs", 0) or 0)
        success_rate = 0 if total_runs == 0 else round(success_runs / total_runs * 100, 2)
        items.append(
            {
                "task_id": task_id,
                "today_new": int(getattr(v, "today_new", 0) or 0),
                "today_basic": int(getattr(v, "today_basic", 0) or 0),
                "today_low": int(getattr(v, "today_low", 0) or 0),
                "success_rate_7d": success_rate,
                "last_run_time": getattr(last, "end_at", None),
                "last_run_status": getattr(last, "status", None),
                "last_run_duration_ms": getattr(last, "duration_ms", None),
            }
        )
    return {"items": items}


@router.post("", response_model=TaskOut)

def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    if not payload.keywords:
        raise HTTPException(status_code=400, detail="keywords cannot be empty")

    task = Task(
        name=payload.name,
        keywords=payload.keywords,
        exclude_words=payload.exclude_words,
        scope=payload.scope or default_scope(),
        schedule=payload.schedule or default_schedule(),
        rules=payload.rules or default_rules(),
        status="enabled",
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return TaskOut.model_validate(task)


@router.get("/{task_id}", response_model=TaskOut)

def get_task(task_id: str, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskOut.model_validate(task)


@router.put("/{task_id}", response_model=TaskOut)

def update_task(task_id: str, payload: TaskUpdate, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(task, key, value)

    task.updated_at = datetime.utcnow()
    db.add(task)
    db.commit()
    db.refresh(task)
    return TaskOut.model_validate(task)


@router.post("/{task_id}/enable", response_model=TaskOut)

def enable_task(task_id: str, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = "enabled"
    db.add(task)
    db.commit()
    db.refresh(task)
    return TaskOut.model_validate(task)


@router.post("/{task_id}/disable", response_model=TaskOut)

def disable_task(task_id: str, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = "disabled"
    db.add(task)
    db.commit()
    db.refresh(task)
    return TaskOut.model_validate(task)


@router.post("/{task_id}/run")
def run_task(task_id: str, db: Session = Depends(get_db), async_run: bool = False):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if async_run:
        job = celery_run_task.delay(task.id, trigger="manual")
        return {"run_id": job.id, "async": True}

    runner = TaskRunner(db)
    run = runner.run(task, trigger="manual")
    return {"run_id": run.id, "async": False}


@router.post("/{task_id}/dry-run")
def dry_run(task_id: str, db: Session = Depends(get_db), limit: int = 20):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    runner = TaskRunner(db)
    result = runner.dry_run(task, limit=limit)
    return result


@router.post("/{task_id}/clone")

def clone_task(task_id: str, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    cloned = Task(
        name=f"{task.name} (复制)",
        keywords=list(task.keywords or []),
        exclude_words=list(task.exclude_words or []),
        scope=dict(task.scope or {}),
        schedule=dict(task.schedule or {}),
        rules=dict(task.rules or {}),
        status=task.status,
    )
    db.add(cloned)
    db.commit()
    db.refresh(cloned)
    return {"new_task_id": cloned.id}


@router.delete("/{task_id}")
def delete_task(task_id: str, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        return {"ok": False}
    db.delete(task)
    db.commit()
    return {"ok": True}


@router.get("/{task_id}/runs", response_model=Page)

def list_runs(
    task_id: str,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = select(Run).where(Run.task_id == task_id)
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar()
    runs = (
        db.execute(query.order_by(Run.start_at.desc()).offset((page - 1) * page_size).limit(page_size))
        .scalars()
        .all()
    )
    items = [RunOut.model_validate(r) for r in runs]
    return {"items": items, "page": page, "page_size": page_size, "total": total}
