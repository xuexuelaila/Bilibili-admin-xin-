from __future__ import annotations

from typing import Any


def get_default_templates() -> list[dict[str, Any]]:
    base_rules = {
        "basic_hot": {
            "enabled": True,
            "mode": "any",
            "thresholds": {
                "views": 100000,
                "fav": 1500,
                "coin": 500,
                "reply": 200,
            },
        },
    }

    def make_low_fan(strength: str, fan_max: int, views_min: int, fav_rate: float, coin_rate: float, reply_rate: float, fav_fan_ratio: float) -> dict[str, Any]:
        return {
            "enabled": True,
            "strength": strength,
            "fan_max": fan_max,
            "views_min": views_min,
            "fav_rate": fav_rate,
            "coin_rate": coin_rate,
            "reply_rate": reply_rate,
            "fav_fan_ratio": fav_fan_ratio,
            "window_days": 7,
        }

    return [
        {
            "id": "appliance-light",
            "name": "家电 低粉爆款（轻）",
            "industry": "家电",
            "strength": "light",
            "rules": {
                **base_rules,
                "low_fan_hot": make_low_fan("light", 80000, 20000, 0.008, 0.0015, 0.0015, 0.015),
            },
        },
        {
            "id": "appliance-balanced",
            "name": "家电 低粉爆款（中）",
            "industry": "家电",
            "strength": "balanced",
            "rules": {
                **base_rules,
                "low_fan_hot": make_low_fan("balanced", 50000, 30000, 0.012, 0.0025, 0.0020, 0.02),
            },
        },
        {
            "id": "appliance-strong",
            "name": "家电 低粉爆款（强）",
            "industry": "家电",
            "strength": "strong",
            "rules": {
                **base_rules,
                "low_fan_hot": make_low_fan("strong", 30000, 50000, 0.015, 0.0035, 0.0025, 0.03),
            },
        },
        {
            "id": "3c-light",
            "name": "3C 低粉爆款（轻）",
            "industry": "3C",
            "strength": "light",
            "rules": {
                **base_rules,
                "low_fan_hot": make_low_fan("light", 80000, 20000, 0.008, 0.0015, 0.0015, 0.015),
            },
        },
        {
            "id": "3c-balanced",
            "name": "3C 低粉爆款（中）",
            "industry": "3C",
            "strength": "balanced",
            "rules": {
                **base_rules,
                "low_fan_hot": make_low_fan("balanced", 50000, 30000, 0.012, 0.0025, 0.0020, 0.02),
            },
        },
        {
            "id": "3c-strong",
            "name": "3C 低粉爆款（强）",
            "industry": "3C",
            "strength": "strong",
            "rules": {
                **base_rules,
                "low_fan_hot": make_low_fan("strong", 30000, 50000, 0.015, 0.0035, 0.0025, 0.03),
            },
        },
    ]
