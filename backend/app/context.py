import logging
import os
from typing import List, Tuple

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import get_settings


settings = get_settings()

# Logging configuration
log_level = settings.log_level.upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

auth_logger = logging.getLogger("auth")
auth_logger.setLevel(getattr(logging, log_level, logging.INFO))

logger = logging.getLogger(__name__)

# CORS/static configuration
ALLOWED_ORIGINS = settings.allowed_origins
STATIC_ALLOWED_ORIGINS = [origin for origin in ALLOWED_ORIGINS if origin != "*"]
ALLOW_ALL_ORIGINS = "*" in ALLOWED_ORIGINS
STATIC_CACHE_MAX_AGE = settings.static_cache_max_age

# Paths
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROJECT_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
ITEMS_DIR = os.path.join(BACKEND_DIR, "items")
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "public")
EXPORTS_DIR = os.path.join(BACKEND_DIR, "exports")

for folder in (ITEMS_DIR, PUBLIC_DIR, EXPORTS_DIR):
    os.makedirs(folder, exist_ok=True)


class CachedStaticFiles(StaticFiles):
    def __init__(self, *args, max_age: int = STATIC_CACHE_MAX_AGE, **kwargs):
        super().__init__(*args, **kwargs)
        self._max_age = max_age

    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        if hasattr(resp, "headers") and resp.status_code == 200:
            resp.headers["Cache-Control"] = f"public, max-age={self._max_age}, immutable"
            try:
                origin = None
                for key, value in scope.get("headers", []):
                    if key.decode().lower() == "origin":
                        origin = value.decode()
                        break
                allowed = STATIC_ALLOWED_ORIGINS
                if origin and origin in allowed:
                    resp.headers["Access-Control-Allow-Origin"] = origin
                    resp.headers["Vary"] = "Origin"
                elif ALLOW_ALL_ORIGINS:
                    resp.headers["Access-Control-Allow-Origin"] = "*"
                    resp.headers.pop("Vary", None)
                else:
                    resp.headers["Access-Control-Allow-Origin"] = "*"
                    resp.headers.pop("Vary", None)
                resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
                resp.headers["Access-Control-Allow-Headers"] = "*"
            except Exception:
                pass
        return resp


def _cors_config() -> Tuple[List[str], bool]:
    allow_origins = ["*"] if ALLOW_ALL_ORIGINS else ALLOWED_ORIGINS
    allow_credentials = not ALLOW_ALL_ORIGINS
    if ALLOW_ALL_ORIGINS and not allow_credentials:
        logger.warning("检测到通配符跨域设置，已禁用凭据共享以符合CORS规范。")
    return allow_origins, allow_credentials


def apply_cors(app: FastAPI) -> Tuple[List[str], bool]:
    allow_origins, allow_credentials = _cors_config()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "Content-Length", "Content-Type"],
    )
    return allow_origins, allow_credentials


def mount_static(app: FastAPI, allow_origins: List[str], allow_credentials: bool) -> None:
    static_app = CachedStaticFiles(directory=ITEMS_DIR, max_age=STATIC_CACHE_MAX_AGE)
    static_cors = CORSMiddleware(
        static_app,
        allow_origins=allow_origins,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
        allow_credentials=allow_credentials,
        expose_headers=["Content-Length", "Content-Type"],
    )
    app.mount("/items", static_cors, name="items")

    public_static = CachedStaticFiles(directory=PUBLIC_DIR, max_age=STATIC_CACHE_MAX_AGE)
    public_cors = CORSMiddleware(
        public_static,
        allow_origins=allow_origins,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
        allow_credentials=allow_credentials,
        expose_headers=["Content-Length", "Content-Type"],
    )
    app.mount("/public", public_cors, name="public")


def create_app(*, lifespan=None) -> FastAPI:
    app = FastAPI(
        title="智能商城API",
        description="基于FastAPI的宿舍智能小商城后端系统",
        version="1.0.0",
        lifespan=lifespan,
    )
    allow_origins, allow_credentials = apply_cors(app)
    mount_static(app, allow_origins, allow_credentials)
    return app
