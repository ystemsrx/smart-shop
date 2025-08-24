# /mnt/shop/chatapi/app.py
import asyncio, uuid, json, time, logging
from typing import Any, Dict, List, Optional, Tuple
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse, JSONResponse
from starlette.background import BackgroundTask
from starlette.exceptions import HTTPException as StarletteHTTPException
from contextlib import asynccontextmanager

try:
    import orjson
    def dumps(obj): return orjson.dumps(obj).decode("utf-8")
except Exception:
    def dumps(obj): return json.dumps(obj, ensure_ascii=False)

from settings import (
    BIGMODEL_API_URL, BIGMODEL_API_KEY, BIGMODEL_MODEL,
    BIND_HOST, BIND_PORT, CORS_ALLOW_ORIGINS,
    MAX_CONNECTIONS, MAX_KEEPALIVE, REDIS_URL, SESSION_TTL, SYSTEM_PROMPT
)
from tools import TOOLS, execute_tool_locally, parse_tool_args, parse_tool_args_multiple

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
log = logging.getLogger("chatapi")

# ===== 会话存储 =====
class SessionStore:
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

# ===== HTTP 客户端（禁用 HTTP/2） =====
transport = httpx.AsyncHTTPTransport(retries=0, http2=False)
limits = httpx.Limits(max_connections=MAX_CONNECTIONS, max_keepalive_connections=MAX_KEEPALIVE)
client = httpx.AsyncClient(timeout=httpx.Timeout(300.0), limits=limits, transport=transport,
                           headers={"Authorization": f"Bearer {BIGMODEL_API_KEY}"})
UPSTREAM_SSE_HEADERS = {"Accept":"text/event-stream","Accept-Encoding":"identity","Cache-Control":"no-cache"}

# ===== Lifespan =====
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    try:
        await client.aclose()
    except Exception:
        pass

