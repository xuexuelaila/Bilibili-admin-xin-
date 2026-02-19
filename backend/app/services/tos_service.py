from __future__ import annotations

import os
import uuid
from typing import Optional

import boto3
from botocore.client import Config

from app.core.config import settings


def _require_tos_config() -> None:
    missing = []
    if not settings.tos_access_key:
        missing.append("TOS_ACCESS_KEY")
    if not settings.tos_secret_key:
        missing.append("TOS_SECRET_KEY")
    if not settings.tos_endpoint:
        missing.append("TOS_ENDPOINT")
    if not settings.tos_region:
        missing.append("TOS_REGION")
    if not settings.tos_bucket:
        missing.append("TOS_BUCKET")
    if missing:
        raise RuntimeError(f"tos config missing: {', '.join(missing)}")


def _client():
    _require_tos_config()
    return boto3.client(
        "s3",
        aws_access_key_id=settings.tos_access_key,
        aws_secret_access_key=settings.tos_secret_key,
        endpoint_url=settings.tos_endpoint,
        region_name=settings.tos_region,
        config=Config(signature_version="s3v4"),
    )


def _build_key(suffix: str) -> str:
    prefix = (settings.tos_prefix or "asr").strip("/")
    name = uuid.uuid4().hex + (suffix if suffix.startswith(".") else f".{suffix}")
    return f"{prefix}/{name}" if prefix else name


def upload_bytes(data: bytes, suffix: str, content_type: Optional[str] = None) -> str:
    client = _client()
    key = _build_key(suffix)
    kwargs = {
        "Bucket": settings.tos_bucket,
        "Key": key,
        "Body": data,
    }
    if content_type:
        kwargs["ContentType"] = content_type
    client.put_object(**kwargs)

    if settings.tos_public_base:
        base = settings.tos_public_base.rstrip("/")
        return f"{base}/{key}"

    expires = int(settings.tos_url_expires or 3600)
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.tos_bucket, "Key": key},
        ExpiresIn=expires,
    )


def guess_content_type(suffix: str) -> str | None:
    suffix = suffix.lower()
    if suffix in {".wav", "wav"}:
        return "audio/wav"
    if suffix in {".mp3", "mp3"}:
        return "audio/mpeg"
    if suffix in {".ogg", "ogg", ".opus", "opus"}:
        return "audio/ogg"
    if suffix in {".m4a", "m4a"}:
        return "audio/mp4"
    return None
