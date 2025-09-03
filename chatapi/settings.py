# /mnt/shop/chatapi/settings.py
import os

# 上游大模型（BigModel GLM）配置
BIGMODEL_API_URL = os.getenv("BIGMODEL_API_URL", "https://open.bigmodel.cn/api/paas/v4/chat/completions")
BIGMODEL_API_KEY = os.getenv("BIGMODEL_API_KEY", "")  # 必填：在 start_api.sh 中导出
BIGMODEL_MODEL   = os.getenv("BIGMODEL_MODEL", "glm-4.5-flash")

# 模型故障转移配置
FALLBACK_MODELS = [
    {"model": "glm-4.5-flash", "supports_thinking": True},
    {"model": "glm-4-flash-250414", "supports_thinking": False},
    {"model": "glm-4-flash", "supports_thinking": False}
]

# 监听地址/端口（与 Nginx 反代一致）
BIND_HOST = os.getenv("BIND_HOST", "127.0.0.1")
BIND_PORT = int(os.getenv("BIND_PORT", "9099"))

# CORS
CORS_ALLOW_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")

# Redis 会话（可选；多进程/多机建议开启）
REDIS_URL = os.getenv("REDIS_URL", "")  # e.g. redis://127.0.0.1:6379/0

# 连接池
MAX_CONNECTIONS = int(os.getenv("MAX_CONNECTIONS", "200"))
MAX_KEEPALIVE   = int(os.getenv("MAX_KEEPALIVE", "50"))

# 会话 TTL（秒）
SESSION_TTL = int(os.getenv("SESSION_TTL", "7200"))  # 2 小时

# 系统提示词配置
SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT", """
你是一个智能购物助手，你的名字是L。
""")
