from typing import Any, Dict, List, Optional

from database import LotteryDB, ProductDB, VariantDB
from ..context import logger
from ..dependencies import build_staff_scope


def normalize_per_order_limit(value: Optional[Any]) -> Optional[int]:
    """将传入的每单赠品上限标准化为正整数或None。"""
    if value is None:
        return None
    try:
        numeric = int(value)
    except (ValueError, TypeError):
        return None
    return numeric if numeric > 0 else None


def persist_lottery_prize_from_payload(prize: Any, owner_id: Optional[str], override_id: Optional[str] = None) -> str:
    display_name = (prize.display_name or "").strip()
    if not display_name:
        raise ValueError("奖项名称不能为空")
    try:
        weight_value = float(prize.weight)
    except Exception:
        raise ValueError("奖项权重必须为数字")
    is_active = True if prize.is_active is None else bool(prize.is_active)
    items_payload: List[Dict[str, Any]] = []
    for item in prize.items or []:
        if not item.product_id:
            continue
        items_payload.append({"id": item.id, "product_id": item.product_id, "variant_id": item.variant_id})
    return LotteryDB.upsert_prize(override_id or prize.id, display_name, weight_value, is_active, items_payload, owner_id)


def search_inventory_for_selector(term: Optional[str], staff: Optional[Dict[str, Any]] = None, owner_override: Optional[str] = None) -> List[Dict[str, Any]]:
    scope = build_staff_scope(staff) if staff else None
    owner_ids = scope.get("owner_ids") if scope else None
    if owner_override:
        owner_ids = [owner_override]
    include_unassigned = False
    try:
        if term:
            products = ProductDB.search_products(term, active_only=False, owner_ids=owner_ids, include_unassigned=include_unassigned)
        else:
            products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
    except Exception as exc:
        logger.error("Failed to search products: %s", exc)
        return []

    filtered: List[Dict[str, Any]] = []
    try:
        product_ids = [p["id"] for p in products]
    except Exception:
        product_ids = []

    variant_map: Dict[str, List[Dict[str, Any]]] = {}
    if product_ids:
        try:
            variant_map = VariantDB.get_for_products(product_ids)
        except Exception as exc:
            logger.warning("Failed to fetch variants: %s", exc)
            variant_map = {}

    for product in products:
        raw_is_active = product.get("is_active")
        if raw_is_active is None:
            is_active = True
        else:
            try:
                is_active = int(raw_is_active) == 1
            except Exception:
                is_active = True

        try:
            base_price = float(product.get("price") or 0)
        except Exception:
            base_price = 0.0
        try:
            discount = float(product.get("discount", 10.0) or 10.0)
        except Exception:
            discount = 10.0
        retail_price = round(base_price * (discount / 10.0), 2)

        variants = variant_map.get(product.get("id")) or []
        if variants:
            for variant in variants:
                try:
                    stock = int(variant.get("stock") or 0)
                except Exception:
                    stock = 0
                available = is_active and stock > 0
                filtered.append(
                    {
                        "product_id": product.get("id"),
                        "product_name": product.get("name"),
                        "variant_id": variant.get("id"),
                        "variant_name": variant.get("name"),
                        "stock": stock,
                        "retail_price": retail_price,
                        "img_path": product.get("img_path"),
                        "category": product.get("category"),
                        "is_active": is_active,
                        "available": available,
                    }
                )
        else:
            try:
                stock = int(product.get("stock") or 0)
            except Exception:
                stock = 0
            available = is_active and stock > 0
            filtered.append(
                {
                    "product_id": product.get("id"),
                    "product_name": product.get("name"),
                    "variant_id": None,
                    "variant_name": None,
                    "stock": stock,
                    "retail_price": retail_price,
                    "img_path": product.get("img_path"),
                    "category": product.get("category"),
                    "is_active": is_active,
                    "available": available,
                }
            )

    filtered.sort(key=lambda x: (0 if x.get("is_active") else 1, x.get("product_name") or "", x.get("variant_name") or ""))
    return filtered[:100]


__all__ = ["normalize_per_order_limit", "persist_lottery_prize_from_payload", "search_inventory_for_selector"]
