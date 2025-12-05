from typing import Optional
from fastapi import APIRouter, Request

from auth import error_response, success_response
from database import CategoryDB, ProductDB, SettingsDB, VariantDB
from ..context import logger
from ..dependencies import resolve_shopping_scope
from ..utils import is_non_sellable, is_truthy


router = APIRouter()


@router.get("/products")
async def get_products(request: Request, category: Optional[str] = None, address_id: Optional[str] = None, building_id: Optional[str] = None, hot_only: Optional[str] = None):
    """获取商品列表。"""
    try:
        scope = resolve_shopping_scope(request, address_id, building_id)
        owner_ids = scope["owner_ids"]
        include_unassigned = False

        show_inactive = SettingsDB.get("show_inactive_in_shop", "false") == "true"

        hot_filter = is_truthy(hot_only)
        if category:
            products = ProductDB.get_products_by_category(
                category, owner_ids=owner_ids, include_unassigned=include_unassigned, hot_only=hot_filter
            )
        else:
            products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned, hot_only=hot_filter)

        if not show_inactive:
            products = [p for p in products if p.get("is_active", 1) != 0]

        product_ids = [p["id"] for p in products]
        variants_map = VariantDB.get_for_products(product_ids)
        for p in products:
            vts = variants_map.get(p["id"], [])
            p["variants"] = vts
            p["has_variants"] = len(vts) > 0
            p["is_not_for_sale"] = is_non_sellable(p)
            if p["has_variants"]:
                p["total_variant_stock"] = sum(v.get("stock", 0) for v in vts)
            if p["is_not_for_sale"]:
                p["stock_display"] = "∞"
        return success_response("获取商品列表成功", {"products": products, "scope": scope})

    except Exception as exc:
        logger.error(f"获取商品失败: {exc}")
        return error_response("获取商品失败", 500)


@router.get("/products/search")
async def search_products(request: Request, q: str, address_id: Optional[str] = None, building_id: Optional[str] = None):
    """搜索商品。"""
    try:
        scope = resolve_shopping_scope(request, address_id, building_id)
        owner_ids = scope["owner_ids"]
        include_unassigned = False

        show_inactive = SettingsDB.get("show_inactive_in_shop", "false") == "true"

        products = ProductDB.search_products(q, owner_ids=owner_ids, include_unassigned=include_unassigned)

        if not show_inactive:
            products = [p for p in products if p.get("is_active", 1) != 0]

        product_ids = [p["id"] for p in products]
        variants_map = VariantDB.get_for_products(product_ids)
        for p in products:
            vts = variants_map.get(p["id"], [])
            p["variants"] = vts
            p["has_variants"] = len(vts) > 0
            p["is_not_for_sale"] = is_non_sellable(p)
            if p["has_variants"]:
                p["total_variant_stock"] = sum(v.get("stock", 0) for v in vts)
            if p["is_not_for_sale"]:
                p["stock_display"] = "∞"
        return success_response("搜索成功", {"products": products, "query": q, "scope": scope})

    except Exception as exc:
        logger.error(f"搜索商品失败: {exc}")
        return error_response("搜索失败", 500)


@router.get("/products/categories")
async def get_categories(request: Request, address_id: Optional[str] = None, building_id: Optional[str] = None):
    """获取商品分类（只返回有商品的分类）。"""
    try:
        scope = resolve_shopping_scope(request, address_id, building_id)
        owner_ids = scope["owner_ids"]
        include_unassigned = False

        show_inactive = SettingsDB.get("show_inactive_in_shop", "false") == "true"

        try:
            CategoryDB.cleanup_orphan_categories()
        except Exception:
            pass

        if show_inactive:
            categories = CategoryDB.get_categories_with_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
        else:
            categories = CategoryDB.get_categories_with_active_products(
                owner_ids=owner_ids, include_unassigned=include_unassigned
            )

        return success_response("获取分类成功", {"categories": categories, "scope": scope})

    except Exception as exc:
        logger.error(f"获取分类失败: {exc}")
        return error_response("获取分类失败", 500)
