import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union

from .config import logger
from .connection import get_db_connection
from .migrations import ensure_table_columns
from .users import UserDB


class ChatLogDB:
    @staticmethod
    def _ensure_chat_schema(conn):
        """确保聊天相关的表结构与索引存在。"""
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_logs'")
        table_exists = cursor.fetchone() is not None

        if table_exists:
            try:
                ensure_table_columns(conn, 'chat_logs', {
                    'thread_id': 'TEXT',
                    'tool_call_id': 'TEXT'
                })
            except Exception as exc:
                logger.warning("确保 chat_logs schema 时出错: %s", exc)

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_threads (
                id TEXT PRIMARY KEY,
                student_id TEXT,
                user_id INTEGER,
                title TEXT,
                first_message_preview TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_archived INTEGER DEFAULT 0,
                metadata TEXT,
                FOREIGN KEY (student_id) REFERENCES users (id),
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_threads_user_id ON chat_threads(user_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_threads_student_id ON chat_threads(student_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_threads_last_active ON chat_threads(last_message_at DESC)')

        if table_exists:
            try:
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_logs_thread_id ON chat_logs(thread_id)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_logs_tool_call_id ON chat_logs(tool_call_id)')
            except Exception as exc:
                logger.warning("创建 chat_logs 索引时出错: %s", exc)

        conn.commit()

    PREVIEW_LIMIT = 8

    @staticmethod
    def _resolve_user_identifier(user_identifier: Optional[Union[str, int]]) -> Optional[Dict[str, Any]]:
        if user_identifier is None:
            return None
        return UserDB.resolve_user_reference(user_identifier)

    @staticmethod
    def _owner_clause(user_ref: Optional[Dict[str, Any]]) -> Tuple[str, List[Any]]:
        if not user_ref:
            return "", []
        return (
            "((user_id IS NOT NULL AND user_id = ?) OR (student_id IS NOT NULL AND student_id = ?))",
            [user_ref['user_id'], user_ref['student_id']]
        )

    @staticmethod
    def _normalize_preview(text: Optional[str]) -> Optional[str]:
        if not text:
            return None
        trimmed = str(text).strip().replace('\r', ' ').replace('\n', ' ')
        if not trimmed:
            return None
        return trimmed[:ChatLogDB.PREVIEW_LIMIT]

    @staticmethod
    def _fetch_thread_for_user(cursor, thread_id: str, user_ref: Optional[Dict[str, Any]]):
        if not thread_id or not user_ref:
            return None
        cursor.execute('''
            SELECT * FROM chat_threads
            WHERE id = ?
              AND (
                    (user_id IS NOT NULL AND user_id = ?)
                 OR (student_id IS NOT NULL AND student_id = ?)
              )
            LIMIT 1
        ''', (thread_id, user_ref['user_id'], user_ref['student_id']))
        row = cursor.fetchone()
        return dict(row) if row else None

    @staticmethod
    def create_thread(user_identifier: Union[str, int], title: Optional[str] = None) -> Dict[str, Any]:
        user_ref = ChatLogDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            raise ValueError("无法解析用户身份，不能创建会话")

        thread_id = str(uuid.uuid4())
        normalized_title = title.strip() if isinstance(title, str) and title.strip() else None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            ChatLogDB._ensure_chat_schema(conn)
            cursor.execute('''
                INSERT INTO chat_threads (id, student_id, user_id, title)
                VALUES (?, ?, ?, ?)
            ''', (thread_id, user_ref['student_id'], user_ref['user_id'], normalized_title))
            conn.commit()
        return ChatLogDB.get_thread_for_user(user_identifier, thread_id)

    @staticmethod
    def rename_thread(user_identifier: Union[str, int], thread_id: str, title: str) -> bool:
        user_ref = ChatLogDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            return False
        normalized_title = title.strip() if isinstance(title, str) else None
        if normalized_title == "":
            normalized_title = None

        with get_db_connection() as conn:
            cursor = conn.cursor()
            ChatLogDB._ensure_chat_schema(conn)
            clause, params = ChatLogDB._owner_clause(user_ref)
            if not clause:
                return False
            cursor.execute(f'''
                UPDATE chat_threads
                SET title = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND {clause}
            ''', (normalized_title, thread_id, *params))
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def list_threads(user_identifier: Union[str, int], limit: int = 50) -> List[Dict[str, Any]]:
        user_ref = ChatLogDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            return []

        with get_db_connection() as conn:
            cursor = conn.cursor()
            ChatLogDB._ensure_chat_schema(conn)
            cursor.execute('''
                SELECT *
                FROM chat_threads
                WHERE (user_id = ? OR student_id = ?)
                ORDER BY last_message_at DESC, updated_at DESC
                LIMIT ?
            ''', (user_ref['user_id'], user_ref['student_id'], limit))
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_thread_for_user(user_identifier: Union[str, int], thread_id: str) -> Optional[Dict[str, Any]]:
        user_ref = ChatLogDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            return None

        with get_db_connection() as conn:
            cursor = conn.cursor()
            ChatLogDB._ensure_chat_schema(conn)
            return ChatLogDB._fetch_thread_for_user(cursor, thread_id, user_ref)

    @staticmethod
    def get_thread_messages(user_identifier: Union[str, int], thread_id: str, limit: int = 500) -> List[Dict[str, Any]]:
        user_ref = ChatLogDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            return []

        with get_db_connection() as conn:
            cursor = conn.cursor()
            ChatLogDB._ensure_chat_schema(conn)
            thread = ChatLogDB._fetch_thread_for_user(cursor, thread_id, user_ref)
            if not thread:
                return []
            cursor.execute('''
                SELECT *
                FROM chat_logs
                WHERE thread_id = ?
                ORDER BY timestamp ASC, id ASC
                LIMIT ?
            ''', (thread_id, limit))
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def add_log(
        user_identifier: Optional[Union[str, int]],
        role: str,
        content: str,
        thread_id: Optional[str] = None,
        tool_call_id: Optional[str] = None
    ):
        user_ref = ChatLogDB._resolve_user_identifier(user_identifier)

        with get_db_connection() as conn:
            cursor = conn.cursor()
            ChatLogDB._ensure_chat_schema(conn)
            if thread_id:
                if not user_ref:
                    raise ValueError("需要登录才能写入指定会话")
                if not ChatLogDB._fetch_thread_for_user(cursor, thread_id, user_ref):
                    raise ValueError("会话不存在或无权限访问")

            cursor.execute('''
                INSERT INTO chat_logs (student_id, user_id, thread_id, tool_call_id, role, content)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                user_ref['student_id'] if user_ref else None,
                user_ref['user_id'] if user_ref else None,
                thread_id,
                tool_call_id,
                role,
                content
            ))

            if thread_id:
                cursor.execute('''
                    UPDATE chat_threads
                    SET updated_at = CURRENT_TIMESTAMP,
                        last_message_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (thread_id,))
                if role == 'user':
                    preview = ChatLogDB._normalize_preview(content)
                    if preview:
                        cursor.execute('''
                            UPDATE chat_threads
                            SET first_message_preview = CASE
                                WHEN first_message_preview IS NULL OR TRIM(first_message_preview) = '' THEN ?
                                ELSE first_message_preview
                            END
                            WHERE id = ?
                        ''', (preview, thread_id))
            conn.commit()

    @staticmethod
    def get_recent_logs(
        user_identifier: Optional[Union[str, int]],
        limit: int = 50,
        thread_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        user_ref = ChatLogDB._resolve_user_identifier(user_identifier)

        with get_db_connection() as conn:
            cursor = conn.cursor()
            ChatLogDB._ensure_chat_schema(conn)
            if thread_id:
                if not user_ref:
                    return []
                if not ChatLogDB._fetch_thread_for_user(cursor, thread_id, user_ref):
                    return []
                cursor.execute('''
                    SELECT *
                    FROM chat_logs
                    WHERE thread_id = ?
                    ORDER BY timestamp DESC, id DESC
                    LIMIT ?
                ''', (thread_id, limit))
            elif user_ref:
                cursor.execute('''
                    SELECT *
                    FROM chat_logs
                    WHERE (user_id = ? OR student_id = ?)
                    ORDER BY timestamp DESC, id DESC
                    LIMIT ?
                ''', (user_ref['user_id'], user_ref['student_id'], limit))
            else:
                cursor.execute('''
                    SELECT *
                    FROM chat_logs
                    WHERE student_id IS NULL AND user_id IS NULL
                    ORDER BY timestamp DESC, id DESC
                    LIMIT ?
                ''', (limit,))
            return [dict(row) for row in cursor.fetchall()]


def cleanup_old_chat_logs():
    """清理7天前的聊天记录和关联的会话标题等信息。"""
    cutoff_date = datetime.now() - timedelta(days=7)
    cutoff_str = cutoff_date.strftime("%Y-%m-%d %H:%M:%S")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            ChatLogDB._ensure_chat_schema(conn)
        except Exception as exc:
            logger.warning("清理聊天记录前确保表结构失败: %s", exc)

        cursor.execute('DELETE FROM chat_logs WHERE timestamp < ?', (cutoff_str,))
        deleted_logs = cursor.rowcount or 0

        cursor.execute(
            '''
            DELETE FROM chat_threads
            WHERE
                (last_message_at IS NOT NULL AND last_message_at < ?)
                OR (
                    created_at < ?
                    AND id NOT IN (
                        SELECT DISTINCT thread_id
                        FROM chat_logs
                        WHERE thread_id IS NOT NULL
                    )
                )
            ''',
            (cutoff_str, cutoff_str)
        )
        deleted_threads = cursor.rowcount or 0

        conn.commit()
        logger.info("清理了 %s 条过期聊天记录，移除 %s 条过期会话", deleted_logs, deleted_threads)
        return {
            "deleted_logs": deleted_logs,
            "deleted_threads": deleted_threads
        }
