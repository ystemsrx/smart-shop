# /backend/ai_chat.py
import asyncio
import uuid
import json
import time
import logging
from typing import Any, Dict, List, Optional, Tuple
import httpx
from fastapi import FastAPI, Request, Response, HTTPException, Depends
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from contextlib import asynccontextmanager

# 导入数据库和认证模块
from database import ProductDB, CartDB, ChatLogDB, CategoryDB
from auth import get_current_user_optional

# 配置日志
logger = logging.getLogger(__name__)

# BigModel API 配置
BIGMODEL_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
BIGMODEL_API_KEY = "your_api_key"  # 实际使用时应从环境变量获取
BIGMODEL_MODEL = "glm-4.5-flash"

# HTTP客户端配置
transport = httpx.AsyncHTTPTransport(retries=0, http2=False)
limits = httpx.Limits(max_connections=200, max_keepalive_connections=50)
client = httpx.AsyncClient(
    timeout=httpx.Timeout(300.0), 
    limits=limits, 
    transport=transport,
    headers={"Authorization": f"Bearer {BIGMODEL_API_KEY}"}
)

UPSTREAM_SSE_HEADERS = {
    "Accept": "text/event-stream",
    "Accept-Encoding": "identity", 
    "Cache-Control": "no-cache"
}

# 系统提示词
SYSTEM_PROMPT = """
# Role

Smart Shopping Assistant

## Profile

* Response language: 中文
* Professional, friendly, helps users shop in the mall

## Goals

* Search and browse products
* [Login required] Manage shopping cart (add, remove, update, view)
* Provide shopping suggestions and product information
* If the tool list is incomplete, guide users to log in at the right time to unlock full functionality

## Constraints

* Non-logged-in users can only search for products
* For shopping cart functions, remind users to log in first
* Maintain a polite and professional tone
* Hallucinations must be strictly avoided; all information should be grounded in facts.

## Skills

* **Product Operations**: Search products, browse categories
* **Shopping Cart Operations**: Add, update, remove, clear, view
* **Service Communication**: Recommend products, prompt login, communicate clearly
"""

# ===== 工具函数实现 =====

def search_products_impl(query, limit: int = 10, user_id: Optional[str] = None) -> Dict[str, Any]:
    """搜索商品实现（支持匿名和登录用户）"""
    try:
        if isinstance(query, list):
            # 多查询搜索
            all_results = {}
            for q in query:
                q_str = (q or "").strip()
                if q_str:
                    products = ProductDB.search_products(q_str)
                    # 限制返回数量
                    products = products[:limit] if len(products) > limit else products
                    
                    # 转换为工具格式
                    items = []
                    for product in products:
                        items.append({
                            "product_id": product["id"],
                            "name": product["name"],
                            "brand": "商店",  # 简化品牌信息
                            "category": product["category"],
                            "price": product["price"],
                            "stock": product["stock"],
                            "in_stock": product["stock"] > 0,
                            "relevance_score": 100,  # 简化相关性评分
                            "description": product.get("description", ""),
                            "img_path": product.get("img_path", "")
                        })
                    
                    all_results[q] = {
                        "ok": True,
                        "query": q,
                        "count": len(items),
                        "items": items
                    }
            
            return {
                "ok": True,
                "multi_query": True,
                "queries": query,
                "results": all_results,
                "count": sum(r["count"] for r in all_results.values())
            }
        else:
            # 单查询搜索
            q = (query or "").strip()
            if not q:
                return {"ok": True, "query": query, "count": 0, "items": []}
            
            products = ProductDB.search_products(q)
            products = products[:limit] if len(products) > limit else products
            
            items = []
            for product in products:
                items.append({
                    "product_id": product["id"],
                    "name": product["name"],
                    "brand": "商店",
                    "category": product["category"],
                    "price": product["price"],
                    "stock": product["stock"],
                    "in_stock": product["stock"] > 0,
                    "relevance_score": 100,
                    "description": product.get("description", ""),
                    "img_path": product.get("img_path", "")
                })
            
            return {"ok": True, "query": query, "count": len(items), "items": items}
            
    except Exception as e:
        logger.error(f"搜索商品失败: {e}")
        return {"ok": False, "error": f"搜索失败: {str(e)}"}

