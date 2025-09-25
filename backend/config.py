"""Centralised environment-driven settings for the backend."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable, List

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

# Ensure variables from .env are loaded before anything else reads from os.environ
_env_candidates: Iterable[Path] = (
    PROJECT_ROOT / ".env",
    BASE_DIR / ".env",
)
for candidate in _env_candidates:
    if candidate.exists():
        load_dotenv(dotenv_path=candidate, override=False)
load_dotenv(override=False)


def _split_csv(value: str | None) -> List[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _as_int(value: str | None, default: int) -> int:
    try:
        return int(value) if value is not None else default
    except ValueError:
        return default


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _normalize_env(value: str | None) -> str:
    if not value:
        return "production"
    cleaned = value.strip().lower()
    if cleaned == "devlopment":  # tolerate typo from configuration guidance
        cleaned = "development"
    return cleaned


@dataclass(frozen=True)
class AdminAccount:
    id: str
    password: str
    name: str
    role: str


@dataclass(frozen=True)
class ModelConfig:
    name: str
    supports_thinking: bool


@dataclass(frozen=True)
class Settings:
    env: str
    is_development: bool
    backend_host: str
    backend_port: int
    log_level: str
    db_path: Path
    db_reset: bool
    shop_name: str
    jwt_secret_key: str
    jwt_algorithm: str
    access_token_expire_days: int
    login_api: str
    admin_accounts: List[AdminAccount]
    allowed_origins: List[str]
    static_cache_max_age: int
    api_key: str
    api_url: str
    model_order: List[ModelConfig]


@lru_cache()
def get_settings() -> Settings:
    env_value = _normalize_env(os.getenv("ENV"))
    is_development = env_value == "development"

    backend_host = os.getenv("DEV_BACKEND_HOST") if is_development else os.getenv("BACKEND_HOST")
    backend_host = (backend_host or "0.0.0.0").strip()

    backend_port = _as_int(os.getenv("BACKEND_PORT"), 9099)
    dev_port = _as_int(os.getenv("DEV_BACKEND_PORT"), backend_port)
    port = dev_port if is_development else backend_port

    log_level_key = "DEV_LOG_LEVEL" if is_development else "LOG_LEVEL"
    log_level = (os.getenv(log_level_key) or os.getenv("LOG_LEVEL") or "INFO").upper()

    db_path_value = os.getenv("DB_PATH", "dorm_shop.db").strip()
    db_path = Path(db_path_value)
    if not db_path.is_absolute():
        db_path = BASE_DIR / db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)

    db_reset = _as_bool(os.getenv("DB_RESET"), False)

    jwt_secret = os.getenv("JWT_SECRET_KEY")
    if not jwt_secret:
        import secrets

        jwt_secret = secrets.token_hex(32)

    jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256").strip() or "HS256"
    access_days = _as_int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS"), 30)

    login_api = os.getenv("LOGIN_API")
    if not login_api:
        raise RuntimeError("LOGIN_API environment variable is required")

    usernames = _split_csv(os.getenv("ADMIN_USERNAME"))
    passwords = _split_csv(os.getenv("ADMIN_PASSWORD"))
    display_names = _split_csv(os.getenv("ADMIN_NAME"))
    roles = _split_csv(os.getenv("ADMIN_ROLE"))

    if usernames and len(usernames) != len(passwords):
        raise RuntimeError("ADMIN_USERNAME and ADMIN_PASSWORD must have the same number of entries")

    if not usernames:
        raise RuntimeError("At least one administrator must be configured via ADMIN_USERNAME/ADMIN_PASSWORD")

    admin_accounts: List[AdminAccount] = []
    for index, username in enumerate(usernames):
        password = passwords[index]
        name = display_names[index] if index < len(display_names) else username
        if index < len(roles):
            role = roles[index].strip().lower() or "admin"
        else:
            role = "super_admin" if index == 0 else "admin"
        admin_accounts.append(AdminAccount(id=username, password=password, name=name, role=role))

    allowed_origins = _split_csv(os.getenv("ALLOWED_ORIGINS"))
    if not allowed_origins:
        allowed_origins = ["*"]

    cache_max_age = _as_int(os.getenv("STATIC_CACHE_MAX_AGE"), 60 * 60 * 24 * 30)

    raw_shop_name = os.getenv("SHOP_NAME")
    shop_name = (raw_shop_name or "").strip()
    if not shop_name:
        raise RuntimeError("SHOP_NAME environment variable is required")

    api_key = os.getenv("API_KEY")
    if not api_key:
        raise RuntimeError("API_KEY environment variable is required")
    
    api_url = os.getenv("API_URL")
    if not api_url:
        raise RuntimeError("API_URL environment variable is required")

    model_names = _split_csv(os.getenv("MODEL"))
    if not model_names:
        model_names = ["glm-4.5-flash"]
    thinking_models = {name.lower() for name in _split_csv(os.getenv("BIGMODEL_SUPPORTS_THINKING"))}
    model_order = [
        ModelConfig(name=model, supports_thinking=model.lower() in thinking_models)
        for model in model_names
    ]

    return Settings(
        env=env_value,
        is_development=is_development,
        backend_host=backend_host,
        backend_port=port,
        log_level=log_level,
        db_path=db_path,
        db_reset=db_reset,
        shop_name=shop_name,
        jwt_secret_key=jwt_secret,
        jwt_algorithm=jwt_algorithm,
        access_token_expire_days=access_days,
    login_api=login_api,
        admin_accounts=admin_accounts,
        allowed_origins=allowed_origins,
        static_cache_max_age=cache_max_age,
        api_key=api_key,
        api_url=api_url,
        model_order=model_order,
    )


__all__ = ["AdminAccount", "ModelConfig", "Settings", "get_settings"]
