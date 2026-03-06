from datetime import datetime
import redis
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
import glob
import os
import shutil
import subprocess
import time
import threading
from pathlib import Path

import httpx

from app.models import (
    Task,
    Subtitle,
    Video,
    FrameJob,
    VideoFrame,
    CommentCrawlJob,
    Product,
    ProductMention,
    FollowedCreator,
)
from app.services.bili_client import MockBiliClient
from app.services.bili_crawler import CrawlerBiliClient
from app.services.asr_service import transcribe_audio_url
from app.services.settings_service import get_or_create_settings
from app.services.creator_sync import sync_creator_videos
from app.services.task_runner import TaskRunner
from app.services.product_links import (
    build_product_key,
    expand_url,
    extract_urls,
    parse_product,
    product_domain_whitelist,
    short_link_domains,
)
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


@celery_app.task(name="refresh_all_videos")
def refresh_all_videos():
    db = SessionLocal()
    r = redis.Redis.from_url(settings.redis_url)
    try:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        lock_key = f"refresh_all_videos:{today}"
        if not r.set(lock_key, "1", nx=True, ex=48 * 3600):
            return {"status": "skipped", "reason": "already refreshed"}

        client = _build_subtitle_client(db)
        bvids = db.execute(select(Video.bvid)).scalars().all()
        total = len(bvids)
        if total == 0:
            return {"status": "done", "total": 0, "updated": 0, "failed": 0}

        updated = 0
        failed = 0
        batch_size = int(settings.refresh_all_batch_size or 50)
        batch_size = max(1, batch_size)

        for idx, bvid in enumerate(bvids, start=1):
            video = db.get(Video, bvid)
            if not video:
                continue
            try:
                detail = client.get_video_detail(bvid) or {}
                stats = detail.get("stats") or {}

                new_views = int(stats.get("views", video.views) or 0)
                old_views = int(video.views or 0)
                video.views_delta_1d = max(0, new_views - old_views) if new_views >= 0 else None

                video.views = new_views
                video.like = int(stats.get("like", video.like) or 0)
                video.fav = int(stats.get("fav", video.fav) or 0)
                video.coin = int(stats.get("coin", video.coin) or 0)
                video.reply = int(stats.get("reply", video.reply) or 0)
                video.share = int(stats.get("share", video.share) or 0)

                if video.views > 0:
                    video.fav_rate = video.fav / video.views
                    video.coin_rate = video.coin / video.views
                    video.reply_rate = video.reply / video.views
                else:
                    video.fav_rate = 0.0
                    video.coin_rate = 0.0
                    video.reply_rate = 0.0

                if detail.get("title"):
                    video.title = detail.get("title") or video.title
                if detail.get("cover_url"):
                    video.cover_url = detail.get("cover_url") or video.cover_url
                if detail.get("up_name"):
                    video.up_name = detail.get("up_name") or video.up_name
                if detail.get("up_id"):
                    video.up_id = detail.get("up_id") or video.up_id
                if detail.get("publish_time") and not video.publish_time:
                    video.publish_time = detail.get("publish_time")

                # Update follower count when possible (best-effort).
                if video.up_id:
                    try:
                        up_info = client.get_up_info(video.up_id)
                        if up_info and up_info.get("follower_count") is not None:
                            video.follower_count = int(up_info.get("follower_count") or video.follower_count)
                    except Exception:
                        pass

                if video.follower_count > 0:
                    video.fav_fan_ratio = video.fav / video.follower_count
                else:
                    video.fav_fan_ratio = 0.0

                video.fetch_time = datetime.utcnow()
                db.add(video)
                updated += 1
            except Exception:
                failed += 1

            if idx % batch_size == 0:
                db.commit()

        db.commit()
        return {"status": "done", "total": total, "updated": updated, "failed": failed}
    finally:
        db.close()


