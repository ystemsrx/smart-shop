import sqlite3
from contextlib import contextmanager
from typing import Any, Optional, Tuple

from .config import DB_PATH, logger


@contextmanager
def get_db_connection():
    """获取数据库连接的上下文管理器。"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    except Exception as exc:
        conn.rollback()
        logger.error("Database operation failed: %s", exc)
        raise
    finally:
        conn.close()


def safe_execute_with_migration(conn, sql: str, params: Tuple[Any, ...] = (), table_name: Optional[str] = None):
    """
    安全执行SQL，如果遇到列不存在的错误，会尝试自动迁移后重新执行。
    """
    cursor = conn.cursor()
    try:
        cursor.execute(sql, params)
        return cursor
    except sqlite3.OperationalError as exc:
        error_msg = str(exc).lower()
        if 'no such column' in error_msg or 'has no column named' in error_msg:
            logger.warning("Detected missing-column error: %s", exc)
            try:
                from .migrations import auto_migrate_database

                auto_migrate_database(conn)
                cursor.execute(sql, params)
                logger.info("SQL retried successfully after auto-migration")
                return cursor
            except Exception as migration_error:
                logger.error("Auto-migration failed: %s", migration_error)
                raise exc
        raise exc
