import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import FrameJob, VideoFrame, Video, FrameFavorite
from app.workers.celery_app import celery_app

router = APIRouter()


@router.post("/videos/{bvid}/frame_jobs")
def create_frame_job(bvid: str, payload: dict, db: Session = Depends(get_db)):
    video = db.get(Video, bvid)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if video.process_status != "to_shoot":
        raise HTTPException(status_code=400, detail="VIDEO_NOT_TO_SHOOT")

    mode = payload.get("mode") or "scene"
    if mode not in {"scene", "interval"}:
        raise HTTPException(status_code=400, detail="invalid mode")
    interval_sec = payload.get("interval_sec") or 2
    scene_threshold = payload.get("scene_threshold") or 0.35
    max_frames = int(payload.get("max_frames") or 120)
    resolution = payload.get("resolution") or "720p"

    if max_frames > 300:
        max_frames = 300
    if max_frames <= 0:
        max_frames = 120
    if resolution not in {"720p", "1080p"}:
        resolution = "720p"

    job = FrameJob(
        bvid=bvid,
        status="pending",
        mode=mode,
        interval_sec=interval_sec if mode == "interval" else None,
        scene_threshold=scene_threshold if mode == "scene" else None,
        max_frames=max_frames,
        resolution=resolution,
        source_video_path=video.source_video_path,
        output_dir=None,
        generated_frames=0,
        frame_count=0,
        progress=0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()
    celery_app.send_task("extract_frames", args=[job.id])
    return {"job_id": job.id}


@router.get("/frame_jobs/{job_id}")
def get_frame_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(FrameJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return {
        "id": job.id,
        "bvid": job.bvid,
        "status": job.status,
        "mode": job.mode,
        "interval_sec": job.interval_sec,
        "scene_threshold": job.scene_threshold,
        "max_frames": job.max_frames,
        "resolution": job.resolution,
        "generated_frames": job.generated_frames,
        "frame_count": job.frame_count,
        "progress": job.progress,
        "error_msg": job.error_msg,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "output_dir": job.output_dir,
    }


@router.get("/frame_jobs/{job_id}/frames")
def list_frames(
    job_id: str,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    only_favorited: bool = Query(False),
):
    job = db.get(FrameJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")

    fav_join = select(VideoFrame, FrameFavorite.id.label("fav_id")).outerjoin(
        FrameFavorite, FrameFavorite.frame_id == VideoFrame.id
    )
    query = fav_join.where(VideoFrame.job_id == job_id).order_by(VideoFrame.idx.asc())
    if only_favorited:
        query = query.where(FrameFavorite.id.isnot(None))
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar()
    rows = db.execute(query.offset((page - 1) * page_size).limit(page_size)).all()
    items = []
    for frame, fav_id in rows:
        items.append(
            {
                "id": frame.id,
                "idx": frame.idx,
                "timestamp_ms": frame.timestamp_ms,
                "frame_url": f"/api/frame_jobs/{job_id}/frames/{frame.id}/image",
                "is_favorited": fav_id is not None,
            }
        )
    return {"items": items, "page": page, "page_size": page_size, "total": total}


@router.get("/frame_jobs/{job_id}/frames/{frame_id}/image")
def view_frame(job_id: str, frame_id: str, db: Session = Depends(get_db)):
    frame = db.get(VideoFrame, frame_id)
    if not frame or frame.job_id != job_id:
        raise HTTPException(status_code=404, detail="frame not found")
    if not os.path.exists(frame.frame_url):
        raise HTTPException(status_code=404, detail="file not found")
    return StreamingResponse(open(frame.frame_url, "rb"), media_type="image/jpeg")


@router.post("/frame_jobs/{job_id}/cancel")
def cancel_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(FrameJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job.status in {"success", "failed"}:
        return {"ok": True}
    job.status = "canceled"
    job.updated_at = datetime.utcnow()
    db.add(job)
    db.commit()
    return {"ok": True}


@router.get("/videos/{bvid}/frame_jobs")
def list_video_frame_jobs(
    bvid: str,
    db: Session = Depends(get_db),
    latest: bool = Query(True),
):
    if latest:
        job = (
            db.execute(
                select(FrameJob)
                .where(FrameJob.bvid == bvid, FrameJob.status == "success")
                .order_by(FrameJob.created_at.desc())
                .limit(1)
            )
            .scalars()
            .first()
        )
        if not job:
            job = (
                db.execute(
                    select(FrameJob)
                    .where(FrameJob.bvid == bvid)
                    .order_by(FrameJob.created_at.desc())
                    .limit(1)
                )
                .scalars()
                .first()
            )
        return {"job": _serialize_job(job) if job else None}

    rows = (
        db.execute(select(FrameJob).where(FrameJob.bvid == bvid).order_by(FrameJob.created_at.desc()))
        .scalars()
        .all()
    )
    return {"items": [_serialize_job(job) for job in rows]}


@router.post("/frames/{frame_id}/favorite")
def favorite_frame(frame_id: str, payload: dict, db: Session = Depends(get_db)):
    frame = db.get(VideoFrame, frame_id)
    if not frame:
        raise HTTPException(status_code=404, detail="frame not found")
    existing = (
        db.execute(select(FrameFavorite).where(FrameFavorite.frame_id == frame_id))
        .scalars()
        .first()
    )
    if existing:
        return {"ok": True, "id": existing.id}
    fav = FrameFavorite(
        bvid=frame.bvid,
        frame_id=frame_id,
        note=payload.get("note"),
        created_at=datetime.utcnow(),
    )
    db.add(fav)
    db.commit()
    return {"ok": True, "id": fav.id}


@router.post("/frames/{frame_id}/unfavorite")
def unfavorite_frame(frame_id: str, db: Session = Depends(get_db)):
    fav = (
        db.execute(select(FrameFavorite).where(FrameFavorite.frame_id == frame_id))
        .scalars()
        .first()
    )
    if not fav:
        return {"ok": True}
    db.delete(fav)
    db.commit()
    return {"ok": True}


@router.post("/frames/batch/favorite")
def batch_favorite_frames(payload: dict, db: Session = Depends(get_db)):
    frame_ids = payload.get("frame_ids") or []
    is_favorited = bool(payload.get("is_favorited", True))
    if not frame_ids:
        return {"updated": 0}
    if is_favorited:
        existing_ids = set(
            db.execute(select(FrameFavorite.frame_id).where(FrameFavorite.frame_id.in_(frame_ids)))
            .scalars()
            .all()
        )
        frames = (
            db.execute(select(VideoFrame).where(VideoFrame.id.in_(frame_ids)))
            .scalars()
            .all()
        )
        created = 0
        for frame in frames:
            if frame.id in existing_ids:
                continue
            fav = FrameFavorite(bvid=frame.bvid, frame_id=frame.id, created_at=datetime.utcnow())
            db.add(fav)
            created += 1
        db.commit()
        return {"updated": created}
    deleted = (
        db.execute(select(FrameFavorite).where(FrameFavorite.frame_id.in_(frame_ids)))
        .scalars()
        .all()
    )
    for fav in deleted:
        db.delete(fav)
    db.commit()
    return {"updated": len(deleted)}


@router.get("/frames/favorites")
def list_frame_favorites(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    bvid: str | None = None,
    q: str | None = None,
):
    query = (
        select(FrameFavorite, VideoFrame, Video)
        .join(VideoFrame, VideoFrame.id == FrameFavorite.frame_id)
        .join(Video, Video.bvid == VideoFrame.bvid, isouter=True)
        .order_by(FrameFavorite.created_at.desc())
    )
    if bvid:
        query = query.where(VideoFrame.bvid == bvid)
    if q:
        like = f"%{q}%"
        query = query.where(Video.title.ilike(like) | VideoFrame.bvid.ilike(like))

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar()
    rows = db.execute(query.offset((page - 1) * page_size).limit(page_size)).all()
    items = []
    for fav, frame, video in rows:
        items.append(
            {
                "id": fav.id,
                "frame_id": frame.id,
                "bvid": frame.bvid,
                "timestamp_ms": frame.timestamp_ms,
                "frame_url": f"/api/frame_jobs/{frame.job_id}/frames/{frame.id}/image",
                "created_at": fav.created_at,
                "video_title": video.title if video else None,
                "video_url": (video.video_url if video else None) or f"https://www.bilibili.com/video/{frame.bvid}",
            }
        )
    return {"items": items, "page": page, "page_size": page_size, "total": total}


def _serialize_job(job: FrameJob | None) -> dict | None:
    if not job:
        return None
    return {
        "id": job.id,
        "bvid": job.bvid,
        "status": job.status,
        "mode": job.mode,
        "interval_sec": job.interval_sec,
        "scene_threshold": job.scene_threshold,
        "max_frames": job.max_frames,
        "resolution": job.resolution,
        "generated_frames": job.generated_frames,
        "frame_count": job.frame_count,
        "progress": job.progress,
        "error_msg": job.error_msg,
        "output_dir": job.output_dir,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }
