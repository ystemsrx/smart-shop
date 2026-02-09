from fastapi import APIRouter, Request

from auth import error_response, get_current_user_required_from_cookie, success_response
from database import CartDB, DeliverySettingsDB, LotteryConfigDB, ProductDB, UserDB, VariantDB
from ..context import logger
from ..dependencies import check_address_and_building, get_owner_id_from_scope, resolve_shopping_scope
from ..schemas import CartUpdateRequest
from ..services.products import normalize_reservation_cutoff
from ..utils import is_non_sellable, resolve_image_url


router = APIRouter()


@router.get("/cart")
async def get_cart(request: Request):
    user = get_current_user_required_from_cookie(request)

    try:
        _user_ref = UserDB.resolve_user_reference(user["id"])

        scope = resolve_shopping_scope(request)
        owner_ids = scope["owner_ids"]
        owner_scope_id = get_owner_id_from_scope(scope)
        address_validation = scope.get("address_validation") or check_address_and_building(None, None)

        include_unassigned = False

        cart_data = CartDB.get_cart(user["id"])
        if not cart_data:
            return success_response(
                "获取购物车成功",
                {
                    "items": [],
                    "total_quantity": 0,
                    "total_price": 0.0,
                    "scope": scope,
                    "lottery_threshold": LotteryConfigDB.get_threshold(owner_scope_id),
                    "lottery_enabled": LotteryConfigDB.get_enabled(owner_scope_id),
                    "address_validation": address_validation,
                },
            )

        items_dict = cart_data["items"]

        all_products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
        product_dict = {p["id"]: p for p in all_products}

        cart_items = []
        total_quantity = 0
        total_price = 0.0

        sep = "@@"
        for key, quantity in items_dict.items():
            product_id = key
            variant_id = None
            if isinstance(key, str) and sep in key:
                product_id, variant_id = key.split(sep, 1)
            if product_id in product_dict:
                product = product_dict[product_id]
                is_active = 1 if int(product.get("is_active", 1) or 1) == 1 else 0
                non_sellable = is_non_sellable(product)
                zhe = float(product.get("discount", 10.0) or 10.0)
                unit_price = round(float(product["price"]) * (zhe / 10.0), 2)
                subtotal = unit_price * quantity
                if non_sellable:
                    subtotal = 0.0

                if is_active == 1:
                    total_quantity += quantity
                    if not non_sellable:
                        total_price += subtotal

                item = {
                    "product_id": product_id,
                    "name": product["name"],
                    "unit_price": round(unit_price, 2),
                    "quantity": quantity,
                    "subtotal": round(subtotal, 2),
                    "stock": product["stock"] if not non_sellable else "∞",
                    "category": product.get("category", ""),
                    "img_path": product.get("img_path", ""),
                    "image_url": resolve_image_url(product.get("img_path", "")),
                    "is_active": is_active,
                    "is_not_for_sale": non_sellable,
                }
                try:
                    requires_reservation = int(product.get("reservation_required", 0) or 0) == 1
                except Exception:
                    requires_reservation = bool(product.get("reservation_required"))
                if requires_reservation:
                    item["reservation_required"] = True
                    cutoff_val = product.get("reservation_cutoff")
                    if cutoff_val:
                        try:
                            item["reservation_cutoff"] = normalize_reservation_cutoff(str(cutoff_val))
                        except Exception:
                            item["reservation_cutoff"] = None
                    note_val = (product.get("reservation_note") or "").strip()
                    if note_val:
                        item["reservation_note"] = note_val[:120]
                if variant_id:
                    variant = VariantDB.get_by_id(variant_id)
                    if variant:
                        item["variant_id"] = variant_id
                        item["variant_name"] = variant.get("name")
                        item["stock"] = variant.get("stock", 0)
                if non_sellable:
                    item["stock"] = "∞"
                cart_items.append(item)

        delivery_scope = scope
        owner_id = get_owner_id_from_scope(delivery_scope)
        delivery_config = DeliverySettingsDB.get_delivery_config(owner_id)
        active_cart_items = [item for item in cart_items if item.get("is_active", 1) == 1 and (item.get("quantity") or 0) > 0]
        has_reservation_items = any(item.get("reservation_required") for item in active_cart_items)
        all_items_reservation_required = bool(active_cart_items) and all(item.get("reservation_required") for item in active_cart_items)
        non_sellable_only = bool(active_cart_items) and all(item.get("is_not_for_sale") for item in active_cart_items)

        shipping_fee = (
            0.0
            if total_quantity == 0
            or delivery_config["delivery_fee"] == 0
            or delivery_config["free_delivery_threshold"] == 0
            or total_price >= delivery_config["free_delivery_threshold"]
            or non_sellable_only
            else delivery_config["delivery_fee"]
        )
        cart_result = {
            "items": cart_items,
            "total_quantity": total_quantity,
            "total_price": round(total_price, 2),
            "shipping_fee": round(shipping_fee, 2),
            "payable_total": round(total_price + shipping_fee, 2),
            "delivery_fee": delivery_config["delivery_fee"],
            "free_delivery_threshold": delivery_config["free_delivery_threshold"],
            "lottery_threshold": LotteryConfigDB.get_threshold(owner_scope_id),
            "lottery_enabled": LotteryConfigDB.get_enabled(owner_scope_id),
            "address_validation": address_validation,
            "has_reservation_items": has_reservation_items,
            "all_reservation_items": all_items_reservation_required,
        }

        cart_result["scope"] = delivery_scope
        return success_response("获取购物车成功", cart_result)

    except Exception as exc:
        logger.error("Failed to fetch cart: %s", exc)
        return error_response("获取购物车失败", 500)


