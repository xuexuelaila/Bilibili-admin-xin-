from __future__ import annotations

import re
from urllib.parse import urlparse, parse_qs, unquote, urljoin

import httpx

from app.core.config import settings

URL_RE = re.compile(r"https?://[^\\s\"'<>]+", re.IGNORECASE)
TRAILING_PUNCT = ".,;!?)]}>\"'"


def extract_urls(text: str | None, jump_url: dict | None = None, extra: object | None = None) -> list[str]:
    urls: set[str] = set()
    if text:
        for raw in URL_RE.findall(text):
            cleaned = _clean_url(raw)
            if cleaned:
                urls.add(cleaned)
    if isinstance(jump_url, dict):
        for value in jump_url.values():
            urls.update(_extract_jump_urls(value))
    if extra is not None:
        urls.update(_extract_urls_recursive(extra))
    return [u for u in urls if u]


def _extract_jump_urls(value) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        for key in ("url", "jump_url", "pc_url", "app_url", "link", "path"):
            url = value.get(key)
            if isinstance(url, str) and url.strip():
                found.add(_clean_url(url))
    elif isinstance(value, str) and value.strip():
        found.add(_clean_url(value))
    return found


def _extract_urls_recursive(value) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(key, str):
                for raw in URL_RE.findall(key):
                    cleaned = _clean_url(raw)
                    if cleaned:
                        found.add(cleaned)
            found.update(_extract_urls_recursive(item))
    elif isinstance(value, list):
        for item in value:
            found.update(_extract_urls_recursive(item))
    elif isinstance(value, str):
        for raw in URL_RE.findall(value):
            cleaned = _clean_url(raw)
            if cleaned:
                found.add(cleaned)
    return found


def _clean_url(raw: str) -> str:
    url = raw.strip()
    if url.startswith("//"):
        url = "https:" + url
    url = url.rstrip(TRAILING_PUNCT)
    return url


def expand_url(url: str, client: httpx.Client, short_domains: set[str]) -> str:
    url = unwrap_redirect(url)
    try:
        host = _host(url)
        if host not in short_domains:
            return url
        res = client.get(url, follow_redirects=False)
        loc = res.headers.get("location")
        if loc:
            if loc.startswith("/"):
                return _clean_url(urljoin(url, loc))
            return _clean_url(loc)
        res = client.head(url, follow_redirects=True)
        if res.status_code < 400 and str(res.url) != url:
            return str(res.url)
    except Exception:
        try:
            res = client.get(url, follow_redirects=True)
            if res.status_code < 400:
                return str(res.url)
        except Exception:
            return url
    try:
        res = client.get(url, follow_redirects=True)
        if res.status_code < 400:
            return str(res.url)
    except Exception:
        return url
    return url


def parse_product(url: str, whitelist: set[str]) -> dict | None:
    url = unwrap_redirect(url)
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if not _host_allowed(host, whitelist):
        return None

    platform = _platform_for_host(host)
    if not platform:
        return None

    item_id = _extract_item_id(platform, parsed)
    if not item_id:
        return None

    sku_id = _extract_sku_id(parsed)
    return {
        "platform": platform,
        "item_id": item_id,
        "sku_id": sku_id,
    }


def build_product_key(platform: str, item_id: str, sku_id: str | None) -> str:
    suffix = sku_id or ""
    return f"{platform}:{item_id}:{suffix}"


def product_domain_whitelist() -> set[str]:
    return {item.strip().lower() for item in settings.product_domain_list if item.strip()}


def short_link_domains() -> set[str]:
    return {item.strip().lower() for item in settings.product_short_link_list if item.strip()}


def unwrap_redirect(url: str) -> str:
    try:
        parsed = urlparse(url)
    except Exception:
        return url
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if host.endswith("bilibili.com") and parsed.path.startswith("/redirect"):
        qs = parse_qs(parsed.query or "")
        for key in ("url", "target", "target_url", "jump_url", "dest_url", "dest"):
            values = qs.get(key)
            if values and values[0]:
                return unquote(values[0])
    return url


def _host(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def _host_allowed(host: str, whitelist: set[str]) -> bool:
    for domain in whitelist:
        if host == domain or host.endswith("." + domain):
            return True
    return False


def _platform_for_host(host: str) -> str | None:
    if host.endswith("jd.com"):
        return "jd"
    if host.endswith("taobao.com") or host.endswith("tb.cn") or host.endswith("m.tb.cn") or host.endswith("s.tb.cn"):
        return "taobao"
    if host.endswith("tmall.com"):
        return "tmall"
    if host.endswith("pinduoduo.com") or host.endswith("yangkeduo.com"):
        return "pdd"
    if host.endswith("vip.com"):
        return "vip"
    if host.endswith("suning.com"):
        return "suning"
    return None


def _extract_item_id(platform: str, parsed) -> str | None:
    path = parsed.path or ""
    qs = parse_qs(parsed.query or "")

    if platform == "jd":
        match = re.search(r"/(\\d+)\\.html", path)
        if match:
            return match.group(1)
        match = re.search(r"/product/(\\d+)\\.html", path)
        if match:
            return match.group(1)
        return _first_qs(qs, ["sku", "skuId", "sku_id"])

    if platform in {"taobao", "tmall"}:
        return _first_qs(qs, ["id", "item_id"])

    if platform == "pdd":
        return _first_qs(qs, ["goods_id", "goodsId"])

    if platform == "vip":
        match = re.search(r"product-(\\d+)", path)
        if match:
            return match.group(1)
        match = re.search(r"detail-(\\d+)", path)
        if match:
            return match.group(1)
        return _first_qs(qs, ["product_id", "item_id"])

    if platform == "suning":
        match = re.search(r"/(\\d+)/(\\d+)\\.html", path)
        if match:
            return match.group(2)
        return _first_qs(qs, ["productId", "product_id", "item_id"])

    return None


def _extract_sku_id(parsed) -> str | None:
    qs = parse_qs(parsed.query or "")
    return _first_qs(qs, ["skuId", "sku_id", "sku"])


def _first_qs(qs: dict, keys: list[str]) -> str | None:
    for key in keys:
        values = qs.get(key)
        if values:
            value = values[0]
            if value:
                return value
    return None
