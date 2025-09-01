#!/bin/bash
# /backend/start.sh - 宿舍智能小商城后端启动脚本

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 配置环境变量
export JWT_SECRET_KEY="${JWT_SECRET_KEY:-your-secret-key-change-in-production}"
export BIGMODEL_API_KEY="${BIGMODEL_API_KEY:-your_api_key}"
export BIGMODEL_API_URL="${BIGMODEL_API_URL:-https://open.bigmodel.cn/api/paas/v4/chat/completions}"



# 创建虚拟环境（如果不存在）
if [ ! -d "venv" ]; then
    echo "创建Python虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
echo "安装Python依赖..."
pip install --upgrade pip
pip install -r requirements.txt

# 创建必要目录
mkdir -p items
mkdir -p logs

# 初始化数据库
echo "初始化数据库..."
python database.py

# 启动应用
echo "启动宿舍智能小商城API..."
echo "服务将运行在 http://0.0.0.0:8000"
echo "API文档: http://0.0.0.0:8000/docs"

# 生产环境启动（多进程）
if [ "$ENV" = "production" ]; then
    echo "生产环境模式启动..."
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4 --log-level info
else
    echo "开发环境模式启动..."
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level debug
fi
