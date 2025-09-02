#!/bin/bash
# 结束运行在9099端口的进程

PORT=9099

echo "正在查找并结束运行在端口 $PORT 的进程..."

PID=$(lsof -ti tcp:$PORT)

if [ -n "$PID" ]; then
    kill -9 $PID
    echo "已结束进程: $PID"
else
    echo "未找到运行在端口 $PORT 的进程。"