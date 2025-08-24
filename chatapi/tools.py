# /mnt/shop/chatapi/tools.py
from typing import Dict, Any, List
import json, re
from fuzzywuzzy import fuzz, process  # pip install fuzzywuzzy python-Levenshtein

# ===== 工具定义（与模型侧 schema 对齐） =====
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "根据关键词搜索商城中的商品",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索的关键词，例如商品名称或类别"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回的最大商品数量，默认10",
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
            "description": "更新购物车中的商品数量、删除商品、添加新商品或清空购物车。支持单个和批量操作",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["add", "update", "remove", "clear"],
                        "description": "操作类型：添加(add)，更新(update)，删除(remove)，清空购物车(clear)"
                    },
                    "product_id": {
                        "type": ["string", "array"],
                        "description": "商品唯一ID，可以是单个字符串或多个商品ID的数组"
                    },
                    "quantity": {
                        "type": ["integer", "array"],
                        "description": "商品数量（仅在add/update时使用），可以是单个数字或数量数组"
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
            "description": "获取当前购物车中的所有商品内容",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]

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

# ===== 工具实现（注意：购物车是“会话级”） =====
def _search_products_impl(query: str, limit: int = 10) -> Dict[str, Any]:
    q = (query or "").strip().lower()
    search_candidates = {}
    for pid, p in CATALOG.items():
        search_text = f"{p.get('name','')} {p.get('brand','')} {p.get('category','')}"
        search_candidates[pid] = search_text

    matches = []
    scored_items = process.extract(q, search_candidates, scorer=fuzz.partial_ratio, limit=len(CATALOG))
    for match_text, score, pid in scored_items:
        if score >= 50:
            p = CATALOG[pid]
            matches.append({
                "product_id": pid,
                "name": p["name"],
                "brand": p["brand"],
                "category": p["category"],
                "price": p["price"],
                "stock": p["stock"],
                "in_stock": p["stock"] > 0,
                "relevance_score": score
            })
            if len(matches) >= int(limit or 10):
                break
    matches.sort(key=lambda x: x["relevance_score"], reverse=True)
    return {"ok": True, "query": query, "count": len(matches), "items": matches}

def _item_view(catalog: Dict[str, Any], product_id: str, quantity: int) -> Dict[str, Any]:
    prod = catalog[product_id]
    unit = float(prod["price"])
    return {
        "product_id": product_id,
        "name": prod["name"],
        "unit_price": unit,
        "quantity": quantity,
        "subtotal": round(unit * quantity, 2)
    }

def _update_single_item(cart: Dict[str, int], action: str, product_id: str, quantity: Any = None):
    if product_id not in CATALOG:
        return "商品不存在"
    if action == "remove":
        cart.pop(product_id, None)
        return "删除成功"
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
        return "错误: 不支持的action"
    if action == "clear":
        cart.clear()
        return "购物车已清空"
    if product_id is None:
        return "错误: 需要提供 product_id"
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
        return "错误: product_id 必须是字符串或列表"
    if len(quantities) != len(product_ids):
        return "错误: 商品ID和数量的数量不匹配"

    results = []
    for i, pid in enumerate(product_ids):
        qty = quantities[i]
        result = _update_single_item(cart, action, pid, qty)
        results.append(f"商品 {pid}: {result}")
    return "\n".join(results)

def _get_cart_impl(cart: Dict[str, int]) -> Dict[str, Any]:
    items, total_qty, total_price = [], 0, 0.0
    for pid, qty in cart.items():
        if pid not in CATALOG:
            continue
        view = _item_view(CATALOG, pid, qty)
        total_qty += qty
        total_price += view["subtotal"]
        items.append(view)
    return {"ok": True, "items": items, "total_quantity": total_qty, "total_price": round(total_price, 2)}

def execute_tool_locally(name: str, args: Dict[str, Any], cart: Dict[str, int]):
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
            return "错误: 未知的工具"
    except Exception as e:
        return f"错误: 工具执行异常: {e}"

# 工具参数解析（健壮处理）
def parse_tool_args(arg_str: str) -> Dict[str, Any]:
    s = (arg_str or "").strip()
    s = re.sub(r",\s*}", "}", s)
    s = re.sub(r",\s*]", "]", s)
    try:
        return json.loads(s) if s else {}
    except Exception:
        s2 = re.sub(r"[\x00-\x1f]", "", s)
        return json.loads(s2) if s2 else {}
