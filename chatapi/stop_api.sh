#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/mnt/shop/chatapi"
LOGFILE="$APP_DIR/relay.log"
PID_FILE="$APP_DIR/relay.pid"
PORT="${BIND_PORT:-9099}"   # 如未设置环境变量，则默认 9099

kill_group() {
  local leader_pid="$1"
  if [[ -n "$leader_pid" ]] && ps -p "$leader_pid" >/dev/null 2>&1; then
    local pgid
    pgid=$(ps -o pgid= -p "$leader_pid" | tr -d ' ')
    if [[ -n "$pgid" ]]; then
      echo "[INFO] 停止进程组 PGID=$pgid (leader PID=$leader_pid)"
      # 先温柔，再强制
      kill -TERM "-$pgid" 2>/dev/null || true
      sleep 1
      kill -KILL "-$pgid" 2>/dev/null || true
    fi
  fi
}

# 1) 如果有 pid 文件，按进程组杀掉
if [[ -f "$PID_FILE" ]]; then
  LEADER_PID="$(cat "$PID_FILE" || true)"
  if [[ -n "${LEADER_PID:-}" ]]; then
    kill_group "$LEADER_PID"
  fi
  rm -f "$PID_FILE" || true
fi

# 2) 兜底：杀掉占用端口的进程（防止 pid 文件丢失或异常退出）
PIDS_ON_PORT="$(lsof -t -i :$PORT || true)"
if [[ -n "${PIDS_ON_PORT:-}" ]]; then
  echo "[INFO] 端口 $PORT 仍被占用，兜底清理：$PIDS_ON_PORT"
  kill -TERM $PIDS_ON_PORT 2>/dev/null || true
  sleep 1
  kill -KILL $PIDS_ON_PORT 2>/dev/null || true
fi

echo "[INFO] 已终止 Chat Relay API。日志：$LOGFILE"
