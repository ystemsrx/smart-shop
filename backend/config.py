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

# 在Windows上，需要特别处理编码问题
import platform
is_windows = platform.system() == "Windows"

for candidate in _env_candidates:
    if candidate.exists():
        if is_windows:
            # 在Windows上，先尝试用UTF-8读取，如果失败则用其他编码
            try:
                load_dotenv(dotenv_path=candidate, override=False, encoding='utf-8')
            except UnicodeDecodeError:
                try:
                    load_dotenv(dotenv_path=candidate, override=False, encoding='gbk')
                except UnicodeDecodeError:
                    load_dotenv(dotenv_path=candidate, override=False, encoding='cp1252')
        else:
            load_dotenv(dotenv_path=candidate, override=False, encoding='utf-8')

# 最后尝试从当前目录加载
if is_windows:
    try:
        load_dotenv(override=False, encoding='utf-8')
    except UnicodeDecodeError:
        try:
            load_dotenv(override=False, encoding='gbk')
        except UnicodeDecodeError:
            load_dotenv(override=False, encoding='cp1252')
else:
    load_dotenv(override=False, encoding='utf-8')


def _strip_quotes(value: str | None) -> str | None:
    """去除环境变量值首尾的引号（单引号或双引号）"""
    if not value:
        return value
    value = value.strip()
    if len(value) >= 2:
        if (value[0] == '"' and value[-1] == '"') or (value[0] == "'" and value[-1] == "'"):
            return value[1:-1]
    return value


def _split_csv(value: str | None) -> List[str]:
    """分割CSV字符串，同时去除每个值的引号"""
    value = _strip_quotes(value)
    if not value:
        return []
    # 分割后，对每个项目也去除可能的引号
    return [_strip_quotes(item.strip()) or item.strip() for item in value.split(",") if item.strip()]


def _as_int(value: str | None, default: int) -> int:
    try:
        return int(value) if value is not None else default
    except ValueError:
        return default


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _safe_decode_string(value: str | None) -> str:
    """安全解码字符串，处理可能的编码问题"""
    if not value:
        return ""
    
    # 如果已经是正确的字符串，直接返回
    if isinstance(value, str):
        # 检查是否包含明显的编码错误字符
        if "闆堕" in value or "\ue5e4" in value:
            # 这是典型的UTF-8被错误解释的情况
            try:
                # 尝试将字符串编码为latin-1，然后解码为UTF-8
                # 这可以修复UTF-8字节被错误解释为Windows-1252的问题
                fixed_bytes = value.encode('latin-1')
                return fixed_bytes.decode('utf-8')
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
            
            try:
                # 另一种尝试：直接替换已知的错误字符
                # "闆堕\ue5e4" 应该是 "零食"
                if "闆堕\ue5e4" in value:
                    return value.replace("闆堕\ue5e4", "零食")
            except Exception:
                pass
        
        try:
            # 验证字符串的完整性
            encoded = value.encode('utf-8')
            decoded = encoded.decode('utf-8')
            return decoded
        except (UnicodeEncodeError, UnicodeDecodeError):
            # 如果出现编码错误，尝试其他处理方式
            try:
                # 尝试使用latin-1编码再解码为UTF-8
                if isinstance(value, str):
                    encoded_bytes = value.encode('latin-1')
                    return encoded_bytes.decode('utf-8')
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
    
    # 如果所有尝试都失败，返回清理后的字符串
    return str(value).strip()


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
    label: str
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
    redis_url: str
    login_api: str
    admin_accounts: List[AdminAccount]
    allowed_origins: List[str]
    static_cache_max_age: int
    api_key: str
    api_url: str
    model_order: List[ModelConfig]
    enable_password_hash: bool


@lru_cache()
def get_settings() -> Settings:
    env_value = _normalize_env(_strip_quotes(os.getenv("ENV")))
    is_development = env_value == "development"

    backend_host = _strip_quotes(os.getenv("DEV_BACKEND_HOST")) if is_development else _strip_quotes(os.getenv("BACKEND_HOST"))
    backend_host = (backend_host or "0.0.0.0").strip()

    backend_port = _as_int(_strip_quotes(os.getenv("BACKEND_PORT")), 9099)
    dev_port = _as_int(_strip_quotes(os.getenv("DEV_BACKEND_PORT")), backend_port)
    port = dev_port if is_development else backend_port

    log_level_key = "DEV_LOG_LEVEL" if is_development else "LOG_LEVEL"
    log_level = (_strip_quotes(os.getenv(log_level_key)) or _strip_quotes(os.getenv("LOG_LEVEL")) or "INFO").upper()

    db_path_value = (_strip_quotes(os.getenv("DB_PATH")) or "dorm_shop.db").strip()
    db_path = Path(db_path_value)
    if not db_path.is_absolute():
        db_path = BASE_DIR / db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)

    db_reset = _as_bool(_strip_quotes(os.getenv("DB_RESET")), False)

    jwt_secret = _strip_quotes(os.getenv("JWT_SECRET_KEY"))
    if not jwt_secret:
        import secrets

        jwt_secret = secrets.token_hex(32)

    jwt_algorithm = (_strip_quotes(os.getenv("JWT_ALGORITHM")) or "HS256").strip() or "HS256"
    access_days = _as_int(_strip_quotes(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS")), 30)

    login_api = _strip_quotes(os.getenv("LOGIN_API"))
    if not login_api:
        raise RuntimeError("LOGIN_API environment variable is required")
    redis_url = (_strip_quotes(os.getenv("REDIS_URL")) or "redis://127.0.0.1:6379/0").strip()

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

    cache_max_age = _as_int(_strip_quotes(os.getenv("STATIC_CACHE_MAX_AGE")), 60 * 60 * 24 * 30)

    raw_shop_name = _strip_quotes(os.getenv("SHOP_NAME"))
    shop_name = _safe_decode_string(raw_shop_name)
    if not shop_name:
        raise RuntimeError("SHOP_NAME environment variable is required")

    api_key = _strip_quotes(os.getenv("API_KEY"))
    if not api_key:
        raise RuntimeError("API_KEY environment variable is required")
    
    api_url = _strip_quotes(os.getenv("API_URL"))
    if not api_url:
        raise RuntimeError("API_URL environment variable is required")

    model_names = _split_csv(os.getenv("MODEL"))
    model_labels = _split_csv(os.getenv("MODEL_NAME"))
    if not model_names:
        raise RuntimeError("MODEL environment variable must provide at least one model")
    if not model_labels:
        raise RuntimeError("MODEL_NAME environment variable must provide display names for models")
    if len(model_names) != len(model_labels):
        raise RuntimeError("MODEL and MODEL_NAME must contain the same number of entries")

    supports_thinking_raw = {name.strip().lower() for name in _split_csv(os.getenv("SUPPORTS_THINKING"))}
    model_order = []
    for model, label in zip(model_names, model_labels):
        supports_thinking = model.strip().lower() in supports_thinking_raw
        model_order.append(ModelConfig(name=model, label=label, supports_thinking=supports_thinking))

    # 密码加密开关（默认启用）
    enable_password_hash = _as_bool(_strip_quotes(os.getenv("ENABLE_PASSWORD_HASH")), True)

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
        redis_url=redis_url,
        login_api=login_api,
        admin_accounts=admin_accounts,
        allowed_origins=allowed_origins,
        static_cache_max_age=cache_max_age,
        api_key=api_key,
        api_url=api_url,
        model_order=model_order,
        enable_password_hash=enable_password_hash,
    )


__all__ = ["AdminAccount", "ModelConfig", "Settings", "get_settings"]
