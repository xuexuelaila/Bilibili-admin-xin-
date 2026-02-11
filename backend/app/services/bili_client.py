from __future__ import annotations
from typing import Any


class BiliClient:
    def search_videos(
        self,
        keyword: str,
        days_limit: int,
        fetch_limit: int,
        search_sort: str,
        partitions: list[int] | None = None,
    ) -> list[dict[str, Any]]:
        raise NotImplementedError

    def get_video_detail(self, bvid: str) -> dict[str, Any]:
        raise NotImplementedError

    def get_video_stats(self, bvid: str) -> dict[str, Any]:
        raise NotImplementedError

    def get_up_info(self, up_id: str) -> dict[str, Any]:
        raise NotImplementedError

    def get_subtitle(self, bvid: str) -> str | None:
        raise NotImplementedError


class MockBiliClient(BiliClient):
    def search_videos(self, keyword: str, days_limit: int, fetch_limit: int, search_sort: str, partitions=None):
        return []

    def get_video_detail(self, bvid: str) -> dict[str, Any]:
        return {}

    def get_video_stats(self, bvid: str) -> dict[str, Any]:
        return {"views": 0, "like": 0, "fav": 0, "coin": 0, "reply": 0, "share": 0}

    def get_up_info(self, up_id: str) -> dict[str, Any]:
        return {"up_name": "", "follower_count": 0}

    def get_subtitle(self, bvid: str) -> str | None:
        return None
