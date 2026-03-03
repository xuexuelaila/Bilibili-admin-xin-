from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.core.config import settings

router = APIRouter()

_ALLOWED_HOSTS = ("hdslb.com",)


def _is_allowed(host: str) -> bool:
    host = (host or "").lower()
    return any(host == h or host.endswith(f".{h}") for h in _ALLOWED_HOSTS)


@router.get("")
def proxy_image(url: str = Query(..., min_length=5, max_length=2000)):
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="invalid url scheme")
    if not parsed.netloc or not _is_allowed(parsed.netloc):
        raise HTTPException(status_code=400, detail="host not allowed")

    headers = {
        "User-Agent": settings.bili_user_agent,
        "Referer": settings.bili_referer,
    }
    try:
        with httpx.Client(headers=headers, timeout=10.0, follow_redirects=True) as client:
            res = client.get(url)
            if res.status_code != 200:
                raise HTTPException(status_code=502, detail="upstream error")
            content_type = res.headers.get("content-type") or "application/octet-stream"
            return StreamingResponse(iter([res.content]), media_type=content_type)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="proxy failed")
