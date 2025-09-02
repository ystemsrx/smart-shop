#!/bin/bash
# 一键构建并后台启动前端服务

cd "$(dirname "$0")"

# 构建项目（前台执行，便于查看构建日志）
npm run build

# 后台启动服务
nohup npm start > frontend.log 2>&1 &

echo "前端服务已在后台启动，日志请查看 frontend.log"