import csv
import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Video, TaskVideo, Subtitle
from app.schemas.video import VideoOut
from app.schemas.subtitle import SubtitleOut
from app.schemas.pagination import Page
from app.services.bili_client import MockBiliClient
from app.services.bili_crawler import CrawlerBiliClient
from app.core.config import settings
from app.services.settings_service import get_or_create_settings

router = APIRouter()


@router.get("", response_model=Page)

def list_videos(
    db: Session = Depends(get_db),
    task_id: str | None = None,
    tag: str | None = None,
    process_status: str | None = None,
    publish_from: str | None = None,
    publish_to: str | None = None,
    fetch_from: str | None = None,
    fetch_to: str | None = None,
    min_views: int | None = None,
    min_fav: int | None = None,
    min_coin: int | None = None,
    min_reply: int | None = None,
    min_fav_rate: float | None = None,
    min_coin_rate: float | None = None,
    min_reply_rate: float | None = None,
    min_fav_fan_ratio: float | None = None,
    fan_max: int | None = None,
    sort: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = select(Video)

    if task_id:
        query = query.join(TaskVideo).where(TaskVideo.task_id == task_id)
    if tag == "basic_hot":
        query = query.where(Video.basic_hot == True)  # noqa: E712
    if tag == "low_fan_hot":
        query = query.where(Video.low_fan_hot == True)  # noqa: E712
    if process_status:
        query = query.where(Video.process_status == process_status)

    if publish_from:
        query = query.where(Video.publish_time >= datetime.fromisoformat(publish_from))
    if publish_to:
        query = query.where(Video.publish_time <= datetime.fromisoformat(publish_to))
    if fetch_from:
        query = query.where(Video.fetch_time >= datetime.fromisoformat(fetch_from))
    if fetch_to:
        query = query.where(Video.fetch_time <= datetime.fromisoformat(fetch_to))

    if min_views is not None:
        query = query.where(Video.views >= min_views)
    if min_fav is not None:
        query = query.where(Video.fav >= min_fav)
    if min_coin is not None:
        query = query.where(Video.coin >= min_coin)
    if min_reply is not None:
        query = query.where(Video.reply >= min_reply)
    if min_fav_rate is not None:
        query = query.where(Video.fav_rate >= min_fav_rate)
    if min_coin_rate is not None:
        query = query.where(Video.coin_rate >= min_coin_rate)
    if min_reply_rate is not None:
        query = query.where(Video.reply_rate >= min_reply_rate)
    if min_fav_fan_ratio is not None:
        query = query.where(Video.fav_fan_ratio >= min_fav_fan_ratio)
    if fan_max is not None:
        query = query.where(Video.follower_count <= fan_max)

    sort_map = {
        "views": Video.views.desc(),
        "fav": Video.fav.desc(),
        "coin": Video.coin.desc(),
        "reply": Video.reply.desc(),
        "fav_rate": Video.fav_rate.desc(),
        "coin_rate": Video.coin_rate.desc(),
        "reply_rate": Video.reply_rate.desc(),
        "fav_fan_ratio": Video.fav_fan_ratio.desc(),
        "publish_time": Video.publish_time.desc(),
        "fetch_time": Video.fetch_time.desc(),
    }
    if sort in sort_map:
        query = query.order_by(sort_map[sort])
    else:
        query = query.order_by(Video.fetch_time.desc())

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar()
    rows = (
        db.execute(query.offset((page - 1) * page_size).limit(page_size))
        .scalars()
        .all()
    )

    items = [video_to_out(v) for v in rows]
    return {"items": items, "page": page, "page_size": page_size, "total": total}


@router.get("/export")
def export_csv(
    db: Session = Depends(get_db),
    task_id: str | None = None,
    tag: str | None = None,
    process_status: str | None = None,
    publish_from: str | None = None,
    publish_to: str | None = None,
    fetch_from: str | None = None,
    fetch_to: str | None = None,
    min_views: int | None = None,
    min_fav: int | None = None,
    min_coin: int | None = None,
    min_reply: int | None = None,
    min_fav_rate: float | None = None,
    min_coin_rate: float | None = None,
    min_reply_rate: float | None = None,
    min_fav_fan_ratio: float | None = None,
    fan_max: int | None = None,
    sort: str | None = None,
    fields: str | None = None,
):
    query = select(Video)
    if task_id:
        query = query.join(TaskVideo).where(TaskVideo.task_id == task_id)
    if tag == "basic_hot":
        query = query.where(Video.basic_hot == True)  # noqa: E712
    if tag == "low_fan_hot":
        query = query.where(Video.low_fan_hot == True)  # noqa: E712
    if process_status:
        query = query.where(Video.process_status == process_status)

    if publish_from:
        query = query.where(Video.publish_time >= datetime.fromisoformat(publish_from))
    if publish_to:
        query = query.where(Video.publish_time <= datetime.fromisoformat(publish_to))
    if fetch_from:
        query = query.where(Video.fetch_time >= datetime.fromisoformat(fetch_from))
    if fetch_to:
        query = query.where(Video.fetch_time <= datetime.fromisoformat(fetch_to))

    if min_views is not None:
        query = query.where(Video.views >= min_views)
    if min_fav is not None:
        query = query.where(Video.fav >= min_fav)
    if min_coin is not None:
        query = query.where(Video.coin >= min_coin)
    if min_reply is not None:
        query = query.where(Video.reply >= min_reply)
    if min_fav_rate is not None:
        query = query.where(Video.fav_rate >= min_fav_rate)
    if min_coin_rate is not None:
        query = query.where(Video.coin_rate >= min_coin_rate)
    if min_reply_rate is not None:
        query = query.where(Video.reply_rate >= min_reply_rate)
    if min_fav_fan_ratio is not None:
        query = query.where(Video.fav_fan_ratio >= min_fav_fan_ratio)
    if fan_max is not None:
        query = query.where(Video.follower_count <= fan_max)

    sort_map = {
        "views": Video.views.desc(),
        "fav": Video.fav.desc(),
        "coin": Video.coin.desc(),
        "reply": Video.reply.desc(),
        "fav_rate": Video.fav_rate.desc(),
        "coin_rate": Video.coin_rate.desc(),
        "reply_rate": Video.reply_rate.desc(),
        "fav_fan_ratio": Video.fav_fan_ratio.desc(),
        "publish_time": Video.publish_time.desc(),
        "fetch_time": Video.fetch_time.desc(),
    }
    if sort in sort_map:
        query = query.order_by(sort_map[sort])
    else:
        query = query.order_by(Video.fetch_time.desc())
    rows = db.execute(query).scalars().all()

    field_map = {
        "bvid": lambda v: v.bvid,
        "video_url": lambda v: f"https://www.bilibili.com/video/{v.bvid}",
        "title": lambda v: v.title,
        "up_name": lambda v: v.up_name,
        "followers": lambda v: v.follower_count,
        "publish_time": lambda v: v.publish_time,
        "views": lambda v: v.views,
        "fav": lambda v: v.fav,
        "coin": lambda v: v.coin,
        "reply": lambda v: v.reply,
        "fav_rate": lambda v: round(v.fav_rate or 0, 6),
        "coin_rate": lambda v: round(v.coin_rate or 0, 6),
        "reply_rate": lambda v: round(v.reply_rate or 0, 6),
        "fav_fan_ratio": lambda v: round(v.fav_fan_ratio or 0, 6),
        "basic_hot": lambda v: v.basic_hot,
        "low_fan_hot": lambda v: v.low_fan_hot,
        "process_status": lambda v: v.process_status,
        "task_ids": lambda v: ",".join(v.source_task_ids or []),
    }
    field_labels = {
        "bvid": "BVID",
        "video_url": "视频链接",
        "title": "标题",
        "up_name": "UP主",
        "followers": "粉丝数",
        "publish_time": "发布时间",
        "views": "播放",
        "fav": "收藏",
        "coin": "投币",
        "reply": "评论",
        "fav_rate": "收藏率",
        "coin_rate": "投币率",
        "reply_rate": "评论率",
        "fav_fan_ratio": "收藏/粉丝比",
        "basic_hot": "爆款",
        "low_fan_hot": "低粉爆款",
        "process_status": "处理状态",
        "task_ids": "任务ID",
    }
    if fields:
        selected = [f.strip() for f in fields.split(",") if f.strip()]
        selected = [f for f in selected if f in field_map]
    else:
        selected = list(field_map.keys())

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([field_labels.get(f, f) for f in selected])
    for v in rows:
        writer.writerow([field_map[f](v) for f in selected])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=videos.csv"},
    )


