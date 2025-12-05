import io
import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile
from PIL import Image

from auth import error_response, is_super_admin_role, success_response
from database import AdminDB, CartDB, ProductDB, VariantDB
from ..context import ITEMS_DIR, logger
from ..dependencies import build_staff_scope, get_owner_id_for_staff, staff_can_access_product
from ..utils import is_non_sellable


def resolve_owner_id_for_staff(staff: Dict[str, Any], requested_owner_id: Optional[str]) -> Optional[str]:
    """Resolve the final owner_id a staff member is allowed to use。"""
    if staff.get("type") == "agent":
        return staff.get("id")

    if requested_owner_id:
        owner_record = AdminDB.get_admin(requested_owner_id, include_disabled=True)
        if not owner_record:
            raise HTTPException(status_code=400, detail="指定的代理不存在")
        role = (owner_record.get("role") or "").lower()
        if role != "agent" and not is_super_admin_role(role):
            raise HTTPException(status_code=400, detail="owner_id 必须为代理账号")
        return requested_owner_id
    return "admin"


def ensure_product_accessible(staff: Dict[str, Any], product_id: str) -> Dict[str, Any]:
    product = ProductDB.get_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    if not staff_can_access_product(staff, product):
        raise HTTPException(status_code=403, detail="无权操作该商品")
    return product


async def store_product_image(category: str, base_name: str, image: UploadFile) -> Tuple[str, str]:
    if not image:
        raise HTTPException(status_code=400, detail="未上传图片")
    safe_category = (category or "misc").strip() or "misc"
    category_dir = os.path.join(ITEMS_DIR, safe_category)
    os.makedirs(category_dir, exist_ok=True)

    timestamp = int(datetime.now().timestamp())
    filename = f"{base_name}_{timestamp}.webp"
    file_path = os.path.join(category_dir, filename)

    content = await image.read()
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

        img.save(file_path, "WEBP", quality=40, method=6, optimize=True)

    except Exception as exc:
        logger.error(f"图片处理失败: {exc}")
        raise HTTPException(status_code=400, detail=f"图片处理失败: {str(exc)}")

    relative_path = f"items/{safe_category}/{filename}"
    return relative_path, file_path


def normalize_reservation_cutoff(value: Optional[str]) -> Optional[str]:
    """将输入的预约截止时间标准化为 HH:MM 格式。"""
    if value is None:
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            return None
        try:
            parsed = datetime.strptime(trimmed, "%H:%M")
        except ValueError:
            raise HTTPException(status_code=400, detail="预约时间格式应为HH:MM")
        return parsed.strftime("%H:%M")
    return None


