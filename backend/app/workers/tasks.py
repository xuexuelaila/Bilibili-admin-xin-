from datetime import datetime
import redis
from celery import shared_task
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Task
from app.services.task_runner import TaskRunner


@shared_task(name="run_task")

def run_task(task_id: str, trigger: str = "schedule"):
    db = SessionLocal()
    try:
        task = db.get(Task, task_id)
        if not task:
            return {"error": "task not found"}
        runner = TaskRunner(db)
        run = runner.run(task, trigger=trigger)
        return {"run_id": run.id}
    finally:
        db.close()


@shared_task(name="dispatch_due_tasks")

def dispatch_due_tasks():
    db = SessionLocal()
    r = redis.Redis.from_url(settings.redis_url)
    try:
        tasks = db.execute(select(Task).where(Task.status == "enabled")).scalars().all()
        now = datetime.utcnow()
        today = now.strftime("%Y-%m-%d")

        for task in tasks:
            schedule = task.schedule or {}
            if schedule.get("type") != "daily":
                continue
            time_str = schedule.get("time") or "09:00"
            if time_str != now.strftime("%H:%M"):
                continue
            lock_key = f"task:{task.id}:{today}:{time_str}"
            if not r.set(lock_key, "1", nx=True, ex=48 * 3600):
                continue
            run_task.delay(task.id, trigger="schedule")
    finally:
        db.close()
