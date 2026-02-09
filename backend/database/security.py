import hashlib
from typing import Optional

from passlib.hash import bcrypt

from .config import logger


def hash_password(password: str) -> str:
    """使用 SHA-256 + bcrypt 加密密码。"""
    sha256_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
    return bcrypt.hash(sha256_hash)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码是否匹配。"""
    try:
        sha256_hash = hashlib.sha256(plain_password.encode('utf-8')).hexdigest()
        return bcrypt.verify(sha256_hash, hashed_password)
    except Exception as exc:
        logger.error("Password verification failed: %s", exc)
        return False


def is_password_hashed(password: Optional[str]) -> bool:
    """检测密码是否为 bcrypt 哈希格式。"""
    if not password or len(password) != 60:
        return False
    return password.startswith(('$2a$', '$2b$', '$2x$', '$2y$'))
