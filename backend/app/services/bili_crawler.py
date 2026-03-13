from __future__ import annotations

import html
import json
import re
import time
from datetime import datetime, timedelta
from typing import Any

import httpx
from app.services.bili_wbi import get_mixin_key, get_wbi_keys, sign_params

from app.core.config import settings
from app.services.bili_client import BiliClient


class CrawlerBiliClient(BiliClient):
    def __init__(
        self,
        rate_limit_per_sec: int = 1,
        retry_times: int = 2,
        timeout_seconds: int = 10,
        cookies: str | None = None,
        user_agent: str | None = None,
        referer: str | None = None,
    ):
        self.rate_limit_per_sec = max(1, int(rate_limit_per_sec))
        self.retry_times = max(0, int(retry_times))
        self.timeout_seconds = max(1, int(timeout_seconds))
        self.min_interval = 1.0 / self.rate_limit_per_sec
        self._last_request = 0.0

        headers = {
            "User-Agent": user_agent or settings.bili_user_agent,
            "Referer": referer or settings.bili_referer,
        }
        self.cookies = _parse_cookie_string(cookies or settings.bili_cookies)
        self.client = httpx.Client(headers=headers, cookies=self.cookies, timeout=self.timeout_seconds)
        self._wbi_mixin_key: str | None = None
        self._wbi_key_time: float | None = None

    def search_videos(
        self,
        keyword: str,
        days_limit: int,
        fetch_limit: int,
        search_sort: str,
        partitions: list[int] | None = None,
    ) -> list[dict[str, Any]]:
        limit = max(1, min(int(fetch_limit), 200))
        page = 1
        results: list[dict[str, Any]] = []
        max_pages = max(1, (limit + 19) // 20)

        while len(results) < limit and page <= max_pages:
            items = self._search_by_api(keyword, page, search_sort, partitions)
            if not items:
                items = self._search_by_html(keyword, page, search_sort, partitions)
            if not items:
                break
            results.extend(items)
            page += 1

        cutoff = datetime.utcnow() - timedelta(days=int(days_limit))
        filtered: list[dict[str, Any]] = []
        for item in results:
            publish_time = item.get("publish_time")
            if isinstance(publish_time, datetime) and publish_time < cutoff:
                continue
            filtered.append(item)

        return filtered[:limit]

    def get_video_detail(self, bvid: str) -> dict[str, Any]:
        api_url = "https://api.bilibili.com/x/web-interface/view"
        data = self._request_json(api_url, {"bvid": bvid})
        if data and isinstance(data.get("data"), dict):
            payload = data["data"]
            stat = payload.get("stat", {}) if isinstance(payload.get("stat"), dict) else {}
            owner = payload.get("owner", {}) if isinstance(payload.get("owner"), dict) else {}
            return {
                "bvid": payload.get("bvid") or bvid,
                "aid": payload.get("aid"),
                "title": _strip_html(payload.get("title") or ""),
                "up_id": str(owner.get("mid") or ""),
                "up_name": owner.get("name") or "",
                "publish_time": _parse_time(payload.get("pubdate")),
                "cover_url": _normalize_url(payload.get("pic")),
                "cid": payload.get("cid"),
                "stats": {
                    "views": int(stat.get("view", 0) or 0),
                    "like": int(stat.get("like", 0) or 0),
                    "fav": int(stat.get("favorite", 0) or 0),
                    "coin": int(stat.get("coin", 0) or 0),
                    "reply": int(stat.get("reply", 0) or 0),
                    "share": int(stat.get("share", 0) or 0),
                },
            }

        url = f"https://www.bilibili.com/video/{bvid}"
        text = self._request_text(url)
        if not text:
            return {}

        data = _extract_initial_state(text) or _extract_next_data(text)
        if not data:
            return {}

        video_data = _find_key(data, "videoData")
        if not isinstance(video_data, dict):
            return {}

        stat = video_data.get("stat", {}) if isinstance(video_data.get("stat"), dict) else {}
        owner = video_data.get("owner", {}) if isinstance(video_data.get("owner"), dict) else {}

        return {
            "bvid": video_data.get("bvid") or bvid,
            "aid": video_data.get("aid"),
            "title": _strip_html(video_data.get("title") or ""),
            "up_id": str(owner.get("mid") or ""),
            "up_name": owner.get("name") or "",
            "publish_time": _parse_time(video_data.get("pubdate")),
            "cover_url": _normalize_url(video_data.get("pic")),
            "cid": video_data.get("cid"),
            "stats": {
                "views": int(stat.get("view", 0) or 0),
                "like": int(stat.get("like", 0) or 0),
                "fav": int(stat.get("favorite", 0) or 0),
                "coin": int(stat.get("coin", 0) or 0),
                "reply": int(stat.get("reply", 0) or 0),
                "share": int(stat.get("share", 0) or 0),
            },
        }

    def get_video_stats(self, bvid: str) -> dict[str, Any]:
        detail = self.get_video_detail(bvid)
        return detail.get("stats") or {"views": 0, "like": 0, "fav": 0, "coin": 0, "reply": 0, "share": 0}

    def get_up_info(self, up_id: str) -> dict[str, Any]:
        if not up_id:
            return {"up_name": "", "follower_count": 0, "following_count": 0}
        url = "https://api.bilibili.com/x/relation/stat"
        params = {"vmid": up_id}
        data = self._request_json(url, params)
        if not data:
            return {"up_name": "", "follower_count": 0, "following_count": 0}
        payload = data.get("data") if isinstance(data, dict) else {}
        follower = int(payload.get("follower", 0) or 0) if isinstance(payload, dict) else 0
        following = int(payload.get("following", 0) or 0) if isinstance(payload, dict) else 0
        return {"up_name": "", "follower_count": follower, "following_count": following}

    def get_up_profile(self, up_id: str) -> dict[str, Any]:
        if not up_id:
            return {"up_name": "", "avatar": None}
        url = "https://api.bilibili.com/x/space/acc/info"
        params = {"mid": up_id}
        data = self._request_json(url, params)
        if not data or data.get("code") not in (0, None):
            return {"up_name": "", "avatar": None}
        payload = data.get("data") if isinstance(data, dict) else {}
        if not isinstance(payload, dict):
            return {"up_name": "", "avatar": None}
        return {
            "up_name": payload.get("name") or "",
            "avatar": _normalize_url(payload.get("face")),
        }

    def get_up_stats(self, up_id: str) -> dict[str, Any]:
        if not up_id:
            return {"view_count": 0, "like_count": 0}
        url = "https://api.bilibili.com/x/space/upstat"
        params = {"mid": up_id}
        data = self._request_json(url, params)
        if not data or data.get("code") not in (0, None):
            return {"view_count": 0, "like_count": 0}
        payload = data.get("data") if isinstance(data, dict) else {}
        if not isinstance(payload, dict):
            return {"view_count": 0, "like_count": 0}
        archive = payload.get("archive") if isinstance(payload.get("archive"), dict) else {}
        view_count = int(archive.get("view", 0) or 0) if isinstance(archive, dict) else 0
        like_count = int(archive.get("like", 0) or 0) if isinstance(archive, dict) else 0
        return {"view_count": view_count, "like_count": like_count}

    def get_subtitle(self, bvid: str) -> str | None:
        detail = self.get_video_detail(bvid)
        cid = detail.get("cid")
        if not cid:
            return None
        url = "https://api.bilibili.com/x/player/v2"
        params = {"bvid": bvid, "cid": cid}
        data = self._request_json(url, params)
        if not data:
            return None
        payload = data.get("data") if isinstance(data, dict) else {}
        subtitle = payload.get("subtitle") if isinstance(payload, dict) else {}
        subtitles = subtitle.get("subtitles") if isinstance(subtitle, dict) else []
        if not subtitles:
            return None
        sub = subtitles[0]
        sub_url = sub.get("url")
        if not sub_url:
            return None
        if sub_url.startswith("//"):
            sub_url = "https:" + sub_url
        sub_json = self._request_json(sub_url)
        if not sub_json:
            return None
        body = sub_json.get("body") if isinstance(sub_json, dict) else []
        if not isinstance(body, list):
            return None
        return "\n".join([line.get("content", "") for line in body if isinstance(line, dict)])

    def get_audio_url(self, bvid: str) -> str | None:
        detail = self.get_video_detail(bvid)
        cid = detail.get("cid")
        if not cid:
            cid = self._get_cid_by_pagelist(bvid)
        if not cid:
            # Fallback: try parse playinfo from video page directly.
            return self._get_audio_url_from_page(bvid)
        url = "https://api.bilibili.com/x/player/playurl"
        params = {"bvid": bvid, "cid": cid, "fnval": 16, "fnver": 0, "fourk": 1}
        data = self._request_json(url, params)
        if not data:
            return self._get_audio_url_from_page(bvid)
        payload = data.get("data") if isinstance(data, dict) else {}
        if not isinstance(payload, dict):
            return self._get_audio_url_from_page(bvid)
        dash = payload.get("dash")
        if isinstance(dash, dict):
            audios = dash.get("audio") if isinstance(dash.get("audio"), list) else []
            for audio in audios:
                if not isinstance(audio, dict):
                    continue
                base_url = audio.get("baseUrl") or audio.get("base_url")
                if base_url:
                    return base_url
        durl = payload.get("durl")
        if isinstance(durl, list) and durl:
            first = durl[0]
            if isinstance(first, dict):
                return first.get("url")
        return self._get_audio_url_from_page(bvid)

    def get_video_url(self, bvid: str) -> str | None:
        detail = self.get_video_detail(bvid)
        cid = detail.get("cid")
        if not cid:
            return None
        url = "https://api.bilibili.com/x/player/playurl"
        params = {"bvid": bvid, "cid": cid, "fnval": 16}
        data = self._request_json(url, params)
        if not data:
            return None
        payload = data.get("data") if isinstance(data, dict) else {}
        if not isinstance(payload, dict):
            return None
        dash = payload.get("dash")
        if isinstance(dash, dict):
            videos = dash.get("video") if isinstance(dash.get("video"), list) else []
            if videos:
                best = max(videos, key=lambda item: item.get("bandwidth", 0) if isinstance(item, dict) else 0)
                if isinstance(best, dict):
                    base_url = best.get("baseUrl") or best.get("base_url")
                    if base_url:
                        return base_url
        durl = payload.get("durl")
        if isinstance(durl, list) and durl:
            first = durl[0]
            if isinstance(first, dict):
                return first.get("url")
        return None

    def get_video_comments(self, bvid: str, limit: int = 500) -> list[dict]:
        detail = self.get_video_detail(bvid)
        aid = detail.get("aid")
        if not aid:
            return []

        url = "https://api.bilibili.com/x/v2/reply/main"
        wbi_url = "https://api.bilibili.com/x/v2/reply/wbi/main"
        page_size = 20
        max_limit = max(1, min(int(limit), 1000))
        page = 1
        raw_replies: list[dict] = []

        while len(raw_replies) < max_limit:
            params = {"type": 1, "oid": aid, "pn": page, "ps": page_size, "sort": 2}
            data = self._request_json(url, params)
            if not data or data.get("code") != 0:
                data = self._request_json_wbi(wbi_url, params)
            if not data or data.get("code") != 0:
                break
            payload = data.get("data") if isinstance(data.get("data"), dict) else {}

            if page == 1:
                top = payload.get("top") if isinstance(payload.get("top"), dict) else {}
                top_upper = top.get("upper")
                if isinstance(top_upper, dict):
                    raw_replies.append(top_upper)
                top_replies = top.get("replies")
                if isinstance(top_replies, list):
                    raw_replies.extend([r for r in top_replies if isinstance(r, dict)])

            replies = payload.get("replies")
            if not isinstance(replies, list) or not replies:
                break
            raw_replies.extend([r for r in replies if isinstance(r, dict)])
            if len(replies) < page_size:
                break
            page += 1

        normalized: list[dict] = []
        for reply in raw_replies[:max_limit]:
            _collect_comment(reply, normalized)
        return normalized

    def get_creator_videos(self, up_id: str, limit: int = 20) -> list[dict[str, Any]]:
        if not up_id:
            return []
        page_size = max(1, min(int(limit), 50))
        page = 1
        results: list[dict[str, Any]] = []
        wbi_url = "https://api.bilibili.com/x/space/wbi/arc/search"
        fallback_url = "https://api.bilibili.com/x/space/arc/search"

        while len(results) < int(limit):
            params = {"mid": up_id, "pn": page, "ps": page_size, "order": "pubdate"}
            data = self._request_json_wbi(wbi_url, params) or self._request_json(fallback_url, params)
            if not data or data.get("code") not in (0, None):
                break
            payload = data.get("data") if isinstance(data, dict) else {}
            if not isinstance(payload, dict):
                break
            listing = payload.get("list") if isinstance(payload.get("list"), dict) else {}
            vlist = listing.get("vlist") if isinstance(listing, dict) else []
            if not isinstance(vlist, list) or not vlist:
                break
            for item in vlist:
                if not isinstance(item, dict):
                    continue
                results.append(
                    {
                        "bvid": item.get("bvid") or "",
                        "title": _strip_html(item.get("title") or ""),
                        "up_id": str(item.get("mid") or up_id),
                        "up_name": item.get("author") or "",
                        "publish_time": _parse_time(item.get("created")),
                        "cover_url": _normalize_url(item.get("pic")),
                        "stats": {
                            "views": int(item.get("play", 0) or 0),
                            "like": int(item.get("like", 0) or 0),
                            "fav": int(item.get("favorite", 0) or 0),
                            "coin": int(item.get("coin", 0) or 0),
                            "reply": int(item.get("comment", 0) or 0),
                            "share": int(item.get("share", 0) or 0),
                        },
                    }
                )
            if len(vlist) < page_size:
                break
            page += 1

        return results[: int(limit)]

    def get_creator_videos_recent(self, up_id: str, days_limit: int = 30) -> list[dict[str, Any]]:
        if not up_id:
            return []
        page_size = 50
        page = 1
        results: list[dict[str, Any]] = []
        wbi_url = "https://api.bilibili.com/x/space/wbi/arc/search"
        fallback_url = "https://api.bilibili.com/x/space/arc/search"
        cutoff = datetime.utcnow() - timedelta(days=int(days_limit))

        while True:
            params = {"mid": up_id, "pn": page, "ps": page_size, "order": "pubdate"}
            data = self._request_json_wbi(wbi_url, params) or self._request_json(fallback_url, params)
            if not data or data.get("code") not in (0, None):
                break
            payload = data.get("data") if isinstance(data, dict) else {}
            if not isinstance(payload, dict):
                break
            listing = payload.get("list") if isinstance(payload.get("list"), dict) else {}
            vlist = listing.get("vlist") if isinstance(listing, dict) else []
            if not isinstance(vlist, list) or not vlist:
                break

            stop = False
            for item in vlist:
                if not isinstance(item, dict):
                    continue
                publish_time = _parse_time(item.get("created"))
                if publish_time and publish_time < cutoff:
                    stop = True
                    break
                results.append(
                    {
                        "bvid": item.get("bvid") or "",
                        "title": _strip_html(item.get("title") or ""),
                        "up_id": str(item.get("mid") or up_id),
                        "up_name": item.get("author") or "",
                        "publish_time": publish_time,
                        "cover_url": _normalize_url(item.get("pic")),
                        "stats": {
                            "views": int(item.get("play", 0) or 0),
                            "like": int(item.get("like", 0) or 0),
                            "fav": int(item.get("favorite", 0) or 0),
                            "coin": int(item.get("coin", 0) or 0),
                            "reply": int(item.get("comment", 0) or 0),
                            "share": int(item.get("share", 0) or 0),
                        },
                    }
                )

            if stop or len(vlist) < page_size:
                break
            page += 1

        return results

    def _request_json(self, url: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
        for attempt in range(self.retry_times + 1):
            try:
                self._rate_limit()
                res = self.client.get(url, params=params)
                if res.status_code != 200:
                    continue
                return res.json()
            except Exception:
                if attempt >= self.retry_times:
                    return None
                time.sleep(0.5 * (attempt + 1))
        return None

    def _request_text(self, url: str, params: dict[str, Any] | None = None) -> str | None:
        for attempt in range(self.retry_times + 1):
            try:
                self._rate_limit()
                res = self.client.get(url, params=params)
                if res.status_code != 200:
                    continue
                return res.text
            except Exception:
                if attempt >= self.retry_times:
                    return None
                time.sleep(0.5 * (attempt + 1))
        return None

    def _request_json_wbi(self, url: str, params: dict[str, Any]) -> dict[str, Any] | None:
        mixin_key = self._ensure_wbi_key()
        if not mixin_key:
            return None
        signed = sign_params({k: str(v) for k, v in params.items()}, mixin_key)
        for attempt in range(self.retry_times + 1):
            try:
                self._rate_limit()
                res = self.client.get(url, params=signed)
                if res.status_code != 200:
                    continue
                return res.json()
            except Exception:
                if attempt >= self.retry_times:
                    return None
                time.sleep(0.5 * (attempt + 1))
        return None

    def _ensure_wbi_key(self) -> str | None:
        now = time.time()
        if self._wbi_mixin_key and self._wbi_key_time and now - self._wbi_key_time < 3600:
            return self._wbi_mixin_key
        keys = get_wbi_keys(self.client)
        if not keys:
            return None
        img_key, sub_key = keys
        self._wbi_mixin_key = get_mixin_key(img_key, sub_key)
        self._wbi_key_time = now
        return self._wbi_mixin_key

    def _rate_limit(self) -> None:
        now = time.time()
        elapsed = now - self._last_request
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request = time.time()

    def _get_cid_by_pagelist(self, bvid: str) -> int | None:
        data = self._request_json("https://api.bilibili.com/x/player/pagelist", {"bvid": bvid})
        if not data or data.get("code") not in (0, None):
            return None
        rows = data.get("data")
        if not isinstance(rows, list) or not rows:
            return None
        first = rows[0]
        if not isinstance(first, dict):
            return None
        cid = first.get("cid")
        return int(cid) if isinstance(cid, (int, float, str)) and str(cid).isdigit() else None

    def _get_audio_url_from_page(self, bvid: str) -> str | None:
        text = self._request_text(f"https://www.bilibili.com/video/{bvid}")
        if not text:
            return None
        playinfo = _extract_playinfo(text)
        if not isinstance(playinfo, dict):
            return None
        data = playinfo.get("data") if isinstance(playinfo.get("data"), dict) else {}
        dash = data.get("dash") if isinstance(data, dict) else {}
        if isinstance(dash, dict):
            audios = dash.get("audio") if isinstance(dash.get("audio"), list) else []
            for audio in audios:
                if not isinstance(audio, dict):
                    continue
                base_url = audio.get("baseUrl") or audio.get("base_url")
                if base_url:
                    return str(base_url)
        durl = data.get("durl") if isinstance(data, dict) else None
        if isinstance(durl, list) and durl:
            first = durl[0]
            if isinstance(first, dict) and first.get("url"):
                return str(first.get("url"))
        return None

    def _search_by_html(
        self,
        keyword: str,
        page: int,
        search_sort: str,
        partitions: list[int] | None,
    ) -> list[dict[str, Any]]:
        url = "https://search.bilibili.com/video"
        order_map = {"relevance": "totalrank", "new": "pubdate", "views": "click"}
        params = {"keyword": keyword, "page": page}
        if search_sort in order_map:
            params["order"] = order_map[search_sort]
        if partitions:
            params["tids"] = ",".join(str(i) for i in partitions)
        text = self._request_text(url, params)
        if not text:
            return []
        data = _extract_next_data(text) or _extract_initial_state(text)
        if not data:
            return []
        items = _collect_video_items(data)
        results: list[dict[str, Any]] = []
        for item in items:
            bvid = item.get("bvid")
            if not bvid:
                continue
            stats = {
                "views": _parse_count(item.get("play") or item.get("view") or item.get("stat", {}).get("view")),
                "like": _parse_count(item.get("like") or item.get("stat", {}).get("like")),
                "fav": _parse_count(item.get("favorite") or item.get("fav") or item.get("stat", {}).get("favorite")),
                "coin": _parse_count(item.get("coin") or item.get("stat", {}).get("coin")),
                "reply": _parse_count(item.get("review") or item.get("reply") or item.get("stat", {}).get("reply")),
                "share": _parse_count(item.get("share") or item.get("stat", {}).get("share")),
            }
            results.append(
                {
                    "bvid": bvid,
                    "title": _strip_html(item.get("title") or ""),
                    "up_id": str(item.get("mid") or item.get("up_id") or item.get("author_mid") or ""),
                    "up_name": item.get("author") or item.get("up_name") or "",
                    "publish_time": _parse_time(item.get("pubdate") or item.get("pubdate_text") or item.get("ptime")),
                    "cover_url": item.get("pic") or item.get("cover") or item.get("picurl"),
                    "stats": stats,
                }
            )
        return results

    def _search_by_api(
        self,
        keyword: str,
        page: int,
        search_sort: str,
        partitions: list[int] | None,
    ) -> list[dict[str, Any]]:
        url = "https://api.bilibili.com/x/web-interface/search/type"
        order_map = {"relevance": "totalrank", "new": "pubdate", "views": "click"}
        params: dict[str, Any] = {
            "search_type": "video",
            "keyword": keyword,
            "page": page,
            "order": order_map.get(search_sort, "totalrank"),
        }
        if partitions:
            params["tids"] = ",".join(str(i) for i in partitions)

        data = self._request_json(url, params)
        if not data or data.get("code") != 0:
            return []
        payload = data.get("data") if isinstance(data.get("data"), dict) else {}
        items = payload.get("result") if isinstance(payload, dict) else []
        if not isinstance(items, list):
            return []

        results: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            bvid = item.get("bvid")
            if not bvid:
                continue
            results.append(
                {
                    "bvid": bvid,
                    "title": _strip_html(item.get("title") or ""),
                    "up_id": str(item.get("mid") or ""),
                    "up_name": item.get("author") or "",
                    "publish_time": _parse_time(item.get("pubdate")),
                    "cover_url": _normalize_url(item.get("pic")),
                    "stats": {
                        "views": _parse_count(item.get("play")),
                        "like": _parse_count(item.get("like")),
                        "fav": _parse_count(item.get("favorites")),
                        "coin": _parse_count(item.get("coin")),
                        "reply": _parse_count(item.get("review")),
                        "share": _parse_count(item.get("share")),
                    },
                }
            )
        return results


def _collect_comment(reply: dict[str, Any], out: list[dict[str, Any]]) -> None:
    if not isinstance(reply, dict):
        return
    content = reply.get("content") if isinstance(reply.get("content"), dict) else {}
    member = reply.get("member") if isinstance(reply.get("member"), dict) else {}
    user_id = str(member.get("mid") or reply.get("mid") or "")
    message = content.get("message") or ""
    jump_url = content.get("jump_url") if isinstance(content.get("jump_url"), dict) else {}
    ctime = reply.get("ctime")
    if user_id and (message or jump_url):
        out.append(
            {
                "user_id": user_id,
                "message": message,
                "jump_url": jump_url,
                "ctime": ctime,
                "raw": reply,
            }
        )
    replies = reply.get("replies")
    if isinstance(replies, list):
        for child in replies:
            if isinstance(child, dict):
                _collect_comment(child, out)


def _parse_cookie_string(cookie_str: str | None) -> dict[str, str]:
    if not cookie_str:
        return {}
    parts = [p.strip() for p in cookie_str.split(";") if p.strip()]
    cookies: dict[str, str] = {}
    for part in parts:
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        cookies[key.strip()] = value.strip()
    return cookies


def _extract_next_data(text: str) -> dict[str, Any] | None:
    match = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', text, re.S)
    if not match:
        return None
    raw = html.unescape(match.group(1))
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _extract_initial_state(text: str) -> dict[str, Any] | None:
    marker = "window.__INITIAL_STATE__"
    idx = text.find(marker)
    if idx == -1:
        return None
    idx = text.find("=", idx)
    if idx == -1:
        return None
    start = text.find("{", idx)
    if start == -1:
        return None
    depth = 0
    end = None
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end is None:
        return None
    raw = text[start:end]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _extract_playinfo(text: str) -> dict[str, Any] | None:
    marker = "window.__playinfo__"
    idx = text.find(marker)
    if idx == -1:
        return None
    idx = text.find("=", idx)
    if idx == -1:
        return None
    start = text.find("{", idx)
    if start == -1:
        return None
    depth = 0
    end = None
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end is None:
        return None
    raw = text[start:end]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _collect_video_items(data: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if "bvid" in node and ("title" in node or "name" in node):
                items.append(node)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(data)
    return items


def _find_key(data: Any, key: str) -> Any:
    if isinstance(data, dict):
        if key in data:
            return data[key]
        for value in data.values():
            found = _find_key(value, key)
            if found is not None:
                return found
    elif isinstance(data, list):
        for value in data:
            found = _find_key(value, key)
            if found is not None:
                return found
    return None


def _strip_html(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", text)


def _normalize_url(url: Any) -> str | None:
    if not url:
        return None
    if isinstance(url, str):
        if url.startswith("//"):
            return "https:" + url
        if url.startswith("http://") and "hdslb.com" in url:
            return "https://" + url[len("http://"):]
        return url
    return None


def _parse_count(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        text = value.replace(",", "").strip()
        if text.endswith("万"):
            try:
                return int(float(text[:-1]) * 10000)
            except ValueError:
                return 0
        if text.endswith("亿"):
            try:
                return int(float(text[:-1]) * 100000000)
            except ValueError:
                return 0
        try:
            return int(float(text))
        except ValueError:
            return 0
    return 0


def _parse_time(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        if value <= 0:
            return None
        return datetime.utcfromtimestamp(value)
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        rel_match = re.match(r"^(\\d+)(分钟|小时|天)前$", value)
        if rel_match:
            amount = int(rel_match.group(1))
            unit = rel_match.group(2)
            now = datetime.utcnow()
            if unit == "分钟":
                return now - timedelta(minutes=amount)
            if unit == "小时":
                return now - timedelta(hours=amount)
            if unit == "天":
                return now - timedelta(days=amount)
        if value in {"刚刚", "刚刚发布"}:
            return datetime.utcnow()
        if value == "昨天":
            return datetime.utcnow() - timedelta(days=1)
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None