async def handle_product_creation(
    staff: Dict[str, Any],
    *,
    name: str,
    category: str,
    price: float,
    stock: int,
    description: str,
    cost: float,
    owner_id: Optional[str],
    discount: Optional[str] = None,
    variants: Optional[str] = None,
    image: Optional[UploadFile],
    is_hot: bool = False,
    is_not_for_sale: bool = False,
    reservation_required: bool = False,
    reservation_cutoff: Optional[str] = None,
    reservation_note: Optional[str] = None,
) -> Dict[str, Any]:
    new_file_path: Optional[str] = None
    try:
        assigned_owner_id = resolve_owner_id_for_staff(staff, owner_id)
        img_path = ""
        if image:
            img_path, new_file_path = await store_product_image(category, name, image)

        discount_value = 10.0
        if discount is not None:
            try:
                discount_value = float(discount)
                if discount_value < 0.5 or discount_value > 10:
                    return error_response("折扣范围应为0.5~10折", 400)
            except Exception:
                return error_response("无效的折扣", 400)

        product_data = {
            "name": name,
            "category": category,
            "price": price,
            "stock": stock,
            "discount": discount_value,
            "description": description,
            "img_path": img_path,
            "cost": cost,
            "owner_id": assigned_owner_id,
            "is_hot": 1 if is_hot else 0,
            "is_not_for_sale": 1 if is_not_for_sale else 0,
            "reservation_required": 1 if reservation_required else 0,
            "reservation_cutoff": normalize_reservation_cutoff(reservation_cutoff),
            "reservation_note": (reservation_note or "").strip()[:120],
        }

        product_id = ProductDB.create_product(product_data)

        if variants:
            try:
                import json

                logger.info(f"收到 variants 数据: {variants}")
                variants_list = json.loads(variants)
                logger.info(f"解析后的 variants_list: {variants_list}")
                if isinstance(variants_list, list) and len(variants_list) > 0:
                    for variant in variants_list:
                        if isinstance(variant, dict) and "name" in variant:
                            variant_id = VariantDB.create_variant(
                                product_id=product_id,
                                name=variant["name"],
                                stock=int(variant.get("stock", 0)),
                            )
                            logger.info(
                                f"成功创建变体: {variant_id}, 名称: {variant['name']}, 库存: {variant.get('stock', 0)}"
                            )
                else:
                    logger.warning(f"variants_list 不是有效的列表或为空: {variants_list}")
            except json.JSONDecodeError as exc:
                logger.error(f"创建商品变体失败 - JSON解析错误: {exc}, 原始数据: {variants}")
            except Exception as exc:
                logger.error(f"创建商品变体失败: {exc}, 类型: {type(exc).__name__}", exc_info=True)

        created_product = ProductDB.get_product_by_id(product_id)
        return success_response("商品创建成功", {"product_id": product_id, "product": created_product})

    except HTTPException as exc:
        if new_file_path:
            try:
                os.remove(new_file_path)
            except Exception:
                pass
        return error_response(exc.detail, exc.status_code)
    except Exception as exc:
        if new_file_path:
            try:
                os.remove(new_file_path)
            except Exception:
                pass
        logger.error(f"创建商品失败: {exc}")
        return error_response("创建商品失败", 500)


async def handle_product_update(staff: Dict[str, Any], product_id: str, payload: Any) -> Dict[str, Any]:
    try:
        existing_product = ensure_product_accessible(staff, product_id)
    except HTTPException as exc:
        return error_response(exc.detail, exc.status_code)

    update_data: Dict[str, Any] = {}

    if getattr(payload, "name", None) is not None:
        update_data["name"] = payload.name
    if getattr(payload, "category", None) is not None:
        update_data["category"] = payload.category
    if getattr(payload, "price", None) is not None:
        update_data["price"] = payload.price
    if getattr(payload, "stock", None) is not None:
        update_data["stock"] = payload.stock
    if getattr(payload, "description", None) is not None:
        update_data["description"] = payload.description
    if getattr(payload, "discount", None) is not None:
        try:
            discount_value = float(payload.discount)
            if discount_value < 0.5 or discount_value > 10:
                return error_response("折扣范围应为0.5~10折", 400)
            update_data["discount"] = discount_value
        except Exception:
            return error_response("无效的折扣", 400)
    if getattr(payload, "is_active", None) is not None:
        update_data["is_active"] = 1 if payload.is_active else 0
    if getattr(payload, "is_hot", None) is not None:
        update_data["is_hot"] = 1 if payload.is_hot else 0
    if getattr(payload, "is_not_for_sale", None) is not None:
        update_data["is_not_for_sale"] = 1 if payload.is_not_for_sale else 0
    if getattr(payload, "cost", None) is not None:
        if payload.cost < 0:
            return error_response("商品成本不能为负数", 400)
        update_data["cost"] = payload.cost
    if getattr(payload, "reservation_required", None) is not None:
        update_data["reservation_required"] = 1 if payload.reservation_required else 0
    if getattr(payload, "reservation_cutoff", None) is not None:
        update_data["reservation_cutoff"] = normalize_reservation_cutoff(payload.reservation_cutoff)
    if getattr(payload, "reservation_note", None) is not None:
        note_value = (payload.reservation_note or "").strip()
        update_data["reservation_note"] = note_value[:120]

    if staff.get("type") == "agent":
        update_data["owner_id"] = staff.get("id")
    elif getattr(payload, "owner_id", None) is not None:
        try:
            resolved_owner = resolve_owner_id_for_staff(staff, payload.owner_id)
        except HTTPException as exc:
            return error_response(exc.detail, exc.status_code)
        update_data["owner_id"] = resolved_owner

    if not update_data:
        return error_response("没有提供更新数据", 400)

    try:
        success = ProductDB.update_product(product_id, update_data)
        if not success:
            return error_response("更新商品失败", 500)
    except Exception as exc:
        logger.error(f"更新商品失败: {exc}")
        return error_response("更新商品失败", 500)

    try:
        old_is_active = int(existing_product.get("is_active", 1) or 1)
    except Exception:
        old_is_active = 1
    new_is_active = update_data.get("is_active", old_is_active)
    if old_is_active == 1 and new_is_active == 0:
        try:
            removed = CartDB.remove_product_from_all_carts(product_id)
            logger.info(f"商品 {product_id} 已下架，已从 {removed} 个购物车中移除")
        except Exception as exc:
            logger.warning(f"下架后移除购物车商品失败: {exc}")

    return success_response("商品更新成功")


