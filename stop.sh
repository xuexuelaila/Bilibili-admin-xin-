#!/bin/zsh
set -e

echo "停止前端 Vite..."
pkill -f "vite --host 127.0.0.1 --port 5173" || true
pkill -f "npm run dev -- --host 127.0.0.1 --port 5173" || true

echo "停止后端 Uvicorn..."
pkill -f "uvicorn app.main:app --host 127.0.0.1 --port 8000" || true

echo "停止 Celery Worker..."
pkill -f "celery -A app.workers.celery_app.celery_app worker -l info" || true

echo "已停止。"
