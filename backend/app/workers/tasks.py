from datetime import datetime
import redis
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Task, Subtitle, Video
from app.services.bili_client import MockBiliClient
from app.services.bili_crawler import CrawlerBiliClient
from app.services.asr_service import transcribe_audio_url
from app.services.settings_service import get_or_create_settings
from app.services.task_runner import TaskRunner
from app.workers.celery_app import celery_app


@celery_app.task(name="run_task")
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


@celery_app.task(name="dispatch_due_tasks")
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


def _build_subtitle_client(db):
    if settings.bili_client == "crawler":
        setting = get_or_create_settings(db)
        return CrawlerBiliClient(
            rate_limit_per_sec=setting.rate_limit_per_sec,
            retry_times=setting.retry_times,
            timeout_seconds=setting.timeout_seconds,
        )
    return MockBiliClient()


def _mark_subtitle(db, bvid: str, status: str, text: str | None = None, error: str | None = None) -> Subtitle:
    subtitle = db.get(Subtitle, bvid)
    if not subtitle:
        subtitle = Subtitle(bvid=bvid, status=status)
    subtitle.status = status
    subtitle.text = text
    subtitle.error = error
    db.add(subtitle)
    db.commit()
    return subtitle


@celery_app.task(name="extract_subtitle")
def extract_subtitle(bvid: str):
    db = SessionLocal()
    try:
        video = db.get(Video, bvid)
        if not video:
            _mark_subtitle(db, bvid, "failed", error="video not found")
            return {"error": "video not found"}

        _mark_subtitle(db, bvid, "extracting")
        client = _build_subtitle_client(db)
        text = client.get_subtitle(bvid)
        if text:
            _mark_subtitle(db, bvid, "done", text=text, error=None)
            return {"status": "done", "source": "subtitle"}

        audio_url = client.get_audio_url(bvid)
        if not audio_url:
            _mark_subtitle(db, bvid, "failed", text=None, error="subtitle not found")
            return {"status": "failed", "error": "subtitle not found"}

        if not settings.asr_provider:
            _mark_subtitle(db, bvid, "failed", text=None, error="asr disabled")
            return {"status": "failed", "error": "asr disabled"}

        try:
            transcript = transcribe_audio_url(audio_url)
        except Exception as exc:  # noqa: BLE001
            _mark_subtitle(db, bvid, "failed", text=None, error=f"asr error: {exc}")
            return {"status": "failed", "error": "asr error"}

        if transcript:
            _mark_subtitle(db, bvid, "done", text=transcript, error=None)
            return {"status": "done", "source": "asr"}

        _mark_subtitle(db, bvid, "failed", text=None, error="asr failed")
        return {"status": "failed", "error": "asr failed"}
    finally:
        db.close()
