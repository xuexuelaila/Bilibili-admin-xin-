from __future__ import annotations

import hashlib
import re
import time
from urllib.parse import urlencode

import httpx


_MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32,
    15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19,
    29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61,
    26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63,
    57, 62, 11, 36, 20, 34, 44, 52,
]


def get_wbi_keys(client: httpx.Client) -> tuple[str, str] | None:
    res = client.get("https://api.bilibili.com/x/web-interface/nav")
    if res.status_code != 200:
        return None
    data = res.json()
    if data.get("code") != 0:
        return None
    wbi = (data.get("data") or {}).get("wbi_img") or {}
    img_url = wbi.get("img_url") or ""
    sub_url = wbi.get("sub_url") or ""
    img_key = _extract_key(img_url)
    sub_key = _extract_key(sub_url)
    if not img_key or not sub_key:
        return None
    return img_key, sub_key


def _extract_key(url: str) -> str:
    if not url:
        return ""
    name = url.split("/")[-1]
    return name.split(".")[0]


def get_mixin_key(img_key: str, sub_key: str) -> str:
    raw = img_key + sub_key
    mixed = "".join([raw[i] for i in _MIXIN_KEY_ENC_TAB if i < len(raw)])
    return mixed[:32]


def sign_params(params: dict[str, str], mixin_key: str) -> dict[str, str]:
    clean: dict[str, str] = {}
    for key, value in params.items():
        text = str(value)
        text = re.sub(r"[!'\(\)\*]", "", text)
        clean[key] = text
    wts = str(int(time.time()))
    clean["wts"] = wts
    query = urlencode(sorted(clean.items()))
    w_rid = hashlib.md5((query + mixin_key).encode("utf-8")).hexdigest()
    clean["w_rid"] = w_rid
    return clean
