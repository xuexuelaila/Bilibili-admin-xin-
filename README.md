# Bilibili-admin

B站爆款视频抓取后台管理系统（v0.1）

说明：当前后端内置 `MockBiliClient`，用于跑通流程，不会真实抓取 B 站数据。
如需爬虫抓取，设置 `backend/.env` 中 `BILI_CLIENT=crawler` 并按需补充 `BILI_COOKIES`。

## 目录结构
- backend/ Python FastAPI + Celery
- frontend/ React + Vite 管理后台
- docs/ 需求与接口文档

## 快速开始

### 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### Celery 定时任务

```bash
cd backend
celery -A app.workers.celery_app.celery_app worker -l info
celery -A app.workers.celery_app.celery_app beat -l info
```
