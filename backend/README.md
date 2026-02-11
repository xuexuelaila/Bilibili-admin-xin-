# Backend

## 运行

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
uvicorn app.main:app --reload
```

## 注意
- 默认使用 `MockBiliClient`，不会真正抓取 B 站数据。需要接入真实抓取时，替换 `app/services/bili_client.py`。
- 爬虫模式：设置 `.env` 中 `BILI_CLIENT=crawler`，可选配置 `BILI_COOKIES` 与 `BILI_USER_AGENT`（必要时提高成功率）。

## Celery Worker

```bash
celery -A app.workers.celery_app.celery_app worker -l info
celery -A app.workers.celery_app.celery_app beat -l info
```