async def handle_product_image_update(staff: Dict[str, Any], product_id: str, image: Optional[UploadFile]) -> Dict[str, Any]:
    try:
        existing = ensure_product_accessible(staff, product_id)
    except HTTPException as exc:
        return error_response(exc.detail, exc.status_code)

    if not image:
        return error_response("未上传图片", 400)

    old_img_path = existing.get("img_path", "")
    category = existing.get("category", "misc") or "misc"
    base_name = existing.get("name", "prod") or "prod"

    try:
        img_path, new_file_path = await store_product_image(category, base_name, image)
    except HTTPException as exc:
        return error_response(exc.detail, exc.status_code)

    try:
        ok = ProductDB.update_image_path(product_id, img_path)
    except Exception as exc:
        ok = False
        logger.error(f"商品图片数据库更新失败: {exc}")

    if not ok:
        try:
            os.remove(new_file_path)
        except Exception:
            pass
        return error_response("更新图片失败", 500)

    if old_img_path and str(old_img_path).strip():
        try:
            rel_path = str(old_img_path).lstrip("/\\")
            if rel_path.startswith("items/"):
                rel_path = rel_path.split("items/", 1)[-1]
            old_file_path = os.path.normpath(os.path.join(ITEMS_DIR, rel_path))
            items_root = os.path.normpath(ITEMS_DIR)
            if old_file_path.startswith(items_root) and os.path.exists(old_file_path):
                os.remove(old_file_path)
                logger.info(f"成功删除原图片: {old_file_path}")
            else:
                logger.warning(f"跳过删除原图片（路径不安全或不存在）: {old_img_path} -> {old_file_path}")
        except Exception as exc:
            logger.warning(f"删除原图片失败 {old_img_path}: {exc}")

    return success_response(
        "图片更新成功",
        {"img_path": img_path, "image_url": f"/items/{img_path.split('items/')[-1]}" if img_path else ""},
    )


