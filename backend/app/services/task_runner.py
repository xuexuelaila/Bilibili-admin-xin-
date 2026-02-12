from __future__ import annotations
from datetime import datetime
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Task, Run, Video, TaskVideo, Subtitle, Alert
from app.services.bili_client import MockBiliClient, BiliClient
from app.services.bili_crawler import CrawlerBiliClient
from app.core.config import settings
from app.services.settings_service import get_or_create_settings
from app.services.rule_engine import evaluate_rules


class TaskRunner:
    def __init__(self, db: Session, client: BiliClient | None = None):
        self.db = db
        if client:
            self.client = client
        elif settings.bili_client == "mock":
            self.client = MockBiliClient()
        elif settings.bili_client == "crawler":
            setting = get_or_create_settings(db)
            self.client = CrawlerBiliClient(
                rate_limit_per_sec=setting.rate_limit_per_sec,
                retry_times=setting.retry_times,
                timeout_seconds=setting.timeout_seconds,
            )
        else:
            self.client = MockBiliClient()

    def run(self, task: Task, trigger: str = "manual") -> Run:
        start = datetime.utcnow()
        run = Run(task_id=task.id, trigger=trigger, status="running", start_at=start, counts={})
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)

        counts = {
            "fetched": 0,
            "inserted": 0,
            "deduped": 0,
            "basic_hot": 0,
            "low_fan_hot": 0,
            "failed_items": 0,
            "excluded": 0,
        }
        error_samples: list[dict[str, str]] = []

        def record_error(stage: str, message: str, meta: dict[str, str] | None = None) -> None:
            if len(error_samples) >= 50:
                return
            payload = {"stage": stage, "message": message}
            if meta:
                payload.update(meta)
            error_samples.append(payload)

        candidates: list[dict[str, Any]] = []
        try:
            scope = task.scope or {}
            for keyword in task.keywords:
                try:
                    items = self.client.search_videos(
                        keyword=keyword,
                        days_limit=int(scope.get("days_limit", 30)),
                        fetch_limit=int(scope.get("fetch_limit", 200)),
                        search_sort=scope.get("search_sort", "relevance"),
                        partitions=scope.get("partition_ids") or [],
                    )
                    candidates.extend(items or [])
                except Exception as exc:  # noqa: BLE001
                    counts["failed_items"] += 1
                    record_error("search", str(exc), {"keyword": keyword})

            counts["fetched"] = len(candidates)
            exclude_words = [w.strip().lower() for w in (task.exclude_words or []) if w and w.strip()]
            if exclude_words:
                filtered: list[dict[str, Any]] = []
                for item in candidates:
                    title = (item.get("title") or "").lower()
                    if title and any(word in title for word in exclude_words):
                        counts["excluded"] += 1
                        continue
                    filtered.append(item)
                candidates = filtered
            dedup_map: dict[str, dict[str, Any]] = {}
            for item in candidates:
                bvid = item.get("bvid") or ""
                if not bvid:
                    continue
                dedup_map[bvid] = item

            counts["deduped"] = max(0, counts["fetched"] - len(dedup_map))

            for bvid, item in dedup_map.items():
                try:
                    self._upsert_video(task, bvid, item, counts)
                except Exception as exc:  # noqa: BLE001
                    counts["failed_items"] += 1
                    record_error("upsert", str(exc), {"bvid": bvid})

            if counts["failed_items"] > 0 and counts["fetched"] == 0:
                run.status = "failed"
            elif counts["failed_items"] > 0:
                run.status = "partial"
            else:
                run.status = "success"
            task.consecutive_failures = 0 if run.status == "success" else task.consecutive_failures + 1
        except Exception as exc:  # noqa: BLE001
            run.status = "failed"
            run.error_summary = str(exc)
            record_error("run", str(exc))
            task.consecutive_failures = task.consecutive_failures + 1
        finally:
            self._maybe_create_alert(task, run)
            if error_samples and not run.error_summary:
                run.error_summary = f"{len(error_samples)} errors"
            if error_samples:
                run.error_detail = json.dumps(error_samples, ensure_ascii=False)
            end = datetime.utcnow()
            run.end_at = end
            run.duration_ms = int((end - start).total_seconds() * 1000)
            run.counts = counts
            self.db.add(run)
            self.db.add(task)
            self.db.commit()
            self.db.refresh(run)

        return run

    def _maybe_create_alert(self, task: Task, run: Run) -> None:
        if run.status == "success":
            return
        setting = get_or_create_settings(self.db)
        threshold = int(setting.alert_consecutive_failures or 3)
        if task.consecutive_failures < threshold:
            return
        # avoid spamming: only one alert per task per day
        from datetime import timedelta

        since = datetime.utcnow() - timedelta(days=1)
        existing = (
            self.db.execute(
                select(Alert).where(
                    Alert.task_id == task.id,
                    Alert.type == "task_failure",
                    Alert.created_at >= since,
                )
            )
            .scalars()
            .first()
        )
        if existing:
            return
        title = f"任务连续失败：{task.name}"
        message = f"任务已连续失败 {task.consecutive_failures} 次，最后状态：{run.status}。"
        meta = {
            "task_id": task.id,
            "run_id": run.id,
            "consecutive_failures": task.consecutive_failures,
        }
        alert = Alert(
            task_id=task.id,
            type="task_failure",
            level="warning",
            title=title,
            message=message,
            meta=meta,
        )
        self.db.add(alert)
        self.db.commit()

    def dry_run(self, task: Task, limit: int = 20) -> dict[str, Any]:
        counts = {
            "fetched": 0,
            "inserted": 0,
            "deduped": 0,
            "basic_hot": 0,
            "low_fan_hot": 0,
            "failed_items": 0,
        }
        error_samples: list[dict[str, str]] = []
        samples: list[dict[str, Any]] = []

        def record_error(stage: str, message: str, meta: dict[str, str] | None = None) -> None:
            if len(error_samples) >= 50:
                return
            payload = {"stage": stage, "message": message}
            if meta:
                payload.update(meta)
            error_samples.append(payload)

        candidates: list[dict[str, Any]] = []
        scope = task.scope or {}
        for keyword in task.keywords:
            try:
                items = self.client.search_videos(
                    keyword=keyword,
                    days_limit=int(scope.get("days_limit", 30)),
                    fetch_limit=int(scope.get("fetch_limit", 200)),
                    search_sort=scope.get("search_sort", "relevance"),
                    partitions=scope.get("partition_ids") or [],
                )
                candidates.extend(items or [])
            except Exception as exc:  # noqa: BLE001
                counts["failed_items"] += 1
                record_error("search", str(exc), {"keyword": keyword})

        counts["fetched"] = len(candidates)
        dedup_map: dict[str, dict[str, Any]] = {}
        for item in candidates:
            bvid = item.get("bvid") or ""
            if not bvid:
                continue
            dedup_map[bvid] = item
        counts["deduped"] = max(0, counts["fetched"] - len(dedup_map))

        for bvid, item in dedup_map.items():
            try:
                computed = self._compute_item(task, bvid, item)
                tags = computed["tags"]
                if tags["basic_hot"]["is_hit"]:
                    counts["basic_hot"] += 1
                if tags["low_fan_hot"]["is_hit"]:
                    counts["low_fan_hot"] += 1
                if len(samples) < limit:
                    sample = {
                        "bvid": bvid,
                        "title": computed["title"],
                        "up_name": computed["up_name"],
                        "publish_time": computed["publish_time"].isoformat() if computed["publish_time"] else None,
                        "stats": computed["stats"],
                        "tags": tags,
                    }
                    samples.append(sample)
            except Exception as exc:  # noqa: BLE001
                counts["failed_items"] += 1
                record_error("compute", str(exc), {"bvid": bvid})

        return {"counts": counts, "samples": samples, "errors": error_samples}

    def _upsert_video(self, task: Task, bvid: str, item: dict[str, Any], counts: dict[str, int]) -> None:
        computed = self._compute_item(task, bvid, item)
        stats = computed["stats"]
        up_id = computed["up_id"]
        up_info = computed["up_info"]
        publish_time = computed["publish_time"]

        video = self.db.get(Video, bvid)
        is_new = video is None
        if not video:
            video = Video(
                bvid=bvid,
                title=computed["title"],
                up_id=up_id,
                up_name=computed["up_name"],
                follower_count=int(up_info.get("follower_count", 0) or 0),
                publish_time=publish_time,
                cover_url=computed["cover_url"],
            )

        video.title = computed["title"] or video.title
        video.up_id = up_id or video.up_id
        video.up_name = computed["up_name"] or video.up_name
        video.follower_count = int(up_info.get("follower_count", video.follower_count) or 0)
        video.publish_time = publish_time or video.publish_time
        video.cover_url = computed["cover_url"] or video.cover_url
        video.fetch_time = datetime.utcnow()

        video.views = int(stats.get("views", 0) or 0)
        video.like = int(stats.get("like", 0) or 0)
        video.fav = int(stats.get("fav", 0) or 0)
        video.coin = int(stats.get("coin", 0) or 0)
        video.reply = int(stats.get("reply", 0) or 0)
        video.share = int(stats.get("share", 0) or 0)

        if video.views > 0:
            video.fav_rate = video.fav / video.views
            video.coin_rate = video.coin / video.views
            video.reply_rate = video.reply / video.views
        else:
            video.fav_rate = 0.0
            video.coin_rate = 0.0
            video.reply_rate = 0.0

        if video.follower_count > 0:
            video.fav_fan_ratio = video.fav / video.follower_count
        else:
            video.fav_fan_ratio = 0.0

        tags = computed["tags"]

        video.basic_hot = tags["basic_hot"]["is_hit"]
        video.basic_hot_reason = tags["basic_hot"]["reason"]
        video.low_fan_hot = tags["low_fan_hot"]["is_hit"]
        video.low_fan_hot_reason = tags["low_fan_hot"]["reason"]

        task_labels = [t.strip() for t in (task.tags or []) if t and t.strip()]
        if task_labels:
            existing = video.tags or []
            merged = list(dict.fromkeys(existing + task_labels))
            video.tags = merged

        if video.basic_hot:
            counts["basic_hot"] += 1
        if video.low_fan_hot:
            counts["low_fan_hot"] += 1

        if task.id not in (video.source_task_ids or []):
            video.source_task_ids = (video.source_task_ids or []) + [task.id]

        self.db.add(video)
        self.db.flush()

        link = (
            self.db.execute(
                select(TaskVideo).where(TaskVideo.task_id == task.id, TaskVideo.bvid == bvid)
            )
            .scalars()
            .first()
        )
        if not link:
            link = TaskVideo(task_id=task.id, bvid=bvid)
            self.db.add(link)
            if is_new:
                counts["inserted"] += 1

        if not video.subtitle:
            subtitle = Subtitle(bvid=bvid, status="none")
            self.db.add(subtitle)

        self.db.commit()

    def _compute_item(self, task: Task, bvid: str, item: dict[str, Any]) -> dict[str, Any]:
        detail = self.client.get_video_detail(bvid) or {}
        stats = detail.get("stats") or item.get("stats") or self.client.get_video_stats(bvid)
        up_id = detail.get("up_id") or item.get("up_id") or ""
        up_info = detail.get("up_info") or item.get("up_info") or self.client.get_up_info(up_id)

        publish_time = item.get("publish_time") or detail.get("publish_time")
        publish_time = self._coerce_datetime(publish_time)

        title = detail.get("title") or item.get("title") or ""
        up_name = detail.get("up_name") or up_info.get("up_name") or item.get("up_name") or ""
        cover_url = detail.get("cover_url") or item.get("cover_url")

        tags = evaluate_rules(
            {
                "views": int(stats.get("views", 0) or 0),
                "like": int(stats.get("like", 0) or 0),
                "fav": int(stats.get("fav", 0) or 0),
                "coin": int(stats.get("coin", 0) or 0),
                "reply": int(stats.get("reply", 0) or 0),
                "share": int(stats.get("share", 0) or 0),
            },
            int(up_info.get("follower_count", 0) or 0),
            task.rules or {},
        )

        return {
            "title": title,
            "up_id": up_id,
            "up_name": up_name,
            "up_info": up_info,
            "publish_time": publish_time,
            "cover_url": cover_url,
            "stats": stats,
            "tags": tags,
        }

    @staticmethod
    def _coerce_datetime(value: Any) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, (int, float)) and value > 0:
            return datetime.utcfromtimestamp(value)
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                return None
        return None
