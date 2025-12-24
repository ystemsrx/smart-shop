import hashlib
import io
import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile
from PIL import Image

from auth import error_response, is_super_admin_role, success_response
from database import AdminDB, CartDB, ImageLookupDB, ProductDB, VariantDB
from ..context import ITEMS_DIR, logger
from ..dependencies import build_staff_scope, get_owner_id_for_staff, staff_can_access_product
from ..utils import enrich_product_image_url, is_non_sellable


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


def _compute_content_hash(content: bytes, length: int = 12) -> str:
    """计算内容的 SHA256 哈希值，返回指定长度的十六进制字符串。"""
    return hashlib.sha256(content).hexdigest()[:length]


def delete_product_image(product_id: str, img_path: Optional[str] = None) -> bool:
    """
    删除商品图片及其 lookup 记录，并清理空目录。
    
    Args:
        product_id: 商品 ID
        img_path: 可选的图片路径/哈希，如果不提供则从数据库查询
        
    Returns:
        bool: 是否成功删除图片
    """
    if not img_path:
        # 从数据库获取 img_path
        product = ProductDB.get_product_by_id(product_id)
        if not product:
            return False
        img_path = product.get("img_path", "")
    
    if not img_path or not str(img_path).strip():
        return True  # 没有图片，视为成功
    
    img_path = str(img_path).strip()
    deleted = False
    
    # 尝试通过 image_lookup 删除（新格式）
    if len(img_path) == 12 and img_path.isalnum():
        lookup = ImageLookupDB.get_by_hash(img_path)
        if lookup:
            physical_path = os.path.normpath(os.path.join(ITEMS_DIR, lookup["physical_path"]))
            items_root = os.path.normpath(ITEMS_DIR)
            
            # 安全检查
            if physical_path.startswith(items_root) and os.path.exists(physical_path):
                try:
                    os.remove(physical_path)
                    deleted = True
                    logger.info(f"删除商品图片: {physical_path}")
                    
                    # 清理空的产品目录
                    product_dir = os.path.dirname(physical_path)
                    if os.path.isdir(product_dir) and not os.listdir(product_dir):
                        os.rmdir(product_dir)
                        logger.info(f"删除空产品目录: {product_dir}")
                        
                        # 清理空的 owner 目录
                        owner_dir = os.path.dirname(product_dir)
                        if os.path.isdir(owner_dir) and not os.listdir(owner_dir):
                            os.rmdir(owner_dir)
                            logger.info(f"删除空归属目录: {owner_dir}")
                except Exception as exc:
                    logger.warning(f"删除图片文件失败 {physical_path}: {exc}")
            
            # 删除 lookup 记录
            ImageLookupDB.delete_by_hash(img_path)
        return deleted or True  # lookup 记录不存在也视为成功
    
    # 旧格式路径
    rel_path = img_path.lstrip("/\\")
    if rel_path.startswith("items/"):
        rel_path = rel_path.split("items/", 1)[-1]
    
    file_path = os.path.normpath(os.path.join(ITEMS_DIR, rel_path))
    items_root = os.path.normpath(ITEMS_DIR)
    
    if file_path.startswith(items_root) and os.path.exists(file_path):
        try:
            os.remove(file_path)
            deleted = True
            logger.info(f"删除商品图片(旧格式): {file_path}")
        except Exception as exc:
            logger.warning(f"删除图片文件失败(旧格式) {file_path}: {exc}")
    
    return deleted


def delete_products_images(product_ids: List[str]) -> int:
    """
    批量删除多个商品的图片。
    
    Args:
        product_ids: 商品 ID 列表
        
    Returns:
        int: 成功删除的图片数量
    """
    deleted_count = 0
    for pid in product_ids:
        product = ProductDB.get_product_by_id(pid)
        if product and product.get("img_path"):
            if delete_product_image(pid, product.get("img_path")):
                deleted_count += 1
    return deleted_count


