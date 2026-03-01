from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import CommentCrawlJob
from app.workers.celery_app import celery_app

router = APIRouter()


def _retry_job(job_id: str, db: Session) -> dict:
    job = db.get(CommentCrawlJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")

    job.status = "queued"
    job.error_msg = None
    job.updated_at = datetime.utcnow()
    db.add(job)
    db.commit()

    celery_app.send_task("crawl_comments", args=[job.id])
    return {"ok": True, "job_id": job.id}


@router.post("/{job_id}/retry")
def retry_comment_job(job_id: str, db: Session = Depends(get_db)):
    return _retry_job(job_id, db)


@router.get("/{job_id}/retry")
def retry_comment_job_get(job_id: str, db: Session = Depends(get_db)):
    return _retry_job(job_id, db)