@router.get("/{bvid}", response_model=VideoOut)

def get_video(bvid: str, db: Session = Depends(get_db)):
    video = db.get(Video, bvid)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video_to_out(video)


@router.post("/{bvid}/process_status")

def update_process_status(bvid: str, payload: dict, db: Session = Depends(get_db)):
    video = db.get(Video, bvid)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    status = payload.get("process_status")
    if status not in {"todo", "done"}:
        raise HTTPException(status_code=400, detail="invalid status")
    video.process_status = status
    db.add(video)
    db.commit()
    return {"ok": True}


@router.post("/{bvid}/note")

def update_note(bvid: str, payload: dict, db: Session = Depends(get_db)):
    video = db.get(Video, bvid)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    note = payload.get("note")
    video.note = note
    db.add(video)
    db.commit()
    return {"ok": True}


@router.post("/{bvid}/subtitle/extract")

def extract_subtitle(bvid: str, db: Session = Depends(get_db)):
    video = db.get(Video, bvid)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    subtitle = db.get(Subtitle, bvid)
    if not subtitle:
        subtitle = Subtitle(bvid=bvid, status="extracting")
    subtitle.status = "extracting"
    db.add(subtitle)
    db.commit()

    if settings.bili_client == "crawler":
        setting = get_or_create_settings(db)
        client = CrawlerBiliClient(
            rate_limit_per_sec=setting.rate_limit_per_sec,
            retry_times=setting.retry_times,
            timeout_seconds=setting.timeout_seconds,
        )
    else:
        client = MockBiliClient()
    text = client.get_subtitle(bvid)
    if text:
        subtitle.status = "done"
        subtitle.text = text
    else:
        subtitle.status = "failed"
        subtitle.error = "subtitle not found"

    db.add(subtitle)
    db.commit()
    return {"status": subtitle.status}