def build_product_listing_for_staff(
    staff: Dict[str, Any], scope: Dict[str, Any], *, query: Optional[str] = None, category: Optional[str] = None, include_inactive: bool = True
) -> Dict[str, Any]:
    owner_ids = scope.get("owner_ids")
    include_unassigned = False

    if staff.get("type") != "agent":
        if owner_ids is None:
            owner_ids = []

    if query:
        products = ProductDB.search_products(
            query, active_only=not include_inactive, owner_ids=owner_ids, include_unassigned=include_unassigned
        )
    elif category:
        products = ProductDB.get_products_by_category(
            category, owner_ids=owner_ids, include_unassigned=include_unassigned
        )
    else:
        products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)

    def is_active(product: Dict[str, Any]) -> bool:
        try:
            return int(product.get("is_active", 1) or 1) == 1
        except Exception:
            return True

    if not include_inactive:
        products = [p for p in products if is_active(p)]

    product_ids = [p["id"] for p in products if p.get("id")]
    variant_map = VariantDB.get_for_products(product_ids)
    for p in products:
        variants = variant_map.get(p.get("id"), [])
        p["variants"] = variants
        p["has_variants"] = len(variants) > 0
        p["is_not_for_sale"] = is_non_sellable(p)

    categories = sorted({p.get("category") for p in products if p.get("category")})
    active_count = sum(1 for p in products if is_active(p))
    inactive_count = len(products) - active_count
    total_stock = 0
    for p in products:
        try:
            if is_non_sellable(p):
                continue
            total_stock += max(int(p.get("stock", 0) or 0), 0)
        except Exception:
            continue

    return {
        "products": products,
        "stats": {"total": len(products), "active": active_count, "inactive": inactive_count, "total_stock": total_stock},
        "categories": categories,
        "scope": scope,
    }


def resolve_owner_filter_for_staff(
    staff: Dict[str, Any], scope: Dict[str, Any], owner_param: Optional[str]
) -> Tuple[Optional[List[str]], bool, str]:
    """解析商品/分类统计的归属过滤。"""
    if staff.get("type") == "agent":
        return scope.get("owner_ids"), bool(scope.get("is_super_admin")), "self"

    filter_value = (owner_param or "").strip() or "self"
    lower = filter_value.lower()

    if lower == "self":
        return ["admin"], False, "self"

    if lower == "all":
        return None, True, "all"

    target = AdminDB.get_admin(filter_value, include_disabled=True, include_deleted=True)
    if not target or (target.get("role") or "").lower() != "agent":
        raise HTTPException(status_code=400, detail="指定的代理不存在")

    return [filter_value], False, filter_value


def resolve_single_owner_for_staff(staff: Dict[str, Any], owner_param: Optional[str]) -> Tuple[str, str]:
    """
    解析单一 owner_id，支持管理员在查询参数中指定代理。
    返回 (owner_id, normalized_filter)
    """
    scope = build_staff_scope(staff)
    owner_ids, _, normalized_filter = resolve_owner_filter_for_staff(staff, scope, owner_param)
    if normalized_filter == "all":
        raise HTTPException(status_code=400, detail="不支持查询全部归属的数据范围")

    if owner_ids and len(owner_ids) > 0:
        return owner_ids[0], normalized_filter

    fallback_owner = get_owner_id_for_staff(staff)
    if not fallback_owner:
        raise HTTPException(status_code=400, detail="无法解析归属范围")
    return fallback_owner, normalized_filter


async def handle_product_stock_update(staff: Dict[str, Any], product_id: str, stock_data: Any) -> Dict[str, Any]:
    try:
        ensure_product_accessible(staff, product_id)
    except HTTPException as exc:
        return error_response(exc.detail, exc.status_code)

    if stock_data.stock < 0:
        return error_response("库存不能为负数", 400)

    try:
        success = ProductDB.update_stock(product_id, stock_data.stock)
    except Exception as exc:
        logger.error(f"更新库存失败: {exc}")
        return error_response("更新库存失败", 500)

    if not success:
        return error_response("更新库存失败", 500)

    return success_response("库存更新成功", {"new_stock": stock_data.stock})


__all__ = [
    "resolve_owner_id_for_staff",
    "ensure_product_accessible",
    "store_product_image",
    "normalize_reservation_cutoff",
    "handle_product_creation",
    "handle_product_update",
    "handle_product_image_update",
    "build_product_listing_for_staff",
    "resolve_owner_filter_for_staff",
    "resolve_single_owner_for_staff",
    "handle_product_stock_update",
    "staff_can_access_product",
]
