# /mnt/shop/chatapi/tools.py
import json, re
from typing import Any, Dict, List, Tuple

# ---------- 可选的模糊匹配依赖 ----------
try:
    from fuzzywuzzy import fuzz, process  # pip install fuzzywuzzy python-Levenshtein
    _HAVE_FUZZ = True
except Exception:
    _HAVE_FUZZ = False

# ===== 示例商品库（内存模拟） =====
CATALOG: Dict[str, Dict[str, Any]] = {
    "sku_iphone15p": {
        "name": "Apple iPhone 15 Pro 256GB",
        "brand": "Apple",
        "category": "手机",
        "price": 8999,
        "stock": 5,
    },
    "sku_wh1000xm5": {
        "name": "Sony WH-1000XM5 头戴耳机",
        "brand": "Sony",
        "category": "耳机",
        "price": 2499,
        "stock": 12,
    },
    "sku_switch_oled": {
        "name": "Nintendo Switch OLED",
        "brand": "Nintendo",
        "category": "游戏机",
        "price": 2599,
        "stock": 8,
    },
    "sku_legotech_car": {
        "name": "LEGO Technic 跑车 42161",
        "brand": "LEGO",
        "category": "玩具",
        "price": 1699,
        "stock": 20,
    },
    "sku_nike_peg41": {
        "name": "Nike Air Zoom Pegasus 41",
        "brand": "Nike",
        "category": "跑鞋",
        "price": 899,
        "stock": 15,
    },
    "sku_nespresso_pixie": {
        "name": "Nespresso Pixie 胶囊咖啡机",
        "brand": "Nespresso",
        "category": "家电",
        "price": 1299,
        "stock": 6,
    },
}

# ===== 工具 schema（与模型约定） =====
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search for products in the store by keyword",
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
                        "description": "Maximum number of products to return, default is 10",
                        "default": 10
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_cart",
            "description": "Update the shopping cart: add/update/remove/clear. Supports single and batch operations",
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
]

# ------------------ 解析工具参数（增强容错版） ------------------
def _extract_first_balanced_json(s: str) -> str:
    """
    从字符串中提取第一个平衡的 JSON 片段（对象或数组）。
    只处理 { } 和 [ ]，并正确跳过字符串字面量里的括号。
    """
    start = None
    for i, ch in enumerate(s):
        if ch in "{[":
            start = i
            break
    if start is None:
        return ""

    stack = []
    in_str = False
    esc = False
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        else:
            if ch == '"':
                in_str = True
                continue
            if ch in "{[":
                stack.append(ch)
            elif ch in "}]":
                if not stack:
                    return ""
                top = stack.pop()
                if (top == "{" and ch != "}") or (top == "[" and ch != "]"):
                    return ""
                if not stack:
                    # 完整片段
                    return s[start:i+1]
    return ""

def parse_tool_args(arg: Any) -> Dict[str, Any]:
    """
    强韧解析模型传来的 function.arguments：
    - 支持 dict 直接返回
    - 支持字符串包含多个 JSON 片段：顺序 raw_decode 合并
    - 清理尾随逗号/控制字符
    - 提取首个平衡 JSON 片段解析
    - 最终失败也返回 {}
    """
    if isinstance(arg, dict):
        return arg
    if isinstance(arg, list):
        return {"__args__": arg}
    if arg is None:
        return {}

    s = str(arg).strip()
    if not s:
        return {}

    # 清除常见流式残留：在 } ] 前的尾随逗号
    s = re.sub(r",\s*([}\]])", r"\1", s)
    # 控制字符（保留 \n \t）
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", s)

    # 1) 直接解析
    try:
        obj = json.loads(s)
        return obj if isinstance(obj, dict) else {"__args__": obj}
    except Exception:
        pass

    # 2) 逐段 raw_decode 合并（处理多个 JSON 连在一起/有逗号分隔等）
    try:
        dec = json.JSONDecoder()
        idx = 0
        merged: Dict[str, Any] = {}
        extras: List[Any] = []
        n = len(s)
        while idx < n:
            # 跳过空白和逗号
            while idx < n and s[idx] in " \r\n\t,":
                idx += 1
            if idx >= n:
                break
            # 对齐到 { 或 [
            if s[idx] not in "{[":
                nxt_obj = s.find("{", idx)
                nxt_arr = s.find("[", idx)
                cands = [p for p in (nxt_obj, nxt_arr) if p != -1]
                if not cands:
                    break
                idx = min(cands)
            try:
                obj, end = dec.raw_decode(s, idx)
            except Exception:
                break
            if isinstance(obj, dict):
                merged.update(obj)
            else:
                extras.append(obj)
            idx = end
        if merged or extras:
            if extras:
                merged["__args__"] = extras if len(extras) > 1 else extras[0]
            return merged
    except Exception:
        pass

    # 3) 提取首个平衡 JSON 片段
    seg = _extract_first_balanced_json(s)
    if seg:
        try:
            obj = json.loads(seg)
            return obj if isinstance(obj, dict) else {"__args__": obj}
        except Exception:
            pass

    # 4) 兜底：尝试把单引号替换为双引号（不保证 100%）
    s2 = re.sub(r"(?<!\\)'", '"', s)
    try:
        obj = json.loads(s2)
        return obj if isinstance(obj, dict) else {"__args__": obj}
    except Exception:
        return {}  # 永不抛异常