def get_cart_impl(user_id: str) -> Dict[str, Any]:
    """获取购物车实现"""
    try:
        cart_data = CartDB.get_cart(user_id)
        if not cart_data:
            return {"ok": True, "items": [], "total_quantity": 0, "total_price": 0.0}
        
        items = cart_data.get("items", {})
        cart_items = []
        total_quantity = 0
        total_price = 0.0
        
        # 获取商品详情并计算总价
        all_products = ProductDB.get_all_products()
        product_dict = {p["id"]: p for p in all_products}
        
        for product_id, quantity in items.items():
            if product_id in product_dict:
                product = product_dict[product_id]
                subtotal = product["price"] * quantity
                total_quantity += quantity
                total_price += subtotal
                
                cart_items.append({
                    "product_id": product_id,
                    "name": product["name"],
                    "unit_price": product["price"],
                    "quantity": quantity,
                    "subtotal": round(subtotal, 2)
                })
        
        return {
            "ok": True,
            "items": cart_items,
            "total_quantity": total_quantity,
            "total_price": round(total_price, 2)
        }
        
    except Exception as e:
        logger.error(f"获取购物车失败: {e}")
        return {"ok": False, "error": f"获取购物车失败: {str(e)}"}

def get_category_impl() -> Dict[str, Any]:
    """获取所有商品类别（不包含商品，未登录也可用）"""
    try:
        categories = CategoryDB.get_all_categories()
        # 仅返回必要字段
        items = [
            {
                "id": c.get("id"),
                "name": c.get("name"),
                "description": c.get("description", "")
            }
            for c in categories
        ]
        return {"ok": True, "count": len(items), "categories": items}
    except Exception as e:
        logger.error(f"获取分类失败: {e}")
        return {"ok": False, "error": f"获取分类失败: {str(e)}"}

def update_cart_impl(user_id: str, action: str, product_id: Any = None, quantity: Any = None) -> Dict[str, Any]:
    """更新购物车实现"""
    try:
        if action not in ("add", "update", "remove", "clear"):
            return {"ok": False, "error": "不支持的操作"}
        
        # 获取当前购物车
        cart_data = CartDB.get_cart(user_id)
        items = cart_data.get("items", {}) if cart_data else {}
        
        if action == "clear":
            items = {}
            CartDB.update_cart(user_id, items)
            return {"ok": True, "message": "购物车已清空", "action": "clear"}
        
        if not product_id:
            return {"ok": False, "error": "需要提供商品ID"}
        
        # 验证商品是否存在
        all_products = ProductDB.get_all_products()
        product_dict = {p["id"]: p for p in all_products}
        
        if isinstance(product_id, str):
            product_ids = [product_id]
            quantities = [quantity] if quantity is not None else [None]
        elif isinstance(product_id, list):
            product_ids = product_id
            if isinstance(quantity, list):
                quantities = quantity
            elif quantity is not None:
                quantities = [quantity] * len(product_ids)
            else:
                quantities = [None] * len(product_ids)
        else:
            return {"ok": False, "error": "商品ID格式错误"}
        
        results = []
        success_count = 0
        
        for i, pid in enumerate(product_ids):
            qty = quantities[i]
            
            if pid not in product_dict:
                results.append(f"商品 {pid}: 商品不存在")
                continue
            
            product = product_dict[pid]
            
            if action == "remove":
                items.pop(pid, None)
                results.append(f"商品 {pid}: 删除成功")
                success_count += 1
            elif action in ["add", "update"]:
                if qty is None:
                    qty = 1 if action == "add" else 0
                
                try:
                    qty = int(qty)
                except (ValueError, TypeError):
                    results.append(f"商品 {pid}: 数量格式错误")
                    continue
                
                if qty < 0:
                    results.append(f"商品 {pid}: 数量不能为负数")
                    continue
                
                if qty > product["stock"]:
                    qty = product["stock"]
                
                if action == "add":
                    current_qty = items.get(pid, 0)
                    new_qty = min(current_qty + qty, product["stock"])
                    items[pid] = new_qty
                    results.append(f"商品 {pid}: 添加成功，当前数量 {new_qty}")
                else:  # update
                    if qty == 0:
                        items.pop(pid, None)
                        results.append(f"商品 {pid}: 数量设为0，已移除")
                    else:
                        items[pid] = qty
                        results.append(f"商品 {pid}: 数量更新为 {qty}")
                
                success_count += 1
        
        # 更新数据库
        CartDB.update_cart(user_id, items)
        
        return {
            "ok": success_count > 0,
            "action": action,
            "processed": len(product_ids),
            "successful": success_count,
            "details": results
        }
        
    except Exception as e:
        logger.error(f"更新购物车失败: {e}")
        return {"ok": False, "error": f"更新购物车失败: {str(e)}"}

