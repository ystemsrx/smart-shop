"""Utility script to reset and bootstrap the SQLite database via env-driven settings."""

from __future__ import annotations

import logging
from pathlib import Path

from config import get_settings
from database import init_database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()


def reset_database() -> None:
    """Delete the existing database (if any) and rebuild it using init_database()."""
    db_path: Path = settings.db_path

    if db_path.exists():
        logger.info("删除旧数据库文件: %s", db_path)
        db_path.unlink()
    else:
        logger.info("未发现旧数据库文件，将创建新数据库: %s", db_path)

    db_path.parent.mkdir(parents=True, exist_ok=True)

    # 运行正式初始化流程（包含结构迁移与管理员导入）
    init_database()
    logger.info("数据库初始化完成: %s", db_path)


if __name__ == "__main__":
    reset_database()