def parse_tool_args_multiple(arg: Any) -> List[Dict[str, Any]]:
    """
    专门处理串联JSON参数的情况
    返回一个参数字典列表，每个字典代表一个独立的工具调用
    """
    if isinstance(arg, dict):
        return [arg]
    if isinstance(arg, list):
        return [{"__args__": arg}]
    if arg is None:
        return [{}]

    s = str(arg).strip()
    if not s:
        return [{}]

    # 清理格式
    s = re.sub(r",\s*([}\]])", r"\1", s)
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", s)

    # 检测是否为串联JSON的特征
    # 特征1：连续的}{模式
    if "}{"in s:
        # 尝试分割并解析
        parts = []
        try:
            dec = json.JSONDecoder()
            idx = 0
            n = len(s)
            while idx < n:
                # 跳过空白
                while idx < n and s[idx] in " \r\n\t,":
                    idx += 1
                if idx >= n:
                    break
                # 寻找JSON对象开始
                if s[idx] != '{':
                    next_obj = s.find("{", idx)
                    if next_obj == -1:
                        break
                    idx = next_obj
                
                try:
                    obj, end = dec.raw_decode(s, idx)
                    if isinstance(obj, dict) and obj:  # 确保非空
                        parts.append(obj)
                    idx = end
                except Exception:
                    # 解析失败，尝试寻找下一个{
                    next_obj = s.find("{", idx + 1)
                    if next_obj == -1:
                        break
                    idx = next_obj
            
            if len(parts) > 1:
                return parts
        except Exception:
            pass
    
    # 尝试单个解析
    single_result = parse_tool_args(arg)
    return [single_result] if single_result else [{}]


# ------------------ 工具实现（使用传入的 cart） ------------------
def _search_products_impl(query, limit: int = 10) -> Dict[str, Any]:
    # 支持单个字符串或字符串数组
    if isinstance(query, list):
        # 多查询模式
        all_results = {}
        product_scores = {}  # product_id -> [(query, score, item), ...]
        
        for q in query:
            q_str = (q or "").strip().lower()
            if not q_str:
                continue
                
            # 单次搜索
            single_result = _search_single_query(q_str, limit)
            all_results[q] = single_result
            
            # 收集每个商品在各查询中的得分
            for item in single_result["items"]:
                pid = item["product_id"]
                score = item["relevance_score"]
                if pid not in product_scores:
                    product_scores[pid] = []
                product_scores[pid].append((q, score, item))
        
        # 智能去重：根据分数和查询优先级决定保留哪些结果
        filtered_results = {}
        total_unique_count = 0
        
        for q in query:
            if q not in all_results:
                continue
            filtered_results[q] = {
                "ok": all_results[q]["ok"],
                "query": q,
                "count": 0,
                "items": []
            }
        
        # 处理每个商品的去重逻辑
        for pid, appearances in product_scores.items():
            if len(appearances) == 1:
                # 只在一个查询中出现，直接保留
                q, score, item = appearances[0]
                filtered_results[q]["items"].append(item)
            else:
                # 在多个查询中出现，需要去重
                high_score_appearances = [(q, s, item) for q, s, item in appearances if s >= 80]
                
                if high_score_appearances:
                    # 有高分结果，保留所有高分结果
                    for q, score, item in high_score_appearances:
                        filtered_results[q]["items"].append(item)
                else:
                    # 都是低分，只保留第一个出现的
                    first_q, first_score, first_item = appearances[0]
                    filtered_results[first_q]["items"].append(first_item)
        
        # 更新每个查询的商品数量，并计算总数
        for q in filtered_results:
            items = filtered_results[q]["items"]
            # 按相关性重新排序
            items.sort(key=lambda x: x["relevance_score"], reverse=True)
            # 限制数量
            if len(items) > limit:
                items = items[:limit]
            filtered_results[q]["items"] = items
            filtered_results[q]["count"] = len(items)
            total_unique_count += len(items)
        
        return {
            "ok": True,
            "multi_query": True,
            "queries": query,
            "results": filtered_results,
            "count": total_unique_count
        }
    else:
        # 单查询模式，保持原有格式
        return _search_single_query(query, limit)

