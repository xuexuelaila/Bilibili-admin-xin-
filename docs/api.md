# 接口文档

## 基础信息

- Base URL：`/api`
- Content-Type：`application/json`
- 时间字段：ISO8601（UTC，后端使用 `datetime.utcnow()`）

## 通用分页结构

```
{
  "items": [],
  "page": 1,
  "page_size": 20,
  "total": 0
}
```

## 通用错误

- 400：参数错误（如 `bvids` 为空、状态非法）
- 404：资源不存在（如 Task/Video/Run）

## 主要对象

### Task
```
{
  "id": "uuid",
  "name": "string",
  "keywords": ["string"],
  "exclude_words": ["string"],
  "scope": {"days_limit": 30, "partition_ids": [], "fetch_limit": 200, "search_sort": "relevance"},
  "schedule": {"type": "daily", "time": "09:00"},
  "rules": {"basic_hot": {...}, "low_fan_hot": {...}},
  "status": "enabled|disabled",
  "consecutive_failures": 0,
  "created_at": "2024-01-01T00:00:00",
  "updated_at": "2024-01-01T00:00:00"
}
```

### Run
```
{
  "id": "uuid",
  "task_id": "uuid",
  "trigger": "manual|schedule",
  "status": "running|success|partial|failed",
  "start_at": "2024-01-01T00:00:00",
  "end_at": "2024-01-01T00:00:00",
  "duration_ms": 1234,
  "counts": {"fetched": 0, "inserted": 0, "deduped": 0, "basic_hot": 0, "low_fan_hot": 0, "failed_items": 0, "excluded": 0},
  "error_summary": "string",
  "error_detail": "string"
}
```

### Video
```
{
  "bvid": "BV...",
  "title": "string",
  "up_id": "string",
  "up_name": "string",
  "follower_count": 0,
  "publish_time": "2024-01-01T00:00:00",
  "fetch_time": "2024-01-01T00:00:00",
  "cover_url": "https://...",
  "stats": {"views": 0, "like": 0, "fav": 0, "coin": 0, "reply": 0, "share": 0, "fav_rate": 0, "coin_rate": 0, "reply_rate": 0, "fav_fan_ratio": 0},
  "tags": {"basic_hot": {"is_hit": false, "reason": []}, "low_fan_hot": {"is_hit": false, "reason": []}},
  "source_task_ids": ["uuid"],
  "source_task_names": ["string"],
  "process_status": "todo|done",
  "note": "string"
}
```

### Subtitle
```
{
  "bvid": "BV...",
  "status": "none|extracting|done|failed",
  "text": "string",
  "format": "txt",
  "updated_at": "2024-01-01T00:00:00",
  "error": "string"
}
```

### Alert
```
{
  "id": 1,
  "task_id": "uuid",
  "type": "task_failure",
  "level": "warning",
  "title": "string",
  "message": "string",
  "meta": {},
  "created_at": "2024-01-01T00:00:00",
  "read_at": "2024-01-01T00:00:00"
}
```

### Settings
```
{
  "rate_limit_per_sec": 1,
  "retry_times": 2,
  "timeout_seconds": 10,
  "alert_consecutive_failures": 3
}
```

### Template
```
{
  "id": 1,
  "name": "string",
  "industry": "string",
  "strength": "light|balanced|strong",
  "rules": {},
  "created_at": "2024-01-01T00:00:00",
  "updated_at": "2024-01-01T00:00:00"
}
```

---

## Health

- `GET /health`
  - 返回：`{"status":"ok"}`

## Metrics

- `GET /metrics/overview`
  - 返回：
    - `today_new_videos`, `today_basic_hot`, `today_low_fan_hot`
    - `failed_tasks`, `success_rate`, `last_run_time`

- `GET /metrics/trends?days=7`
  - days: 3~30
  - 返回：`{ "days": 7, "series": [{"date":"2024-01-01","new_videos":0,"basic_hot":0,"low_fan_hot":0,"runs":0,"success_runs":0}] }`

- `GET /metrics/task_rank?days=7`
  - days: 3~30
  - 返回：`{ "days": 7, "items": [{"task_id":"uuid","task_name":"string","videos":0,"basic_hot":0,"low_fan_hot":0}] }`

## Tasks

- `GET /tasks`
  - Query：`status`, `q`, `page`, `page_size`
  - 返回：分页 `Task`