@celery_app.task(name="sync_creator_watch")
def sync_creator_watch():
    db = SessionLocal()
    try:
        creators = (
            db.execute(select(FollowedCreator).where(FollowedCreator.monitor_enabled == True))  # noqa: E712
            .scalars()
            .all()
        )
        if not creators:
            return {"status": "skipped", "reason": "no creators"}

        client = _build_creator_client(db)
        limit = max(1, int(settings.creator_watch_fetch_limit or 20))
        now = datetime.utcnow()
        updated = 0
        inserted = 0
        failed = 0

        for creator in creators:
            creator.last_checked_at = now
            try:
                profile = client.get_up_profile(creator.up_id) if creator.up_id else {}
                if profile:
                    if profile.get("up_name"):
                        creator.up_name = profile.get("up_name") or creator.up_name
                    if profile.get("avatar"):
                        creator.avatar = profile.get("avatar") or creator.avatar

                up_info = client.get_up_info(creator.up_id) if creator.up_id else {}
                follower_count = int(up_info.get("follower_count", 0) or 0)
                following_count = int(up_info.get("following_count", 0) or 0)

                stats = client.get_up_stats(creator.up_id) if creator.up_id else {}
                creator.follower_count = follower_count
                creator.following_count = following_count
                creator.view_count = int(stats.get("view_count", creator.view_count) or 0)
                creator.like_count = int(stats.get("like_count", creator.like_count) or 0)

                sync_result = sync_creator_videos(
                    db,
                    creator,
                    client,
                    limit=limit,
                    now=now,
                )
                inserted += sync_result["inserted"]
                updated += sync_result["updated"]
                failed += sync_result["failed"]

                creator.last_success_at = now
                creator.last_error_at = None
                creator.last_error_msg = None
                db.add(creator)
                db.commit()
            except Exception as exc:  # noqa: BLE001
                failed += 1
                creator.last_error_at = now
                creator.last_error_msg = str(exc)
                db.add(creator)
                db.commit()

        return {"status": "done", "inserted": inserted, "updated": updated, "failed": failed}
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


def _build_creator_client(db):
    if settings.bili_client == "crawler":
        setting = get_or_create_settings(db)
        return CrawlerBiliClient(
            rate_limit_per_sec=setting.rate_limit_per_sec,
            retry_times=setting.retry_times,
            timeout_seconds=setting.timeout_seconds,
        )
    return MockBiliClient()


def _comment_crawl_limit() -> int:
    limit = int(settings.comment_crawl_limit or 500)
    max_limit = int(settings.comment_crawl_limit_max or 1000)
    limit = max(1, min(limit, max_limit))
    return limit


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


def _to_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)) and value > 0:
        return datetime.utcfromtimestamp(value)
    return None


@celery_app.task(name="crawl_comments")
def crawl_comments(job_id: str):
    db = SessionLocal()
    now = datetime.utcnow()
    try:
        job = db.get(CommentCrawlJob, job_id)
        if not job:
            return {"error": "job not found"}
        if job.status == "running":
            return {"status": "running"}

        job.status = "running"
        job.error_msg = None
        job.updated_at = now
        db.add(job)
        db.commit()

        client = _build_subtitle_client(db)
        limit = int(job.limit or _comment_crawl_limit())
        limit = max(1, min(limit, int(settings.comment_crawl_limit_max or 1000)))
        comments = client.get_video_comments(job.bvid, limit=limit) if client else []

        whitelist = product_domain_whitelist()
        short_domains = short_link_domains()
        url_cache: dict[str, str] = {}
        product_cache: dict[str, Product] = {}
        seen_mentions: set[tuple] = set()
        mention_count = 0
        product_ids: set[int] = set()

        with httpx.Client(headers=_bili_headers(), follow_redirects=True, timeout=10.0) as http_client:
            for comment in comments:
                user_id = str(comment.get("user_id") or "").strip()
                if not user_id:
                    continue
                mentioned_at = _to_datetime(comment.get("ctime")) or now
                urls = extract_urls(
                    comment.get("message") or "",
                    comment.get("jump_url") or {},
                    comment.get("raw"),
                )
                if not urls:
                    continue

                for raw_url in urls:
                    expanded = url_cache.get(raw_url)
                    if not expanded:
                        expanded = expand_url(raw_url, http_client, short_domains) if short_domains else raw_url
                        url_cache[raw_url] = expanded

                    info = parse_product(expanded, whitelist)
                    if not info:
                        continue

                    key = build_product_key(info["platform"], info["item_id"], info.get("sku_id"))
                    product = product_cache.get(key)
                    if not product:
                        product = (
                            db.execute(select(Product).where(Product.product_key == key))
                            .scalars()
                            .first()
                        )
                        if not product:
                            product = Product(
                                product_key=key,
                                platform=info["platform"],
                                item_id=info["item_id"],
                                sku_id=info.get("sku_id"),
                                first_seen_at=mentioned_at,
                                last_seen_at=mentioned_at,
                            )
                            db.add(product)
                            db.flush()
                        else:
                            if not product.last_seen_at or product.last_seen_at < mentioned_at:
                                product.last_seen_at = mentioned_at
                            db.add(product)
                        product_cache[key] = product

                    product_ids.add(product.id)

                    keywords = job.keywords or []
                    keyword_list = keywords if keywords else [None]
                    for keyword in keyword_list:
                        mention_key = (product.id, job.bvid, user_id, raw_url, keyword or "")
                        if mention_key in seen_mentions:
                            continue
                        seen_mentions.add(mention_key)

                        exists = (
                            db.execute(
                                select(ProductMention.id).where(
                                    ProductMention.product_id == product.id,
                                    ProductMention.bvid == job.bvid,
                                    ProductMention.user_id == user_id,
                                    ProductMention.raw_url == raw_url,
                                    ProductMention.keyword == keyword,
                                )
                            )
                            .first()
                        )
                        if exists:
                            continue

                        mention = ProductMention(
                            product_id=product.id,
                            bvid=job.bvid,
                            task_id=job.task_id,
                            keyword=keyword,
                            user_id=user_id,
                            mentioned_at=mentioned_at,
                            raw_url=raw_url,
                            job_id=job.id,
                        )
                        db.add(mention)
                        mention_count += 1

        job.comment_count = len(comments)
        job.mention_count = mention_count
        job.product_count = len(product_ids)
        job.status = "success"
        job.finished_at = datetime.utcnow()
        job.updated_at = datetime.utcnow()
        db.add(job)
        db.commit()
        return {"status": "success", "comments": len(comments), "mentions": mention_count}
    except Exception as exc:  # noqa: BLE001
        job = db.get(CommentCrawlJob, job_id) if db else None
        if job:
            job.status = "failed"
            job.error_msg = str(exc)
            job.updated_at = datetime.utcnow()
            db.add(job)
            db.commit()
        return {"status": "failed", "error": str(exc)}
    finally:
        db.close()