# ===== 工具调用处理 =====

def get_available_tools(user_id: Optional[str]) -> List[Dict[str, Any]]:
    """根据用户登录状态返回可用工具"""
    # 所有用户都可以搜索商品
    tools = [
        {
            "type": "function",
            "function": {
                "name": "search_products",
                "description": "Search for products in the store by keywords",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": ["string", "array"],
                            "description": "Search keyword(s), can be a single string or an array of strings",
                            "items": {"type": "string"}
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of products to return, default is 5",
                            "default": 5
                        }
                    },
                    "required": ["query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_category",
                "description": "Get all existing product categories without products name",
                "parameters": {"type": "object", "properties": {}, "required": []}
            }
        }
    ]
    
    # 只有登录用户才能使用购物车功能
    if user_id:
        tools.extend([
            {
                "type": "function",
                "function": {
                    "name": "update_cart",
                    "description": "Update the shopping cart: add/update/remove/clear items",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "action": {
                                "type": "string",
                                "enum": ["add", "update", "remove", "clear"],
                                "description": "Type of operation"
                            },
                            "product_id": {
                                "type": ["string", "array"],
                                "description": "Product ID(s), can be a string or an array of strings"
                            },
                            "quantity": {
                                "type": ["integer", "array"],
                                "description": "Quantity (used for add/update operations)"
                            }
                        },
                        "required": ["action"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_cart",
                    "description": "Retrieve all products currently in the shopping cart",
                    "parameters": {"type": "object", "properties": {}, "required": []}
                }
            }
        ])
    
    return tools

def execute_tool_locally(name: str, args: Dict[str, Any], user_id: Optional[str]) -> Any:
    """执行工具调用"""
    try:
        if name == "search_products":
            return search_products_impl(
                args.get("query", ""), 
                int(args.get("limit", 10)),
                user_id
            )
        elif name == "update_cart":
            if not user_id:
                return {"ok": False, "error": "需要登录才能使用购物车功能"}
            return update_cart_impl(
                user_id=user_id,
                action=str(args.get("action", "")),
                product_id=args.get("product_id", None),
                quantity=args.get("quantity", None)
            )
        elif name == "get_cart":
            if not user_id:
                return {"ok": False, "error": "需要登录才能查看购物车"}
            return get_cart_impl(user_id)
        elif name == "get_category":
            return get_category_impl()
        else:
            return {"ok": False, "error": f"未知的工具: {name}"}
    except Exception as e:
        logger.error(f"工具执行异常: {e}")
        return {"ok": False, "error": f"工具执行异常: {e}"}

# ===== 参数解析（复用原有逻辑） =====

def parse_tool_args(arg: Any) -> Dict[str, Any]:
    """解析工具参数（复用原有逻辑）"""
    if isinstance(arg, dict):
        return arg
    if isinstance(arg, list):
        return {"__args__": arg}
    if arg is None:
        return {}

    s = str(arg).strip()
    if not s:
        return {}

    try:
        obj = json.loads(s)
        return obj if isinstance(obj, dict) else {"__args__": obj}
    except Exception:
        return {}

# ===== SSE 流式响应 =====

