import copy
from app.core.config import settings

DEFAULT_SCOPE = {
    "days_limit": 30,
    "partition_ids": [],
    "fetch_limit": 200,
    "search_sort": "relevance",
}

DEFAULT_SCHEDULE = {
    "type": "daily",
    "time": settings.default_task_schedule_time,
}

DEFAULT_RULES = {
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
    "low_fan_hot": {
        "enabled": True,
        "strength": "balanced",
        "fan_max": 50000,
        "views_min": 30000,
        "fav_rate": 0.012,
        "coin_rate": 0.0025,
        "reply_rate": 0.0020,
        "fav_fan_ratio": 0.02,
        "window_days": 7,
    },
}


def default_scope():
    return copy.deepcopy(DEFAULT_SCOPE)


def default_schedule():
    return copy.deepcopy(DEFAULT_SCHEDULE)


def default_rules():
    return copy.deepcopy(DEFAULT_RULES)