def _frames_dir() -> Path:
    base = Path(__file__).resolve().parents[2]
    return base / (settings.frames_dir or "frames")


def _bili_headers() -> dict[str, str]:
    headers = {"User-Agent": settings.bili_user_agent, "Referer": settings.bili_referer}
    if settings.bili_cookies:
        headers["Cookie"] = settings.bili_cookies
    return headers


def _get_ffmpeg_bin() -> str:
    ffmpeg_bin = settings.asr_ffmpeg_path or shutil.which("ffmpeg")
    if not ffmpeg_bin:
        try:
            import imageio_ffmpeg

            ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            ffmpeg_bin = None
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg not found (install imageio-ffmpeg or ffmpeg)")
    return ffmpeg_bin


def _download_video(url: str, out_path: str) -> None:
    with httpx.stream("GET", url, headers=_bili_headers(), timeout=60) as res:
        res.raise_for_status()
        with open(out_path, "wb") as fp:
            for chunk in res.iter_bytes():
                fp.write(chunk)


def _cleanup_old_jobs(db: SessionLocal, bvid: str, keep: int = 3):
    jobs = (
        db.execute(select(FrameJob).where(FrameJob.bvid == bvid, FrameJob.status == "success").order_by(FrameJob.created_at.desc()))
        .scalars()
        .all()
    )
    if len(jobs) <= keep:
        return
    for job in jobs[keep:]:
        frames = db.execute(select(VideoFrame).where(VideoFrame.job_id == job.id)).scalars().all()
        for frame in frames:
            try:
                if os.path.exists(frame.frame_url):
                    os.remove(frame.frame_url)
            except OSError:
                pass
            db.delete(frame)
        if job.output_dir and os.path.exists(job.output_dir):
            try:
                shutil.rmtree(job.output_dir)
            except OSError:
                pass
        db.delete(job)
    db.commit()


