from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Run, Task
from app.schemas.run import RunOut
from app.services.task_runner import TaskRunner
from app.workers.tasks import run_task as celery_run_task

router = APIRouter()


@router.get("/runs/{run_id}", response_model=RunOut)

def get_run(run_id: str, db: Session = Depends(get_db)):
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunOut.model_validate(run)


@router.post("/runs/{run_id}/retry")
def retry_run(run_id: str, db: Session = Depends(get_db), async_run: bool = False):
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    task = db.get(Task, run.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if async_run:
        job = celery_run_task.delay(task.id, trigger="manual")
        return {"run_id": job.id, "async": True}

    runner = TaskRunner(db)
    new_run = runner.run(task, trigger="manual")
    return {"run_id": new_run.id, "async": False}
