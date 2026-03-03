import re
from urllib.parse import urlparse
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select, func, or_, String, cast
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import FollowedCreator
from app.schemas.pagination import Page
from app.services.bili_client import MockBiliClient
from app.services.bili_crawler import CrawlerBiliClient
from app.services.settings_service import get_or_create_settings

router = APIRouter()

_UP_ID_RE = re.compile(r"(?:space\\.bilibili\\.com/|bilibili\\.com/space/|m\\.bilibili\\.com/space/|mid=)(\\d+)")


def _parse_up_id(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = raw.strip()
    if not cleaned:
        return None
    if cleaned.isdigit():
        return cleaned
    match = _UP_ID_RE.search(cleaned)
    if match:
        return match.group(1)
    try:
        parsed = urlparse(cleaned)
        if parsed.netloc and "bilibili.com" in parsed.netloc:
            parts = [p for p in parsed.path.split("/") if p]
            for part in parts:
                if part.isdigit():
                    return part
    except Exception:
        pass
    # fallback: find any long digit sequence
    fallback = re.search(r"(\\d{5,})", cleaned)
    if fallback:
        return fallback.group(1)
    return None


def _parse_group_tags(raw) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(t).strip() for t in raw if str(t).strip()]
    if isinstance(raw, str):
        return [t.strip() for t in raw.split(",") if t.strip()]
    return []


def _build_creator_client(db: Session):
    if settings.bili_client == "crawler":
        setting = get_or_create_settings(db)
        return CrawlerBiliClient(
            rate_limit_per_sec=setting.rate_limit_per_sec,
            retry_times=setting.retry_times,
            timeout_seconds=setting.timeout_seconds,
        )
    return MockBiliClient()


def _creator_to_dict(creator: FollowedCreator) -> dict:
    return {
        "up_id": creator.up_id,
        "up_name": creator.up_name,
        "avatar": creator.avatar,
        "follower_count": int(getattr(creator, "follower_count", 0) or 0),
        "following_count": int(getattr(creator, "following_count", 0) or 0),
        "like_count": int(getattr(creator, "like_count", 0) or 0),
        "view_count": int(getattr(creator, "view_count", 0) or 0),
        "group_tags": creator.group_tags or [],
        "note": creator.note,
        "monitor_enabled": bool(creator.monitor_enabled),
        "last_checked_at": creator.last_checked_at,
        "last_success_at": creator.last_success_at,
        "last_error_at": creator.last_error_at,
        "last_error_msg": creator.last_error_msg,
    }


@router.get("", response_model=Page)
def list_creators(
    db: Session = Depends(get_db),
    q: str | None = None,
    group: str | None = None,
    enabled: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    query = select(FollowedCreator)
    if enabled is not None:
        query = query.where(FollowedCreator.monitor_enabled == enabled)
    if q:
        keyword = f"%{q.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(FollowedCreator.up_name).like(keyword),
                func.lower(FollowedCreator.up_id).like(keyword),
                func.lower(cast(FollowedCreator.note, String)).like(keyword),
            )
        )
    if group:
        lowered = func.lower(cast(FollowedCreator.group_tags, String))
        query = query.where(lowered.like(f'%\"{group.strip().lower()}\"%'))

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar()
    rows = (
        db.execute(query.order_by(FollowedCreator.up_name.asc()).offset((page - 1) * page_size).limit(page_size))
        .scalars()
        .all()
    )
    return {
        "items": [_creator_to_dict(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": int(total or 0),
    }




@router.post("")
def create_creator(payload: dict, db: Session = Depends(get_db)):
    raw = payload.get("up_id") or payload.get("up_id_or_url") or payload.get("url") or payload.get("input")
    up_id = _parse_up_id(str(raw)) if raw else None
    if not up_id:
        if raw:
            raise HTTPException(status_code=400, detail="无法识别UP主ID，请确认链接或直接输入数字ID")
        raise HTTPException(status_code=400, detail="up_id or UP主页链接不能为空")

    creator = db.get(FollowedCreator, up_id)
    if not creator:
        creator = FollowedCreator(up_id=up_id, monitor_enabled=True)

    note = payload.get("note")
    if note is not None:
        creator.note = str(note)

    groups = payload.get("group_tags")
    if groups is not None:
        creator.group_tags = _parse_group_tags(groups)

    monitor = payload.get("monitor_enabled")
    if monitor is not None:
        creator.monitor_enabled = bool(monitor)

    client = _build_creator_client(db)
    profile = client.get_up_profile(up_id)
    if profile:
        if profile.get("up_name"):
            creator.up_name = profile.get("up_name") or creator.up_name
        if profile.get("avatar"):
            creator.avatar = profile.get("avatar") or creator.avatar

    up_info = client.get_up_info(up_id)
    if up_info:
        creator.follower_count = int(up_info.get("follower_count", creator.follower_count) or 0)
        creator.following_count = int(up_info.get("following_count", creator.following_count) or 0)

    stats = client.get_up_stats(up_id)
    if stats:
        creator.view_count = int(stats.get("view_count", creator.view_count) or 0)
        creator.like_count = int(stats.get("like_count", creator.like_count) or 0)

    if not creator.up_name:
        creator.up_name = payload.get("up_name") or creator.up_id

    try:
        db.add(creator)
        db.commit()
        db.refresh(creator)
        return {"ok": True, "creator": _creator_to_dict(creator)}
    except IntegrityError:
        db.rollback()
        existing = db.get(FollowedCreator, up_id)
        if existing:
            return {"ok": True, "creator": _creator_to_dict(existing)}
        raise


@router.put("/{up_id}")
def update_creator(up_id: str, payload: dict, db: Session = Depends(get_db)):
    creator = db.get(FollowedCreator, up_id)
    if not creator:
        raise HTTPException(status_code=404, detail="creator not found")

    note = payload.get("note")
    if note is not None:
        creator.note = str(note)
    groups = payload.get("group_tags")
    if groups is not None:
        creator.group_tags = _parse_group_tags(groups)
    monitor = payload.get("monitor_enabled")
    if monitor is not None:
        creator.monitor_enabled = bool(monitor)

    if payload.get("refresh_profile"):
        client = _build_creator_client(db)
        profile = client.get_up_profile(up_id)
        if profile:
            if profile.get("up_name"):
                creator.up_name = profile.get("up_name") or creator.up_name
            if profile.get("avatar"):
                creator.avatar = profile.get("avatar") or creator.avatar
        up_info = client.get_up_info(up_id)
        if up_info:
            creator.follower_count = int(up_info.get("follower_count", creator.follower_count) or 0)
            creator.following_count = int(up_info.get("following_count", creator.following_count) or 0)
        stats = client.get_up_stats(up_id)
        if stats:
            creator.view_count = int(stats.get("view_count", creator.view_count) or 0)
            creator.like_count = int(stats.get("like_count", creator.like_count) or 0)

    db.add(creator)
    db.commit()
    db.refresh(creator)
    return {"ok": True, "creator": _creator_to_dict(creator)}


@router.delete("/{up_id}")
def delete_creator(up_id: str, db: Session = Depends(get_db)):
    creator = db.get(FollowedCreator, up_id)
    if not creator:
        raise HTTPException(status_code=404, detail="creator not found")
    db.delete(creator)
    db.commit()
    return {"ok": True, "up_id": up_id}