def _search_single_query(query: str, limit: int = 10) -> Dict[str, Any]:
    q = (query or "").strip().lower()
    if not q:
        return {"ok": True, "query": query, "count": 0, "items": []}

    # 构造候选
    candidates = {}
    for pid, p in CATALOG.items():
        candidates[pid] = f"{p.get('name','')} {p.get('brand','')} {p.get('category','')}".lower()

    items: List[Dict[str, Any]] = []
    if _HAVE_FUZZ:
        scored = process.extract(q, candidates, scorer=fuzz.partial_ratio, limit=len(candidates))
        for matched_text, score, pid in scored:
            if score >= 60:
                p = CATALOG[pid]
                items.append({
                    "product_id": pid,
                    "name": p["name"], "brand": p["brand"], "category": p["category"],
                    "price": p["price"], "stock": p["stock"], "in_stock": p["stock"] > 0,
                    "relevance_score": score
                })
                if len(items) >= int(limit or 10):
                    break
        items.sort(key=lambda x: x["relevance_score"], reverse=True)
    else:
        # 无 fuzzywuzzy 时的简单包含匹配
        for pid, text in candidates.items():
            if q in text:
                p = CATALOG[pid]
                items.append({
                    "product_id": pid,
                    "name": p["name"], "brand": p["brand"], "category": p["category"],
                    "price": p["price"], "stock": p["stock"], "in_stock": p["stock"] > 0,
                    "relevance_score": 100 if q == text else 60
                })
        items = sorted(items, key=lambda x: x["relevance_score"], reverse=True)[: int(limit or 10)]

    return {"ok": True, "query": query, "count": len(items), "items": items}

def _item_view(product_id: str, quantity: int) -> Dict[str, Any]:
    prod = CATALOG[product_id]
    unit = float(prod["price"])
    return {
        "product_id": product_id,
        "name": prod["name"],
        "unit_price": unit,
        "quantity": int(quantity),
        "subtotal": round(unit * int(quantity), 2)
    }

def _update_single_item(cart: Dict[str, int], action: str, product_id: str, quantity: Any = None) -> str:
    if product_id not in CATALOG:
        return "商品不存在"

    if action == "remove":
        cart.pop(product_id, None)
        return "删除成功"

    # add / update 都需要数量
    if quantity is None:
        q = 1 if action == "add" else None
        if q is None:
            return "update 需要 quantity"
    else:
        try:
            q = int(quantity)
        except Exception:
            return "非法的数量"
        if q < 0:
            return "数量不能为负数"
        if action == "update" and q == 0:
            return "update 数量不可为 0，请改用 remove"

    stock = int(CATALOG[product_id]["stock"])

    if action == "add":
        new_q = cart.get(product_id, 0) + q
        if new_q > stock:
            new_q = stock
        cart[product_id] = new_q
        return f"添加成功，当前数量: {new_q}"

    if action == "update":
        if q > stock:
            q = stock
        cart[product_id] = q
        return f"数量修改成功，当前数量: {q}"

    return "未处理的分支"

def _update_cart_impl(cart: Dict[str, int], action: str, product_id: Any = None, quantity: Any = None):
    if action not in ("add", "update", "remove", "clear"):
        return {"ok": False, "error": "不支持的action"}

    if action == "clear":
        cart.clear()
        return {"ok": True, "message": "购物车已清空", "action": "clear"}

    if product_id is None:
        return {"ok": False, "error": "需要提供 product_id"}

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
        return {"ok": False, "error": "product_id 必须是字符串或列表"}

    if len(quantities) != len(product_ids):
        return {"ok": False, "error": "商品ID和数量的数量不匹配"}

    results = []
    success_count = 0
    for i, pid in enumerate(product_ids):
        qty = quantities[i]
        result = _update_single_item(cart, action, pid, qty)
        if not result.startswith("错误") and "失败" not in result:
            success_count += 1
        results.append(f"商品 {pid}: {result}")

    return {
        "ok": success_count > 0,
        "action": action,
        "processed": len(product_ids),
        "successful": success_count,
        "details": results
    }

def _get_cart_impl(cart: Dict[str, int]) -> Dict[str, Any]:
    items = []
    total_qty = 0
    total_price = 0.0
    for pid, qty in cart.items():
        if pid not in CATALOG:
            continue
        view = _item_view(pid, qty)
        total_qty += int(qty)
        total_price += view["subtotal"]
        items.append(view)
    return {"ok": True, "items": items, "total_quantity": total_qty, "total_price": round(total_price, 2)}

# 统一入口（使用会话级 cart）
def execute_tool_locally(name: str, args: Dict[str, Any], cart: Dict[str, int]) -> Any:
    try:
        if name == "search_products":
            return _search_products_impl(args.get("query", ""), int(args.get("limit", 10)))
        elif name == "update_cart":
            return _update_cart_impl(
                cart=cart,
                action=str(args.get("action", "")),
                product_id=args.get("product_id", None),
                quantity=args.get("quantity", None),
            )
        elif name == "get_cart":
            return _get_cart_impl(cart)
        else:
            return {"ok": False, "error": f"未知的工具: {name}"}
    except Exception as e:
        # 不让异常冒出，始终返回 JSON
        return {"ok": False, "error": f"工具执行异常: {e}"}