@router.post("/cart/update")
async def update_cart(cart_request: CartUpdateRequest, request: Request):
    user = get_current_user_required_from_cookie(request)

    try:
        _user_ref = UserDB.resolve_user_reference(user["id"])

        scope = resolve_shopping_scope(request)
        owner_ids = scope["owner_ids"]
        include_unassigned = False if owner_ids else True

        accessible_products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
        product_dict = {p["id"]: p for p in accessible_products}

        current_cart = CartDB.get_cart(user["id"])
        items = current_cart["items"] if current_cart else {}

        if cart_request.action == "clear":
            items = {}
        elif cart_request.action == "remove" and cart_request.product_id:
            key = cart_request.product_id
            if cart_request.variant_id:
                key = f"{key}@@{cart_request.variant_id}"
            items.pop(key, None)
        elif cart_request.action in ["add", "update"] and cart_request.product_id and cart_request.quantity is not None:
            product = product_dict.get(cart_request.product_id)

            if not product:
                logger.error("Product not accessible or does not exist: %s", cart_request.product_id)
                return error_response("商品不在当前地址的可售范围内", 403)

            try:
                is_active = 1 if int(product.get("is_active", 1) or 1) == 1 else 0
            except Exception:
                is_active = 1
            if is_active != 1 and cart_request.quantity and cart_request.quantity > 0:
                return error_response("该商品已下架，无法添加或更新数量", 400)

            key = cart_request.product_id
            non_sellable = is_non_sellable(product)
            limit_stock = None if non_sellable else product["stock"]
            if cart_request.variant_id:
                key = f"{key}@@{cart_request.variant_id}"
                v = VariantDB.get_by_id(cart_request.variant_id)
                if not v or v.get("product_id") != cart_request.product_id:
                    return error_response("规格不存在", 400)
                limit_stock = None if non_sellable else int(v.get("stock", 0))

            if cart_request.action == "add":
                if cart_request.quantity <= 0:
                    logger.error("Invalid quantity for add action: %s", cart_request.quantity)
                    return error_response("数量必须大于0", 400)

                current_quantity = items.get(key, 0)
                new_quantity = current_quantity + cart_request.quantity
                if limit_stock is not None and new_quantity > limit_stock:
                    logger.error(
                        "Insufficient stock when adding to cart: product=%s variant=%s current=%s requested=%s stock=%s",
                        cart_request.product_id,
                        cart_request.variant_id or "-",
                        current_quantity,
                        cart_request.quantity,
                        limit_stock,
                    )
                    return error_response(f"库存不足，当前库存: {limit_stock}，购物车中已有: {current_quantity}", 400)
                items[key] = new_quantity
            else:
                if cart_request.quantity > 0:
                    if limit_stock is not None and cart_request.quantity > limit_stock:
                        logger.error(
                            "Insufficient stock when updating cart: product=%s variant=%s requested=%s stock=%s",
                            cart_request.product_id,
                            cart_request.variant_id or "-",
                            cart_request.quantity,
                            limit_stock,
                        )
                        return error_response(f"数量超过库存，最大可设置: {limit_stock}", 400)
                    items[key] = cart_request.quantity
                else:
                    items.pop(key, None)
        else:
            logger.error(
                "Invalid cart update request: action=%s product_id=%s quantity=%s",
                cart_request.action,
                cart_request.product_id,
                cart_request.quantity,
            )
            return error_response("无效的购物车更新请求", 400)

        cleaned = {}
        for k, v in items.items():
            pid = k.split("@@", 1)[0] if isinstance(k, str) else k
            p = product_dict.get(pid)

            if p is None:
                logger.warning("Filtering inaccessible product from cart: %s", pid)
                continue

            try:
                active = 1 if int(p.get("is_active", 1) or 1) == 1 else 0
            except Exception:
                active = 1

            if active == 1 and v > 0:
                cleaned[k] = v
        CartDB.update_cart(user["id"], cleaned)

        return success_response("购物车更新成功", {"action": cart_request.action, "items": cleaned, "scope": scope})

    except Exception as exc:
        logger.error("Failed to update cart: %s", exc)
        return error_response("更新购物车失败", 500)
