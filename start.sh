#!/bin/zsh
set -e

ROOT="/Users/fangyaxin/qa-community/Bilibili-admin-xin-"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo "[1/4] 启动后端..."
cd "$BACKEND"
if ! command -v python3 >/dev/null 2>&1; then
  echo "未检测到 python3，请先安装 Python 3"
  exit 1
fi
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip -q install -r requirements.txt

if ! lsof -nP -iTCP:6379 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[0/4] 启动 Redis..."
  if command -v redis-server >/dev/null 2>&1; then
    nohup redis-server >/tmp/bili-redis.log 2>&1 &
    sleep 1
  else
    echo "未检测到 redis-server，请先安装并启动 Redis（端口 6379）"
    exit 1
  fi
fi

nohup uvicorn app.main:app --host 127.0.0.1 --port 8000 >/tmp/bili-backend.log 2>&1 &
nohup celery -A app.workers.celery_app.celery_app worker -l info --without-mingle --without-gossip >/tmp/bili-worker.log 2>&1 &

echo "[2/4] 启动前端..."
cd "$FRONTEND"
npm install --silent
nohup npm run dev -- --host 127.0.0.1 --port 5173 >/tmp/bili-frontend.log 2>&1 &

echo "[3/4] 等待服务就绪..."
sleep 2

echo "[4/4] 打开页面..."
open http://127.0.0.1:5173/videos
echo "启动完成：前端 http://127.0.0.1:5173/videos ，后端 http://127.0.0.1:8000 ，worker 已启动"