@celery_app.task(name="extract_frames")
def extract_frames(job_id: str):
    db = SessionLocal()
    try:
        job = db.get(FrameJob, job_id)
        if not job:
            return {"error": "job not found"}
        if job.status == "canceled":
            return {"status": "canceled"}
        job.status = "running"
        job.updated_at = datetime.utcnow()
        db.add(job)
        db.commit()

        video = db.get(Video, job.bvid)
        if not video:
            job.status = "failed"
            job.error_msg = "VIDEO_SOURCE_NOT_AVAILABLE"
            db.commit()
            return {"status": "failed"}

        output_dir = _frames_dir() / job.bvid / job.id
        output_dir.mkdir(parents=True, exist_ok=True)
        job.output_dir = str(output_dir)
        db.commit()

        source_path = job.source_video_path or video.source_video_path
        if not source_path or not os.path.exists(source_path):
            client = _build_subtitle_client(db)
            video_url = client.get_video_url(job.bvid)
            if not video_url:
                job.status = "failed"
                job.error_msg = "VIDEO_SOURCE_NOT_AVAILABLE"
                db.commit()
                return {"status": "failed"}
            source_path = str(output_dir / "source.mp4")
            _download_video(video_url, source_path)
            job.source_video_path = source_path
            db.commit()

        width = 1280 if job.resolution == "720p" else 1920
        max_frames = min(job.max_frames or 120, 300)
        ffmpeg_bin = _get_ffmpeg_bin()

        if job.mode == "interval":
            interval = max(int(job.interval_sec or 2), 1)
            out_pattern = str(output_dir / "frame_%05d.jpg")
            vf = f"fps=1/{interval},scale={width}:-1"
            cmd = [ffmpeg_bin, "-y", "-i", source_path, "-vf", vf, "-frames:v", str(max_frames), "-q:v", "2", out_pattern]
        else:
            threshold = float(job.scene_threshold or 0.35)
            out_pattern = str(output_dir / "frame_%05d.jpg")
            vf = f"select='gt(scene,{threshold})',showinfo,scale={width}:-1"
            cmd = [ffmpeg_bin, "-y", "-i", source_path, "-vf", vf, "-vsync", "vfr", "-frames:v", str(max_frames), "-q:v", "2", out_pattern]

        pts_times: list[float] = []

        def _collect_pts(stream):
            for line in stream:
                if "pts_time:" in line:
                    try:
                        part = line.split("pts_time:")[1]
                        value = part.split(" ")[0].strip()
                        pts_times.append(float(value))
                    except Exception:
                        continue

        process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        reader = None
        if process.stderr:
            reader = threading.Thread(target=_collect_pts, args=(process.stderr,), daemon=True)
            reader.start()

        while process.poll() is None:
            job = db.get(FrameJob, job_id)
            if job and job.status == "canceled":
                process.terminate()
                process.wait(timeout=5)
                db.commit()
                return {"status": "canceled"}
            count = len(glob.glob(str(output_dir / "*.jpg")))
            job.generated_frames = count
            job.frame_count = count
            job.progress = min(count / max_frames, 1.0) if max_frames else None
            job.updated_at = datetime.utcnow()
            db.add(job)
            db.commit()
            time.sleep(0.6)

        if reader:
            reader.join(timeout=2)

        if process.returncode != 0:
            job = db.get(FrameJob, job_id)
            job.status = "failed"
            job.error_msg = "ffmpeg failed"
            db.commit()
            return {"status": "failed"}

        frame_files = sorted(glob.glob(str(output_dir / "*.jpg")))
        if not frame_files:
            job = db.get(FrameJob, job_id)
            job.status = "failed"
            job.error_msg = "NO_FRAMES"
            db.commit()
            return {"status": "failed"}

        frames = []
        for idx, path in enumerate(frame_files, start=1):
            if job.mode == "interval":
                ts = int((idx - 1) * (job.interval_sec or 2) * 1000)
            else:
                ts = int(pts_times[idx - 1] * 1000) if idx - 1 < len(pts_times) else None
            frames.append(
                VideoFrame(
                    job_id=job.id,
                    bvid=job.bvid,
                    idx=idx,
                    timestamp_ms=ts,
                    frame_url=path,
                )
            )

        db.add_all(frames)
        job = db.get(FrameJob, job_id)
        job.status = "success"
        job.generated_frames = len(frame_files)
        job.frame_count = len(frame_files)
        job.progress = 1.0
        job.updated_at = datetime.utcnow()
        db.add(job)
        db.commit()

        _cleanup_old_jobs(db, job.bvid)
        return {"status": "success", "frames": len(frame_files)}
    except Exception as exc:  # noqa: BLE001
        job = db.get(FrameJob, job_id) if db else None
        if job:
            job.status = "failed"
            job.error_msg = str(exc)
            db.commit()
        return {"status": "failed", "error": str(exc)}
    finally:
        db.close()
