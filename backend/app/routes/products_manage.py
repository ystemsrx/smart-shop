from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from auth import (
    error_response,
    get_current_admin_required_from_cookie,
    get_current_staff_required_from_cookie,
    success_response,
)
from database import AdminDB, CategoryDB, OrderDB, ProductDB, UserProfileDB, VariantDB
from ..context import logger
from ..dependencies import build_staff_scope, get_owner_id_for_staff, require_agent_with_scope, staff_can_access_product
from ..schemas import (
    BulkProductUpdateRequest,
    CategoryCreateRequest,
    CategoryUpdateRequest,
    ProductDeleteRequest,
    ProductUpdateRequest,
    StockUpdateRequest,
    VariantCreate,
    VariantUpdate,
)
from ..services.admin import compute_registered_user_count
from ..services.orders import resolve_staff_order_scope
from ..services.products import (
    build_product_listing_for_staff,
    delete_product_image,
    delete_products_images,
    handle_product_creation,
    handle_product_image_update,
    handle_product_stock_update,
    handle_product_update,
    resolve_owner_filter_for_staff,
)
from ..utils import enrich_product_image_url, is_non_sellable, is_truthy


router = APIRouter()


@router.get("/admin/products/{product_id}/variants")
async def list_variants(product_id: str, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        product = ProductDB.get_product_by_id(product_id)
        if not product:
            return error_response("商品不存在", 404)
        if not staff_can_access_product(staff, product):
            return error_response("无权访问该商品", 403)
        return success_response("获取规格成功", {"variants": VariantDB.get_by_product(product_id)})
    except Exception as exc:
        logger.error("Failed to fetch variants: %s", exc)
        return error_response("获取规格失败", 500)


@router.get("/agent/products/{product_id}/variants")
async def agent_list_variants(product_id: str, request: Request):
    require_agent_with_scope(request)
    return await list_variants(product_id, request)


@router.post("/admin/products/{product_id}/variants")
async def create_variant(product_id: str, payload: VariantCreate, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        product = ProductDB.get_product_by_id(product_id)
        if not product:
            return error_response("商品不存在", 404)
        if not staff_can_access_product(staff, product):
            return error_response("无权访问该商品", 403)
        vid = VariantDB.create_variant(product_id, payload.name, payload.stock)
        return success_response("规格创建成功", {"variant_id": vid})
    except Exception as exc:
        logger.error("Failed to create variant: %s", exc)
        return error_response("规格创建失败", 500)


@router.post("/agent/products/{product_id}/variants")
async def agent_create_variant(product_id: str, payload: VariantCreate, request: Request):
    require_agent_with_scope(request)
    return await create_variant(product_id, payload, request)


@router.put("/admin/variants/{variant_id}")
async def update_variant(variant_id: str, payload: VariantUpdate, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        variant = VariantDB.get_by_id(variant_id)
        if not variant:
            return error_response("规格不存在", 404)
        product = ProductDB.get_product_by_id(variant.get("product_id"))
        if not staff_can_access_product(staff, product):
            return error_response("无权访问该商品", 403)
        ok = VariantDB.update_variant(variant_id, payload.name, payload.stock)
        if not ok:
            return error_response("无有效更新项", 400)
        return success_response("规格已更新")
    except Exception as exc:
        logger.error("Failed to update variant: %s", exc)
        return error_response("规格更新失败", 500)


@router.put("/agent/variants/{variant_id}")
async def agent_update_variant(variant_id: str, payload: VariantUpdate, request: Request):
    require_agent_with_scope(request)
    return await update_variant(variant_id, payload, request)


@router.delete("/admin/variants/{variant_id}")
async def delete_variant(variant_id: str, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        variant = VariantDB.get_by_id(variant_id)
        if not variant:
            return error_response("规格不存在", 404)
        product = ProductDB.get_product_by_id(variant.get("product_id"))
        if not staff_can_access_product(staff, product):
            return error_response("无权访问该商品", 403)
        ok = VariantDB.delete_variant(variant_id)
        if not ok:
            return error_response("规格不存在", 404)
        return success_response("规格已删除")
    except Exception as exc:
        logger.error("Failed to delete variant: %s", exc)
        return error_response("规格删除失败", 500)


@router.delete("/agent/variants/{variant_id}")
async def agent_delete_variant(variant_id: str, request: Request):
    require_agent_with_scope(request)
    return await delete_variant(variant_id, request)


@router.post("/admin/products")
async def create_product(
    request: Request,
    name: str = Form(...),
    category: str = Form(...),
    price: float = Form(...),
    stock: int = Form(0),
    description: str = Form(""),
    cost: float = Form(0.0),
    owner_id: Optional[str] = Form(None),
    discount: Optional[str] = Form(None),
    variants: Optional[str] = Form(None),
    is_hot: Optional[str] = Form(None),
    is_not_for_sale: Optional[str] = Form(None),
    reservation_required: Optional[str] = Form(None),
    reservation_cutoff: Optional[str] = Form(None),
    reservation_note: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    staff = get_current_staff_required_from_cookie(request)
    resolved_owner_id = owner_id
    if not resolved_owner_id:
        resolved_owner_id = request.query_params.get("owner_id")
    if resolved_owner_id:
        normalized = resolved_owner_id.strip()
        if not normalized or normalized.lower() in ("self", "admin", "all"):
            resolved_owner_id = None
        else:
            resolved_owner_id = normalized
    return await handle_product_creation(
        staff,
        name=name,
        category=category,
        price=price,
        stock=stock,
        description=description,
        cost=cost,
        owner_id=resolved_owner_id,
        discount=discount,
        variants=variants,
        image=image,
        is_hot=is_truthy(is_hot),
        is_not_for_sale=is_truthy(is_not_for_sale),
        reservation_required=is_truthy(reservation_required) if reservation_required is not None else False,
        reservation_cutoff=reservation_cutoff,
        reservation_note=reservation_note,
    )


@router.post("/agent/products")
async def agent_create_product(
    request: Request,
    name: str = Form(...),
    category: str = Form(...),
    price: float = Form(...),
    stock: int = Form(0),
    description: str = Form(""),
    cost: float = Form(0.0),
    discount: Optional[str] = Form(None),
    variants: Optional[str] = Form(None),
    is_hot: Optional[str] = Form(None),
    is_not_for_sale: Optional[str] = Form(None),
    reservation_required: Optional[str] = Form(None),
    reservation_cutoff: Optional[str] = Form(None),
    reservation_note: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    agent, _ = require_agent_with_scope(request)
    agent_owner_id = get_owner_id_for_staff(agent)
    return await handle_product_creation(
        agent,
        name=name,
        category=category,
        price=price,
        stock=stock,
        description=description,
        cost=cost,
        owner_id=agent_owner_id,
        discount=discount,
        variants=variants,
        image=image,
        is_hot=is_truthy(is_hot),
        is_not_for_sale=is_truthy(is_not_for_sale),
        reservation_required=is_truthy(reservation_required) if reservation_required is not None else False,
        reservation_cutoff=reservation_cutoff,
        reservation_note=reservation_note,
    )


@router.get("/admin/products")
async def admin_list_products(
    request: Request, q: Optional[str] = None, category: Optional[str] = None, include_inactive: Optional[bool] = True, owner_id: Optional[str] = None
):
    staff = get_current_staff_required_from_cookie(request)

    query = q.strip() if isinstance(q, str) and q.strip() else None
    category_filter = category.strip() if isinstance(category, str) and category.strip() else None

    if include_inactive is None:
        include_inactive_flag = True
    elif isinstance(include_inactive, str):
        include_inactive_flag = include_inactive.strip().lower() not in ("false", "0", "no")
    else:
        include_inactive_flag = bool(include_inactive)

    scope = build_staff_scope(staff)
    owner_ids, include_unassigned, _ = resolve_owner_filter_for_staff(staff, scope, owner_id)
    scope_override = dict(scope)
    scope_override["owner_ids"] = owner_ids
    scope_override["is_super_admin"] = include_unassigned

    data = build_product_listing_for_staff(
        staff,
        scope_override,
        query=query,
        category=category_filter,
        include_inactive=include_inactive_flag,
    )
    return success_response("获取商品列表成功", data)


@router.get("/agent/categories")
async def agent_get_categories(request: Request):
    try:
        agent, scope = require_agent_with_scope(request)
        owner_ids = scope.get("owner_ids")
        include_unassigned = False

        try:
            CategoryDB.cleanup_orphan_categories()
        except Exception:
            pass

        categories = CategoryDB.get_categories_with_products(owner_ids=owner_ids, include_unassigned=include_unassigned)

        return success_response("获取分类成功", {"categories": categories})

    except Exception as exc:
        logger.error("Failed to fetch agent categories: %s", exc)
        return error_response("获取分类失败", 500)


@router.get("/agent/products")
async def agent_list_products(request: Request, q: Optional[str] = None, category: Optional[str] = None, include_inactive: bool = True):
    agent, scope = require_agent_with_scope(request)
    query = q.strip() if isinstance(q, str) else None
    category_filter = category.strip() if isinstance(category, str) and category.strip() else None
    data = build_product_listing_for_staff(agent, scope, query=query, category=category_filter, include_inactive=include_inactive)
    return success_response("获取商品列表成功", data)


@router.get("/admin/stats")
async def get_admin_stats(request: Request, owner_id: Optional[str] = None):
    staff = get_current_staff_required_from_cookie(request)

    try:
        scope = build_staff_scope(staff)
        owner_ids, include_unassigned, normalized_filter = resolve_owner_filter_for_staff(staff, scope, owner_id)

        dashboard_summary = OrderDB.get_dashboard_stats(
            period="week",
            agent_id=scope.get("agent_id") if normalized_filter != "admin" else None,
            address_ids=scope.get("address_ids"),
            building_ids=scope.get("building_ids"),
            filter_admin_orders=scope.get("filter_admin_orders", False),
        )

        products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
        try:
            CategoryDB.cleanup_orphan_categories()
        except Exception:
            pass
        categories = CategoryDB.get_categories_with_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
        users_count = compute_registered_user_count(None)

        for p in products:
            p["is_not_for_sale"] = is_non_sellable(p)

        total_stock = 0
        for p in products:
            try:
                if is_non_sellable(p):
                    continue
                total_stock += max(int(p.get("stock", 0) or 0), 0)
            except Exception:
                continue

        stats = {
            "total_products": len(products),
            "categories": len(categories),
            "total_stock": total_stock,
            "recent_products": products[:5],
            "users_count": users_count,
            "total_orders": dashboard_summary.get("total_orders", 0),
            "total_revenue": dashboard_summary.get("total_revenue", 0.0),
            "total_profit": dashboard_summary.get("profit_stats", {}).get("total_profit", 0.0),
            "scope": scope,
            "owner_filter": normalized_filter,
        }

        return success_response("获取统计信息成功", stats)

    except Exception as exc:
        logger.error("Failed to fetch statistics: %s", exc)
        return error_response("获取统计信息失败", 500)


@router.get("/admin/users/count")
async def get_users_count(request: Request, owner_id: Optional[str] = None, agent_id: Optional[str] = None):
    staff = get_current_staff_required_from_cookie(request)
    try:
        scope = build_staff_scope(staff)

        if agent_id is not None:
            (
                selected_agent_id,
                selected_address_ids,
                selected_building_ids,
                exclude_address_ids,
                exclude_building_ids,
                normalized_filter,
            ) = resolve_staff_order_scope(staff, scope, agent_id)

            count = UserProfileDB.count_users_by_scope(
                agent_id=selected_agent_id,
                address_ids=selected_address_ids,
                building_ids=selected_building_ids,
                exclude_address_ids=exclude_address_ids,
                exclude_building_ids=exclude_building_ids,
            )

            return success_response("获取注册人数成功", {"count": count, "agent_filter": normalized_filter})
        else:
            owner_ids, _, normalized_filter = resolve_owner_filter_for_staff(staff, scope, owner_id)
            count = compute_registered_user_count(owner_ids)
            return success_response("获取注册人数成功", {"count": count, "owner_filter": normalized_filter})
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to fetch registration count: %s", exc)
        return error_response("获取注册人数失败", 500)


@router.get("/admin/products/{product_id}")
async def get_product_details(product_id: str, request: Request):
    staff = get_current_staff_required_from_cookie(request)

    try:
        product = ProductDB.get_product_by_id(product_id)
        if not product:
            return error_response("商品不存在", 404)
        if not staff_can_access_product(staff, product):
            return error_response("无权访问该商品", 403)

        enrich_product_image_url(product)  # Add image_url field
        variants = VariantDB.get_by_product(product_id)
        product["variants"] = variants
        product["has_variants"] = len(variants) > 0
        if product["has_variants"]:
            product["total_variant_stock"] = sum(v.get("stock", 0) for v in variants)

        return success_response("获取商品详情成功", {"product": product})


    except Exception as exc:
        logger.error("Failed to fetch product details: %s", exc)
        return error_response("获取商品详情失败", 500)


@router.get("/agent/products/{product_id}")
async def agent_get_product_details(product_id: str, request: Request):
    require_agent_with_scope(request)
    return await get_product_details(product_id, request)


@router.put("/admin/products/{product_id}")
async def update_product(product_id: str, product_data: ProductUpdateRequest, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    return await handle_product_update(staff, product_id, product_data)


@router.put("/agent/products/{product_id}")
async def agent_update_product(product_id: str, product_data: ProductUpdateRequest, request: Request):
    agent, _ = require_agent_with_scope(request)
    return await handle_product_update(agent, product_id, product_data)


@router.put("/admin/products/0")
async def bulk_update_products(payload: BulkProductUpdateRequest, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    try:
        if not payload.product_ids:
            return error_response("未提供商品ID", 400)

        update_fields: Dict[str, Any] = {}
        if payload.discount is not None:
            try:
                d = float(payload.discount)
                if d < 0.5 or d > 10:
                    return error_response("折扣范围应为0.5~10折", 400)
                update_fields["discount"] = d
            except Exception:
                return error_response("无效的折扣", 400)

        if not update_fields:
            return error_response("没有可更新的字段", 400)

        updated = 0
        not_found: List[str] = []
        blocked: List[str] = []
        for pid in payload.product_ids:
            p = ProductDB.get_product_by_id(pid)
            if not p:
                not_found.append(pid)
                continue
            owner_id = p.get("owner_id")
            if owner_id and owner_id != "admin" and AdminDB.is_agent_deleted(owner_id):
                blocked.append(pid)
                continue
            ok = ProductDB.update_product(pid, update_fields)
            if ok:
                updated += 1
        return success_response("批量更新完成", {"updated": updated, "not_found": not_found, "blocked": blocked})
    except Exception as exc:
        logger.error("Failed to bulk update products: %s", exc)
        return error_response("批量更新商品失败", 500)


@router.put("/admin/products")
async def bulk_update_products_alt(payload: BulkProductUpdateRequest, request: Request):
    return await bulk_update_products(payload, request)


@router.patch("/admin/products/{product_id}/stock")
async def update_product_stock(product_id: str, stock_data: StockUpdateRequest, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    return await handle_product_stock_update(staff, product_id, stock_data)


@router.patch("/agent/products/{product_id}/stock")
async def agent_update_product_stock(product_id: str, stock_data: StockUpdateRequest, request: Request):
    agent, _ = require_agent_with_scope(request)
    return await handle_product_stock_update(agent, product_id, stock_data)


@router.delete("/admin/products/{product_id}")
async def delete_products(product_id: str, request: Request, delete_request: Optional[ProductDeleteRequest] = None):
    staff = get_current_staff_required_from_cookie(request)

    try:
        if delete_request and delete_request.product_ids:
            product_ids = delete_request.product_ids
            if len(product_ids) > 100:
                return error_response("批量删除数量不能超过100件商品", 400)

            allowed_ids: List[str] = []
            blocked_ids: List[str] = []
            for pid in product_ids:
                product = ProductDB.get_product_by_id(pid)
                if product and staff_can_access_product(staff, product):
                    owner_id = product.get("owner_id")
                    if owner_id and owner_id != "admin" and AdminDB.is_agent_deleted(owner_id):
                        blocked_ids.append(pid)
                        continue
                    allowed_ids.append(pid)

            if not allowed_ids:
                if blocked_ids:
                    return error_response("已删除代理的商品不可删除", 400)
                return error_response("无权删除指定商品", 403)

            logger.info("Staff %s requested bulk product deletion: %s", staff["id"], allowed_ids)
            # 先删除图片
            delete_products_images(allowed_ids)
            # 再删除数据库记录
            result = ProductDB.batch_delete_products(allowed_ids)
            return success_response(
                "批量删除完成",
                {"deleted": result.get("deleted_count", 0), "not_found": result.get("not_found", []), "blocked": blocked_ids},
            )
        else:
            product = ProductDB.get_product_by_id(product_id)
            if not product or not staff_can_access_product(staff, product):
                return error_response("无权删除该商品", 403)
            owner_id = product.get("owner_id")
            if owner_id and owner_id != "admin" and AdminDB.is_agent_deleted(owner_id):
                return error_response("已删除代理的商品不可删除", 400)
            # 先删除图片
            delete_product_image(product_id, product.get("img_path"))
            # 再删除数据库记录
            success = ProductDB.delete_product(product_id)
            if success:
                return success_response("删除成功")
            else:
                return error_response("删除失败或商品不存在", 400)
    except Exception as exc:
        logger.error("Failed to delete product: %s", exc)
        return error_response("删除商品失败", 500)


@router.delete("/agent/products/{product_id}")
async def agent_delete_products(product_id: str, request: Request, delete_request: Optional[ProductDeleteRequest] = None):
    agent, _ = require_agent_with_scope(request)

    if delete_request and delete_request.product_ids:
        filtered_ids = [pid for pid in delete_request.product_ids if ProductDB.is_owned_by_agent(pid, agent.get("agent_id"))]
        if not filtered_ids:
            return error_response("无权删除指定商品", 403)
        # 先删除图片
        delete_products_images(filtered_ids)
        # 再删除数据库记录
        result = ProductDB.batch_delete_products(filtered_ids)
        return success_response("删除成功", {"deleted": result.get("deleted_count", 0)})
    else:
        product = ProductDB.get_product_by_id(product_id)
        if not product or product.get("owner_id") != agent.get("agent_id"):
            return error_response("无权删除该商品", 403)

        # 先删除图片
        delete_product_image(product_id, product.get("img_path"))
        # 再删除数据库记录
        success = ProductDB.delete_product(product_id)
        if success:
            return success_response("删除成功")
        else:
            return error_response("删除失败或商品不存在", 400)


@router.post("/admin/products/{product_id}/image")
async def update_product_image(product_id: str, request: Request, image: Optional[UploadFile] = File(None)):
    staff = get_current_staff_required_from_cookie(request)
    return await handle_product_image_update(staff, product_id, image)


@router.post("/agent/products/{product_id}/image")
async def agent_update_product_image(product_id: str, request: Request, image: Optional[UploadFile] = File(None)):
    agent, _ = require_agent_with_scope(request)
    return await handle_product_image_update(agent, product_id, image)


@router.get("/admin/categories")
async def get_admin_categories(request: Request, owner_id: Optional[str] = None):
    staff = get_current_staff_required_from_cookie(request)
    try:
        scope = build_staff_scope(staff)
        owner_ids, _, _ = resolve_owner_filter_for_staff(staff, scope, owner_id)
        categories = CategoryDB.get_categories_with_products(owner_ids=owner_ids, include_unassigned=False)
        return success_response("获取分类成功", {"categories": categories})
    except Exception as exc:
        logger.error("Failed to fetch categories: %s", exc)
        return error_response("获取分类失败", 500)


@router.post("/admin/categories")
async def create_category(request: Request, payload: CategoryCreateRequest):
    staff = get_current_staff_required_from_cookie(request)
    try:
        scope = build_staff_scope(staff)
        owner_ids, _, _ = resolve_owner_filter_for_staff(staff, scope, None)
        owner_id_value = owner_ids[0] if owner_ids else "admin"

        existing = CategoryDB.get_category_by_name(payload.name, owner_id=owner_id_value)
        if existing:
            return error_response("分类名称已存在", 400)

        category_id = CategoryDB.create_category(payload.name, payload.description, owner_id=owner_id_value)
        if category_id:
            return success_response("分类创建成功", {"category_id": category_id})
        return error_response("创建分类失败", 500)
    except Exception as exc:
        logger.error("Failed to create category: %s", exc)
        return error_response("创建分类失败", 500)


@router.put("/admin/categories/{category_id}")
async def update_category(category_id: str, payload: CategoryUpdateRequest, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        category = CategoryDB.get_category(category_id, include_deleted=True)
        if not category:
            return error_response("分类不存在", 404)

        scope = build_staff_scope(staff)
        owner_ids, _, _ = resolve_owner_filter_for_staff(staff, scope, None)
        owner_id_value = owner_ids[0] if owner_ids else "admin"

        if payload.name and payload.name != category.get("name"):
            existing = CategoryDB.get_category_by_name(payload.name, owner_id=owner_id_value)
            if existing:
                return error_response("分类名称已存在", 400)

        updated = CategoryDB.update_category(
            category_id,
            name=payload.name if payload.name is not None else category.get("name"),
            description=payload.description if payload.description is not None else category.get("description"),
        )
        if updated:
            return success_response("分类更新成功")
        return error_response("无可更新字段或分类不存在", 400)
    except Exception as exc:
        logger.error("Failed to update category: %s", exc)
        return error_response("更新分类失败", 500)


@router.delete("/admin/categories/{category_id}")
async def delete_category(category_id: str, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        category = CategoryDB.get_category(category_id, include_deleted=True)
        if not category:
            return error_response("分类不存在", 404)

        products = ProductDB.get_products_by_category(category.get("name"), owner_ids=[category.get("owner_id")], include_unassigned=False)
        if products:
            return error_response("该分类下仍有商品，无法删除", 400)

        success = CategoryDB.delete_category(category_id)
        if success:
            return success_response("分类删除成功")
        else:
            return error_response("分类不存在或删除失败", 400)
    except Exception as exc:
        logger.error("Failed to delete category: %s", exc)
        return error_response("删除分类失败", 500)
