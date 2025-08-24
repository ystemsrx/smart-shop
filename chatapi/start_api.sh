#!/usr/bin/env bash
set -euo pipefail

# ====== 配置区（请按需修改） ======
APP_DIR="/mnt/shop/chatapi"
VENV_DIR="$APP_DIR/.venv"

# 上游大模型凭据（必填）
export BIGMODEL_API_KEY="YOUR_API_KEY"
export BIGMODEL_API_URL="https://open.bigmodel.cn/api/paas/v4/chat/completions"
export BIGMODEL_MODEL="glm-4.5-flash"

# 监听地址与端口（与 Nginx 反代一致）
export BIND_HOST="127.0.0.1"
export BIND_PORT="9099"

# 可选：Redis（多进程/多机强烈建议）
# export REDIS_URL="redis://127.0.0.1:6379/0"

# ====== 安装依赖与启动 ======
mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
pip install -r requirements.txt

# 性能：多进程 + UVLoop；如有 Redis，跨进程共享会话更稳
# workers 可按 CPU 核心调整
LOGFILE="$APP_DIR/relay.log"
# 以新会话/进程组方式启动，并记录父进程 PID
nohup setsid uvicorn app:app --host "$BIND_HOST" --port "$BIND_PORT" --workers 2 --proxy-headers > "$LOGFILE" 2>&1 &
echo $! > "$APP_DIR/relay.pid"
echo "Relay started on ${BIND_HOST}:${BIND_PORT}, logs: $LOGFILE (pid $(cat $APP_DIR/relay.pid))"