@router.get("/{bvid}/subtitle", response_model=SubtitleOut)

def get_subtitle(bvid: str, db: Session = Depends(get_db)):
    subtitle = db.get(Subtitle, bvid)
    if not subtitle:
        raise HTTPException(status_code=404, detail="Subtitle not found")
    return SubtitleOut.model_validate(subtitle)


@router.get("/{bvid}/cover/download")

def download_cover(bvid: str, db: Session = Depends(get_db)):
    video = db.get(Video, bvid)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return {"cover_url": video.cover_url}


def video_to_out(video: Video) -> VideoOut:
    stats = {
        "views": video.views,
        "like": video.like,
        "fav": video.fav,
        "coin": video.coin,
        "reply": video.reply,
        "share": video.share,
        "fav_rate": video.fav_rate,
        "coin_rate": video.coin_rate,
        "reply_rate": video.reply_rate,
        "fav_fan_ratio": video.fav_fan_ratio,
    }
    tags = {
        "basic_hot": {"is_hit": video.basic_hot, "reason": video.basic_hot_reason},
        "low_fan_hot": {"is_hit": video.low_fan_hot, "reason": video.low_fan_hot_reason},
    }
    return VideoOut(
        bvid=video.bvid,
        title=video.title,
        up_id=video.up_id,
        up_name=video.up_name,
        follower_count=video.follower_count,
        publish_time=video.publish_time,
        fetch_time=video.fetch_time,
        cover_url=video.cover_url,
        stats=stats,
        tags=tags,
        source_task_ids=video.source_task_ids or [],
        process_status=video.process_status,
        note=video.note,
    )
