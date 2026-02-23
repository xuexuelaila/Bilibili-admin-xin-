import hashlib
import io
from datetime import datetime
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, or_, String, cast
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import CoverFavorite, Video
from app.schemas.cover_favorite import CoverFavoriteOut, CoverFavoriteUpdate, CoverFavoriteCreate
from app.schemas.pagination import Page
from app.core.config import settings

router = APIRouter()


def _cover_headers() -> dict[str, str]:
    headers = {
        "User-Agent": settings.bili_user_agent,
        "Referer": settings.bili_referer,
    }
    if settings.bili_cookies:
        headers["Cookie"] = settings.bili_cookies
    return headers


def _normalize_cover_url(url: str | None) -> str:
    if not url:
        return ""
    if url.startswith("//"):
        return "https:" + url
    return url


def _cover_hash(cover_url: str) -> str:
    normalized = _normalize_cover_url(cover_url)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


@router.post("/favorite")
def favorite_cover(payload: CoverFavoriteCreate, db: Session = Depends(get_db)):
    bvid = payload.bvid
    cover_url = payload.cover_url
    if not cover_url and bvid:
        video = db.get(Video, bvid)
        if not video or not video.cover_url:
            raise HTTPException(status_code=404, detail="cover not found")
        cover_url = video.cover_url
    if not cover_url:
        raise HTTPException(status_code=400, detail="cover_url required")
    if not bvid:
        video = db.execute(select(Video).where(Video.cover_url == cover_url)).scalars().first()
        if video:
            bvid = video.bvid
    if not bvid:
        raise HTTPException(status_code=400, detail="bvid required")

    cover_url = _normalize_cover_url(cover_url)
    cover_hash = _cover_hash(cover_url)

    existing = db.execute(select(CoverFavorite).where(CoverFavorite.cover_hash == cover_hash)).scalars().first()
    if existing:
        return {"ok": False, "reason": "duplicate", "id": existing.id}

    now = datetime.utcnow()
    item = CoverFavorite(
        bvid=bvid,
        cover_url=cover_url,
        cover_hash=cover_hash,
        category=list(dict.fromkeys(payload.category or [])),
        layout_type=payload.layout_type,
        note=payload.note,
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    db.commit()
    return {"ok": True, "id": item.id}


@router.post("/unfavorite")
def unfavorite_cover(payload: dict, db: Session = Depends(get_db)):
    cover_id = payload.get("id")
    if not cover_id:
        raise HTTPException(status_code=400, detail="id required")
    item = db.get(CoverFavorite, cover_id)
    if not item:
        raise HTTPException(status_code=404, detail="cover not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/favorites", response_model=Page)
def list_favorites(
    db: Session = Depends(get_db),
    category: str | None = None,
    layout_type: str | None = None,
    q: str | None = None,
    sort: str | None = None,
    order: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = select(CoverFavorite, Video).join(Video, Video.bvid == CoverFavorite.bvid, isouter=True)

    if category:
        categories = [c.strip() for c in category.split(",") if c.strip()]
        lowered = func.lower(cast(CoverFavorite.category, String))
        conditions = [lowered.like(f"%\\\"{c.lower()}\\\"%") for c in categories]
        query = query.where(or_(*conditions))

    if layout_type:
        types = [t.strip() for t in layout_type.split(",") if t.strip()]
        if len(types) == 1:
            query = query.where(CoverFavorite.layout_type == types[0])
        else:
            query = query.where(CoverFavorite.layout_type.in_(types))

    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(CoverFavorite.note.like(like), CoverFavorite.bvid.like(like)))

    order_dir = (order or "desc").lower()
    sort = sort or "created_at"
    if sort == "views":
        col = Video.views
    elif sort == "views_delta_1d":
        col = Video.views_delta_1d
    else:
        col = CoverFavorite.created_at

    if order_dir == "asc":
        query = query.order_by(col.asc().nulls_last() if hasattr(col, "nulls_last") else col.asc())
    else:
        query = query.order_by(col.desc().nulls_last() if hasattr(col, "nulls_last") else col.desc())

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar()
    rows = db.execute(query.offset((page - 1) * page_size).limit(page_size)).all()

    items: list[CoverFavoriteOut] = []
    for cover, video in rows:
        items.append(
            CoverFavoriteOut(
                id=cover.id,
                bvid=cover.bvid,
                cover_url=cover.cover_url,
                cover_hash=cover.cover_hash,
                category=cover.category or [],
                layout_type=cover.layout_type,
                note=cover.note,
                created_at=cover.created_at,
                updated_at=cover.updated_at,
                video_title=video.title if video else None,
                up_name=video.up_name if video else None,
                views=video.views if video else None,
                views_delta_1d=getattr(video, "views_delta_1d", None) if video else None,
            )
        )

    return {"items": items, "page": page, "page_size": page_size, "total": total}


@router.put("/favorites/{cover_id}")
def update_favorite(cover_id: str, payload: CoverFavoriteUpdate, db: Session = Depends(get_db)):
    item = db.get(CoverFavorite, cover_id)
    if not item:
        raise HTTPException(status_code=404, detail="cover not found")
    if payload.category is not None:
        item.category = list(dict.fromkeys(payload.category))
    if payload.layout_type is not None:
        item.layout_type = payload.layout_type
    if payload.note is not None:
        item.note = payload.note
    item.updated_at = datetime.utcnow()
    db.add(item)
    db.commit()
    return {"ok": True}


@router.get("/favorites/{cover_id}/download")
def download_cover(cover_id: str, db: Session = Depends(get_db)):
    item = db.get(CoverFavorite, cover_id)
    if not item:
        raise HTTPException(status_code=404, detail="cover not found")
    url = _normalize_cover_url(item.cover_url)
    try:
        res = httpx.get(url, timeout=10, headers=_cover_headers())
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail="cover download failed")
        suffix = ""
        path = urlparse(url).path
        if "." in path:
            suffix = "." + path.rsplit(".", 1)[-1]
        filename = f"{item.bvid}{suffix or '.jpg'}"
        return StreamingResponse(
            io.BytesIO(res.content),
            media_type=res.headers.get("content-type", "image/jpeg"),
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="cover download failed")
