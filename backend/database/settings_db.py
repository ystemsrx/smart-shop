from .connection import get_db_connection
from .config import logger


class SettingsDB:
    """简单的键值设置存取。"""

    @staticmethod
    def get(key: str, default=None):
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT value FROM settings WHERE key = ?', (key,))
            row = cursor.fetchone()
            return row[0] if row else default

    @staticmethod
    def set(key: str, value: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                    (key, value)
                )
                conn.commit()
                return True
            except Exception as exc:
                logger.error("Failed to save setting: %s", exc)
                conn.rollback()
                return False