- `GET /tasks/summary?ids=uuid,uuid`
  - 返回：`{ "items": [{"task_id":"uuid","today_new":0,"today_basic":0,"today_low":0,"success_rate_7d":0,"last_run_time":null,"last_run_status":null,"last_run_duration_ms":null}] }`

- `POST /tasks`
  - Body：`Task`（不含 id、status 等系统字段）
  - 备注：`keywords` 不能为空，否则 400
  - 返回：`Task`

- `GET /tasks/{task_id}`
  - 返回：`Task`

- `PUT /tasks/{task_id}`
  - Body：`Task` 的可选字段
  - 返回：`Task`

- `POST /tasks/{task_id}/enable`
- `POST /tasks/{task_id}/disable`
  - 返回：`Task`

- `POST /tasks/{task_id}/run?async_run=false`
  - 返回：`{"run_id":"uuid","async":false}`

- `POST /tasks/{task_id}/dry-run?limit=20`
  - 返回：`{ "counts": {...}, "samples": [...], "errors": [...] }`

- `POST /tasks/{task_id}/clone`
  - 返回：`{"new_task_id":"uuid"}`

- `DELETE /tasks/{task_id}`
  - 返回：`{"ok":true|false}`

- `GET /tasks/{task_id}/runs`
  - Query：`page`, `page_size`
  - 返回：分页 `Run`

## Runs

- `GET /runs/{run_id}`
  - 返回：`Run`

- `POST /runs/{run_id}/retry?async_run=false`
  - 返回：`{"run_id":"uuid","async":false}`

## Videos

- `GET /videos`
  - Query：
    - `task_id`, `tag=basic_hot|low_fan_hot`, `process_status=todo|done`
    - `publish_from`, `publish_to`, `fetch_from`, `fetch_to`（ISO8601）
    - `min_views`, `min_fav`, `min_coin`, `min_reply`
    - `min_fav_rate`, `min_coin_rate`, `min_reply_rate`, `min_fav_fan_ratio`
    - `fan_max`
    - `sort=views|fav|coin|reply|fav_rate|coin_rate|reply_rate|fav_fan_ratio|publish_time|fetch_time`
    - `page`, `page_size`
  - 返回：分页 `Video`

- `GET /videos/export`
  - Query：同 `/videos`，额外支持：
    - `bvids=BV1,BV2`
    - `fields=bvid,title,...`
    - `include_missing=true|false`
  - 返回：CSV 文件（`text/csv`）

- `POST /videos/process_status/batch`
  - Body：`{"bvids":["BV..."],"process_status":"todo|done"}`
  - 返回：`{"ok":true,"updated":1}`

- `POST /videos/subtitle/extract/batch`
  - Body：`{"bvids":["BV..."]}`
  - 返回：`{"ok":true,"updated":1,"failed":[{"bvid":"BV...","reason":"subtitle not found"}],"total":2}`

- `GET /videos/cover/download/batch?bvids=BV1,BV2`
  - 返回：ZIP 文件（`application/zip`）

- `GET /videos/{bvid}`
  - 返回：`Video`

- `POST /videos/{bvid}/process_status`
  - Body：`{"process_status":"todo|done"}`
  - 返回：`{"ok":true}`

- `POST /videos/{bvid}/note`
  - Body：`{"note":"string"}`
  - 返回：`{"ok":true}`

- `POST /videos/{bvid}/subtitle/extract`
  - 返回：`{"status":"done|failed|extracting"}`

- `GET /videos/{bvid}/subtitle`
  - 返回：`Subtitle`

- `GET /videos/{bvid}/cover/download`
  - 返回：图片文件

## Alerts

- `GET /alerts`
  - Query：`unread=true|false`, `page`, `page_size`
  - 返回：分页 `Alert`

- `POST /alerts/{alert_id}/read`
  - 返回：`{"ok":true|false}`

- `POST /alerts/mark_all_read`
  - 返回：`{"ok":true,"count":N}`

- `GET /alerts/unread_count`
  - 返回：`{"count":N}`

## Settings

- `GET /settings`
  - 返回：`Settings`

- `PUT /settings`
  - Body：`Settings` 可选字段
  - 返回：`Settings`

## Templates

- `GET /templates/tasks`
  - 返回：`{"items":[Template]}`

- `POST /templates/tasks`
  - Body：`Template`（不含 id/时间）
  - 返回：`Template`

- `PUT /templates/tasks/{template_id}`
  - Body：`Template` 可选字段
  - 返回：`Template`

- `DELETE /templates/tasks/{template_id}`
  - 返回：`{"ok":true|false}`
