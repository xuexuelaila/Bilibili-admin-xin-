from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Task, Run
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
