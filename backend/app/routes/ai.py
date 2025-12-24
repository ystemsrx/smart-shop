import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

from ai_chat import stream_chat
from auth import get_current_user_from_cookie, get_current_user_required_from_cookie
from config import get_settings
from database import ChatLogDB
from ..context import logger
from ..schemas import ChatRequest, ChatThreadCreateRequest, ChatThreadUpdateRequest


router = APIRouter()


def _serialize_chat_thread(thread: Dict[str, Any]) -> Dict[str, Any]:
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


def _serialize_chat_message(record: Dict[str, Any]) -> Dict[str, Any]:
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
        # 优先使用数据库中的thinking_content字段
        thinking_content_from_db = record.get("thinking_content")
        if thinking_content_from_db:
            payload["thinking_content"] = thinking_content_from_db
            payload["thinking_duration"] = record.get("thinking_duration")
            payload["is_thinking_stopped"] = bool(record.get("is_thinking_stopped"))
        else:
            # 向后兼容：从JSON content中提取thinking_content
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


@router.get("/ai/models")
async def list_ai_models():
    """返回可用模型列表及其能力，用于前端渲染模型选择器。"""
    configs = get_settings().model_order
    logger.info(f"/ai/models API调用 - 配置中的模型数量: {len(configs)}")
    logger.info(f"/ai/models API调用 - 配置中的模型列表: {[(cfg.name, cfg.label) for cfg in configs]}")
    result = {
        "models": [
            {
                "model": cfg.name,
                "name": cfg.label,
                "supports_thinking": cfg.supports_thinking,
            }
            for cfg in configs
        ]
    }
    logger.info(f"/ai/models API调用 - 返回结果中的模型数量: {len(result['models'])}")
    return result


@router.get("/ai/chats")
async def list_chat_history(request: Request, limit: int = 100):
    """列出当前用户的聊天会话。"""
    user = get_current_user_required_from_cookie(request)
    try:
        safe_limit = max(1, min(limit, 200))
        threads = ChatLogDB.list_threads(user["id"], limit=safe_limit)
        return {"chats": [_serialize_chat_thread(thread) for thread in threads]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"获取聊天历史失败: {exc}")
        raise HTTPException(status_code=500, detail="无法获取聊天历史")


@router.post("/ai/chats")
async def create_chat_history(payload: ChatThreadCreateRequest, request: Request):
    """创建新的聊天会话。"""
    user = get_current_user_required_from_cookie(request)
    try:
        thread = ChatLogDB.create_thread(user["id"], title=payload.title)
        return {"chat": _serialize_chat_thread(thread)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"创建聊天会话失败: {exc}")
        raise HTTPException(status_code=500, detail="创建聊天会话失败")


@router.get("/ai/chats/{chat_id}")
async def get_chat_history(chat_id: str, request: Request):
    """获取指定聊天会话及其消息。"""
    user = get_current_user_required_from_cookie(request)
    try:
        thread = ChatLogDB.get_thread_for_user(user["id"], chat_id)
        if not thread:
            raise HTTPException(status_code=401, detail="无权访问该会话")
        messages = ChatLogDB.get_thread_messages(user["id"], chat_id, limit=800)
        return {"chat": _serialize_chat_thread(thread), "messages": [_serialize_chat_message(msg) for msg in messages]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"获取聊天会话失败: {exc}")
        raise HTTPException(status_code=500, detail="获取聊天会话失败")


@router.patch("/ai/chats/{chat_id}")
async def rename_chat_history(chat_id: str, payload: ChatThreadUpdateRequest, request: Request):
    """重命名聊天会话。"""
    user = get_current_user_required_from_cookie(request)
    try:
        updated = ChatLogDB.rename_thread(user["id"], chat_id, payload.title or "")
        if not updated:
            raise HTTPException(status_code=401, detail="无权更新该会话")
        thread = ChatLogDB.get_thread_for_user(user["id"], chat_id)
        return {"chat": _serialize_chat_thread(thread)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"更新聊天会话失败: {exc}")
        raise HTTPException(status_code=500, detail="更新聊天会话失败")


@router.post("/ai/chat")
async def ai_chat(request: ChatRequest, http_request: Request):
    """AI聊天接口（支持未登录用户，但功能受限）。"""
    try:
        user = None
        try:
            user = get_current_user_from_cookie(http_request)
            logger.info(f"AI聊天请求 - 用户ID: {user['id'] if user else 'anonymous'}")
        except Exception as exc:
            logger.info(f"AI聊天请求 - 用户未登录: {exc}")

        conversation_id = (request.conversation_id or "").strip() or None
        if conversation_id and not user:
            raise HTTPException(status_code=401, detail="需要登录才能访问指定对话")
        if user:
            if not conversation_id:
                raise HTTPException(status_code=400, detail="缺少会话ID")
            thread = ChatLogDB.get_thread_for_user(user["id"], conversation_id)
            if not thread:
                raise HTTPException(status_code=401, detail="无权访问该会话")
        else:
            conversation_id = None

        messages: List[Dict[str, Any]] = []
        for msg in request.messages:
            message_dict: Dict[str, Any] = {"role": msg.role, "content": msg.content}
            if msg.tool_calls is not None:
                message_dict["tool_calls"] = msg.tool_calls
            if msg.tool_call_id is not None:
                message_dict["tool_call_id"] = msg.tool_call_id
            messages.append(message_dict)

        selected_model = (request.model or "").strip()
        return await stream_chat(user, messages, http_request, selected_model, conversation_id)
    except Exception as exc:
        logger.error(f"AI聊天失败: {exc}")
        raise HTTPException(status_code=500, detail="AI聊天服务暂时不可用")