def _sse(event: str, data: Dict[str, Any]) -> bytes:
    """生成SSE格式数据"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")

def _add_system_prompt(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """添加系统提示词"""
    if not SYSTEM_PROMPT or not SYSTEM_PROMPT.strip():
        return messages
    
    # 检查是否已有系统消息
    if messages and messages[0].get("role") == "system":
        return messages
    
    # 在开头添加系统消息
    system_message = {"role": "system", "content": SYSTEM_PROMPT.strip()}
    return [system_message] + messages

async def handle_tool_calls_and_continue(
    user_id: Optional[str], 
    base_messages: List[Dict[str, Any]],
    tool_calls: List[Dict[str, Any]], 
    send
):
    """处理工具调用并继续对话"""
    for i, tc in enumerate(tool_calls, 1):
        tc_id = tc.get("id") or f"call_{i}"
        fn_info = tc.get("function", {}) or {}
        name = fn_info.get("name", "")
        args_s = fn_info.get("arguments", "") or ""

        # 发送工具开始状态
        await send(_sse("tool_status", {
            "type": "tool_status",
            "status": "started",
            "tool_call_id": tc_id,
            "function": {"name": name, "arguments": args_s}
        }))

        # 执行工具
        try:
            args = parse_tool_args(args_s)
            tool_res = execute_tool_locally(name, args, user_id)
            if isinstance(tool_res, str):
                tool_res = {"ok": False, "error": tool_res}
        except Exception as e:
            logger.exception("工具执行失败")
            tool_res = {"ok": False, "error": f"工具执行异常: {e}"}

        # 发送工具完成状态
        await send(_sse("tool_status", {
            "type": "tool_status",
            "status": "finished",
            "tool_call_id": tc_id,
            "result": tool_res,
            "result_type": "json"
        }))

        # 添加工具响应到消息历史
        base_messages.append({
            "role": "tool",
            "tool_call_id": tc_id,
            "content": json.dumps(tool_res, ensure_ascii=False)
        })
        
        # 记录聊天日志
        if user_id:
            ChatLogDB.add_log(user_id, "tool", json.dumps(tool_res, ensure_ascii=False))

    # 继续对话
    messages_with_system = _add_system_prompt(base_messages)
    tools = get_available_tools(user_id)
    payload = {
        "model": BIGMODEL_MODEL,
        "messages": messages_with_system,
        "stream": True,
        "tools": tools,
        "thinking": {"type": "disabled"}
    }

    retries = 2
    for attempt in range(retries + 1):
        try:
            async with client.stream("POST", BIGMODEL_API_URL, json=payload, headers=UPSTREAM_SSE_HEADERS) as upstream:
                upstream.raise_for_status()
                tool_calls_buffer: Dict[int, Dict[str, Any]] = {}
                assistant_text_parts: List[str] = []
                finish_reason: Optional[str] = None

                async for line in upstream.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                    except Exception:
                        continue

                    choice = (chunk.get("choices") or [{}])[0]
                    delta = choice.get("delta", {})

                    if "content" in delta and delta["content"]:
                        text = delta["content"]
                        assistant_text_parts.append(text)
                        await send(_sse("message", {"type": "delta", "delta": text, "role": "assistant"}))

                    # 处理工具调用
                    if "tool_calls" in delta and delta["tool_calls"]:
                        for part in delta["tool_calls"]:
                            idx = part.get("index", 0)
                            if idx not in tool_calls_buffer:
                                tool_calls_buffer[idx] = {
                                    "id": "",
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""}
                                }
                            if part.get("id"):
                                tool_calls_buffer[idx]["id"] = part["id"]
                            f = part.get("function") or {}
                            if f.get("name"):
                                tool_calls_buffer[idx]["function"]["name"] = f["name"]
                            if f.get("arguments"):
                                tool_calls_buffer[idx]["function"]["arguments"] += f["arguments"]

                    if choice.get("finish_reason"):
                        finish_reason = choice["finish_reason"]

                # 如果有新的工具调用，递归处理
                if tool_calls_buffer:
                    assistant_content = "".join(assistant_text_parts)
                    base_messages.append({
                        "role": "assistant",
                        "content": assistant_content,
                        "tool_calls": [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                    })
                    
                    # 记录助手回复
                    if user_id:
                        ChatLogDB.add_log(user_id, "assistant", assistant_content)

                    ordered = [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                    await handle_tool_calls_and_continue(user_id, base_messages, ordered, send)
                else:
                    # 记录最终助手回复
                    final_content = "".join(assistant_text_parts)
                    if user_id and final_content:
                        ChatLogDB.add_log(user_id, "assistant", final_content)
                    
                    await send(_sse("completed", {"type": "completed", "finish_reason": finish_reason or "stop"}))
            break
        except Exception as e:
            logger.warning(f"上游流式失败 (尝试 {attempt+1}/{retries+1}): {e}")
            if attempt >= retries:
                await send(_sse("error", {"type": "error", "error": f"上游流式失败: {e}"}))

async def stream_chat(user: Optional[Dict], init_messages: List[Dict[str, Any]]) -> StreamingResponse:
    """AI聊天流式响应"""
    queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue()
    user_id = user["id"] if user else None

    async def send(chunk: bytes):
        try:
            await queue.put(chunk)
        except asyncio.CancelledError:
            return

    async def event_generator():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

    async def producer():
        try:
            # 记录用户消息
            if user_id and init_messages:
                for msg in init_messages:
                    if msg.get("role") == "user":
                        ChatLogDB.add_log(user_id, "user", msg.get("content", ""))

            # 添加系统提示词
            messages_with_system = _add_system_prompt(init_messages)
            tools = get_available_tools(user_id)
            payload = {
                "model": BIGMODEL_MODEL,
                "messages": messages_with_system,
                "stream": True,
                "tools": tools,
                "thinking": {"type": "disabled"}
            }

            retries = 2
            for attempt in range(retries + 1):
                try:
                    async with client.stream("POST", BIGMODEL_API_URL, json=payload, headers=UPSTREAM_SSE_HEADERS) as upstream:
                        upstream.raise_for_status()
                        tool_calls_buffer: Dict[int, Dict[str, Any]] = {}
                        assistant_text_parts: List[str] = []
                        finish_reason: Optional[str] = None

                        async for line in upstream.aiter_lines():
                            if not line or not line.startswith("data: "):
                                continue
                            data = line[6:].strip()
                            if data == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                            except Exception:
                                continue

                            choice = (chunk.get("choices") or [{}])[0]
                            delta = choice.get("delta", {})

                            if "content" in delta and delta["content"]:
                                text = delta["content"]
                                assistant_text_parts.append(text)
                                await send(_sse("message", {"type": "delta", "delta": text, "role": "assistant"}))

                            # 处理工具调用
                            if "tool_calls" in delta and delta["tool_calls"]:
                                for part in delta["tool_calls"]:
                                    idx = part.get("index", 0)
                                    if idx not in tool_calls_buffer:
                                        tool_calls_buffer[idx] = {
                                            "id": "",
                                            "type": "function",
                                            "function": {"name": "", "arguments": ""}
                                        }
                                    if part.get("id"):
                                        tool_calls_buffer[idx]["id"] = part["id"]
                                    f = part.get("function") or {}
                                    if f.get("name"):
                                        tool_calls_buffer[idx]["function"]["name"] = f["name"]
                                    if f.get("arguments"):
                                        tool_calls_buffer[idx]["function"]["arguments"] += f["arguments"]

                            if choice.get("finish_reason"):
                                finish_reason = choice["finish_reason"]

                        assistant_joined = "".join(assistant_text_parts)
                        messages = init_messages + [{
                            "role": "assistant",
                            "content": assistant_joined,
                            "tool_calls": [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())] if tool_calls_buffer else None
                        }]

                        # 如果有工具调用
                        if tool_calls_buffer:
                            # 记录助手回复
                            if user_id:
                                ChatLogDB.add_log(user_id, "assistant", assistant_joined)
                            
                            ordered = [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                            await handle_tool_calls_and_continue(user_id, messages, ordered, send)
                        else:
                            # 记录助手回复
                            if user_id:
                                ChatLogDB.add_log(user_id, "assistant", assistant_joined)
                            
                            await send(_sse("completed", {"type": "completed", "finish_reason": finish_reason or "stop"}))

                    break
                except Exception as e:
                    logger.warning(f"上游请求失败 (尝试 {attempt+1}/{retries+1}): {e}")
                    if attempt >= retries:
                        await send(_sse("error", {"type": "error", "error": f"对话失败: {e}"}))

        finally:
            try:
                await queue.put(None)
            except Exception:
                pass

    asyncio.create_task(producer())

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    }

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=headers
    )
