from __future__ import annotations

import glob
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from base64 import b64encode
from typing import Iterable
from urllib.parse import urlparse

import httpx

from app.core.config import settings

_model_cache = None
_baidu_token_cache = {"token": None, "expires_at": 0.0}


def _iter_text(segments: Iterable) -> str:
    parts = []
    for seg in segments:
        text = getattr(seg, "text", None)
        if text:
            parts.append(text.strip())
    return "\n".join([p for p in parts if p])


def _get_model():
    global _model_cache
    if _model_cache is not None:
        return _model_cache
    if settings.asr_provider != "faster_whisper":
        return None
    try:
        from faster_whisper import WhisperModel
    except Exception:
        return None
    device = settings.asr_device or "cpu"
    compute_type = settings.asr_compute_type or "int8"
    model_name = settings.asr_model or "base"
    _model_cache = WhisperModel(model_name, device=device, compute_type=compute_type)
    return _model_cache


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


def _bili_headers() -> dict[str, str]:
    headers = {"User-Agent": settings.bili_user_agent, "Referer": settings.bili_referer}
    if settings.bili_cookies:
        headers["Cookie"] = settings.bili_cookies
    return headers


def _guess_suffix(url: str) -> str:
    path = urlparse(url).path or ""
    if "." in path:
        return "." + path.rsplit(".", 1)[-1]
    return ".m4a"


def _download_audio_bytes(audio_url: str) -> bytes:
    max_bytes = int(settings.asr_max_audio_mb or 100) * 1024 * 1024
    data = bytearray()
    with httpx.stream("GET", audio_url, headers=_bili_headers(), timeout=30) as res:
        res.raise_for_status()
        for chunk in res.iter_bytes():
            data.extend(chunk)
            if len(data) > max_bytes:
                raise RuntimeError("audio too large")
    return bytes(data)


