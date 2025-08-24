# /mnt/shop/chatapi/app.py
import asyncio, uuid, json, time
from typing import Any, Dict, List, Optional
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse, JSONResponse
from starlette.background import BackgroundTask

try:
    import orjson
    def dumps(obj): return orjson.dumps(obj).decode("utf-8")
except Exception:
    def dumps(obj): return json.dumps(obj, ensure_ascii=False)

from settings import (
    BIGMODEL_API_URL, BIGMODEL_API_KEY, BIGMODEL_MODEL,
    BIND_HOST, BIND_PORT, CORS_ALLOW_ORIGINS,
    MAX_CONNECTIONS, MAX_KEEPALIVE, REDIS_URL, SESSION_TTL
)
from tools import TOOLS, execute_tool_locally, parse_tool_args

# ========== 会话存储：内存（可选 Redis） ==========
class SessionStore:
    """基于内存；如配置 REDIS_URL，可替换实现为 redis-py。"""
    def __init__(self):
        self._store: Dict[str, Dict[str, Any]] = {}
    async def get(self, sid: str) -> Dict[str, Any]:
        s = self._store.get(sid)
        if not s:
            s = {"messages": [], "cart": {}, "ts": time.time()}
            self._store[sid] = s
        else:
            s["ts"] = time.time()
        return s
    async def set(self, sid: str, data: Dict[str, Any]):
        data["ts"] = time.time()
        self._store[sid] = data
    async def cleanup(self):
        now = time.time()
        drop = [k for k,v in self._store.items() if now - v.get("ts", now) > SESSION_TTL]
        for k in drop:
            self._store.pop(k, None)

SESSION = SessionStore()

# ========== HTTP 客户端与应用 ==========
# 关键：禁用 http2 以规避个别服务端/链路对 HTTP/2 + SSE 的缓冲
transport = httpx.AsyncHTTPTransport(retries=0, http2=False)
limits = httpx.Limits(max_connections=MAX_CONNECTIONS, max_keepalive_connections=MAX_KEEPALIVE)
client = httpx.AsyncClient(
    timeout=httpx.Timeout(300.0),
    limits=limits,
    transport=transport,
    headers={"Authorization": f"Bearer {BIGMODEL_API_KEY}"}
)
# 上游 SSE 请求头（避免压缩，要求按行推送）
UPSTREAM_SSE_HEADERS = {
    "Accept": "text/event-stream",
    "Accept-Encoding": "identity",
    "Cache-Control": "no-cache",
}

app = FastAPI(title="BBBTO Chat Relay API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz")
async def healthz():
    return {"ok": True, "model": BIGMODEL_MODEL}

def _ensure_cookie_session(request: Request, resp: Response) -> str:
    sid = request.cookies.get("chat_session")
    if not sid:
        sid = uuid.uuid4().hex
        resp.set_cookie("chat_session", sid, max_age=SESSION_TTL, httponly=False, samesite="Lax")
    return sid

