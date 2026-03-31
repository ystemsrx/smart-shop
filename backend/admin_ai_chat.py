# /backend/admin_ai_chat.py
"""管理员/代理 AI 助手核心逻辑。

复用 ai_chat.py 中的流式响应基础设施，提供管理员专属的工具定义与执行。
"""
import asyncio
import io
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import Request
from fastapi.responses import StreamingResponse
from PIL import Image

from ai_chat import (
    StreamResponseError,
    _build_assistant_log_content,
    _is_user_cancelled,
    _sse,
    normalize_tool_arguments,
    resolve_model_config,
    stream_model_response,
    ERROR_INTERRUPTED_MARKER,
)
from config import get_settings, ModelConfig
from database import (
    ProductDB,
    VariantDB,
    CategoryDB,
    OrderDB,
    LotteryConfigDB,
    LotteryDB,
    GiftThresholdDB,
    CouponDB,
    StaffChatLogDB,
    AgentAssignmentDB,
    ImageLookupDB,
    UserDB,
    get_db_connection,
)
from app.utils import convert_sqlite_timestamp_to_unix, format_device_time_ms

logger = logging.getLogger(__name__)
settings = get_settings()

# 图片上传目录
ITEMS_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "items"))

def _to_local_time(value: Optional[str]) -> str:
    """将数据库 UTC 时间字符串转为服务器本地时区时间。"""
    if not value:
        return ""
    try:
        txt = str(value).replace("T", " ").strip()
        if " " in txt:
            dt = datetime.strptime(txt[:19], "%Y-%m-%d %H:%M:%S")
        else:
            dt = datetime.fromisoformat(txt)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone().strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return value or ""


def _to_device_time(value: Optional[str], tz_offset_minutes: Optional[int] = None) -> str:
    if not value:
        return ""
    try:
        ts = convert_sqlite_timestamp_to_unix(str(value))
        return format_device_time_ms(float(ts) * 1000.0, tz_offset_minutes, "%Y-%m-%d %H:%M:%S")
    except Exception:
        return _to_local_time(value)


def _serialize_order_items_for_ai(items: Any) -> List[Dict[str, Any]]:
    serialized: List[Dict[str, Any]] = []
    for raw in (items or []):
        if not isinstance(raw, dict):
            continue
        try:
            quantity = int(raw.get("quantity") or 0)
        except Exception:
            quantity = 0
        try:
            unit_price = float(raw.get("unit_price") or 0)
        except Exception:
            unit_price = 0.0
        try:
            subtotal = float(raw.get("subtotal") or 0)
        except Exception:
            subtotal = 0.0
        item: Dict[str, Any] = {
            "name": raw.get("name") or raw.get("product_name") or raw.get("title") or "未命名商品",
            "quantity": quantity,
            "unit_price": unit_price,
            "subtotal": subtotal,
        }
        if raw.get("product_id"):
            item["product_id"] = raw.get("product_id")
        if raw.get("variant_id"):
            item["variant_id"] = raw.get("variant_id")
        if raw.get("variant_name"):
            item["variant_name"] = raw.get("variant_name")
        if raw.get("category"):
            item["category"] = raw.get("category")
        if raw.get("is_lottery"):
            item["is_lottery"] = True
        if raw.get("is_auto_gift"):
            item["is_auto_gift"] = True
        if raw.get("is_reservation"):
            item["is_reservation"] = True
        if raw.get("is_not_for_sale"):
            item["is_not_for_sale"] = True
        serialized.append(item)
    return serialized


def _serialize_order_for_ai(order: Dict[str, Any], compute_unified_order_status, tz_offset_minutes: Optional[int] = None) -> Dict[str, Any]:
    items = order.get("items", []) if isinstance(order, dict) else []
    serialized_items = _serialize_order_items_for_ai(items)
    discount_amount = 0.0
    try:
        discount_amount = float(order.get("discount_amount") or 0)
    except Exception:
        discount_amount = 0.0
    coupon_id = order.get("coupon_id")
    resolved_user_id = _resolve_tool_user_id(order.get("user_id"), order.get("student_id"))
    return {
        "id": order.get("id"),
        "status": order.get("status"),
        "unified_status": compute_unified_order_status(order),
        "payment_status": order.get("payment_status"),
        "total_amount": order.get("total_amount"),
        "user_id": resolved_user_id,
        "user_name": order.get("customer_name") or order.get("user_name") or order.get("student_name") or resolved_user_id,
        "created_at": _to_device_time(order.get("created_at"), tz_offset_minutes),
        "items_count": len(serialized_items),
        "items": serialized_items,
        "coupon_id": coupon_id,
        "discount_amount": discount_amount,
        "coupon_applied": bool(coupon_id and discount_amount > 0),
        "address_name": order.get("address_name"),
        "building_name": order.get("building_name"),
    }


# ===== 系统提示词 =====

def generate_admin_system_prompt(staff: Dict[str, Any]) -> str:
    """Generate system prompt for admin/agent AI assistant."""
    current_settings = get_settings()
    shop_name = current_settings.shop_name
    staff_name = staff.get("name", "Staff")
    staff_role = staff.get("role", "staff")
    staff_type = staff.get("type", "admin")

    scope_desc = ""
    if staff_type == "agent":
        agent_id = staff.get("agent_id", "")
        assignments = AgentAssignmentDB.get_buildings_for_agent(agent_id)
        if assignments:
            areas = []
            for a in assignments:
                addr = a.get("address_name", a.get("address_id", ""))
                bld = a.get("building_name", a.get("building_id", ""))
                if addr and bld:
                    areas.append(f"{addr}-{bld}")
                elif addr:
                    areas.append(addr)
            scope_desc = f"\nRegion scope: {', '.join(areas)}. You can only manage products, orders, and configurations within your assigned region."

    return f"""# Profile
You are the admin assistant AI for {shop_name}.
Response language: 简体中文

# Context
Current operator: {staff_name} (role: {staff_role})
{scope_desc}

# Available Operations (via tool calls)
1. Product management (manage_products) - Categories / list / search / add / edit / delete products
2. Order management (manage_orders) - View orders / update order status
3. Lottery configuration (manage_lottery) - Get / modify lottery settings and prizes
4. Gift thresholds (manage_gift_thresholds) - Get / add / modify / delete spending thresholds
5. Coupon management (manage_coupons) - Issue / revoke coupons
6. User query (search_users) - Search users / view user orders / view user coupons

# Important Rules
- Before editing or deleting products, use manage_products(action='categories'/'list'/'search') to look up info first.
- For destructive operations (delete, batch update), confirm with the operator first.
- When performing batch operations, describe the scope of impact.
- Currency unit is CNY (Chinese Yuan).
- Discount range: 0.5–10 (where 10 = full price, i.e. no discount).
- Product images: When the user sends an image, the message will contain the image path (starting with ai_uploads_tmp/). Use that exact path when adding/editing product images via the image_path parameter.

# Order Status Reference
## Filtering (action='list', filters.status):
- unpaid(未付款): Not paid yet
- pending_confirm(待确认): Payment being processed
- awaiting_delivery(待配送): Paid, awaiting shipment
- delivering(配送中): In delivery
- completed(已完成): Delivered / completed
- cancelled(已取消): Cancelled

## Updating (action='update_status', updates[].status):
- Prefer unified targets: unpaid / pending_confirm / awaiting_delivery / delivering / completed / cancelled
- Also compatible with legacy values: pending / confirmed / shipped / delivered / cancelled
- The assistant must treat status changes as real state transitions: payment status and inventory sync may also change together.

Current date: {datetime.now().strftime("%Y-%m-%d")}
"""

# AI filter status → unified (Chinese) status used by get_orders_paginated
_FILTER_STATUS_TO_UNIFIED: Dict[str, str] = {
    "unpaid": "未付款",
    "pending_confirm": "待确认",
    "awaiting_delivery": "待配送",
    "delivering": "配送中",
    "completed": "已完成",
    "cancelled": "已取消",
}

# ===== 工具定义 =====