async def store_product_image(
    owner_id: str,
    product_id: str,
    image: UploadFile
) -> Tuple[str, str]:
    """
    存储商品图片，使用新的哈希路径格式。
    
    Args:
        owner_id: 归属 ID（admin 或 agent_id）
        product_id: 商品 ID
        image: 上传的图片文件

    Returns:
        Tuple[str, str]: (hash12, 物理文件路径)
        - hash12 用于存储到 products.img_path
        - 物理文件路径用于回滚清理
    """
    if not image:
        raise HTTPException(status_code=400, detail="未上传图片")

    content = await image.read()
    
    # 处理图片并转换为 WEBP
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

        # 将处理后的图片保存到内存以计算哈希
        output_buffer = io.BytesIO()
        img.save(output_buffer, "WEBP", quality=40, method=6, optimize=True)
        processed_content = output_buffer.getvalue()

    except Exception as exc:
        logger.error(f"图片处理失败: {exc}")
        raise HTTPException(status_code=400, detail=f"图片处理失败: {str(exc)}")

    # 计算内容哈希
    file_hash = _compute_content_hash(processed_content, 12)

    # 检查是否已存在相同哈希（相同图片内容）
    existing = ImageLookupDB.get_by_hash(file_hash)
    if existing:
        # 返回现有哈希，物理路径为空表示无需清理
        physical_path = os.path.join(ITEMS_DIR, existing["physical_path"])
        return file_hash, physical_path

    # 构建新路径: {owner_id}/{product_id}/{hash}.webp
    rel_path = f"{owner_id}/{product_id}/{file_hash}.webp"
    file_path = os.path.normpath(os.path.join(ITEMS_DIR, rel_path))

    # 创建目录
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    # 保存文件
    try:
        with open(file_path, "wb") as f:
            f.write(processed_content)
    except Exception as exc:
        logger.error(f"保存图片失败: {exc}")
        raise HTTPException(status_code=500, detail=f"保存图片失败")

    # 插入 image_lookup 记录
    ImageLookupDB.insert(file_hash, rel_path, product_id)

    return file_hash, file_path


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
    product_id: Optional[str] = None
    try:
        assigned_owner_id = resolve_owner_id_for_staff(staff, owner_id) or "admin"

        discount_value = 10.0
        if discount is not None:
            try:
                discount_value = float(discount)
                if discount_value < 0.5 or discount_value > 10:
                    return error_response("折扣范围应为0.5~10折", 400)
            except Exception:
                return error_response("无效的折扣", 400)

        # 先创建商品（不含图片），获取 product_id
        product_data = {
            "name": name,
            "category": category,
            "price": price,
            "stock": stock,
            "discount": discount_value,
            "description": description,
            "img_path": "",  # 稍后更新
            "cost": cost,
            "owner_id": assigned_owner_id,
            "is_hot": 1 if is_hot else 0,
            "is_not_for_sale": 1 if is_not_for_sale else 0,
            "reservation_required": 1 if reservation_required else 0,
            "reservation_cutoff": normalize_reservation_cutoff(reservation_cutoff),
            "reservation_note": (reservation_note or "").strip()[:120],
        }

        product_id = ProductDB.create_product(product_data)

        # 有图片则上传并更新
        if image:
            img_hash, new_file_path = await store_product_image(assigned_owner_id, product_id, image)
            ProductDB.update_image_path(product_id, img_hash)

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

    old_img_hash = existing.get("img_path", "")
    owner_id = existing.get("owner_id", "admin") or "admin"

    try:
        img_hash, new_file_path = await store_product_image(owner_id, product_id, image)
    except HTTPException as exc:
        return error_response(exc.detail, exc.status_code)

    try:
        ok = ProductDB.update_image_path(product_id, img_hash)
    except Exception as exc:
        ok = False
        logger.error(f"商品图片数据库更新失败: {exc}")

    if not ok:
        # 回滚：删除新上传的图片
        try:
            os.remove(new_file_path)
            ImageLookupDB.delete_by_hash(img_hash)
        except Exception:
            pass
        return error_response("更新图片失败", 500)

    # 删除旧图片（如果存在且与新图片不同）
    if old_img_hash and old_img_hash != img_hash:
        try:
            old_lookup = ImageLookupDB.get_by_hash(old_img_hash)
            if old_lookup:
                old_physical_path = os.path.join(ITEMS_DIR, old_lookup["physical_path"])
                if os.path.exists(old_physical_path):
                    os.remove(old_physical_path)
                    logger.info(f"成功删除原图片: {old_physical_path}")
                ImageLookupDB.delete_by_hash(old_img_hash)
            else:
                # 兼容旧格式路径
                rel_path = str(old_img_hash).lstrip("/\\")
                if rel_path.startswith("items/"):
                    rel_path = rel_path.split("items/", 1)[-1]
                old_file_path = os.path.normpath(os.path.join(ITEMS_DIR, rel_path))
                items_root = os.path.normpath(ITEMS_DIR)
                if old_file_path.startswith(items_root) and os.path.exists(old_file_path):
                    os.remove(old_file_path)
                    logger.info(f"成功删除原图片(旧格式): {old_file_path}")
        except Exception as exc:
            logger.warning(f"删除原图片失败 {old_img_hash}: {exc}")

    return success_response(
        "图片更新成功",
        {"img_path": img_hash, "image_url": f"/items/{img_hash}.webp"},
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
        enrich_product_image_url(p)  # Add image_url field
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
    "delete_product_image",
    "delete_products_images",
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