def _maybe_transcode_to_wav(audio_bytes: bytes, suffix: str) -> bytes:
    if not settings.asr_transcode:
        return audio_bytes
    ffmpeg_bin = _get_ffmpeg_bin()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as src:
        src.write(audio_bytes)
        src.flush()
        src_path = src.name
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as dst:
        dst_path = dst.name
    try:
        subprocess.run(
            [ffmpeg_bin, "-y", "-i", src_path, "-ac", "1", "-ar", "16000", dst_path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with open(dst_path, "rb") as fp:
            return fp.read()
    finally:
        for path in (src_path, dst_path):
            try:
                os.remove(path)
            except OSError:
                pass


def _split_wav_bytes(wav_bytes: bytes, segment_seconds: int) -> list[bytes]:
    if segment_seconds <= 0:
        return [wav_bytes]
    ffmpeg_bin = _get_ffmpeg_bin()
    with tempfile.TemporaryDirectory() as tmpdir:
        src_path = os.path.join(tmpdir, "input.wav")
        with open(src_path, "wb") as fp:
            fp.write(wav_bytes)
        pattern = os.path.join(tmpdir, "seg_%03d.wav")
        subprocess.run(
            [
                ffmpeg_bin,
                "-y",
                "-i",
                src_path,
                "-f",
                "segment",
                "-segment_time",
                str(segment_seconds),
                "-reset_timestamps",
                "1",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                pattern,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        segments = sorted(glob.glob(os.path.join(tmpdir, "seg_*.wav")))
        if not segments:
            return [wav_bytes]
        out = []
        for path in segments:
            with open(path, "rb") as fp:
                out.append(fp.read())
        return out


def _transcribe_with_faster_whisper(audio_url: str) -> str | None:
    model = _get_model()
    if model is None:
        return None
    with tempfile.NamedTemporaryFile(delete=False, suffix=_guess_suffix(audio_url)) as fp:
        tmp_path = fp.name
        with httpx.stream("GET", audio_url, headers=_bili_headers(), timeout=30) as res:
            res.raise_for_status()
            for chunk in res.iter_bytes():
                fp.write(chunk)

    try:
        language = settings.asr_language or None
        segments, _info = model.transcribe(tmp_path, language=language)
        text = _iter_text(segments)
        return text.strip() if text else None
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def _extract_text_from_result(result) -> str | None:
    if isinstance(result, list):
        texts = []
        for item in result:
            if isinstance(item, str):
                texts.append(item.strip())
                continue
            if isinstance(item, dict) and item.get("text"):
                texts.append(str(item["text"]).strip())
        text = "\n".join([t for t in texts if t])
        return text or None
    if isinstance(result, dict) and result.get("text"):
        return str(result.get("text")).strip()
    if isinstance(result, str):
        return result.strip()
    return None


def _doubao_headers(request_id: str) -> dict[str, str]:
    return {
        "X-Api-App-Key": settings.doubao_app_key or "",
        "X-Api-Access-Key": settings.doubao_access_key or "",
        "X-Api-Resource-Id": settings.doubao_resource_id,
        "X-Api-Request-Id": request_id,
        "X-Api-Sequence": "-1",
    }


def _baidu_get_access_token() -> str:
    cached = _baidu_token_cache.get("token")
    expires_at = float(_baidu_token_cache.get("expires_at") or 0.0)
    if cached and (expires_at - time.time()) > 60:
        return cached
    if not settings.baidu_api_key or not settings.baidu_secret_key:
        raise RuntimeError("baidu api key or secret not set")
    params = {
        "grant_type": "client_credentials",
        "client_id": settings.baidu_api_key,
        "client_secret": settings.baidu_secret_key,
    }
    res = httpx.post(settings.baidu_token_endpoint, params=params, timeout=30)
    res.raise_for_status()
    data = res.json() if res.content else {}
    token = data.get("access_token")
    if not token:
        err = data.get("error") or "token_error"
        desc = data.get("error_description") or ""
        raise RuntimeError(f"baidu token error: {err} {desc}".strip())
    expires_in = int(data.get("expires_in") or 0)
    _baidu_token_cache["token"] = token
    _baidu_token_cache["expires_at"] = time.time() + max(expires_in, 0)
    return token


def _transcribe_with_doubao_flash(audio_url: str) -> str | None:
    if not settings.doubao_app_key or not settings.doubao_access_key:
        return None
    audio_bytes = _download_audio_bytes(audio_url)
    audio_bytes = _maybe_transcode_to_wav(audio_bytes, _guess_suffix(audio_url))
    audio_b64 = b64encode(audio_bytes).decode("utf-8")

    request_id = str(uuid.uuid4())
    headers = _doubao_headers(request_id)
    payload = {
        "user": {"uid": settings.doubao_app_key},
        "audio": {"data": audio_b64},
        "request": {"model_name": "bigmodel"},
    }
    res = httpx.post(settings.doubao_endpoint, headers=headers, json=payload, timeout=60)
    res.raise_for_status()
    api_code = res.headers.get("X-Api-Status-Code")
    if api_code and api_code != "20000000":
        api_msg = res.headers.get("X-Api-Message", "")
        raise RuntimeError(f"doubao api error: {api_code} {api_msg}")
    data = res.json()
    result = data.get("result") if isinstance(data, dict) else None
    return _extract_text_from_result(result)


def _transcribe_with_doubao_standard(audio_url: str) -> str | None:
    from app.services.tos_service import upload_bytes, guess_content_type

    audio_bytes = _download_audio_bytes(audio_url)
    suffix = _guess_suffix(audio_url)
    if settings.asr_transcode:
        audio_bytes = _maybe_transcode_to_wav(audio_bytes, suffix)
        upload_suffix = ".wav"
        audio_format = "wav"
    else:
        upload_suffix = suffix
        audio_format = suffix.lstrip(".") or "wav"

    content_type = guess_content_type(upload_suffix)
    public_url = upload_bytes(audio_bytes, upload_suffix, content_type=content_type)

    request_id = str(uuid.uuid4())
    headers = _doubao_headers(request_id)
    payload = {
        "user": {"uid": settings.doubao_app_key},
        "audio": {"url": public_url, "format": audio_format},
        "request": {"model_name": "bigmodel"},
    }
    res = httpx.post(settings.doubao_submit_endpoint, headers=headers, json=payload, timeout=60)
    res.raise_for_status()
    api_code = res.headers.get("X-Api-Status-Code")
    if api_code and api_code != "20000000":
        api_msg = res.headers.get("X-Api-Message", "")
        raise RuntimeError(f"doubao api error: {api_code} {api_msg}")
    task_id = res.headers.get("X-Api-Request-Id") or request_id
    query_headers = _doubao_headers(task_id)

    for _ in range(30):
        query_res = httpx.post(settings.doubao_query_endpoint, headers=query_headers, json={}, timeout=30)
        query_res.raise_for_status()
        query_code = query_res.headers.get("X-Api-Status-Code")
        data = query_res.json() if query_res.content else {}
        result = data.get("result") if isinstance(data, dict) else None
        text = _extract_text_from_result(result)
        if query_code == "20000000" and text:
            return text
        if query_code and query_code not in {"20000000", "20000001", "20000002"}:
            query_msg = query_res.headers.get("X-Api-Message", "")
            raise RuntimeError(f"doubao api error: {query_code} {query_msg}")
        # not ready yet
        import time

        time.sleep(2)
    raise RuntimeError("doubao api timeout")


def _transcribe_with_baidu(audio_url: str) -> str | None:
    token = _baidu_get_access_token()
    audio_bytes = _download_audio_bytes(audio_url)
    audio_bytes = _maybe_transcode_to_wav(audio_bytes, _guess_suffix(audio_url))
    segments = _split_wav_bytes(audio_bytes, int(settings.baidu_segment_seconds or 55))
    results = []
    last_err = None
    for chunk in segments:
        payload = {
            "format": "wav",
            "rate": 16000,
            "channel": 1,
            "token": token,
            "cuid": settings.baidu_cuid or "bili-admin",
            "len": len(chunk),
            "speech": b64encode(chunk).decode("utf-8"),
            "dev_pid": int(settings.baidu_dev_pid or 1537),
        }
        data = {}
        last_exc = None
        for attempt in range(3):
            try:
                res = httpx.post(settings.baidu_asr_endpoint, json=payload, timeout=120)
                res.raise_for_status()
                data = res.json() if res.content else {}
                last_exc = None
                break
            except httpx.TimeoutException as exc:
                last_exc = exc
                time.sleep(1 + attempt)
        if last_exc is not None:
            raise RuntimeError("baidu asr timeout")
        err_no = data.get("err_no")
        if err_no not in (0, "0", None):
            err_no = data.get("err_no")
            err_msg = data.get("err_msg", "")
            raise RuntimeError(f"baidu asr error: {err_no} {err_msg}".strip())
        text = _extract_text_from_result(data.get("result"))
        if text:
            results.append(text)
        else:
            last_err = data.get("err_msg") or f"empty result (err_no={err_no})"
    if results:
        return "\n".join(results).strip()
    if last_err:
        raise RuntimeError(f"baidu asr empty result: {last_err}")
    return None


def transcribe_audio_url(audio_url: str) -> str | None:
    if settings.asr_provider == "faster_whisper":
        return _transcribe_with_faster_whisper(audio_url)
    if settings.asr_provider == "doubao":
        resource = settings.doubao_resource_id or ""
        if resource.endswith("_turbo"):
            return _transcribe_with_doubao_flash(audio_url)
        return _transcribe_with_doubao_standard(audio_url)
    if settings.asr_provider == "baidu":
        return _transcribe_with_baidu(audio_url)
    return None