def get_admin_tools(staff: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return the list of tools available to admin/agent."""
    return [
        {
            "type": "function",
            "function": {
                "name": "manage_products",
                "description": "Manage products: categories (list all categories with product counts), list (paginated product list), search (by keyword), add (single), edit (batch), delete (batch). Use 'categories', 'list' or 'search' to look up info before edit/delete.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["categories", "list", "search", "add", "edit", "delete"],
                            "description": "categories = list all categories with product counts, list = paginated product list, search = search by keyword, add = add a single product, edit = batch edit, delete = batch delete"
                        },
                        "query": {
                            "type": "string",
                            "description": "Search keyword (used with action='search'). Matches against product name, category, and description."
                        },
                        "category": {
                            "type": "string",
                            "description": "Filter by category name (used with action='list')"
                        },
                        "page": {
                            "type": "integer",
                            "description": "Page number starting from 0 (used with action='list'/'search'), default 0"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Results per page (used with action='list'/'search'), default 20, max 50"
                        },
                        "products": {
                            "type": "array",
                            "description": "Product list. Only 1 item allowed for 'add'; multiple for 'edit'/'delete'.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "product_id": {"type": "string", "description": "Product ID (required for edit/delete)"},
                                    "name": {"type": "string", "description": "Product name"},
                                    "category": {"type": "string", "description": "Category name"},
                                    "price": {"type": "number", "description": "Price in CNY"},
                                    "stock": {"type": "integer", "description": "Stock quantity (only for products WITHOUT variants; for products with variants, set stock in each variant)"},
                                    "description": {"type": "string", "description": "Short product description"},
                                    "discount": {"type": "number", "description": "Discount factor (0.5–10, where 10 = full price)"},
                                    "image_path": {"type": "string", "description": "Image path (obtained from image upload)"},
                                    "is_hot": {"type": "boolean", "description": "Whether the product is marked as hot/featured"},
                                    "is_not_for_sale": {"type": "boolean", "description": "Whether the product is not for sale (display only)"},
                                    "cost": {"type": "number", "description": "Cost price"},
                                    "variants": {
                                        "type": "array",
                                        "description": "Product variants / specifications. For add: provide name and stock. For edit: provide variant_id to update existing, or omit variant_id to create new. Set delete=true with variant_id to remove a variant.",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "variant_id": {"type": "string", "description": "Variant ID (required for update/delete existing variant, omit to create new)"},
                                                "name": {"type": "string"},
                                                "stock": {"type": "integer"},
                                                "delete": {"type": "boolean", "description": "Set true to delete this variant (requires variant_id)"}
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "required": ["action"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "manage_orders",
                "description": "View orders or batch update order status. Use action='list' to query orders with filters, action='update_status' to change status in batch.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["list", "update_status"],
                            "description": "list = view order list, update_status = batch update order status"
                        },
                        "filters": {
                            "type": "object",
                            "description": "Query filters (used with action='list')",
                            "properties": {
                                "order_id": {"type": "string", "description": "Exact order ID lookup. When provided, returns the matching order detail if accessible."},
                                "user_id": {"type": "string", "description": "Exact user ID filter. Use this after searching users."},
                                "status": {"type": "string", "enum": ["unpaid", "pending_confirm", "awaiting_delivery", "delivering", "completed", "cancelled"], "description": "Filter by unified order status"},
                                "page": {"type": "integer", "description": "Page number, default 0"},
                                "limit": {"type": "integer", "description": "Results per page, default 20, max 50"}
                            }
                        },
                        "updates": {
                            "type": "array",
                            "description": "Batch status updates (used with action='update_status')",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "order_id": {"type": "string", "description": "Order ID"},
                                    "status": {
                                        "type": "string",
                                        "enum": [
                                            "unpaid",
                                            "pending_confirm",
                                            "awaiting_delivery",
                                            "delivering",
                                            "completed",
                                            "cancelled",
                                            "未付款",
                                            "待确认",
                                            "待配送",
                                            "配送中",
                                            "已完成",
                                            "已取消",
                                            "pending",
                                            "confirmed",
                                            "shipped",
                                            "delivered"
                                        ],
                                        "description": "Preferred: unified targets unpaid/pending_confirm/awaiting_delivery/delivering/completed/cancelled. Legacy raw values pending/confirmed/shipped/delivered are also supported."
                                    }
                                },
                                "required": ["order_id", "status"]
                            }
                        }
                    },
                    "required": ["action"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "manage_lottery",
                "description": "Get or modify lottery configuration and prizes. Supports batch edit/delete of prizes.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["get_config", "update_config", "add_prize", "edit_prizes", "delete_prizes"],
                            "description": "get_config = retrieve config, update_config = modify config, add_prize = add prizes, edit_prizes = batch edit, delete_prizes = batch delete"
                        },
                        "config": {
                            "type": "object",
                            "description": "Lottery configuration (used with update_config)",
                            "properties": {
                                "threshold_amount": {"type": "number", "description": "Minimum order amount to qualify for lottery"},
                                "is_enabled": {"type": "boolean", "description": "Whether lottery is enabled"}
                            }
                        },
                        "prizes": {
                            "type": "array",
                            "description": "Prize list",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "prize_id": {"type": "string", "description": "Prize ID (required for edit/delete)"},
                                    "display_name": {"type": "string", "description": "Prize display name"},
                                    "weight": {"type": "number", "description": "Weight / probability"},
                                    "is_active": {"type": "boolean", "description": "Whether the prize is active"},
                                    "items": {
                                        "type": "array",
                                        "description": "Products included in the prize",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "product_id": {"type": "string"},
                                                "variant_id": {"type": "string"},
                                                "quantity": {"type": "integer"}
                                            },
                                            "required": ["product_id", "quantity"]
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "required": ["action"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "manage_gift_thresholds",
                "description": "Manage spending-based gift thresholds. Supports batch add/edit/delete.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["list", "add", "edit", "delete"],
                            "description": "list = view all thresholds, add = batch add, edit = batch edit, delete = batch delete"
                        },
                        "thresholds": {
                            "type": "array",
                            "description": "Threshold list",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "threshold_id": {"type": "string", "description": "Threshold ID (required for edit/delete)"},
                                    "threshold_amount": {"type": "number", "description": "Spending threshold amount in CNY"},
                                    "gift_products": {"type": "boolean", "description": "Whether to gift products"},
                                    "gift_coupon": {"type": "boolean", "description": "Whether to gift a coupon"},
                                    "coupon_amount": {"type": "number", "description": "Coupon amount in CNY"},
                                    "per_order_limit": {"type": "integer", "description": "Per-order limit"},
                                    "is_active": {"type": "boolean", "description": "Whether this threshold is active"},
                                    "items": {
                                        "type": "array",
                                        "description": "Gift products for this threshold (replaces existing items). For products with variants, specify variant_id.",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "product_id": {"type": "string"},
                                                "variant_id": {"type": "string", "description": "Variant ID (required for products with variants)"}
                                            },
                                            "required": ["product_id"]
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "required": ["action"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "manage_coupons",
                "description": "List, batch issue, or batch revoke coupons.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["list", "issue", "revoke"],
                            "description": "list = view coupons, issue = batch issue, revoke = batch revoke"
                        },
                        "user_id": {"type": "string", "description": "User ID (filter for list, or target for issue)"},
                        "coupons": {
                            "type": "array",
                            "description": "Coupon operation list",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "coupon_id": {"type": "string", "description": "Coupon ID (required for revoke)"},
                                    "user_id": {"type": "string", "description": "User ID override for issue"},
                                    "amount": {"type": "number", "description": "Coupon amount in CNY (required for issue)"},
                                    "quantity": {"type": "integer", "description": "Number of coupons to issue (1–200)"},
                                    "expires_at": {"type": "string", "description": "Expiration datetime in ISO format (optional for issue)"}
                                }
                            }
                        }
                    },
                    "required": ["action"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search_users",
                "description": "User query tool: search users, view a user's orders, or view a user's coupons.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["search", "orders", "coupons"],
                            "description": "search = find users by keyword (returns name/phone/order count), orders = list a user's orders, coupons = list a user's coupons"
                        },
                        "keywords": {
                            "type": "array",
                            "description": "Search keywords (used with action='search'). Matches user ID, name, or phone.",
                            "items": {"type": "string"}
                        },
                        "user_id": {
                            "type": "string",
                            "description": "User ID used by action='orders'/'coupons'."
                        },
                        "sort_by": {
                            "type": "string",
                            "enum": ["time", "amount"],
                            "description": "Sort order for action='orders'. Default 'time' (newest first). 'amount' = highest first."
                        },
                        "order_id": {
                            "type": "string",
                            "description": "Exact order ID lookup for action='orders'. When provided, returns that single order if accessible."
                        },
                        "page": {
                            "type": "integer",
                            "description": "Page number starting from 0 (used with action='orders'), default 0"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Results per page, default 10 for search, 20 for orders"
                        }
                    },
                    "required": ["action"]
                }
            }
        }
    ]


# ===== 工具执行辅助 =====

def _get_owner_id(staff: Dict[str, Any]) -> str:
    """获取工作人员对应的 owner_id。"""
    if staff.get("type") == "agent":
        return staff.get("agent_id") or staff.get("id")
    return "admin"


def _resolve_tool_user_id(*candidates: Any) -> str:
    """将工具层传入或数据库中的用户标识统一解析为 user_id。"""
    for candidate in candidates:
        text = str(candidate or "").strip()
        if not text:
            continue
        try:
            user_ref = UserDB.resolve_user_reference(text)
        except Exception:
            user_ref = None
        if user_ref and user_ref.get("user_id") is not None:
            return str(user_ref["user_id"])
        return text
    return ""


def _build_scope(staff: Dict[str, Any]) -> Dict[str, Any]:
    """构建工作人员的访问范围。"""
    scope = {
        "owner_ids": None,
        "address_ids": None,
        "building_ids": None,
        "is_super_admin": False,
        "agent_id": None,
        "filter_admin_orders": False,
    }
    from auth import is_super_admin_role
    scope["is_super_admin"] = is_super_admin_role(staff.get("role"))

    if staff.get("type") == "agent":
        agent_id = staff.get("agent_id")
        assignments = AgentAssignmentDB.get_buildings_for_agent(agent_id)
        building_ids = [item["building_id"] for item in assignments if item.get("building_id")]
        address_ids = list({item["address_id"] for item in assignments if item.get("address_id")})
        scope.update({
            "owner_ids": [agent_id],
            "address_ids": address_ids,
            "building_ids": building_ids,
            "agent_id": agent_id,
        })
    else:
        scope.update({
            "owner_ids": ["admin"],
            "filter_admin_orders": True,
        })
    return scope


def _can_access_product(staff: Dict[str, Any], product: Dict[str, Any]) -> bool:
    """检查工作人员是否有权访问商品。"""
    if staff.get("type") == "agent":
        return product.get("owner_id") == staff.get("agent_id")
    return True


def _can_access_order(staff: Dict[str, Any], order: Dict[str, Any], scope: Dict[str, Any]) -> bool:
    """检查工作人员是否有权访问订单。"""
    if scope.get("is_super_admin"):
        return True
    agent_id = scope.get("agent_id")
    if agent_id:
        if order.get("agent_id") == agent_id:
            return True
        if order.get("building_id") in (scope.get("building_ids") or []):
            return True
        if order.get("address_id") in (scope.get("address_ids") or []):
            return True
        return False
    # admin
    return True


# ===== 工具实现 =====

def _format_product_summary(product: Dict[str, Any], variants: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """格式化商品摘要信息用于工具返回。"""
    discount = product.get("discount", 10)
    price = product.get("price", 0)
    effective_price = ProductDB._calc_effective_price(product)
    summary: Dict[str, Any] = {
        "id": product.get("id"),
        "name": product.get("name"),
        "category": product.get("category"),
        "price": price,
        "discount": discount,
        "is_hot": bool(product.get("is_hot")),
        "is_active": product.get("is_active", 1) == 1,
    }
    if discount < 10:
        summary["effective_price"] = effective_price
    if product.get("description"):
        summary["description"] = product["description"][:80]

    # 变体信息
    if variants:
        summary["variants"] = [
            {"id": v.get("id"), "name": v.get("name"), "stock": v.get("stock", 0)}
            for v in variants
        ]
        summary["has_variants"] = True
    else:
        summary["stock"] = product.get("stock", 0)
        summary["has_variants"] = False
    return summary


def _manage_products_impl(staff: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    """商品管理工具实现。"""
    action = args.get("action", "")
    products = args.get("products", [])
    owner_id = _get_owner_id(staff)

    if action == "categories":
        scope = _build_scope(staff)
        categories = CategoryDB.get_categories_with_products(
            owner_ids=scope["owner_ids"], include_unassigned=True
        )
        result = []
        for cat in categories:
            cat_name = cat.get("name", "")
            count = len(ProductDB.get_products_by_category(
                cat_name, owner_ids=scope["owner_ids"], include_unassigned=True
            ))
            result.append({"name": cat_name, "product_count": count})
        return {"ok": True, "action": "categories", "categories": result, "total": len(result)}

    elif action in ("list", "search"):
        scope = _build_scope(staff)
        page = max(int(args.get("page") or 0), 0)
        limit = min(max(int(args.get("limit") or 20), 1), 50)

        if action == "search":
            query = (args.get("query") or "").strip()
            if not query:
                return {"ok": False, "error": "搜索关键词不能为空"}
            all_products = ProductDB.search_products(
                query, active_only=False, owner_ids=scope["owner_ids"], include_unassigned=True
            )
        else:
            query = None
            category = args.get("category")
            if category:
                all_products = ProductDB.get_products_by_category(
                    category, owner_ids=scope["owner_ids"], include_unassigned=True
                )
            else:
                all_products = ProductDB.get_all_products(
                    owner_ids=scope["owner_ids"], include_unassigned=True
                )

        total = len(all_products)
        start = page * limit
        page_products = all_products[start:start + limit]

        # 批量获取变体信息
        pids = [p["id"] for p in page_products]
        vmap = VariantDB.get_for_products(pids) if pids else {}

        result = {
            "ok": True,
            "action": action,
            "total": total,
            "page": page,
            "limit": limit,
            "has_more": start + limit < total,
            "products": [_format_product_summary(p, vmap.get(p["id"])) for p in page_products],
        }
        if query is not None:
            result["query"] = query
        return result

    elif action == "add":
        if len(products) != 1:
            return {"ok": False, "error": "添加商品每次只能添加一个"}
        p = products[0]
        name = p.get("name", "").strip()
        if not name:
            return {"ok": False, "error": "商品名称不能为空"}

        discount_value = 10.0
        if p.get("discount") is not None:
            try:
                discount_value = float(p["discount"])
                if discount_value < 0.5 or discount_value > 10:
                    return {"ok": False, "error": "折扣范围应为0.5~10折"}
            except (ValueError, TypeError):
                return {"ok": False, "error": "无效的折扣值"}

        # 有变体时商品级库存置为0，库存由各变体单独管理
        has_variants = bool(p.get("variants"))
        product_data = {
            "name": name,
            "category": p.get("category", "默认分类"),
            "price": float(p.get("price", 0)),
            "stock": 0 if has_variants else int(p.get("stock", 0)),
            "discount": discount_value,
            "description": p.get("description", ""),
            "img_path": "",
            "cost": float(p.get("cost", 0)),
            "owner_id": owner_id,
            "is_hot": 1 if p.get("is_hot") else 0,
            "is_not_for_sale": 1 if p.get("is_not_for_sale") else 0,
            "reservation_required": 0,
            "reservation_cutoff": None,
            "reservation_note": "",
        }

        try:
            product_id = ProductDB.create_product(product_data)
        except Exception as e:
            return {"ok": False, "error": f"创建商品失败: {e}"}

        # 处理图片
        if p.get("image_path"):
            try:
                _apply_image_to_product(owner_id, product_id, p["image_path"])
            except Exception as e:
                logger.warning("Failed to apply image to product %s: %s", product_id, e)

        # 处理规格
        if p.get("variants"):
            for v in p["variants"]:
                try:
                    VariantDB.create_variant(product_id, v.get("name", ""), int(v.get("stock", 0)))
                except Exception as e:
                    logger.warning("Failed to create variant for product %s: %s", product_id, e)

        product = ProductDB.get_product_by_id(product_id)
        return {
            "ok": True,
            "action": "add",
            "product": {
                "id": product_id,
                "name": product.get("name") if product else name,
                "price": product.get("price") if product else product_data["price"],
                "category": product.get("category") if product else product_data["category"],
            }
        }

    elif action == "edit":
        results = []
        for p in products:
            pid = p.get("product_id", "")
            if not pid:
                results.append({"product_id": pid, "ok": False, "error": "缺少product_id"})
                continue
            product = ProductDB.get_product_by_id(pid)
            if not product:
                results.append({"product_id": pid, "ok": False, "error": "商品不存在"})
                continue
            if not _can_access_product(staff, product):
                results.append({"product_id": pid, "ok": False, "error": "无权访问该商品"})
                continue

            update_data = {}
            for field in ["name", "category", "description"]:
                if field in p and p[field] is not None:
                    update_data[field] = str(p[field]).strip()
            for field in ["price", "cost"]:
                if field in p and p[field] is not None:
                    try:
                        update_data[field] = float(p[field])
                    except (ValueError, TypeError):
                        pass
            existing_variants = VariantDB.get_by_product(pid)
            if "stock" in p and p["stock"] is not None:
                if existing_variants:
                    results.append({"product_id": pid, "ok": False, "error": f"该商品含有{len(existing_variants)}个规格，请通过variants参数分别修改各规格的库存，不能直接修改商品级库存"})
                    continue
                try:
                    update_data["stock"] = int(p["stock"])
                except (ValueError, TypeError):
                    pass
            if "discount" in p and p["discount"] is not None:
                try:
                    dv = float(p["discount"])
                    if 0.5 <= dv <= 10:
                        update_data["discount"] = dv
                except (ValueError, TypeError):
                    pass
            if "is_hot" in p:
                update_data["is_hot"] = 1 if p["is_hot"] else 0
            if "is_not_for_sale" in p:
                update_data["is_not_for_sale"] = 1 if p["is_not_for_sale"] else 0

            try:
                if update_data:
                    ProductDB.update_product(pid, update_data)
                # 处理图片
                if p.get("image_path"):
                    _apply_image_to_product(owner_id, pid, p["image_path"])
                # 处理变体
                if p.get("variants"):
                    for v in p["variants"]:
                        vid = v.get("variant_id", "")
                        if vid:
                            if v.get("delete"):
                                VariantDB.delete_variant(vid)
                            else:
                                VariantDB.update_variant(
                                    vid,
                                    name=v.get("name"),
                                    stock=int(v["stock"]) if v.get("stock") is not None else None,
                                )
                        else:
                            # 新建变体
                            VariantDB.create_variant(pid, v.get("name", ""), int(v.get("stock", 0)))
                results.append({"product_id": pid, "ok": True, "name": product.get("name", "")})
            except Exception as e:
                results.append({"product_id": pid, "ok": False, "error": str(e)})

        success_count = sum(1 for r in results if r.get("ok"))
        return {"ok": True, "action": "edit", "total": len(results), "success": success_count, "results": results}

    elif action == "delete":
        results = []
        for p in products:
            pid = p.get("product_id", "")
            if not pid:
                results.append({"product_id": pid, "ok": False, "error": "缺少product_id"})
                continue
            product = ProductDB.get_product_by_id(pid)
            if not product:
                results.append({"product_id": pid, "ok": False, "error": "商品不存在"})
                continue
            if not _can_access_product(staff, product):
                results.append({"product_id": pid, "ok": False, "error": "无权访问该商品"})
                continue
            try:
                ProductDB.delete_product(pid)
                results.append({"product_id": pid, "ok": True, "name": product.get("name", "")})
            except Exception as e:
                results.append({"product_id": pid, "ok": False, "error": str(e)})

        success_count = sum(1 for r in results if r.get("ok"))
        return {"ok": True, "action": "delete", "total": len(results), "success": success_count, "results": results}

    return {"ok": False, "error": f"未知的action: {action}"}


def _apply_image_to_product(owner_id: str, product_id: str, image_path: str) -> None:
    """将上传的图片应用到商品。临时文件由定时清理任务统一处理。"""
    # 安全检查: 严格限制到 ITEMS_DIR/ai_uploads_tmp 下，防止目录穿越
    if os.path.isabs(image_path):
        raise ValueError("无效的图片路径")
    if "\\" in image_path:
        raise ValueError("无效的图片路径")

    normalized_rel = os.path.normpath(image_path)
    if ".." in normalized_rel.split(os.sep):
        raise ValueError("无效的图片路径")

    uploads_prefix = f"ai_uploads_tmp{os.sep}"
    if not (normalized_rel == "ai_uploads_tmp" or normalized_rel.startswith(uploads_prefix)):
        raise ValueError("无效的图片路径")

    base_uploads_dir = os.path.realpath(os.path.join(ITEMS_DIR, "ai_uploads_tmp"))
    full_path = os.path.realpath(os.path.join(ITEMS_DIR, normalized_rel))
    if not (full_path == base_uploads_dir or full_path.startswith(base_uploads_dir + os.sep)):
        raise ValueError("无效的图片路径")

    if not os.path.isfile(full_path):
        raise FileNotFoundError(f"图片文件不存在: {image_path}")

    # 读取并重新编码为 quality=40 (与现有商品图片一致)
    with open(full_path, "rb") as f:
        content = f.read()

    img = Image.open(io.BytesIO(content))
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    output_buffer = io.BytesIO()
    img.save(output_buffer, "WEBP", quality=40, method=6, optimize=True)
    processed_content = output_buffer.getvalue()

    import hashlib
    file_hash = hashlib.sha256(processed_content).hexdigest()[:12]

    existing = ImageLookupDB.get_by_hash(file_hash)
    if existing:
        ProductDB.update_image_path(product_id, file_hash)
        return

    rel_path = f"{owner_id}/{product_id}/{file_hash}.webp"
    file_path = os.path.normpath(os.path.join(ITEMS_DIR, rel_path))
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    with open(file_path, "wb") as f:
        f.write(processed_content)

    ImageLookupDB.insert(file_hash, rel_path, product_id)
    ProductDB.update_image_path(product_id, file_hash)


def _manage_orders_impl(staff: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    """订单管理工具实现。"""
    from app.services.orders import apply_manage_order_status_transition, compute_unified_order_status

    action = args.get("action", "")
    owner_id = _get_owner_id(staff)
    scope = _build_scope(staff)
    tz_offset_minutes = staff.get("device_timezone_offset_minutes", 0)

    if action == "list":
        filters = args.get("filters") or {}
        order_id = (filters.get("order_id") or "").strip()
        user_id = _resolve_tool_user_id(filters.get("user_id"), filters.get("student_id"))
        status = filters.get("status")
        page = max(int(filters.get("page") or 0), 0)
        limit = min(max(int(filters.get("limit") or 20), 1), 50)

        try:
            if order_id:
                order = OrderDB.get_order_by_id(order_id)
                if not order:
                    return {"ok": True, "action": "list", "orders": [], "count": 0, "page": 0, "limit": 1, "has_more": False}
                if not _can_access_order(staff, order, scope):
                    return {"ok": False, "error": "无权访问该订单"}
                if status:
                    unified = _FILTER_STATUS_TO_UNIFIED.get(status)
                    if unified and compute_unified_order_status(order) != unified:
                        return {"ok": True, "action": "list", "orders": [], "count": 0, "page": 0, "limit": 1, "has_more": False}
                if user_id and _resolve_tool_user_id(order.get("user_id"), order.get("student_id")) != user_id:
                    return {"ok": True, "action": "list", "orders": [], "count": 0, "page": 0, "limit": 1, "has_more": False}
                order_data = _serialize_order_for_ai(order, compute_unified_order_status, tz_offset_minutes)
                return {
                    "ok": True,
                    "action": "list",
                    "orders": [order_data],
                    "count": 1,
                    "page": 0,
                    "limit": 1,
                    "has_more": False,
                }

            kwargs = {
                "offset": page * limit,
                "limit": limit,
            }
            if user_id:
                kwargs["user_id"] = user_id
            if status:
                unified = _FILTER_STATUS_TO_UNIFIED.get(status)
                if unified:
                    kwargs["unified_status"] = unified

            # 根据角色过滤
            if scope.get("agent_id"):
                kwargs["agent_id"] = scope["agent_id"]
                kwargs["address_ids"] = scope.get("address_ids")
                kwargs["building_ids"] = scope.get("building_ids")
            elif scope.get("filter_admin_orders"):
                kwargs["filter_admin_orders"] = True

            result_data = OrderDB.get_orders_paginated(**kwargs)
            orders = result_data.get("orders", []) if isinstance(result_data, dict) else result_data
            total = result_data.get("total", len(orders)) if isinstance(result_data, dict) else len(orders)
            order_list = [_serialize_order_for_ai(o, compute_unified_order_status, tz_offset_minutes) for o in orders]
            return {
                "ok": True,
                "action": "list",
                "orders": order_list,
                "count": len(order_list),
                "total": total,
                "page": page,
                "limit": limit,
                "has_more": (page * limit + len(order_list)) < total,
            }
        except Exception as e:
            return {"ok": False, "error": f"查询订单失败: {e}"}

    elif action == "update_status":
        updates = args.get("updates", [])
        if not updates:
            return {"ok": False, "error": "缺少更新列表"}

        results = []
        for u in updates:
            oid = u.get("order_id", "")
            new_status = u.get("status", "")
            if not oid or not new_status:
                results.append({"order_id": oid, "ok": False, "error": "缺少order_id或status"})
                continue

            try:
                order = OrderDB.get_order_by_id(oid)
                if not order:
                    results.append({"order_id": oid, "ok": False, "error": "订单不存在"})
                    continue
                if not _can_access_order(staff, order, scope):
                    results.append({"order_id": oid, "ok": False, "error": "无权访问该订单"})
                    continue

                ok, missing_items, meta = apply_manage_order_status_transition(oid, new_status)
                if not ok:
                    message = "更新订单状态失败"
                    if missing_items:
                        message = "；".join(str(item) for item in missing_items if str(item).strip()) or message
                    results.append({"order_id": oid, "ok": False, "error": message, "details": {"missing_items": missing_items}})
                    continue

                results.append({
                    "order_id": oid,
                    "ok": True,
                    "old_status": meta.get("old_unified_status"),
                    "new_status": meta.get("new_unified_status"),
                    "raw_status": meta.get("status"),
                    "payment_status": meta.get("payment_status"),
                })
            except Exception as e:
                results.append({"order_id": oid, "ok": False, "error": str(e)})

        success_count = sum(1 for r in results if r.get("ok"))
        return {"ok": True, "action": "update_status", "total": len(results), "success": success_count, "results": results}

    return {"ok": False, "error": f"未知的action: {action}"}


def _manage_lottery_impl(staff: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    """抽奖配置工具实现。"""
    action = args.get("action", "")
    owner_id = _get_owner_id(staff)

    if action == "get_config":
        try:
            config = LotteryConfigDB.get_config(owner_id)
            prizes = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True)
            return {
                "ok": True,
                "action": "get_config",
                "config": {
                    "threshold_amount": config.get("threshold_amount", 0),
                    "is_enabled": config.get("is_enabled", True),
                },
                "prizes": [{
                    "id": p.get("id"),
                    "display_name": p.get("display_name") or p.get("prize_name"),
                    "weight": p.get("weight"),
                    "is_active": bool(p.get("is_active")),
                    "items": p.get("items", []),
                } for p in prizes]
            }
        except Exception as e:
            return {"ok": False, "error": f"获取抽奖配置失败: {e}"}

    elif action == "update_config":
        config = args.get("config", {})
        try:
            if "threshold_amount" in config:
                LotteryConfigDB.set_threshold(owner_id, float(config["threshold_amount"]))
            if "is_enabled" in config:
                LotteryConfigDB.set_enabled(owner_id, bool(config["is_enabled"]))
            return {"ok": True, "action": "update_config", "updated": config}
        except Exception as e:
            return {"ok": False, "error": f"更新抽奖配置失败: {e}"}

    elif action == "add_prize":
        prizes = args.get("prizes", [])
        if not prizes:
            return {"ok": False, "error": "缺少奖品信息"}
        results = []
        for p in prizes:
            try:
                prize_id = LotteryDB.upsert_prize(
                    prize_id=None,
                    display_name=p.get("display_name", "新奖品"),
                    weight=float(p.get("weight", 1.0)),
                    is_active=bool(p.get("is_active", True)),
                    items=p.get("items", []),
                    owner_id=owner_id,
                )
                results.append({"ok": True, "prize_id": prize_id, "display_name": p.get("display_name")})
            except Exception as e:
                results.append({"ok": False, "error": str(e), "display_name": p.get("display_name")})
        success_count = sum(1 for r in results if r.get("ok"))
        return {"ok": True, "action": "add_prize", "total": len(results), "success": success_count, "results": results}

    elif action == "edit_prizes":
        prizes = args.get("prizes", [])
        results = []
        for p in prizes:
            pid = p.get("prize_id", "")
            if not pid:
                results.append({"prize_id": pid, "ok": False, "error": "缺少prize_id"})
                continue
            try:
                # upsert_prize 需要所有字段, 先获取现有值作为默认值
                existing_prizes = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True)
                existing = next((pr for pr in existing_prizes if pr.get("id") == pid), None)
                if not existing:
                    results.append({"prize_id": pid, "ok": False, "error": "奖品不存在"})
                    continue
                LotteryDB.upsert_prize(
                    prize_id=pid,
                    display_name=p.get("display_name", existing.get("display_name", "")),
                    weight=float(p.get("weight", existing.get("weight", 1.0))),
                    is_active=bool(p["is_active"]) if "is_active" in p else bool(existing.get("is_active")),
                    items=p.get("items", existing.get("items", [])),
                    owner_id=owner_id,
                )
                results.append({"prize_id": pid, "ok": True})
            except Exception as e:
                results.append({"prize_id": pid, "ok": False, "error": str(e)})
        success_count = sum(1 for r in results if r.get("ok"))
        return {"ok": True, "action": "edit_prizes", "total": len(results), "success": success_count, "results": results}

    elif action == "delete_prizes":
        prizes = args.get("prizes", [])
        results = []
        for p in prizes:
            pid = p.get("prize_id", "")
            if not pid:
                results.append({"prize_id": pid, "ok": False, "error": "缺少prize_id"})
                continue
            try:
                LotteryDB.delete_prize(pid, owner_id=owner_id)
                results.append({"prize_id": pid, "ok": True})
            except Exception as e:
                results.append({"prize_id": pid, "ok": False, "error": str(e)})
        success_count = sum(1 for r in results if r.get("ok"))
        return {"ok": True, "action": "delete_prizes", "total": len(results), "success": success_count, "results": results}

    return {"ok": False, "error": f"未知的action: {action}"}


def _manage_gift_thresholds_impl(staff: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    """满额门槛工具实现。"""
    action = args.get("action", "")
    owner_id = _get_owner_id(staff)

    if action == "list":
        try:
            thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=True)
            return {
                "ok": True,
                "action": "list",
                "thresholds": [{
                    "id": t.get("id"),
                    "threshold_amount": t.get("threshold_amount"),
                    "gift_products": bool(t.get("gift_products")),
                    "gift_coupon": bool(t.get("gift_coupon")),
                    "coupon_amount": t.get("coupon_amount"),
                    "per_order_limit": t.get("per_order_limit"),
                    "is_active": bool(t.get("is_active")),
                    "items": t.get("items", []),
                } for t in thresholds]
            }
        except Exception as e:
            return {"ok": False, "error": f"获取满额门槛失败: {e}"}

    elif action == "add":
        thresholds = args.get("thresholds", [])
        if not thresholds:
            return {"ok": False, "error": "缺少门槛信息"}
        results = []
        for t in thresholds:
            try:
                tid = GiftThresholdDB.create_threshold(
                    owner_id=owner_id,
                    threshold_amount=float(t.get("threshold_amount", 0)),
                    gift_products=bool(t.get("gift_products")),
                    gift_coupon=bool(t.get("gift_coupon")),
                    coupon_amount=float(t.get("coupon_amount", 0)),
                    per_order_limit=int(t.get("per_order_limit", 0)) if t.get("per_order_limit") is not None else None,
                )
                if t.get("items"):
                    GiftThresholdDB.add_items_to_threshold(tid, owner_id, t["items"])
                results.append({"ok": True, "threshold_id": tid, "threshold_amount": t.get("threshold_amount")})
            except Exception as e:
                results.append({"ok": False, "error": str(e)})
        success_count = sum(1 for r in results if r.get("ok"))
        return {"ok": True, "action": "add", "total": len(results), "success": success_count, "results": results}

    elif action == "edit":
        thresholds = args.get("thresholds", [])
        results = []
        for t in thresholds:
            tid = t.get("threshold_id", "")
            if not tid:
                results.append({"threshold_id": tid, "ok": False, "error": "缺少threshold_id"})
                continue
            try:
                update_data = {}
                if "threshold_amount" in t:
                    update_data["threshold_amount"] = float(t["threshold_amount"])
                if "gift_products" in t:
                    update_data["gift_products"] = bool(t["gift_products"])
                if "gift_coupon" in t:
                    update_data["gift_coupon"] = bool(t["gift_coupon"])
                if "coupon_amount" in t:
                    update_data["coupon_amount"] = float(t["coupon_amount"])
                if "per_order_limit" in t:
                    update_data["per_order_limit"] = int(t["per_order_limit"]) if t["per_order_limit"] is not None else None
                if "is_active" in t:
                    update_data["is_active"] = bool(t["is_active"])
                GiftThresholdDB.update_threshold(tid, owner_id=owner_id, **update_data)
                if "items" in t:
                    GiftThresholdDB.add_items_to_threshold(tid, owner_id, t["items"])
                results.append({"threshold_id": tid, "ok": True})
            except Exception as e:
                results.append({"threshold_id": tid, "ok": False, "error": str(e)})
        success_count = sum(1 for r in results if r.get("ok"))
        return {"ok": True, "action": "edit", "total": len(results), "success": success_count, "results": results}

    elif action == "delete":
        thresholds = args.get("thresholds", [])
        results = []
        for t in thresholds:
            tid = t.get("threshold_id", "")
            if not tid:
                results.append({"threshold_id": tid, "ok": False, "error": "缺少threshold_id"})
                continue
            try:
                GiftThresholdDB.delete_threshold(tid, owner_id=owner_id)
                results.append({"threshold_id": tid, "ok": True})
            except Exception as e:
                results.append({"threshold_id": tid, "ok": False, "error": str(e)})
        success_count = sum(1 for r in results if r.get("ok"))
        return {"ok": True, "action": "delete", "total": len(results), "success": success_count, "results": results}

    return {"ok": False, "error": f"未知的action: {action}"}


def _manage_coupons_impl(staff: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    """优惠券管理工具实现。"""
    action = args.get("action", "")
    owner_id = _get_owner_id(staff)

    if action == "list":
        user_id = _resolve_tool_user_id(args.get("user_id"), args.get("student_id"))
        try:
            items = CouponDB.list_all(user_id or None, owner_id=owner_id)
            # 按 (user_id, amount, is_active) 聚合，避免逐张列出
            groups: Dict[tuple, Dict[str, Any]] = {}
            for c in (items or []):
                uid = _resolve_tool_user_id(c.get("user_id"), c.get("issued_to_user_id"), c.get("student_id"))
                amt = c.get("amount", 0)
                active = bool(c.get("is_active"))
                key = (uid, amt, active)
                if key not in groups:
                    groups[key] = {
                        "user_id": uid,
                        "amount": amt,
                        "is_active": active,
                        "count": 0,
                        "coupon_ids": [],
                    }
                groups[key]["count"] += 1
                groups[key]["coupon_ids"].append(c.get("id"))
            return {
                "ok": True,
                "action": "list",
                "coupons": list(groups.values()),
                "total_count": len(items or []),
            }
        except Exception as e:
            return {"ok": False, "error": f"查询优惠券失败: {e}"}

    elif action == "issue":
        user_id = _resolve_tool_user_id(args.get("user_id"), args.get("student_id"))
        coupons = args.get("coupons", [])
        if not coupons:
            return {"ok": False, "error": "缺少优惠券信息"}

        results = []
        for c in coupons:
            try:
                amt = float(c.get("amount", 0))
                if amt <= 0:
                    results.append({"ok": False, "error": "金额必须大于0"})
                    continue
                qty = int(c.get("quantity", 1))
                if qty <= 0 or qty > 200:
                    results.append({"ok": False, "error": "数量需为1-200"})
                    continue

                expires_at = None
                if c.get("expires_at"):
                    try:
                        from datetime import datetime as _dt
                        try:
                            dt = _dt.fromisoformat(c["expires_at"])
                        except Exception:
                            dt = _dt.strptime(c["expires_at"], "%Y-%m-%d %H:%M:%S")
                        expires_at = dt.strftime("%Y-%m-%d %H:%M:%S")
                    except Exception:
                        results.append({"ok": False, "error": "无效的过期时间格式"})
                        continue

                target_user_id = _resolve_tool_user_id(c.get("user_id"), c.get("student_id"), user_id)
                ids = CouponDB.issue_coupons(target_user_id, amt, qty, expires_at, owner_id=owner_id)
                if not ids:
                    results.append({"ok": False, "error": "发放失败，user_id 不存在或发生其他错误"})
                else:
                    results.append({"ok": True, "issued": len(ids), "amount": amt, "user_id": target_user_id})
            except Exception as e:
                results.append({"ok": False, "error": str(e)})

        success_count = sum(1 for r in results if r.get("ok"))
        total_issued = sum(r.get("issued", 0) for r in results if r.get("ok"))
        return {"ok": True, "action": "issue", "total": len(results), "success": success_count, "total_issued": total_issued, "results": results}

    elif action == "revoke":
        coupons = args.get("coupons", [])
        if not coupons:
            return {"ok": False, "error": "缺少优惠券信息"}

        results = []
        for c in coupons:
            cid = c.get("coupon_id", "")
            if not cid:
                results.append({"coupon_id": cid, "ok": False, "error": "缺少coupon_id"})
                continue
            try:
                ok = CouponDB.revoke(cid, owner_id)
                if ok:
                    results.append({"coupon_id": cid, "ok": True})
                else:
                    results.append({"coupon_id": cid, "ok": False, "error": "撤回失败或已撤回/不存在"})
            except Exception as e:
                results.append({"coupon_id": cid, "ok": False, "error": str(e)})

        success_count = sum(1 for r in results if r.get("ok"))
        return {"ok": True, "action": "revoke", "total": len(results), "success": success_count, "results": results}

    return {"ok": False, "error": f"未知的action: {action}"}


def _search_users_impl(staff: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    """用户查询工具实现：搜索用户 / 查看订单 / 查看优惠券。"""
    action = args.get("action", "search")
    scope = _build_scope(staff)
    owner_id = _get_owner_id(staff)
    tz_offset_minutes = staff.get("device_timezone_offset_minutes", 0)

    if action == "search":
        keywords = args.get("keywords", [])
        if not keywords:
            return {"ok": False, "error": "缺少搜索关键词"}
        limit = min(max(int(args.get("limit") or 10), 1), 50)

        all_results: Dict[str, Dict[str, Any]] = {}
        for kw in keywords:
            like = f"%{kw.strip()}%"
            try:
                with get_db_connection() as conn:
                    cur = conn.cursor()
                    params: List[Any] = [like, like, like]
                    search_condition = "(CAST(COALESCE(u.user_id, '') AS TEXT) LIKE ? OR u.name LIKE ? OR up.phone LIKE ?)"
                    filters: List[str] = [search_condition]

                    if staff.get("type") == "agent":
                        address_ids = [aid for aid in (scope.get("address_ids") or []) if aid]
                        building_ids = [bid for bid in (scope.get("building_ids") or []) if bid]
                        if not address_ids and not building_ids:
                            continue
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
                        filters.append("((up.address_id IS NOT NULL AND TRIM(up.address_id) != '') OR (up.building_id IS NOT NULL AND TRIM(up.building_id) != ''))")

                    query = f"""
                        SELECT DISTINCT
                            u.id AS legacy_user_key,
                            CAST(COALESCE(u.user_id, '') AS TEXT) AS user_id,
                            u.name AS name,
                            up.phone AS phone,
                            (SELECT COUNT(*) FROM orders o WHERE o.student_id = u.id) AS order_count
                        FROM users u
                        LEFT JOIN user_profiles up
                          ON (up.user_id = u.user_id OR (up.user_id IS NULL AND up.student_id = u.id))
                        WHERE {" AND ".join(filters)}
                        ORDER BY u.user_id ASC, u.id ASC
                        LIMIT ?
                    """
                    params.append(limit)
                    cur.execute(query, tuple(params))
                    for row in cur.fetchall() or []:
                        resolved_user_id = _resolve_tool_user_id(row["user_id"], row["legacy_user_key"])
                        if not resolved_user_id:
                            continue
                        if resolved_user_id not in all_results:
                            all_results[resolved_user_id] = {
                                "user_id": resolved_user_id,
                                "name": row["name"] or resolved_user_id,
                                "phone": row["phone"] or "",
                                "order_count": row["order_count"],
                            }
            except Exception as e:
                logger.error("User search failed for keyword '%s': %s", kw, e)

        return {"ok": True, "action": "search", "users": list(all_results.values()), "count": len(all_results)}

    elif action == "orders":
        user_id = _resolve_tool_user_id(args.get("user_id"), args.get("student_id"))
        order_id = (args.get("order_id") or "").strip()
        if not user_id:
            return {"ok": False, "error": "缺少 user_id"}
        sort_by = args.get("sort_by", "time")
        page = max(int(args.get("page") or 0), 0)
        limit = min(max(int(args.get("limit") or 20), 1), 50)

        try:
            from app.services.orders import compute_unified_order_status

            if order_id:
                order = OrderDB.get_order_by_id(order_id)
                if not order:
                    return {"ok": True, "action": "orders", "user_id": user_id, "orders": [], "total": 0, "page": 0, "limit": 1, "has_more": False}
                if user_id and _resolve_tool_user_id(order.get("user_id"), order.get("student_id")) != user_id:
                    return {"ok": True, "action": "orders", "user_id": user_id, "orders": [], "total": 0, "page": 0, "limit": 1, "has_more": False}
                if not _can_access_order(staff, order, scope):
                    return {"ok": False, "error": "无权访问该订单"}
                return {
                    "ok": True,
                    "action": "orders",
                    "user_id": user_id or _resolve_tool_user_id(order.get("user_id"), order.get("student_id")),
                    "orders": [_serialize_order_for_ai(order, compute_unified_order_status, tz_offset_minutes)],
                    "total": 1,
                    "page": 0,
                    "limit": 1,
                    "has_more": False,
                }

            kwargs: Dict[str, Any] = {
                "offset": page * limit,
                "limit": limit,
                "user_id": user_id,
            }
            if scope.get("agent_id"):
                kwargs["agent_id"] = scope["agent_id"]
                kwargs["address_ids"] = scope.get("address_ids")
                kwargs["building_ids"] = scope.get("building_ids")
            elif scope.get("filter_admin_orders"):
                kwargs["filter_admin_orders"] = True

            result_data = OrderDB.get_orders_paginated(**kwargs)
            orders = result_data.get("orders", []) if isinstance(result_data, dict) else result_data
            total = result_data.get("total", len(orders)) if isinstance(result_data, dict) else len(orders)

            order_list = [_serialize_order_for_ai(o, compute_unified_order_status, tz_offset_minutes) for o in orders]

            if sort_by == "amount":
                order_list.sort(key=lambda x: x.get("total_amount") or 0, reverse=True)

            return {
                "ok": True,
                "action": "orders",
                "user_id": user_id,
                "orders": order_list,
                "total": total,
                "page": page,
                "limit": limit,
                "has_more": page * limit + limit < total,
            }
        except Exception as e:
            return {"ok": False, "error": f"查询订单失败: {e}"}

    elif action == "coupons":
        user_id = _resolve_tool_user_id(args.get("user_id"), args.get("student_id"))
        if not user_id:
            return {"ok": False, "error": "缺少 user_id"}
        try:
            items = CouponDB.list_all(user_id, owner_id=owner_id)
            groups: Dict[tuple, Dict[str, Any]] = {}
            for c in (items or []):
                amt = c.get("amount", 0)
                active = c.get("status") == "active" and not c.get("expired")
                key = (amt, active)
                if key not in groups:
                    groups[key] = {"amount": amt, "is_active": active, "count": 0, "coupon_ids": []}
                groups[key]["count"] += 1
                groups[key]["coupon_ids"].append(c.get("id"))
            return {
                "ok": True,
                "action": "coupons",
                "user_id": user_id,
                "coupons": list(groups.values()),
                "total_count": len(items or []),
            }
        except Exception as e:
            return {"ok": False, "error": f"查询优惠券失败: {e}"}

    return {"ok": False, "error": f"未知的action: {action}"}


# ===== 工具分发 =====

def execute_admin_tool(name: str, args: Dict[str, Any], staff: Dict[str, Any], request: Optional[Request] = None) -> Any:
    """执行管理员工具调用。"""
    try:
        if name == "manage_products":
            return _manage_products_impl(staff, args)
        elif name == "manage_orders":
            return _manage_orders_impl(staff, args)
        elif name == "manage_lottery":
            return _manage_lottery_impl(staff, args)
        elif name == "manage_gift_thresholds":
            return _manage_gift_thresholds_impl(staff, args)
        elif name == "manage_coupons":
            return _manage_coupons_impl(staff, args)
        elif name == "search_users":
            return _search_users_impl(staff, args)
        else:
            return {"ok": False, "error": f"未知的管理工具: {name}"}
    except Exception as e:
        logger.error("Admin tool execution failed: %s", e)
        return {"ok": False, "error": f"工具执行异常: {e}"}


# ===== 图片上传 =====

def handle_admin_image_upload(staff: Dict[str, Any], content: bytes) -> Dict[str, Any]:
    """处理管理员聊天中的图片上传。转为 WebP quality=80 并存储到临时目录。"""
    try:
        img = Image.open(io.BytesIO(content))

        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        output_buffer = io.BytesIO()
        img.save(output_buffer, "WEBP", quality=80, method=6)
        processed_content = output_buffer.getvalue()

        import hashlib
        file_hash = hashlib.sha256(processed_content).hexdigest()[:12]
        staff_id = staff.get("id", "unknown")
        timestamp = int(time.time())

        # 上传到临时目录 ai_uploads_tmp/
        rel_path = f"ai_uploads_tmp/{staff_id}/{timestamp}_{file_hash}.webp"
        file_path = os.path.normpath(os.path.join(ITEMS_DIR, rel_path))
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        with open(file_path, "wb") as f:
            f.write(processed_content)

        return {"ok": True, "image_path": rel_path, "url": f"/items/{rel_path}"}
    except Exception as e:
        logger.error("Admin image upload failed: %s", e)
        return {"ok": False, "error": f"图片上传失败: {e}"}


def cleanup_temp_uploads(max_age_hours: int = 24) -> int:
    """清理超过 max_age_hours 小时未使用的临时上传图片。返回删除的文件数。"""
    tmp_dir = os.path.join(ITEMS_DIR, "ai_uploads_tmp")
    if not os.path.isdir(tmp_dir):
        return 0
    cutoff = time.time() - max_age_hours * 3600
    removed = 0
    for root, dirs, files in os.walk(tmp_dir, topdown=False):
        for fname in files:
            fpath = os.path.join(root, fname)
            try:
                if os.path.getmtime(fpath) < cutoff:
                    os.remove(fpath)
                    removed += 1
            except OSError:
                pass
        # 删除空目录
        try:
            if not os.listdir(root) and root != tmp_dir:
                os.rmdir(root)
        except OSError:
            pass
    return removed


# ===== 消息处理 =====

ALLOWED_ROLES = {"system", "user", "assistant", "tool"}


def _add_admin_system_prompt(messages: List[Dict[str, Any]], staff: Dict[str, Any]) -> List[Dict[str, Any]]:
    """添加管理员系统提示词。"""
    if messages and messages[0].get("role") == "system":
        return messages
    prompt = generate_admin_system_prompt(staff)
    if not prompt or not prompt.strip():
        return messages
    return [{"role": "system", "content": prompt.strip()}] + messages


def _sanitize_admin_messages(
    messages: List[Dict[str, Any]],
    staff_account_id: str,
    thread_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """清理和规范化管理员聊天消息。content 始终保持纯文本字符串。"""
    sanitized = []
    for msg in messages:
        role = msg.get("role", "")
        if role not in ALLOWED_ROLES:
            continue
        content = msg.get("content")
        # 确保 content 是字符串（防止意外的 list/dict 类型，以及 None 导致部分模型报错）
        if content is None:
            content = ""
        elif not isinstance(content, str):
            content = str(content)
        # 跳过中断标记消息，不纳入上下文
        if content == ERROR_INTERRUPTED_MARKER:
            continue
        clean = {"role": role, "content": content}
        if msg.get("tool_calls"):
            clean["tool_calls"] = msg["tool_calls"]
        if msg.get("tool_call_id"):
            clean["tool_call_id"] = msg["tool_call_id"]
        sanitized.append(clean)
    return sanitized


def _prune_synced_staff_user_messages(
    staff_account_id: str,
    messages: List[Dict[str, Any]],
    thread_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """移除已落库的 staff 用户消息，仅保留最后一条未同步 user 输入。"""
    if not staff_account_id or not messages:
        return messages

    try:
        history = StaffChatLogDB.get_recent_logs(staff_account_id, limit=200, thread_id=thread_id)
    except Exception as exc:
        logger.warning("Failed to load staff chat history, skipping deduplication: %s", exc)
        return messages

    persisted_user_contents: List[str] = []
    for record in reversed(history):  # 转为时间正序
        if (record.get("role") or "").lower() == "user":
            persisted_user_contents.append(record.get("content") or "")

    persisted_index = 0
    synced_indices: List[int] = []
    unsynced_user_indices: List[int] = []

    for idx, msg in enumerate(messages):
        if (msg.get("role") or "").lower() != "user":
            continue

        content = msg.get("content")
        if content is None:
            content = ""

        matched = False
        while persisted_index < len(persisted_user_contents):
            if persisted_user_contents[persisted_index] == content:
                matched = True
                persisted_index += 1
                synced_indices.append(idx)
                break
            persisted_index += 1

        if not matched:
            unsynced_user_indices.append(idx)

    pruned: List[Dict[str, Any]] = []
    for idx, msg in enumerate(messages):
        if idx in synced_indices:
            continue
        if idx in unsynced_user_indices and idx != unsynced_user_indices[-1]:
            continue
        pruned.append(msg)

    return pruned


# ===== 工具调用处理 =====

async def handle_admin_tool_calls_and_continue(
    staff: Dict[str, Any],
    staff_account_id: str,
    base_messages: List[Dict[str, Any]],
    tool_calls: List[Dict[str, Any]],
    send,
    request: Request,
    model_config: ModelConfig,
    conversation_id: Optional[str] = None,
    client_disconnected: Optional[asyncio.Event] = None
):
    """处理管理员工具调用并继续对话。"""
    for i, tc in enumerate(tool_calls, 1):
        tc_id = tc.get("id") or f"call_{i}"
        if not tc.get("id"):
            tc["id"] = tc_id
        fn_info = tc.get("function")
        if not isinstance(fn_info, dict):
            fn_info = {}
            tc["function"] = fn_info
        name = fn_info.get("name", "")
        normalized_args, args = normalize_tool_arguments(fn_info.get("arguments", ""))
        fn_info["arguments"] = normalized_args

        # 发送工具开始状态
        await send(_sse("tool_status", {
            "type": "tool_status",
            "status": "started",
            "tool_call_id": tc_id,
            "function": {"name": name, "arguments": normalized_args}
        }))

        # 执行工具
        try:
            tool_res = execute_admin_tool(name, args, staff, request)
            if isinstance(tool_res, str):
                tool_res = {"ok": False, "error": tool_res}
        except Exception as e:
            logger.exception("Admin tool execution failed")
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
        StaffChatLogDB.add_log(
            staff_account_id,
            "tool",
            json.dumps(tool_res, ensure_ascii=False),
            thread_id=conversation_id,
            tool_call_id=tc_id
        )

    # 继续对话
    messages_with_system = _add_admin_system_prompt(base_messages, staff)
    tools = get_admin_tools(staff)

    retries = 2
    for attempt in range(retries + 1):
        try:
            assistant_content, tool_calls_buffer, finish_reason, reasoning_output, thinking_dur = await stream_model_response(
                model_config,
                messages_with_system,
                tools,
                send,
                client_disconnected,
                None
            )

            if tool_calls_buffer:
                assistant_message = {
                    "role": "assistant",
                    "tool_calls": [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                }
                if assistant_content and assistant_content.strip():
                    assistant_message["content"] = assistant_content
                else:
                    assistant_message["content"] = ""
                base_messages.append(assistant_message)

                tool_calls_info = [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                content_to_log = _build_assistant_log_content(
                    assistant_content if assistant_content and assistant_content.strip() else "",
                    reasoning_output,
                    tool_calls_info
                )
                StaffChatLogDB.add_log(staff_account_id, "assistant", content_to_log, thread_id=conversation_id, thinking_duration=thinking_dur)

                ordered = [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                await handle_admin_tool_calls_and_continue(staff, staff_account_id, base_messages, ordered, send, request, model_config, conversation_id, client_disconnected)
            else:
                if assistant_content and assistant_content.strip():
                    StaffChatLogDB.add_log(
                        staff_account_id,
                        "assistant",
                        _build_assistant_log_content(assistant_content, reasoning_output),
                        thread_id=conversation_id,
                        thinking_duration=thinking_dur
                    )
                await send(_sse("completed", {"type": "completed", "finish_reason": finish_reason or "stop"}))
            break
        except StreamResponseError as e:
            is_user_cancelled = _is_user_cancelled(e.finish_reason)
            will_retry = e.retryable and attempt < retries and not e.has_partial and not is_user_cancelled
            if will_retry:
                continue

            is_thinking_stopped = (
                e.finish_reason == "cancelled"
                and e.partial_reasoning.strip()
                and not e.partial_text.strip()
            )
            is_error_log = (not is_user_cancelled) and (not e.has_partial)
            if e.partial_text or e.partial_reasoning or not e.tool_calls:
                content_to_save = _build_assistant_log_content(e.partial_text or "", e.partial_reasoning or "")
                if not e.partial_text.strip() and not e.partial_reasoning.strip():
                    content_to_save = ERROR_INTERRUPTED_MARKER
                StaffChatLogDB.add_log(
                    staff_account_id, "assistant", content_to_save,
                    thread_id=conversation_id, is_thinking_stopped=is_thinking_stopped,
                    thinking_duration=e.thinking_duration, is_error=is_error_log
                )
            elif e.tool_calls:
                StaffChatLogDB.add_log(staff_account_id, "assistant", json.dumps({
                    "tool_calls": [e.tool_calls[i] for i in sorted(e.tool_calls.keys())]
                }, ensure_ascii=False), thread_id=conversation_id, is_error=is_error_log)

            if e.has_partial or is_user_cancelled:
                await send(_sse("completed", {"type": "completed", "finish_reason": e.finish_reason or "interrupted"}))
                break
            await send(_sse("error", {"type": "error", "error": str(e)}))
            break
        except Exception as e:
            logger.warning("Model response failed (attempt %s/%s): %s", attempt + 1, retries + 1, e)
            if attempt >= retries:
                await send(_sse("error", {"type": "error", "error": f"对话失败: {e}"}))


# ===== 流式聊天主入口 =====

async def stream_admin_chat(
    staff: Dict[str, Any],
    init_messages: List[Dict[str, Any]],
    request: Request,
    selected_model_name: Optional[str],
    conversation_id: Optional[str] = None
) -> StreamingResponse:
    """管理员 AI 聊天流式响应。"""
    queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue()
    staff_account_id = staff.get("id", "")
    init_messages = _sanitize_admin_messages(init_messages, staff_account_id, conversation_id)
    init_messages = _prune_synced_staff_user_messages(staff_account_id, init_messages, conversation_id)
    model_config = resolve_model_config(selected_model_name)

    client_disconnected = asyncio.Event()
    producer_task = None

    async def send(chunk: bytes):
        try:
            await queue.put(chunk)
        except asyncio.CancelledError:
            client_disconnected.set()
            raise

    async def event_generator():
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield item
        except (asyncio.CancelledError, GeneratorExit):
            logger.info("Admin chat client disconnected; canceling generation task")
            client_disconnected.set()
            if producer_task:
                producer_task.cancel()
            raise
        finally:
            client_disconnected.set()
            if producer_task and not producer_task.done():
                producer_task.cancel()

    async def producer():
        partial_state = {
            "assistant_text": "",
            "reasoning_output": "",
            "user_messages_logged": False
        }
        user_messages_to_log: List[str] = []

        try:
            if init_messages:
                for msg in init_messages:
                    if msg.get("role") == "user":
                        content = msg.get("content")
                        if content is None:
                            content = ""
                        user_messages_to_log.append(content)

            messages_with_system = _add_admin_system_prompt(init_messages, staff)
            logger.info("Admin AI chat started with model: %s (%s) for staff: %s", model_config.name, model_config.label, staff_account_id)
            tools = get_admin_tools(staff)

            retries = 2
            for attempt in range(retries + 1):
                try:
                    assistant_text, tool_calls_buffer, finish_reason, reasoning_output, thinking_dur = await stream_model_response(
                        model_config,
                        messages_with_system,
                        tools,
                        send,
                        client_disconnected,
                        partial_state
                    )

                    partial_state["assistant_text"] = assistant_text
                    partial_state["reasoning_output"] = reasoning_output
                    if thinking_dur is not None:
                        partial_state["thinking_duration"] = thinking_dur

                    if user_messages_to_log and not partial_state["user_messages_logged"]:
                        for content in user_messages_to_log:
                            StaffChatLogDB.add_log(staff_account_id, "user", content, thread_id=conversation_id)
                        partial_state["user_messages_logged"] = True

                    if tool_calls_buffer:
                        assistant_message = {
                            "role": "assistant",
                            "tool_calls": [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                        }
                        if assistant_text and assistant_text.strip():
                            assistant_message["content"] = assistant_text
                        else:
                            assistant_message["content"] = ""
                        messages = init_messages + [assistant_message]

                        tool_calls_info = [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                        content_to_log = _build_assistant_log_content(
                            assistant_text if assistant_text and assistant_text.strip() else "",
                            reasoning_output,
                            tool_calls_info
                        )
                        StaffChatLogDB.add_log(staff_account_id, "assistant", content_to_log, thread_id=conversation_id, thinking_duration=thinking_dur)

                        ordered = [tool_calls_buffer[i] for i in sorted(tool_calls_buffer.keys())]
                        await handle_admin_tool_calls_and_continue(staff, staff_account_id, messages, ordered, send, request, model_config, conversation_id, client_disconnected)
                    else:
                        if assistant_text and assistant_text.strip():
                            StaffChatLogDB.add_log(
                                staff_account_id,
                                "assistant",
                                _build_assistant_log_content(assistant_text, reasoning_output),
                                thread_id=conversation_id,
                                thinking_duration=thinking_dur
                            )
                        await send(_sse("completed", {"type": "completed", "finish_reason": finish_reason or "stop"}))
                    break
                except StreamResponseError as e:
                    is_user_cancelled = _is_user_cancelled(e.finish_reason)
                    will_retry = e.retryable and attempt < retries and not e.has_partial and not is_user_cancelled
                    if will_retry:
                        continue

                    if user_messages_to_log and not partial_state["user_messages_logged"]:
                        for content in user_messages_to_log:
                            StaffChatLogDB.add_log(staff_account_id, "user", content, thread_id=conversation_id)
                        partial_state["user_messages_logged"] = True

                    is_thinking_stopped = (
                        e.finish_reason == "cancelled"
                        and e.partial_reasoning.strip()
                        and not e.partial_text.strip()
                    )
                    is_error_log = (not is_user_cancelled) and (not e.has_partial)
                    if e.partial_text or e.partial_reasoning or not e.tool_calls:
                        content_to_save = _build_assistant_log_content(e.partial_text or "", e.partial_reasoning or "")
                        if not e.partial_text.strip() and not e.partial_reasoning.strip():
                            content_to_save = ERROR_INTERRUPTED_MARKER
                        StaffChatLogDB.add_log(
                            staff_account_id, "assistant", content_to_save,
                            thread_id=conversation_id, is_thinking_stopped=is_thinking_stopped,
                            thinking_duration=e.thinking_duration, is_error=is_error_log
                        )
                    elif e.tool_calls:
                        StaffChatLogDB.add_log(staff_account_id, "assistant", json.dumps({
                            "tool_calls": [e.tool_calls[i] for i in sorted(e.tool_calls.keys())]
                        }, ensure_ascii=False), thread_id=conversation_id, is_error=is_error_log)

                    if e.has_partial or is_user_cancelled:
                        await send(_sse("completed", {"type": "completed", "finish_reason": e.finish_reason or "interrupted"}))
                        break
                    await send(_sse("error", {"type": "error", "error": str(e)}))
                    break
                except Exception as e:
                    logger.warning("Model response failed (attempt %s/%s): %s", attempt + 1, retries + 1, e)
                    if attempt >= retries:
                        await send(_sse("error", {"type": "error", "error": f"{e}"}))
        except asyncio.CancelledError:
            logger.info("Admin chat client disconnected; saving partial content")
            if user_messages_to_log and not partial_state["user_messages_logged"]:
                for content in user_messages_to_log:
                    try:
                        StaffChatLogDB.add_log(staff_account_id, "user", content, thread_id=conversation_id)
                    except Exception as e:
                        logger.error("Failed to persist user message: %s", e)

            try:
                assistant_text = partial_state.get("assistant_text", "")
                reasoning_output = partial_state.get("reasoning_output", "")
                thinking_dur = partial_state.get("thinking_duration")

                if assistant_text or reasoning_output:
                    content_to_log = _build_assistant_log_content(assistant_text, reasoning_output)
                else:
                    content_to_log = ERROR_INTERRUPTED_MARKER

                is_thinking_stopped = bool(reasoning_output.strip()) and not bool(assistant_text.strip())
                StaffChatLogDB.add_log(
                    staff_account_id, "assistant", content_to_log,
                    thread_id=conversation_id, is_thinking_stopped=is_thinking_stopped,
                    thinking_duration=thinking_dur, is_error=False
                )
            except Exception as e:
                logger.error("Failed to persist partial generated content: %s", e)
            raise
        finally:
            try:
                await queue.put(None)
            except Exception:
                pass

    producer_task = asyncio.create_task(producer())

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
