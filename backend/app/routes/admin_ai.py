import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from admin_ai_chat import stream_admin_chat, handle_admin_image_upload
from auth import (
    get_current_admin_required_from_cookie,
    get_current_staff_required_from_cookie,
)
from config import get_settings
from database import StaffChatLogDB
from ..context import logger
from ..dependencies import require_agent_with_scope
from ..schemas import ChatRequest, ChatThreadCreateRequest, ChatThreadUpdateRequest


router = APIRouter()


# ===== 序列化辅助 =====

def _serialize_staff_thread(thread: Dict[str, Any]) -> Dict[str, Any]:
    if not thread:
        return {}
    custom_title = (thread.get("title") or "").strip()
    preview = (thread.get("first_message_preview") or "").strip()
    return {
        "id": thread.get("id"),
        "title": custom_title if custom_title else None,
        "preview": preview[:8] if preview else None,
        "created_at": thread.get("created_at"),
        "updated_at": thread.get("updated_at"),
        "last_message_at": thread.get("last_message_at"),
        "is_archived": bool(thread.get("is_archived")),
    }


def _serialize_staff_message(record: Dict[str, Any]) -> Dict[str, Any]:
    if not record:
        return {}
    content = record.get("content")
    payload = {
        "id": record.get("id"),
        "role": record.get("role"),
        "content": content,
        "timestamp": record.get("timestamp"),
        "thread_id": record.get("thread_id"),
        "tool_call_id": record.get("tool_call_id"),
    }
    if payload["role"] == "assistant":
        thinking_content_from_db = record.get("thinking_content")
        if thinking_content_from_db:
            payload["thinking_content"] = thinking_content_from_db
            payload["thinking_duration"] = record.get("thinking_duration")
            payload["is_thinking_stopped"] = bool(record.get("is_thinking_stopped"))
        else:
            payload["thinking_content"] = ""
            if isinstance(content, str):
                try:
                    parsed = json.loads(content)
                    if isinstance(parsed, dict):
                        if "tool_calls" in parsed:
                            payload["tool_calls"] = parsed.get("tool_calls")
                        if "content" in parsed:
                            payload["content"] = parsed.get("content") or ""
                        elif "tool_calls" in parsed:
                            payload["content"] = ""
                        thinking_value = parsed.get("thinking_content")
                        if thinking_value is None:
                            thinking_value = ""
                        if isinstance(thinking_value, str):
                            payload["thinking_content"] = thinking_value
                        else:
                            payload["thinking_content"] = str(thinking_value)
                except Exception:
                    pass
    return payload


# ===== 模型列表（共用） =====

@router.get("/admin/ai/models")
async def admin_list_ai_models(request: Request):
    get_current_staff_required_from_cookie(request)
    configs = get_settings().model_order
    return {
        "models": [
            {"model": cfg.name, "name": cfg.label, "supports_thinking": cfg.supports_thinking}
            for cfg in configs
        ]
    }


@router.get("/agent/ai/models")
async def agent_list_ai_models(request: Request):
    require_agent_with_scope(request)
    configs = get_settings().model_order
    return {
        "models": [
            {"model": cfg.name, "name": cfg.label, "supports_thinking": cfg.supports_thinking}
            for cfg in configs
        ]
    }


# ===== 聊天主接口 =====