app = FastAPI(title="BBBTO Chat Relay API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ALLOW_ORIGINS,
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ===== 通用 =====
def error_json(code: str, message: str, status: int = 400, details: Any = None) -> JSONResponse:
    payload: Dict[str, Any] = {"ok": False, "error": {"code": code, "message": message}}
    if details is not None:
        payload["error"]["details"] = details
    return JSONResponse(payload, status_code=status)

def _ensure_cookie_session(request: Request, resp: Response) -> str:
    sid = request.cookies.get("chat_session")
    if not sid:
        sid = uuid.uuid4().hex
        resp.set_cookie("chat_session", sid, max_age=SESSION_TTL, httponly=False, samesite="Lax")
    return sid

def _add_system_prompt(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """在消息列表开头添加系统提示词（如果配置了的话）"""
    if not SYSTEM_PROMPT or not SYSTEM_PROMPT.strip():
        return messages
    
    # 检查是否已经有系统消息
    if messages and messages[0].get("role") == "system":
        return messages
    
    # 在开头添加系统消息
    system_message = {"role": "system", "content": SYSTEM_PROMPT.strip()}
    return [system_message] + messages

def _sse(event: str, data: Dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {dumps(data)}\n\n".encode("utf-8")

def _coerce_messages(obj: Any) -> List[Dict[str, Any]]:
    if isinstance(obj, str):
        return [{"role":"user","content": obj}]
    if isinstance(obj, list):
        out: List[Dict[str, Any]] = []
        for i, m in enumerate(obj):
            if isinstance(m, str):
                out.append({"role":"user","content": m}); continue
            if not isinstance(m, dict):
                raise ValueError(f"messages[{i}] 必须是对象或字符串")
            role = m.get("role"); content = m.get("content")
            if not role and content: role = "user"
            if not role or content is None:
                raise ValueError(f"messages[{i}] 需要包含 role 和 content")
            if not isinstance(content, (str,int,float)):
                content = json.dumps(content, ensure_ascii=False)
            out.append({"role": str(role), "content": str(content)})
        return out
    if isinstance(obj, dict) and "messages" in obj:
        return _coerce_messages(obj["messages"])
    raise ValueError("无法解析为 messages")

async def _parse_messages_from_request(request: Request):
    try:
        ct = request.headers.get("content-type","")
    except Exception:
        ct = ""
    if ct and "application/json" in ct.lower():
        try:
            raw = await request.body()
        except Exception as e:
            return None, error_json("read_body_failed", f"读取请求体失败: {e}", 400)
        try:
            body = json.loads(raw.decode("utf-8", errors="ignore"))
        except Exception as e:
            preview = raw[:128]
            return None, error_json("invalid_json", f"JSON 解析失败: {e}", 400, {"preview": preview.decode("utf-8","ignore")})
        try:
            if isinstance(body, dict) and "messages" in body:
                messages = _coerce_messages(body["messages"])
            else:
                content = body.get("input") if isinstance(body, dict) else str(body)
                messages = _coerce_messages(content)
        except ValueError as ve:
            return None, error_json("invalid_messages", str(ve), 400)
        return messages, None
    try:
        text = (await request.body()).decode("utf-8", errors="ignore")
    except Exception as e:
        return None, error_json("read_body_failed", f"读取请求体失败: {e}", 400)
    return [{"role":"user","content": text.strip()}], None

# ===== 健康检查 =====
@app.get("/healthz")
async def healthz():
    return {"ok": True, "model": BIGMODEL_MODEL}

# ===== 工具处理并继续流式 =====
async def _handle_tool_calls_and_continue(sid: str, base_messages: List[Dict[str, Any]],
                                          tool_calls: List[Dict[str, Any]], send):
    sess = await SESSION.get(sid)
    cart = sess["cart"]

    for i, tc in enumerate(tool_calls, 1):
        tc_id = tc.get("id") or f"call_{i}"
        fn_info = tc.get("function", {}) or {}
        name = fn_info.get("name","")
        args_s = fn_info.get("arguments","") or ""

        # 发 started
        await send(_sse("tool_status", {
            "type":"tool_status","status":"started","tool_call_id": tc_id,
            "function": {"name": name, "arguments": args_s}
        }))

        # 执行工具（解析容错 + 永不抛异常）
        try:
            args = parse_tool_args(args_s)
            tool_res = execute_tool_locally(name, args, cart)
            if isinstance(tool_res, str):
                tool_res = {"ok": False, "error": tool_res}
        except Exception as e:
            log.exception("Tool execution failed")
            tool_res = {"ok": False, "error": f"工具执行异常: {e}", "raw_args_preview": str(args_s)[:200]}

        # 发 finished
        await send(_sse("tool_status", {
            "type":"tool_status","status":"finished","tool_call_id": tc_id,
            "result": tool_res, "result_type": "json"
        }))

        # 回写 tool role
        base_messages.append({
            "role":"tool","tool_call_id": tc_id,
            "content": json.dumps(tool_res, ensure_ascii=False)
        })

    # Save and continue to upstream API
    sess["messages"] = base_messages
    await SESSION.set(sid, sess)

    # 添加系统提示词到消息列表
    messages_with_system = _add_system_prompt(base_messages)
    payload = {"model": BIGMODEL_MODEL, "messages": messages_with_system, "stream": True,
               "tools": TOOLS, "thinking": {"type":"disabled"}}
    

    
    retries = 2
    for attempt in range(retries + 1):
        try:
            async with client.stream("POST", BIGMODEL_API_URL, json=payload, headers=UPSTREAM_SSE_HEADERS) as upstream:
                upstream.raise_for_status()
                tool_calls_buffer: Dict[int, Dict[str, Any]] = {}
                assistant_text_parts: List[str] = []
                finish_reason: Optional[str] = None
                
                async for line in upstream.aiter_lines():
                    if not line or not line.startswith("data: "): continue
                    data = line[6:].strip()
                    if data == "[DONE]": break
                    try:
                        chunk = json.loads(data)
                    except Exception:
                        continue
                    choice = (chunk.get("choices") or [{}])[0]
                    delta = choice.get("delta", {})
                    
                    if "content" in delta and delta["content"]:
                        text = delta["content"]
                        assistant_text_parts.append(text)
                        await send(_sse("message", {"type":"delta","delta":text,"role":"assistant"}))
                    
                    # 处理可能的新工具调用
                    if "tool_calls" in delta and delta["tool_calls"]:
                        for part in delta["tool_calls"]:
                            idx = part.get("index", 0)
                            if idx not in tool_calls_buffer:
                                tool_calls_buffer[idx] = {"id":"","type":"function",
                                                          "function":{"name":"","arguments":""}}
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
                    # 更新会话消息
                    assistant_content = "".join(assistant_text_parts)
                    sess = await SESSION.get(sid)
                    sess["messages"].append({
                        "role":"assistant",
                        "content": assistant_content,
                        "tool_calls": [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                    })
                    await SESSION.set(sid, sess)
                    
                    # 递归处理新的工具调用
                    ordered = [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                    await _handle_tool_calls_and_continue(sid, sess["messages"], ordered, send)
                else:
                    # 没有新工具调用，正常结束
                    await send(_sse("completed", {"type":"completed","finish_reason": finish_reason or "stop"}))
            break
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}"
            try:
                error_body = await e.response.aread()
                error_text = error_body.decode('utf-8', errors='ignore')
                error_detail += f": {error_text[:200]}"
            except Exception:
                pass
            
            log.warning(f"Upstream stream failed (attempt {attempt+1}/{retries+1}): {error_detail}")
            if attempt >= retries:
                await send(_sse("error", {"type":"error","error": f"上游流式失败: {error_detail}"}))
        except httpx.HTTPError as e:
            log.warning(f"Upstream stream failed (attempt {attempt+1}/{retries+1}): {e}")
            if attempt >= retries:
                await send(_sse("error", {"type":"error","error": f"上游流式失败: {e}"}))

# ===== 主流式流程 =====
async def _stream_chat(request: Request, init_messages: List[Dict[str, Any]]) -> StreamingResponse:
    queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue()

    async def send(chunk: bytes):
        try:
            await queue.put(chunk)
        except asyncio.CancelledError:
            return

    async def event_generator():
        while True:
            item = await queue.get()
            if item is None: break
            yield item

    headers = {"Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"}
    resp = StreamingResponse(event_generator(), media_type="text/event-stream",
                             headers=headers, background=BackgroundTask(SESSION.cleanup))
    sid = _ensure_cookie_session(request, resp)

    async def heartbeat():
        try:
            while True:
                await asyncio.sleep(20)
                await send(_sse("ping", {}))
        except asyncio.CancelledError:
            return

    async def producer():
        hb_task: Optional[asyncio.Task] = None
        try:
            hb_task = asyncio.create_task(heartbeat())
            session = await SESSION.get(sid)
            messages = (session.get("messages") or []) + init_messages
            session["messages"] = messages
            await SESSION.set(sid, session)

            # 添加系统提示词到消息列表
            messages_with_system = _add_system_prompt(messages)
            payload = {"model": BIGMODEL_MODEL, "messages": messages_with_system, "stream": True,
                       "tools": TOOLS, "thinking": {"type":"disabled"}}

            retries = 2
            last_error: Optional[str] = None
            for attempt in range(retries + 1):
                try:
                    async with client.stream("POST", BIGMODEL_API_URL, json=payload, headers=UPSTREAM_SSE_HEADERS) as upstream:
                        upstream.raise_for_status()
                        tool_calls_buffer: Dict[int, Dict[str, Any]] = {}
                        assistant_text_parts: List[str] = []
                        finish_reason: Optional[str] = None

                        async for line in upstream.aiter_lines():
                            if not line or not line.startswith("data: "): continue
                            data = line[6:].strip()
                            if data == "[DONE]": break
                            try:
                                chunk = json.loads(data)
                            except Exception:
                                continue

                            choice = (chunk.get("choices") or [{}])[0]
                            delta = choice.get("delta", {})

                            if "content" in delta and delta["content"]:
                                text = delta["content"]
                                assistant_text_parts.append(text)
                                await send(_sse("message", {"type":"delta","delta":text,"role":"assistant"}))

                            # 多工具聚合：逐个 part 合并
                            if "tool_calls" in delta and delta["tool_calls"]:
                                for part in delta["tool_calls"]:
                                    idx = part.get("index", 0)
                                    if idx not in tool_calls_buffer:
                                        tool_calls_buffer[idx] = {"id":"","type":"function",
                                                                  "function":{"name":"","arguments":""}}
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
                    session2 = await SESSION.get(sid)
                    session2_messages = session2.get("messages") or []
                    session2_messages.append({
                        "role":"assistant",
                        "content": assistant_joined,
                        "tool_calls": [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())] if tool_calls_buffer else None
                    })
                    session2["messages"] = session2_messages
                    await SESSION.set(sid, session2)

                    # 有工具就全部执行
                    if tool_calls_buffer:
                        ordered = [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                        base_messages = session2["messages"]
                        await _handle_tool_calls_and_continue(sid, base_messages, ordered, send)
                    else:
                        # 没有工具调用，正常结束
                        await send(_sse("completed", {"type":"completed","finish_reason": finish_reason or "stop"}))
                        
                    last_error = None
                    break
                except httpx.HTTPStatusError as e:
                    last_error = f"上游返回非 2xx: {e.response.status_code}"
                    log.warning(last_error)
                except httpx.HTTPError as e:
                    last_error = f"上游网络错误: {e}"
                    log.warning(last_error)
                except asyncio.CancelledError:
                    return
                except Exception as e:
                    last_error = f"未知异常: {e}"
                    log.exception("producer error")
                await asyncio.sleep(0.5 * (attempt + 1))

            if last_error:
                await send(_sse("message", {"type":"error","error": last_error}))
                await send(_sse("completed", {"type":"completed","finish_reason": "error"}))
        finally:
            if hb_task: hb_task.cancel()
            try: await queue.put(None)
            except Exception: pass

    asyncio.create_task(producer())
    return resp

# ===== 路由 =====
@app.post("/v1/chat")
async def chat(request: Request):
    messages, err = await _parse_messages_from_request(request)
    if err is not None:
        return err
    return await _stream_chat(request, messages)

@app.post("/v1/chat_nostream")
async def chat_nostream(request: Request):
    messages, err = await _parse_messages_from_request(request)
    if err is not None:
        return err

    sid = request.cookies.get("chat_session") or uuid.uuid4().hex
    sess = await SESSION.get(sid)
    sess["messages"] = (sess.get("messages") or []) + messages
    await SESSION.set(sid, sess)

    def _post_json(payload):
        return client.post(BIGMODEL_API_URL, json=payload, headers={"Accept-Encoding":"identity"})

    try:
        # 添加系统提示词到消息列表
        messages_with_system = _add_system_prompt(sess["messages"])
        r = await _post_json({"model": BIGMODEL_MODEL, "messages": messages_with_system, "stream": False,
                              "tools": TOOLS, "thinking": {"type":"disabled"}})
        r.raise_for_status()
        data = r.json()
    except httpx.HTTPError as e:
        return error_json("upstream_error", f"上游请求失败: {e}", 502)
    except Exception as e:
        return error_json("unknown_error", f"解析上游响应失败: {e}", 500)

    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    tool_calls = msg.get("tool_calls") or []
    assistant_text = msg.get("content") or ""

    if tool_calls:
        try:
            for i, tc in enumerate(tool_calls, 1):
                name = tc.get("function",{}).get("name","")
                args = parse_tool_args(tc.get("function",{}).get("arguments","") or "")
                res = execute_tool_locally(name, args, sess["cart"])
                if isinstance(res, str): res = {"ok": False, "error": res}
                sess["messages"].append({
                    "role":"tool","tool_call_id": tc.get("id", f"call_{i}"),
                    "content": json.dumps(res, ensure_ascii=False)
                })
            await SESSION.set(sid, sess)
        except Exception as e:
            # 工具失败不阻塞：返回第一段 + 错误信息
            return JSONResponse({"ok": True, "content": assistant_text,
                                 "tool_error": f"{e}"}, status_code=200)

        try:
            # 添加系统提示词到消息列表（工具调用后的第二次请求）
            messages_with_system_2 = _add_system_prompt(sess["messages"])
            r2 = await _post_json({"model": BIGMODEL_MODEL, "messages": messages_with_system_2, "stream": False,
                                   "tools": TOOLS, "thinking": {"type":"disabled"}})
            r2.raise_for_status()
            data2 = r2.json()
        except httpx.HTTPError as e:
            return JSONResponse({"ok": True, "content": assistant_text,
                                 "followup_error": str(e)}, status_code=200)
        except Exception as e:
            return JSONResponse({"ok": True, "content": assistant_text,
                                 "followup_error": f"解析失败: {e}"}, status_code=200)

        choice2 = (data2.get("choices") or [{}])[0]
        msg2 = choice2.get("message") or {}
        assistant_text = msg2.get("content") or assistant_text

    return JSONResponse({"ok": True, "content": assistant_text})

# ===== 全局异常处理 =====
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return error_json("http_error", exc.detail if isinstance(exc.detail, str) else str(exc.detail), exc.status_code)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log.exception("Unhandled exception")
    return error_json("internal_error", f"{exc.__class__.__name__}: {exc}", 500)
