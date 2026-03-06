from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import FollowedCreator, Video
from app.services.bili_client import BiliClient


def sync_creator_videos(
    db: Session,
    creator: FollowedCreator,
    client: BiliClient,
    *,
    limit: int | None = None,
    days_limit: int | None = None,
    now: datetime | None = None,
) -> dict[str, int]:
    now = now or datetime.utcnow()
    inserted = 0
    updated = 0
    failed = 0

    try:
        if days_limit is not None:
            items = client.get_creator_videos_recent(creator.up_id, days_limit=days_limit) or []
        else:
            safe_limit = max(1, int(limit or 20))
            items = client.get_creator_videos(creator.up_id, limit=safe_limit) or []
    except Exception:
        return {"inserted": 0, "updated": 0, "failed": 1}

    follower_count = int(getattr(creator, "follower_count", 0) or 0)

    for item in items:
        try:
            bvid = item.get("bvid")
            if not bvid:
                continue
            video = db.get(Video, bvid)
            is_new = video is None
            if not video:
                video = Video(
                    bvid=bvid,
                    title=item.get("title") or "",
                    up_id=creator.up_id,
                    up_name=item.get("up_name") or creator.up_name or "",
                    publish_time=item.get("publish_time"),
                    cover_url=item.get("cover_url"),
                    fetch_time=now,
                    source="creator_watch",
                )

            stats = item.get("stats") or {}
            old_views = int(video.views or 0)
            new_views = int(stats.get("views", old_views) or 0)
            if old_views > 0:
                video.views_delta_1d = max(0, new_views - old_views)

            video.views = new_views
            video.like = int(stats.get("like", video.like) or 0)
            video.fav = int(stats.get("fav", video.fav) or 0)
            video.coin = int(stats.get("coin", video.coin) or 0)
            video.reply = int(stats.get("reply", video.reply) or 0)
            video.share = int(stats.get("share", video.share) or 0)

            if item.get("title"):
                video.title = item.get("title") or video.title
            if item.get("cover_url"):
                video.cover_url = item.get("cover_url") or video.cover_url
            if item.get("publish_time") and not video.publish_time:
                video.publish_time = item.get("publish_time")

            if follower_count > 0:
                video.follower_count = follower_count
                video.fav_fan_ratio = video.fav / follower_count if follower_count > 0 else 0.0

            if video.views > 0:
                video.fav_rate = video.fav / video.views
                video.coin_rate = video.coin / video.views
                video.reply_rate = video.reply / video.views
            else:
                video.fav_rate = 0.0
                video.coin_rate = 0.0
                video.reply_rate = 0.0

            video.source = "creator_watch"
            video.fetch_time = now
            db.add(video)
            if is_new:
                inserted += 1
            else:
                updated += 1
        except Exception:
            failed += 1

    return {"inserted": inserted, "updated": updated, "failed": failed}
