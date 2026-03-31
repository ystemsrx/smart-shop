import uuid
import json
from typing import Any, Dict, List, Optional

from .config import logger
from .connection import get_db_connection
from .migrations import ensure_table_columns


class StaffChatLogDB:
    """管理员/代理聊天日志数据库。

    与 ChatLogDB 类似，但基于 staff_account_id（管理员表的 id 字段）而非 user_id/student_id。
    """

    PREVIEW_LIMIT = 8

    @staticmethod
    def _ensure_schema(conn):
        """确保工作人员聊天相关的表结构存在。"""
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS staff_chat_threads (
                id TEXT PRIMARY KEY,
                staff_account_id TEXT NOT NULL,
                title TEXT,
                first_message_preview TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_archived INTEGER DEFAULT 0
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_staff_chat_threads_account ON staff_chat_threads(staff_account_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_staff_chat_threads_last ON staff_chat_threads(last_message_at DESC)')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS staff_chat_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                staff_account_id TEXT NOT NULL,
                thread_id TEXT,
                tool_call_id TEXT,
                role TEXT NOT NULL,
                content TEXT,
                thinking_content TEXT,
                thinking_duration REAL,
                is_thinking_stopped INTEGER DEFAULT 0,
                is_error INTEGER DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_staff_chat_logs_account ON staff_chat_logs(staff_account_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_staff_chat_logs_thread ON staff_chat_logs(thread_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_staff_chat_logs_tool_call ON staff_chat_logs(tool_call_id)')

        conn.commit()

    @staticmethod
    def _normalize_preview(text: Optional[str]) -> Optional[str]:
        if not text:
            return None
        trimmed = str(text).strip().replace('\r', ' ').replace('\n', ' ')
        if not trimmed:
            return None
        return trimmed[:StaffChatLogDB.PREVIEW_LIMIT]

    @staticmethod
    def create_thread(staff_account_id: str, title: Optional[str] = None) -> Dict[str, Any]:
        thread_id = str(uuid.uuid4())
        normalized_title = title.strip() if isinstance(title, str) and title.strip() else None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            StaffChatLogDB._ensure_schema(conn)
            cursor.execute('''
                INSERT INTO staff_chat_threads (id, staff_account_id, title)
                VALUES (?, ?, ?)
            ''', (thread_id, staff_account_id, normalized_title))
            conn.commit()
        return StaffChatLogDB.get_thread_for_staff(staff_account_id, thread_id)

    @staticmethod
    def rename_thread(staff_account_id: str, thread_id: str, title: str) -> bool:
        normalized_title = title.strip() if isinstance(title, str) else None
        if normalized_title == "":
            normalized_title = None

        with get_db_connection() as conn:
            cursor = conn.cursor()
            StaffChatLogDB._ensure_schema(conn)
            cursor.execute('''
                UPDATE staff_chat_threads
                SET title = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND staff_account_id = ?
            ''', (normalized_title, thread_id, staff_account_id))
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def list_threads(staff_account_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            StaffChatLogDB._ensure_schema(conn)
            cursor.execute('''
                SELECT *
                FROM staff_chat_threads
                WHERE staff_account_id = ?
                ORDER BY last_message_at DESC, updated_at DESC
                LIMIT ?
            ''', (staff_account_id, limit))
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_thread_for_staff(staff_account_id: str, thread_id: str) -> Optional[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            StaffChatLogDB._ensure_schema(conn)
            cursor.execute('''
                SELECT * FROM staff_chat_threads
                WHERE id = ? AND staff_account_id = ?
                LIMIT 1
            ''', (thread_id, staff_account_id))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def get_thread_messages(staff_account_id: str, thread_id: str, limit: int = 500) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            StaffChatLogDB._ensure_schema(conn)
            # 验证线程归属
            cursor.execute('''
                SELECT id FROM staff_chat_threads
                WHERE id = ? AND staff_account_id = ?
            ''', (thread_id, staff_account_id))
            if not cursor.fetchone():
                return []
            cursor.execute('''
                SELECT *
                FROM staff_chat_logs
                WHERE thread_id = ?
                ORDER BY timestamp ASC, id ASC
                LIMIT ?
            ''', (thread_id, limit))
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def add_log(
        staff_account_id: str,
        role: str,
        content: str,
        thread_id: Optional[str] = None,
        tool_call_id: Optional[str] = None,
        thinking_content: Optional[str] = None,
        thinking_duration: Optional[float] = None,
        is_thinking_stopped: bool = False,
        is_error: bool = False
    ):
        # 如果content是JSON格式且role是assistant，尝试提取thinking信息
        actual_content = content
        if role == "assistant" and content and content.strip():
            try:
                parsed = json.loads(content)
                if isinstance(parsed, dict):
                    if not thinking_content and "thinking_content" in parsed:
                        thinking_content = parsed.get("thinking_content", "")
                    # 如果有tool_calls，保留完整JSON以便序列化器重建
                    if "tool_calls" in parsed:
                        actual_content = content  # 保留完整JSON
                    elif "content" in parsed:
                        actual_content = parsed.get("content", "")
            except (json.JSONDecodeError, ValueError):
                pass

        with get_db_connection() as conn:
            cursor = conn.cursor()
            StaffChatLogDB._ensure_schema(conn)

            if thread_id:
                cursor.execute('''
                    SELECT id FROM staff_chat_threads
                    WHERE id = ? AND staff_account_id = ?
                ''', (thread_id, staff_account_id))
                if not cursor.fetchone():
                    raise ValueError("会话不存在或无权限访问")

            cursor.execute('''
                INSERT INTO staff_chat_logs (staff_account_id, thread_id, tool_call_id, role, content, thinking_content, thinking_duration, is_thinking_stopped, is_error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                staff_account_id,
                thread_id,
                tool_call_id,
                role,
                actual_content,
                thinking_content,
                thinking_duration,
                1 if is_thinking_stopped else 0,
                1 if is_error else 0
            ))

            if thread_id:
                cursor.execute('''
                    UPDATE staff_chat_threads
                    SET updated_at = CURRENT_TIMESTAMP,
                        last_message_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (thread_id,))
                if role == 'user':
                    preview = StaffChatLogDB._normalize_preview(content)
                    if preview:
                        cursor.execute('''
                            UPDATE staff_chat_threads
                            SET first_message_preview = CASE
                                WHEN first_message_preview IS NULL OR TRIM(first_message_preview) = '' THEN ?
                                ELSE first_message_preview
                            END
                            WHERE id = ?
                        ''', (preview, thread_id))
            conn.commit()

    @staticmethod
    def get_recent_logs(
        staff_account_id: str,
        limit: int = 50,
        thread_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            StaffChatLogDB._ensure_schema(conn)
            if thread_id:
                cursor.execute('''
                    SELECT id FROM staff_chat_threads
                    WHERE id = ? AND staff_account_id = ?
                ''', (thread_id, staff_account_id))
                if not cursor.fetchone():
                    return []
                cursor.execute('''
                    SELECT *
                    FROM staff_chat_logs
                    WHERE thread_id = ?
                    ORDER BY timestamp DESC, id DESC
                    LIMIT ?
                ''', (thread_id, limit))
            else:
                cursor.execute('''
                    SELECT *
                    FROM staff_chat_logs
                    WHERE staff_account_id = ?
                    ORDER BY timestamp DESC, id DESC
                    LIMIT ?
                ''', (staff_account_id, limit))
            return [dict(row) for row in cursor.fetchall()]