def _sse(event: str, data: Dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {dumps(data)}\n\n".encode("utf-8")

async def _handle_tool_calls_and_continue(sid: str, base_messages: List[Dict[str, Any]], tool_calls: List[Dict[str, Any]], send):
    """
    收到工具调用后：发 started -> 执行 -> 发 finished -> 回写 tool -> 再次请求上游并继续流式
    这里的 send 是一个异步函数：await send(bytes)
    """
    sess = await SESSION.get(sid)
    cart = sess["cart"]

    for i, tc in enumerate(tool_calls, 1):
        tc_id   = tc.get("id") or f"call_{i}"
        fn_info = tc.get("function", {}) or {}
        name    = fn_info.get("name","")
        args_s  = fn_info.get("arguments","") or ""

        # 通知：开始
        await send(_sse("tool_status", {
            "type":"tool_status","status":"started","tool_call_id": tc_id,
            "function": {"name": name, "arguments": args_s}
        }))

        # 执行
        try:
            args = parse_tool_args(args_s)
        except Exception as e:
            tool_res = f"错误: 参数解析失败: {e}"
        else:
            tool_res = execute_tool_locally(name, args, cart)

        # 通知：完成
        result_is_json = not isinstance(tool_res, str)
        await send(_sse("tool_status", {
            "type":"tool_status","status":"finished","tool_call_id": tc_id,
            "result": tool_res if result_is_json else str(tool_res),
            "result_type": "json" if result_is_json else "text"
        }))

        # 回写 tool role
        base_messages.append({
            "role": "tool",
            "tool_call_id": tc_id,
            "content": json.dumps(tool_res, ensure_ascii=False) if result_is_json else str(tool_res)
        })

    # 保存回会话
    sess["messages"] = base_messages
    await SESSION.set(sid, sess)

    # 再次向上游请求，继续/收尾 —— 关键：client.stream + SSE 请求头
    payload = {
        "model": BIGMODEL_MODEL,
        "messages": base_messages,
        "stream": True,
        "tools": TOOLS,
        "thinking": {"type":"disabled"}
    }
    async with client.stream("POST", BIGMODEL_API_URL, json=payload, headers=UPSTREAM_SSE_HEADERS) as upstream:
        upstream.raise_for_status()
        async for line in upstream.aiter_lines():
            if not line:
                continue
            if not line.startswith("data: "):
                continue
            data = line[6:].strip()
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
            except Exception:
                continue
            choice = (chunk.get("choices") or [{}])[0]
            delta  = choice.get("delta", {})
            if "content" in delta and delta["content"]:
                await send(_sse("message", {"type":"delta","delta":delta["content"],"role":"assistant"}))

async def _stream_chat(request: Request, init_messages: List[Dict[str, Any]]) -> StreamingResponse:
    """
    返回一个 StreamingResponse（异步生成器）。
    通过 asyncio.Queue 把生产者逻辑与 SSE 输出解耦，确保边到边流式。
    """
    # 准备 SSE 输出队列
    queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue()

    async def send(chunk: bytes):
        await queue.put(chunk)

    async def event_generator():
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

    # SSE 响应头（提示代理不要缓冲/变换）
    sse_headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    streaming_resp = StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=sse_headers,
        background=BackgroundTask(SESSION.cleanup)
    )
    sid = _ensure_cookie_session(request, streaming_resp)

    # 生产者：与上游交互并逐行转发
    async def producer():
        try:
            # 读取/更新会话
            session = await SESSION.get(sid)
            messages = (session.get("messages") or []) + init_messages
            session["messages"] = messages
            await SESSION.set(sid, session)

            payload = {
                "model": BIGMODEL_MODEL,
                "messages": messages,
                "stream": True,
                "tools": TOOLS,
                "thinking": {"type":"disabled"}
            }
            # 关键：用 client.stream + 明确 SSE 请求头
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
                    delta  = choice.get("delta", {})

                    # 普通 token
                    if "content" in delta and delta["content"]:
                        text = delta["content"]
                        assistant_text_parts.append(text)
                        await send(_sse("message", {"type":"delta","delta":text,"role":"assistant"}))

                    # 工具调用聚合（BigModel 工具不流式）
                    if "tool_calls" in delta and delta["tool_calls"]:
                        part = delta["tool_calls"][0]
                        idx  = part.get("index", 0)
                        if idx not in tool_calls_buffer:
                            tool_calls_buffer[idx] = {"id":"","type":"function","function":{"name":"","arguments":""}}
                        if "id" in part and part["id"]:
                            tool_calls_buffer[idx]["id"] = part["id"]
                        if "function" in part:
                            fn = tool_calls_buffer[idx]["function"]
                            if "name" in part["function"] and part["function"]["name"]:
                                fn["name"] = part["function"]["name"]
                            if "arguments" in part["function"] and part["function"]["arguments"]:
                                fn["arguments"] += part["function"]["arguments"]

                    if choice.get("finish_reason"):
                        finish_reason = choice["finish_reason"]

            # 把这段助手消息写回历史
            assistant_joined = "".join(assistant_text_parts)
            session2 = await SESSION.get(sid)
            session2_messages = session2.get("messages") or []
            session2_messages.append({
                "role":"assistant",
                "content": assistant_joined,
                "tool_calls": [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())] if tool_calls_buffer else None
            })
            session2["messages"] = session2_messages
            await SESSION.set(sid, session2)

            # 若有工具调用，执行并继续
            if tool_calls_buffer and finish_reason in ("tool_calls","stop"):
                ordered = [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                base_messages = session2["messages"]
                await _handle_tool_calls_and_continue(sid, base_messages, ordered, send)

            # 收尾事件
            await send(_sse("completed", {"type":"completed","finish_reason": finish_reason or "stop"}))
        except Exception as e:
            await send(_sse("message", {"type":"error","error": str(e)}))
        finally:
            await queue.put(None)

    asyncio.create_task(producer())
    return streaming_resp

@app.post("/v1/chat")
async def chat(request: Request):
    # 解析输入
    ct = request.headers.get("content-type","")
    if ct and "application/json" in ct:
        body = await request.json()
        if isinstance(body, dict) and "messages" in body:
            messages = body["messages"]
        else:
            content = body["input"] if isinstance(body, dict) else str(body)
            messages = [{"role":"user","content": str(content)}]
    else:
        text = (await request.body()).decode("utf-8", errors="ignore")
        messages = [{"role":"user","content": text.strip()}]

    return await _stream_chat(request, messages)

@app.post("/v1/chat_nostream")
async def chat_nostream(request: Request):
    """非流式：一次性返回最终助手文本（不推荐，主要用于调试）"""
    ct = request.headers.get("content-type","")
    if ct and "application/json" in ct:
        body = await request.json()
        if isinstance(body, dict) and "messages" in body:
            messages = body["messages"]
        else:
            content = body["input"] if isinstance(body, dict) else str(body)
            messages = [{"role":"user","content": str(content)}]
    else:
        text = (await request.body()).decode("utf-8", errors="ignore")
        messages = [{"role":"user","content": text.strip()}]

    sid = request.cookies.get("chat_session") or uuid.uuid4().hex
    sess = await SESSION.get(sid)
    sess["messages"] = (sess.get("messages") or []) + messages
    await SESSION.set(sid, sess)

    r = await client.post(BIGMODEL_API_URL, json={
        "model": BIGMODEL_MODEL, "messages": sess["messages"], "stream": False, "tools": TOOLS,
        "thinking": {"type":"disabled"}
    }, headers={"Accept-Encoding":"identity"})
    r.raise_for_status()
    data = r.json()
    choice = (data.get("choices") or [{}])[0]
    msg    = choice.get("message") or {}
    tool_calls = msg.get("tool_calls") or []
    assistant_text = msg.get("content") or ""

    if tool_calls:
        # 执行工具
        for i, tc in enumerate(tool_calls, 1):
            name = tc.get("function",{}).get("name","")
            args = parse_tool_args(tc.get("function",{}).get("arguments","") or "")
            res  = execute_tool_locally(name, args, sess["cart"])
            sess["messages"].append({
                "role":"tool",
                "tool_call_id": tc.get("id", f"call_{i}"),
                "content": json.dumps(res, ensure_ascii=False) if not isinstance(res, str) else res
            })
        await SESSION.set(sid, sess)
        # 再次请求
        r2 = await client.post(BIGMODEL_API_URL, json={
            "model": BIGMODEL_MODEL, "messages": sess["messages"], "stream": False, "tools": TOOLS,
            "thinking": {"type":"disabled"}
        }, headers={"Accept-Encoding":"identity"})
        r2.raise_for_status()
        data2 = r2.json()
        choice2 = (data2.get("choices") or [{}])[0]
        msg2 = choice2.get("message") or {}
        assistant_text = msg2.get("content") or assistant_text

    return JSONResponse({"ok": True, "content": assistant_text})

# 优雅关闭
@app.on_event("shutdown")
async def _shutdown():
    await client.aclose()
