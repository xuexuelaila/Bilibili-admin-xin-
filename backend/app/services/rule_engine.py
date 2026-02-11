from __future__ import annotations
from typing import Any


def evaluate_basic_hot(stats: dict[str, Any], rules: dict[str, Any]) -> tuple[bool, list[str]]:
    cfg = rules.get("basic_hot") or {}
    if not cfg.get("enabled", True):
        return False, []

    thresholds: dict[str, float] = cfg.get("thresholds", {})
    mode = cfg.get("mode", "any")
    reasons: list[str] = []

    for field, threshold in thresholds.items():
        value = stats.get(field, 0) or 0
        if value >= threshold:
            reasons.append(f"{field}>={threshold}")

    if not reasons:
        return False, []

    if mode == "all" and len(reasons) != len(thresholds):
        return False, []

    return True, reasons


def evaluate_low_fan_hot(stats: dict[str, Any], follower_count: int, rules: dict[str, Any]) -> tuple[bool, list[str]]:
    cfg = rules.get("low_fan_hot") or {}
    if not cfg.get("enabled", True):
        return False, []

    views = stats.get("views", 0) or 0
    fav = stats.get("fav", 0) or 0
    coin = stats.get("coin", 0) or 0
    reply = stats.get("reply", 0) or 0

    reasons: list[str] = []

    if views == 0 or follower_count == 0:
        return False, ["views_or_follower_zero"]

    fan_max = cfg.get("fan_max", 50000)
    views_min = cfg.get("views_min", 30000)
    fav_rate = fav / views
    coin_rate = coin / views
    reply_rate = reply / views
    fav_fan_ratio = fav / follower_count

    if follower_count <= fan_max:
        reasons.append(f"fan<={fan_max}")
    if views >= views_min:
        reasons.append(f"views>={views_min}")
    if fav_rate >= cfg.get("fav_rate", 0.012):
        reasons.append(f"fav_rate>={cfg.get('fav_rate', 0.012)}")
    if coin_rate >= cfg.get("coin_rate", 0.0025):
        reasons.append(f"coin_rate>={cfg.get('coin_rate', 0.0025)}")
    if reply_rate >= cfg.get("reply_rate", 0.0020):
        reasons.append(f"reply_rate>={cfg.get('reply_rate', 0.0020)}")
    if fav_fan_ratio >= cfg.get("fav_fan_ratio", 0.02):
        reasons.append(f"fav_fan_ratio>={cfg.get('fav_fan_ratio', 0.02)}")

    required = 6
    if len(reasons) >= required:
        return True, reasons

    return False, reasons


def evaluate_rules(stats: dict[str, Any], follower_count: int, rules: dict[str, Any]) -> dict[str, Any]:
    basic_hit, basic_reason = evaluate_basic_hot(stats, rules)
    low_hit, low_reason = evaluate_low_fan_hot(stats, follower_count, rules)
    return {
        "basic_hot": {"is_hit": basic_hit, "reason": basic_reason},
        "low_fan_hot": {"is_hit": low_hit, "reason": low_reason},
    }
