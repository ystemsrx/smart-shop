from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request

from auth import (
    error_response,
    get_current_staff_required_from_cookie,
    success_response,
)
from database import AddressDB, ChatLogDB, UserDB, UserProfileDB, get_db_connection
from ..context import logger
from ..dependencies import build_staff_scope
from .ai import _serialize_chat_thread, _serialize_chat_message


router = APIRouter()


def _staff_can_access_user(staff: Dict[str, Any], scope: Dict[str, Any], student_id: str) -> bool:
    """检查工作人员是否有权查看该用户的聊天记录。"""
    if staff.get("type") != "agent":
        return True
    address_ids = scope.get("address_ids") or []
    building_ids = scope.get("building_ids") or []
    if not address_ids and not building_ids:
        return False
    profile = UserProfileDB.get_user_profile(student_id)
    if not profile:
        return False
    user_addr = profile.get("address_id")
    user_bldg = profile.get("building_id")
    if user_addr and user_addr in address_ids:
        return True
    if user_bldg and user_bldg in building_ids:
        return True
    return False


@router.get("/admin/chat-audit/users")
async def list_chat_audit_users(request: Request, q: str = "", offset: int = 0, limit: int = 30):
    """列出有聊天记录的用户，支持搜索和分页。代理仅可见管辖区域用户。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        scope = build_staff_scope(staff)
        like = f"%{q.strip()}%" if q.strip() else "%"
        safe_offset = max(0, offset)
        safe_limit = max(1, min(limit, 100))

        with get_db_connection() as conn:
            cur = conn.cursor()

            search_condition = "(u.id LIKE ? OR u.name LIKE ? OR up.name LIKE ?)"
            params: List[Any] = [like, like, like]
            filters: List[str] = [search_condition]

            if staff.get("type") == "agent":
                address_ids = [aid for aid in (scope.get("address_ids") or []) if aid]
                building_ids = [bid for bid in (scope.get("building_ids") or []) if bid]
                if not address_ids and not building_ids:
                    return success_response("查询成功", {"users": [], "total": 0, "offset": safe_offset, "limit": safe_limit})
                coverage_parts: List[str] = []
                if address_ids:
                    placeholders = ",".join("?" * len(address_ids))
                    coverage_parts.append(f"up.address_id IN ({placeholders})")
                    params.extend(address_ids)
                if building_ids:
                    placeholders = ",".join("?" * len(building_ids))
                    coverage_parts.append(f"up.building_id IN ({placeholders})")
                    params.extend(building_ids)
                filters.append("(" + " OR ".join(coverage_parts) + ")")

            where_clause = " AND ".join(filters)

            count_query = f"""
                SELECT COUNT(DISTINCT u.id)
                FROM users u
                LEFT JOIN user_profiles up
                  ON (up.user_id = u.user_id OR (up.user_id IS NULL AND up.student_id = u.id))
                INNER JOIN chat_threads ct
                  ON (ct.user_id = u.user_id OR ct.student_id = u.id)
                WHERE {where_clause}
            """
            cur.execute(count_query, tuple(params))
            total = cur.fetchone()[0] or 0

            data_query = f"""
                SELECT
                    u.id AS student_id,
                    COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(up.name), ''), u.id) AS display_name,
                    MAX(ct.last_message_at) AS last_chat_at,
                    COUNT(DISTINCT ct.id) AS thread_count,
                    up.address_id,
                    a.name AS address_name
                FROM users u
                LEFT JOIN user_profiles up
                  ON (up.user_id = u.user_id OR (up.user_id IS NULL AND up.student_id = u.id))
                LEFT JOIN addresses a
                  ON a.id = up.address_id
                INNER JOIN chat_threads ct
                  ON (ct.user_id = u.user_id OR ct.student_id = u.id)
                WHERE {where_clause}
                GROUP BY u.id
                ORDER BY last_chat_at DESC
                LIMIT ? OFFSET ?
            """
            data_params = list(params) + [safe_limit, safe_offset]
            cur.execute(data_query, tuple(data_params))
            rows = cur.fetchall() or []

        users = []
        for row in rows:
            users.append({
                "student_id": row["student_id"],
                "display_name": row["display_name"],
                "last_chat_at": row["last_chat_at"],
                "thread_count": row["thread_count"],
                "address_id": row["address_id"],
                "address_name": row["address_name"],
            })

        # Return staff's own address_ids so frontend can expand them by default
        staff_address_ids = []
        if staff.get("type") == "agent":
            staff_address_ids = scope.get("address_ids") or []
        else:
            # Admin: return all address ids (all expanded by default handled on frontend)
            staff_address_ids = []

        return success_response("查询成功", {
            "users": users,
            "total": total,
            "offset": safe_offset,
            "limit": safe_limit,
            "staff_address_ids": staff_address_ids,
        })
    except Exception as exc:
        logger.error("Failed to list chat audit users: %s", exc)
        return error_response("查询用户列表失败", 500)


@router.get("/admin/chat-audit/users/{student_id}/threads")
async def list_user_threads(request: Request, student_id: str, limit: int = 50):
    """获取指定用户的聊天会话列表。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        scope = build_staff_scope(staff)
        if not _staff_can_access_user(staff, scope, student_id):
            return error_response("无权查看该用户的聊天记录", 403)

        user_ref = UserDB.resolve_user_reference(student_id)
        if not user_ref:
            return error_response("用户不存在", 404)

        safe_limit = max(1, min(limit, 200))

        with get_db_connection() as conn:
            cur = conn.cursor()
            ChatLogDB._ensure_chat_schema(conn)
            cur.execute('''
                SELECT *
                FROM chat_threads
                WHERE (user_id = ? OR student_id = ?)
                ORDER BY last_message_at DESC, updated_at DESC
                LIMIT ?
            ''', (user_ref['user_id'], user_ref['student_id'], safe_limit))
            rows = cur.fetchall() or []

        threads = [_serialize_chat_thread(dict(row)) for row in rows]
        return success_response("查询成功", {"threads": threads})
    except Exception as exc:
        logger.error("Failed to list threads for user %s: %s", student_id, exc)
        return error_response("查询聊天列表失败", 500)


@router.get("/admin/chat-audit/threads/{thread_id}/messages")
async def get_thread_messages(request: Request, thread_id: str, limit: int = 500):
    """获取指定聊天会话的消息内容。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        scope = build_staff_scope(staff)
        safe_limit = max(1, min(limit, 1000))

        with get_db_connection() as conn:
            cur = conn.cursor()
            ChatLogDB._ensure_chat_schema(conn)

            cur.execute('SELECT * FROM chat_threads WHERE id = ? LIMIT 1', (thread_id,))
            thread_row = cur.fetchone()
            if not thread_row:
                return error_response("聊天会话不存在", 404)
            thread = dict(thread_row)

            owner_sid = thread.get("student_id")
            if owner_sid and not _staff_can_access_user(staff, scope, owner_sid):
                return error_response("无权查看该聊天记录", 403)

            cur.execute('''
                SELECT *
                FROM chat_logs
                WHERE thread_id = ?
                ORDER BY timestamp ASC, id ASC
                LIMIT ?
            ''', (thread_id, safe_limit))
            rows = cur.fetchall() or []

        messages = [_serialize_chat_message(dict(row)) for row in rows]
        return success_response("查询成功", {
            "thread": _serialize_chat_thread(thread),
            "messages": messages,
        })
    except Exception as exc:
        logger.error("Failed to get messages for thread %s: %s", thread_id, exc)
        return error_response("查询聊天内容失败", 500)
