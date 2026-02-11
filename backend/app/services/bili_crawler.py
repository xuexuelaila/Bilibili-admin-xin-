from __future__ import annotations

import html
import json
import re
import time
from datetime import datetime, timedelta
from typing import Any

import httpx

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
            return {"up_name": "", "follower_count": 0}
        url = "https://api.bilibili.com/x/relation/stat"
        params = {"vmid": up_id}
        data = self._request_json(url, params)
        if not data:
            return {"up_name": "", "follower_count": 0}
        payload = data.get("data") if isinstance(data, dict) else {}
        follower = int(payload.get("follower", 0) or 0) if isinstance(payload, dict) else 0
        return {"up_name": "", "follower_count": follower}

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

    def _rate_limit(self) -> None:
        now = time.time()
        elapsed = now - self._last_request
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request = time.time()

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