@router.post("/admin/ai/chat")
async def admin_ai_chat(request_body: ChatRequest, http_request: Request):
    """管理员 AI 聊天接口。"""
    try:
        staff = get_current_staff_required_from_cookie(http_request)
        staff_account_id = staff.get("id", "")

        conversation_id = (request_body.conversation_id or "").strip() or None
        if conversation_id:
            thread = StaffChatLogDB.get_thread_for_staff(staff_account_id, conversation_id)
            if not thread:
                raise HTTPException(status_code=401, detail="无权访问该会话")

        messages: List[Dict[str, Any]] = []
        for msg in request_body.messages:
            message_dict: Dict[str, Any] = {"role": msg.role, "content": msg.content}
            if msg.tool_calls is not None:
                message_dict["tool_calls"] = msg.tool_calls
            if msg.tool_call_id is not None:
                message_dict["tool_call_id"] = msg.tool_call_id
            messages.append(message_dict)

        selected_model = (request_body.model or "").strip()
        return await stream_admin_chat(staff, messages, http_request, selected_model, conversation_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Admin AI chat request failed: %s", exc)
        raise HTTPException(status_code=500, detail="AI聊天服务暂时不可用")


@router.post("/agent/ai/chat")
async def agent_ai_chat(request_body: ChatRequest, http_request: Request):
    """代理 AI 聊天接口。"""
    try:
        agent, _ = require_agent_with_scope(http_request)
        staff_account_id = agent.get("id", "")

        conversation_id = (request_body.conversation_id or "").strip() or None
        if conversation_id:
            thread = StaffChatLogDB.get_thread_for_staff(staff_account_id, conversation_id)
            if not thread:
                raise HTTPException(status_code=401, detail="无权访问该会话")

        messages: List[Dict[str, Any]] = []
        for msg in request_body.messages:
            message_dict: Dict[str, Any] = {"role": msg.role, "content": msg.content}
            if msg.tool_calls is not None:
                message_dict["tool_calls"] = msg.tool_calls
            if msg.tool_call_id is not None:
                message_dict["tool_call_id"] = msg.tool_call_id
            messages.append(message_dict)

        selected_model = (request_body.model or "").strip()
        return await stream_admin_chat(agent, messages, http_request, selected_model, conversation_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Agent AI chat request failed: %s", exc)
        raise HTTPException(status_code=500, detail="AI聊天服务暂时不可用")


# ===== 聊天历史管理 =====

@router.get("/admin/ai/chats")
async def admin_list_chats(request: Request, limit: int = 100):
    staff = get_current_staff_required_from_cookie(request)
    try:
        safe_limit = max(1, min(limit, 200))
        threads = StaffChatLogDB.list_threads(staff["id"], limit=safe_limit)
        return {"chats": [_serialize_staff_thread(t) for t in threads]}
    except Exception as exc:
        logger.error("Failed to list admin chat history: %s", exc)
        raise HTTPException(status_code=500, detail="无法获取聊天历史")


@router.get("/agent/ai/chats")
async def agent_list_chats(request: Request, limit: int = 100):
    agent, _ = require_agent_with_scope(request)
    try:
        safe_limit = max(1, min(limit, 200))
        threads = StaffChatLogDB.list_threads(agent["id"], limit=safe_limit)
        return {"chats": [_serialize_staff_thread(t) for t in threads]}
    except Exception as exc:
        logger.error("Failed to list agent chat history: %s", exc)
        raise HTTPException(status_code=500, detail="无法获取聊天历史")


@router.post("/admin/ai/chats")
async def admin_create_chat(payload: ChatThreadCreateRequest, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        thread = StaffChatLogDB.create_thread(staff["id"], title=payload.title)
        return {"chat": _serialize_staff_thread(thread)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Failed to create admin chat thread: %s", exc)
        raise HTTPException(status_code=500, detail="创建聊天会话失败")


@router.post("/agent/ai/chats")
async def agent_create_chat(payload: ChatThreadCreateRequest, request: Request):
    agent, _ = require_agent_with_scope(request)
    try:
        thread = StaffChatLogDB.create_thread(agent["id"], title=payload.title)
        return {"chat": _serialize_staff_thread(thread)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Failed to create agent chat thread: %s", exc)
        raise HTTPException(status_code=500, detail="创建聊天会话失败")


@router.get("/admin/ai/chats/{chat_id}")
async def admin_get_chat(chat_id: str, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        thread = StaffChatLogDB.get_thread_for_staff(staff["id"], chat_id)
        if not thread:
            raise HTTPException(status_code=401, detail="无权访问该会话")
        messages = StaffChatLogDB.get_thread_messages(staff["id"], chat_id, limit=800)
        return {"chat": _serialize_staff_thread(thread), "messages": [_serialize_staff_message(msg) for msg in messages]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to fetch admin chat thread: %s", exc)
        raise HTTPException(status_code=500, detail="获取聊天会话失败")


@router.get("/agent/ai/chats/{chat_id}")
async def agent_get_chat(chat_id: str, request: Request):
    agent, _ = require_agent_with_scope(request)
    try:
        thread = StaffChatLogDB.get_thread_for_staff(agent["id"], chat_id)
        if not thread:
            raise HTTPException(status_code=401, detail="无权访问该会话")
        messages = StaffChatLogDB.get_thread_messages(agent["id"], chat_id, limit=800)
        return {"chat": _serialize_staff_thread(thread), "messages": [_serialize_staff_message(msg) for msg in messages]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to fetch agent chat thread: %s", exc)
        raise HTTPException(status_code=500, detail="获取聊天会话失败")


@router.patch("/admin/ai/chats/{chat_id}")
async def admin_rename_chat(chat_id: str, payload: ChatThreadUpdateRequest, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        updated = StaffChatLogDB.rename_thread(staff["id"], chat_id, payload.title or "")
        if not updated:
            raise HTTPException(status_code=401, detail="无权更新该会话")
        thread = StaffChatLogDB.get_thread_for_staff(staff["id"], chat_id)
        return {"chat": _serialize_staff_thread(thread)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to update admin chat thread: %s", exc)
        raise HTTPException(status_code=500, detail="更新聊天会话失败")


@router.patch("/agent/ai/chats/{chat_id}")
async def agent_rename_chat(chat_id: str, payload: ChatThreadUpdateRequest, request: Request):
    agent, _ = require_agent_with_scope(request)
    try:
        updated = StaffChatLogDB.rename_thread(agent["id"], chat_id, payload.title or "")
        if not updated:
            raise HTTPException(status_code=401, detail="无权更新该会话")
        thread = StaffChatLogDB.get_thread_for_staff(agent["id"], chat_id)
        return {"chat": _serialize_staff_thread(thread)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to update agent chat thread: %s", exc)
        raise HTTPException(status_code=500, detail="更新聊天会话失败")


# ===== 图片上传 =====

@router.post("/admin/ai/upload-image")
async def admin_upload_image(request: Request, file: UploadFile = File(...)):
    """管理员聊天图片上传。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        content = await file.read()
        result = handle_admin_image_upload(staff, content)
        if not result.get("ok"):
            raise HTTPException(status_code=400, detail=result.get("error", "上传失败"))
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Admin image upload failed: %s", exc)
        raise HTTPException(status_code=500, detail="图片上传失败")


@router.post("/agent/ai/upload-image")
async def agent_upload_image(request: Request, file: UploadFile = File(...)):
    """代理聊天图片上传。"""
    agent, _ = require_agent_with_scope(request)
    try:
        content = await file.read()
        result = handle_admin_image_upload(agent, content)
        if not result.get("ok"):
            raise HTTPException(status_code=400, detail=result.get("error", "上传失败"))
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Agent image upload failed: %s", exc)
        raise HTTPException(status_code=500, detail="图片上传失败")
