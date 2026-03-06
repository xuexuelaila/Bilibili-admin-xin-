from celery import Celery
from celery.schedules import crontab

from app.core.config import settings


def _parse_hhmm(value: str, default: str = "03:00") -> tuple[int, int]:
    raw = (value or "").strip()
    if ":" not in raw:
        raw = default
    parts = raw.split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        hour, minute = 3, 0
    hour = max(0, min(23, hour))
    minute = max(0, min(59, minute))
    return hour, minute

celery_app = Celery(
    "bili_admin",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.autodiscover_tasks(["app.workers"])

beat_schedule = {
    "dispatch-due-tasks": {
        "task": "dispatch_due_tasks",
        "schedule": 60.0,
    }
}

if settings.refresh_all_enabled:
    hour, minute = _parse_hhmm(settings.refresh_all_time, default="03:00")
    beat_schedule["refresh-all-videos"] = {
        "task": "refresh_all_videos",
        "schedule": crontab(hour=hour, minute=minute),
    }

creator_interval = int(settings.creator_watch_interval_minutes or 45)
creator_interval = max(30, min(60, creator_interval))
beat_schedule["sync-creator-watch"] = {
    "task": "sync_creator_watch",
    "schedule": float(creator_interval * 60),
}

celery_app.conf.update(
    task_track_started=True,
    timezone="Asia/Shanghai",
    beat_schedule=beat_schedule,
)
