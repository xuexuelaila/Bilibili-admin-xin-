from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "bili_admin",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.autodiscover_tasks(["app.workers"])

celery_app.conf.update(
    task_track_started=True,
    timezone="UTC",
    beat_schedule={
        "dispatch-due-tasks": {
            "task": "dispatch_due_tasks",
            "schedule": 60.0,
        }
    },
)
