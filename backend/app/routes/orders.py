import asyncio
import json
import os
import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse
from starlette.responses import FileResponse

from auth import error_response, get_current_staff_required_from_cookie, get_current_user_required_from_cookie, success_response
from database import AdminDB, AgentStatusDB, CartDB, CouponDB, DeliverySettingsDB, GiftThresholdDB, LotteryConfigDB, LotteryDB, OrderDB, OrderExportDB, ProductDB, RewardDB, SalesCycleDB, SettingsDB, UserProfileDB, VariantDB
from ..context import EXPORTS_DIR, logger
from ..dependencies import build_staff_scope, check_address_and_building, get_owner_id_for_staff, get_owner_id_from_scope, require_agent_with_scope, resolve_shopping_scope, staff_can_access_order
from ..schemas import OrderCreateRequest, OrderDeleteRequest, OrderExportRequest, OrderStatusUpdateRequest, PaymentStatusUpdateRequest
from ..services.orders import (
    build_agent_name_map,
    build_export_row,
    prepare_export_scope,
    resolve_scope_label,
    resolve_staff_order_scope,
    serialize_export_job,
    write_export_workbook,
)
from ..services.products import normalize_reservation_cutoff
from ..utils import build_export_filename, convert_sqlite_timestamp_to_unix, format_export_range_label, is_non_sellable


router = APIRouter()


@router.post("/orders")
async def create_order(order_request: OrderCreateRequest, request: Request):
    user = get_current_user_required_from_cookie(request)

    try:
        shipping_info = dict(order_request.shipping_info or {})
        scope = resolve_shopping_scope(request, address_id=shipping_info.get("address_id"), building_id=shipping_info.get("building_id"))

        validation = scope.get("address_validation") or check_address_and_building(shipping_info.get("address_id"), shipping_info.get("building_id"))
        if not validation.get("is_valid"):
            reason = validation.get("reason")
            if reason in ("missing_address", "missing_building"):
                message = validation.get("message") or "请先选择收货地址"
            else:
                message = validation.get("message") or "地址不存在或未启用，请联系管理员"
            return error_response(message, 400)

        agent_id = scope.get("agent_id")
        cycle_locked = False
        if agent_id:
            cycle_locked = SalesCycleDB.is_locked("agent", agent_id)
        else:
            cycle_locked = SalesCycleDB.is_locked("admin", "admin")
        if cycle_locked:
            return error_response("暂时无法结算，请联系管理员", 400)
        reservation_due_to_closure = False
        closure_note = ""
        allow_reservation_when_closed = False
        closure_requires_reservation_only = False
        closure_prefix = "店铺已暂停营业。"

        if agent_id:
            status = AgentStatusDB.get_agent_status(agent_id)
            agent_open = bool(status.get("is_open", 1))
            allow_reservation_when_closed = bool(status.get("allow_reservation", 0))
            if not agent_open:
                closure_note = status.get("closed_note", "")
                closure_prefix = "当前区域代理已暂停营业。"
                reservation_due_to_closure = True
                if not allow_reservation_when_closed:
                    closure_requires_reservation_only = True
        else:
            is_open = SettingsDB.get("shop_is_open", "1") != "0"
            allow_reservation_when_closed = SettingsDB.get("shop_reservation_enabled", "false") == "true"
            if not is_open:
                closure_note = SettingsDB.get("shop_closed_note", "")
                reservation_due_to_closure = True
                if not allow_reservation_when_closed:
                    closure_requires_reservation_only = True

        cart_data = CartDB.get_cart(user["id"])
        if not cart_data or not cart_data["items"]:
            return error_response("购物车为空，无法创建订单", 400)

        owner_ids = scope["owner_ids"]
        include_unassigned = False if owner_ids else True

        shipping_info["address_id"] = scope.get("address_id")
        shipping_info["building_id"] = scope.get("building_id")
        if scope.get("agent_id"):
            shipping_info["agent_id"] = scope["agent_id"]

        items_dict = cart_data["items"]
        all_products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
        product_dict = {p["id"]: p for p in all_products}

        order_items = []
        total_amount = 0.0
        items_require_reservation = False
        cart_item_count = 0
        all_cart_items_reservation_only = True

        sep = "@@"
        for key, quantity in items_dict.items():
            product_id = key
            variant_id = None
            if isinstance(key, str) and sep in key:
                product_id, variant_id = key.split(sep, 1)
            if product_id in product_dict:
                product = product_dict[product_id]
                if int(product.get("is_active", 1) or 1) != 1:
                    continue
                non_sellable = is_non_sellable(product)

                zhe = float(product.get("discount", 10.0) or 10.0)
                unit_price = round(float(product["price"]) * (zhe / 10.0), 2)

                if variant_id:
                    variant = VariantDB.get_by_id(variant_id)
                    if not variant or variant.get("product_id") != product_id:
                        return error_response("规格不存在", 400)
                    if not non_sellable and quantity > int(variant.get("stock", 0)):
                        return error_response(f"商品 {product['name']}（{variant.get('name')}）库存不足", 400)
                else:
                    if not non_sellable and quantity > product.get("stock", 0):
                        return error_response(f"商品 {product['name']} 库存不足", 400)

                subtotal = unit_price * quantity
                if non_sellable:
                    subtotal = 0.0
                else:
                    total_amount += subtotal
                cart_item_count += 1

                requires_reservation = False
                try:
                    requires_reservation = int(product.get("reservation_required", 0) or 0) == 1
                except Exception:
                    requires_reservation = bool(product.get("reservation_required"))
                cutoff_value = product.get("reservation_cutoff")
                note_value = (product.get("reservation_note") or "").strip()

                item = {
                    "product_id": product_id,
                    "name": product["name"],
                    "unit_price": round(unit_price, 2),
                    "quantity": quantity,
                    "subtotal": round(subtotal, 2),
                    "category": product.get("category", ""),
                    "img_path": product.get("img_path", ""),
                    "is_not_for_sale": non_sellable,
                }
                if requires_reservation:
                    items_require_reservation = True
                    item["is_reservation"] = True
                    if cutoff_value:
                        try:
                            item["reservation_cutoff"] = normalize_reservation_cutoff(str(cutoff_value))
                        except Exception:
                            item["reservation_cutoff"] = None
                    if note_value:
                        item["reservation_note"] = note_value[:120]
                else:
                    all_cart_items_reservation_only = False
                if variant_id:
                    item["variant_id"] = variant_id
                    item["variant_name"] = variant.get("name")
                order_items.append(item)

        items_subtotal = round(total_amount, 2)
        all_items_are_reservation = cart_item_count > 0 and all_cart_items_reservation_only

        if reservation_due_to_closure:
            if allow_reservation_when_closed:
                pass
            else:
                if not all_items_are_reservation:
                    fallback = closure_note.strip() or "暂不支持下单"
                    return error_response(f"{closure_prefix}当前仅支持预约商品下单，请移除非预约商品后再试。{fallback}", 400)

        owner_scope_id = get_owner_id_from_scope(scope)
        lottery_threshold = LotteryConfigDB.get_threshold(owner_scope_id)

        try:
            applicable_thresholds = GiftThresholdDB.get_applicable_thresholds(items_subtotal, owner_scope_id)
            logger.info(f"订单金额 {items_subtotal} 元，适用门槛: {[t.get('threshold_amount') for t in applicable_thresholds]}")

            for threshold in applicable_thresholds:
                threshold_id = threshold.get("id")
                threshold_amount = threshold.get("threshold_amount", 0)
                gift_products = threshold.get("gift_products", 0) == 1
                gift_coupon = threshold.get("gift_coupon", 0) == 1
                coupon_amount = threshold.get("coupon_amount", 0)
                applicable_times = threshold.get("applicable_times", 0)

                if gift_products and applicable_times > 0:
                    try:
                        selected_gifts = GiftThresholdDB.pick_gifts_for_threshold(threshold_id, owner_scope_id, applicable_times)
                        for gift in selected_gifts:
                            try:
                                gift_quantity = int(gift.get("quantity", 1))
                            except Exception:
                                gift_quantity = 1
                            if gift_quantity <= 0:
                                continue
                            gift_item = {
                                "product_id": gift.get("product_id"),
                                "name": gift.get("display_name") or gift.get("product_name") or "满额赠品",
                                "unit_price": 0.0,
                                "quantity": gift_quantity,
                                "subtotal": 0.0,
                                "category": gift.get("category") or "满额赠品",
                                "img_path": gift.get("img_path") or "",
                                "is_auto_gift": True,
                                "auto_gift_item_id": gift.get("threshold_item_id"),
                                "auto_gift_product_name": gift.get("product_name"),
                                "auto_gift_variant_name": gift.get("variant_name"),
                                "gift_threshold_id": threshold_id,
                                "gift_threshold_amount": threshold_amount,
                            }
                            if gift.get("variant_id"):
                                gift_item["variant_id"] = gift.get("variant_id")
                                if gift.get("variant_name"):
                                    gift_item["variant_name"] = gift.get("variant_name")
                            order_items.append(gift_item)
                    except Exception as exc:
                        logger.warning(f"生成满额赠品失败 (门槛{threshold_amount}): {exc}")

                if gift_coupon and coupon_amount > 0 and applicable_times > 0:
                    logger.info(f"记录满额优惠券待发放：{applicable_times} 张 {coupon_amount} 元（门槛{threshold_amount}）")
        except Exception as exc:
            logger.warning(f"处理满额赠品配置失败: {exc}")

        rewards_attached_ids: List[str] = []
        lottery_enabled = LotteryConfigDB.get_enabled(owner_scope_id)
        if lottery_enabled and items_subtotal >= lottery_threshold:
            try:
                rewards = RewardDB.get_eligible_rewards(user["id"], owner_scope_id, restrict_owner=True) or []
                for r in rewards:
                    qty = int(r.get("prize_quantity") or 1)
                    prize_name = r.get("prize_name") or "抽奖奖品"
                    prize_pid = r.get("prize_product_id") or f"prize_{int(datetime.now().timestamp())}"
                    prize_variant_id = r.get("prize_variant_id")
                    prize_variant_name = r.get("prize_variant_name")
                    prize_product_name = r.get("prize_product_name") or prize_name
                    prize_img_path = r.get("prize_img_path") or ""
                    try:
                        recorded_value = float(r.get("prize_unit_price") or 0.0)
                    except Exception:
                        recorded_value = 0.0
                    lottery_item = {
                        "product_id": prize_pid,
                        "name": prize_name,
                        "unit_price": 0.0,
                        "quantity": qty,
                        "subtotal": 0.0,
                        "category": "抽奖",
                        "is_lottery": True,
                        "img_path": prize_img_path,
                        "image_url": prize_img_path,
                        "lottery_display_name": prize_name,
                        "lottery_product_id": prize_pid,
                        "lottery_product_name": prize_product_name,
                        "lottery_variant_id": prize_variant_id,
                        "lottery_variant_name": prize_variant_name,
                        "lottery_unit_price": recorded_value,
                        "lottery_group_id": r.get("prize_group_id"),
                        "lottery_reward_id": r.get("id"),
                    }
                    if prize_variant_id:
                        lottery_item["variant_id"] = prize_variant_id
                        if prize_variant_name:
                            lottery_item["variant_name"] = prize_variant_name
                    order_items.append(lottery_item)
                    rewards_attached_ids.append(r.get("id"))
            except Exception as exc:
                logger.warning(f"附加抽奖奖品失败: {exc}")

        user_confirms_reservation = bool(order_request.reservation_requested)
        if items_require_reservation and not user_confirms_reservation:
            if reservation_due_to_closure:
                tip = closure_note or "当前打烊，仅支持预约购买"
                return error_response(f"{tip}（请确认预约购买后再试）", 400)
            return error_response("该商品需要预约购买，请确认预约方式后再提交订单", 400)

        reservation_reasons: List[str] = []
        if items_require_reservation:
            reservation_reasons.append("商品预约")
        if reservation_due_to_closure:
            reservation_reasons.append("店铺打烊预约")

        is_reservation_order = len(reservation_reasons) > 0
        if is_reservation_order:
            shipping_info["reservation"] = True
            shipping_info["reservation_reasons"] = reservation_reasons
            if reservation_due_to_closure:
                shipping_info["reservation_due_to_closure"] = True
                if closure_note:
                    shipping_info["reservation_closure_note"] = closure_note
            if not user_confirms_reservation and closure_requires_reservation_only:
                return error_response("当前仅支持预约下单，请确认后再试", 400)

        delivery_scope = scope
        owner_scope_id = get_owner_id_from_scope(delivery_scope)
        delivery_config = DeliverySettingsDB.get_delivery_config(owner_scope_id)
        shipping_fee = (
            0.0
            if delivery_config["delivery_fee"] == 0
            or delivery_config["free_delivery_threshold"] == 0
            or items_subtotal >= delivery_config["free_delivery_threshold"]
            else (delivery_config["delivery_fee"] if items_subtotal > 0 else 0.0)
        )

        discount_amount = 0.0
        used_coupon_id = None
        if order_request.apply_coupon and order_request.coupon_id:
            try:
                coupon = CouponDB.check_valid_for_student(order_request.coupon_id, user["id"], owner_scope_id)
                if coupon:
                    try:
                        amt = float(coupon.get("amount") or 0)
                    except Exception:
                        amt = 0.0
                    if items_subtotal > amt and amt > 0:
                        discount_amount = round(amt, 2)
                        used_coupon_id = coupon.get("id")
            except Exception as exc:
                logger.warning(f"校验优惠券失败: {exc}")

        total_amount = round(max(0.0, items_subtotal - discount_amount) + shipping_fee, 2)

        if cart_item_count == 0:
            return error_response("购物车中没有可结算的上架商品", 400)

        order_id = OrderDB.create_order(
            user_identifier=user["id"],
            total_amount=round(total_amount, 2),
            shipping_info=shipping_info,
            items=order_items,
            payment_method=order_request.payment_method,
            note=order_request.note,
            discount_amount=discount_amount,
            coupon_id=used_coupon_id,
            address_id=scope.get("address_id"),
            building_id=scope.get("building_id"),
            agent_id=scope.get("agent_id"),
            is_reservation=is_reservation_order,
            reservation_reason="; ".join(reservation_reasons) if reservation_reasons else None,
        )
        if used_coupon_id and discount_amount > 0:
            try:
                CouponDB.lock_for_order(used_coupon_id, order_id)
            except Exception as exc:
                logger.warning(f"锁定优惠券失败: {exc}")
        if rewards_attached_ids:
            try:
                RewardDB.consume_rewards(user["id"], rewards_attached_ids, order_id, owner_scope_id)
            except Exception as exc:
                logger.warning(f"标记抽奖奖品消费失败: {exc}")

        try:
            shipping_profile = dict(shipping_info)
            UserProfileDB.upsert_shipping(user["id"], shipping_profile)
            logger.info(f"已更新用户 {user['id']} 的最新收货信息")
        except Exception as exc:
            logger.warning(f"更新用户收货信息失败: {exc}")

        return success_response(
            "订单创建成功",
            {"order_id": order_id, "total_amount": round(total_amount, 2), "discount_amount": round(discount_amount, 2), "coupon_id": used_coupon_id},
        )

    except Exception as exc:
        logger.error(f"创建订单失败: {exc}")
        return error_response("创建订单失败", 500)


def _enrich_order_items_with_images(order: Dict) -> Dict:
    items = order.get("items") or []
    if not items:
        return order

    product_ids_to_fetch = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        if item.get("is_lottery") or item.get("is_auto_gift"):
            if not item.get("img_path") and not item.get("image_url"):
                pid = item.get("lottery_product_id") or item.get("product_id")
                if pid and not pid.startswith("prize_"):
                    product_ids_to_fetch.add(pid)

    if not product_ids_to_fetch:
        return order

    product_images = {}
    for pid in product_ids_to_fetch:
        try:
            product = ProductDB.get_product_by_id(pid)
            if product and product.get("img_path"):
                product_images[pid] = product["img_path"]
        except Exception:
            pass

    for item in items:
        if not isinstance(item, dict):
            continue
        if item.get("is_lottery") or item.get("is_auto_gift"):
            if not item.get("img_path") and not item.get("image_url"):
                pid = item.get("lottery_product_id") or item.get("product_id")
                if pid and pid in product_images:
                    item["img_path"] = product_images[pid]
                    item["image_url"] = product_images[pid]

    return order


@router.get("/orders/my")
async def get_my_orders(request: Request):
    user = get_current_user_required_from_cookie(request)

    try:
        orders = OrderDB.get_orders_by_student(user["id"])

        for order in orders:
            if order.get("created_at"):
                order["created_at_timestamp"] = convert_sqlite_timestamp_to_unix(order["created_at"], order["id"])
            _enrich_order_items_with_images(order)

        return success_response("获取订单列表成功", {"orders": orders})

    except Exception as exc:
        logger.error(f"获取订单列表失败: {exc}")
        return error_response("获取订单列表失败", 500)


@router.get("/orders/{order_id}")
async def get_order_detail(order_id: str, request: Request):
    user = get_current_user_required_from_cookie(request)

    try:
        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)

        if order["student_id"] != user["id"] and user.get("type") != "admin":
            return error_response("无权查看此订单", 403)

        if order.get("created_at"):
            order["created_at_timestamp"] = convert_sqlite_timestamp_to_unix(order["created_at"], order["id"])

        _enrich_order_items_with_images(order)

        return success_response("获取订单详情成功", {"order": order})

    except Exception as exc:
        logger.error(f"获取订单详情失败: {exc}")
        return error_response("获取订单详情失败", 500)


@router.get("/admin/orders")
async def get_all_orders(
    request: Request,
    limit: Optional[int] = 20,
    offset: Optional[int] = 0,
    order_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    keyword: Optional[str] = None,
    cycle_id: Optional[str] = None,
):
    staff = get_current_staff_required_from_cookie(request)

    try:
        try:
            limit_val = int(limit or 20)
        except Exception:
            limit_val = 20
        if limit_val <= 0:
            limit_val = 20
        if limit_val > 100:
            limit_val = 100
        try:
            offset_val = int(offset or 0)
        except Exception:
            offset_val = 0
        if offset_val < 0:
            offset_val = 0

        scope = build_staff_scope(staff)
        (
            selected_agent_id,
            selected_address_ids,
            selected_building_ids,
            exclude_address_ids,
            exclude_building_ids,
            selected_filter,
        ) = resolve_staff_order_scope(staff, scope, agent_id)

        cycle_start = None
        cycle_end = None
        if cycle_id:
            if (selected_filter or "").lower() == "all":
                return error_response("全部订单不支持周期筛选", 400)
            owner_type = "agent" if staff.get("type") == "agent" else "admin"
            owner_id = staff.get("agent_id") if staff.get("type") == "agent" else "admin"
            if staff.get("type") != "agent":
                owner_type = "agent" if selected_filter and selected_filter != "self" else "admin"
                owner_id = selected_agent_id if owner_type == "agent" else "admin"
            cycle_range = SalesCycleDB.resolve_cycle_range(owner_type, owner_id, cycle_id)
            if not cycle_range:
                return error_response("周期不存在", 404)
            cycle_start = cycle_range.get("start_time")
            cycle_end = cycle_range.get("end_time")

        page_data = OrderDB.get_orders_paginated(
            order_id=order_id,
            keyword=keyword,
            limit=limit_val,
            offset=offset_val,
            agent_id=selected_agent_id,
            address_ids=selected_address_ids,
            building_ids=selected_building_ids,
            exclude_address_ids=exclude_address_ids,
            exclude_building_ids=exclude_building_ids,
            cycle_start=cycle_start,
            cycle_end=cycle_end,
        )
        orders = page_data.get("orders", [])
        total = int(page_data.get("total", 0))

        for order in orders:
            if order.get("created_at"):
                order["created_at_timestamp"] = convert_sqlite_timestamp_to_unix(order["created_at"], order["id"])

        stats = OrderDB.get_order_stats(
            agent_id=selected_agent_id,
            address_ids=selected_address_ids,
            building_ids=selected_building_ids,
            exclude_address_ids=exclude_address_ids,
            exclude_building_ids=exclude_building_ids,
            cycle_start=cycle_start,
            cycle_end=cycle_end,
        )
        has_more = (offset_val + len(orders)) < total
        return success_response(
            "获取订单列表成功",
            {
                "orders": orders,
                "stats": stats,
                "total": total,
                "limit": limit_val,
                "offset": offset_val,
                "has_more": has_more,
                "scope": scope,
                "selected_agent_id": selected_agent_id,
                "selected_agent_filter": selected_filter or "self",
            },
        )

    except Exception as exc:
        logger.error(f"获取订单列表失败: {exc}")
        return error_response("获取订单列表失败", 500)


@router.get("/agent/orders")
async def get_agent_orders(
    request: Request,
    limit: Optional[int] = 20,
    offset: Optional[int] = 0,
    order_id: Optional[str] = None,
    keyword: Optional[str] = None,
    cycle_id: Optional[str] = None,
):
    _agent, scope = require_agent_with_scope(request)

    try:
        try:
            limit_val = int(limit or 20)
        except Exception:
            limit_val = 20
        if limit_val <= 0:
            limit_val = 20
        if limit_val > 100:
            limit_val = 100

        try:
            offset_val = int(offset or 0)
        except Exception:
            offset_val = 0
        if offset_val < 0:
            offset_val = 0

        cycle_start = None
        cycle_end = None
        if cycle_id:
            cycle_range = SalesCycleDB.resolve_cycle_range("agent", scope.get("agent_id"), cycle_id)
            if not cycle_range:
                return error_response("周期不存在", 404)
            cycle_start = cycle_range.get("start_time")
            cycle_end = cycle_range.get("end_time")

        page_data = OrderDB.get_orders_paginated(
            order_id=order_id,
            keyword=keyword,
            limit=limit_val,
            offset=offset_val,
            agent_id=scope.get("agent_id"),
            address_ids=scope.get("address_ids"),
            building_ids=scope.get("building_ids"),
            cycle_start=cycle_start,
            cycle_end=cycle_end,
        )

        orders = page_data.get("orders", [])
        total = int(page_data.get("total", 0))

        for order in orders:
            if order.get("created_at"):
                order["created_at_timestamp"] = convert_sqlite_timestamp_to_unix(order["created_at"], order["id"])

        stats = OrderDB.get_order_stats(
            agent_id=scope.get("agent_id"),
            address_ids=scope.get("address_ids"),
            building_ids=scope.get("building_ids"),
            cycle_start=cycle_start,
            cycle_end=cycle_end,
        )

        has_more = (offset_val + len(orders)) < total

        return success_response(
            "获取订单列表成功",
            {"orders": orders, "stats": stats, "total": total, "limit": limit_val, "offset": offset_val, "has_more": has_more, "scope": scope},
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"代理获取订单列表失败: {exc}")
        return error_response("获取订单列表失败", 500)


async def create_export_job_for_staff(staff: Dict[str, Any], payload: OrderExportRequest, staff_prefix: str):
    start_ms = payload.start_time_ms
    end_ms = payload.end_time_ms
    tz_offset = payload.timezone_offset_minutes
    keyword = (payload.keyword or "").strip() or None
    status_filter = (payload.status_filter or "").strip()
    unified_status = status_filter if status_filter and status_filter != "全部" else None
    cycle_id = payload.cycle_id

    (
        selected_agent_id,
        selected_address_ids,
        selected_building_ids,
        exclude_address_ids,
        exclude_building_ids,
        selected_filter,
        filter_admin_orders,
    ) = prepare_export_scope(staff, payload.agent_filter if staff.get("type") == "admin" else "self")

    if cycle_id:
        owner_type = "agent" if staff.get("type") == "agent" else "admin"
        owner_id = staff.get("agent_id") if staff.get("type") == "agent" else "admin"
        if staff.get("type") == "admin":
            filter_value = (selected_filter or "").lower()
            if filter_value == "all":
                return error_response("全部订单不支持周期筛选", 400)
            if filter_value not in ("", "self", "admin"):
                owner_type = "agent"
                owner_id = selected_agent_id or selected_filter
        cycle_range = SalesCycleDB.resolve_cycle_range(owner_type, owner_id, cycle_id)
        if not cycle_range:
            return error_response("周期不存在", 404)

        def cycle_to_ms(value: Optional[str]) -> Optional[int]:
            if not value:
                return None
            try:
                dt = datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                return int(dt.timestamp() * 1000)
            except Exception:
                return None

        cycle_start_ms = cycle_to_ms(cycle_range.get("start_time"))
        cycle_end_ms = cycle_to_ms(cycle_range.get("end_time"))

        if cycle_start_ms is not None:
            start_ms = cycle_start_ms if start_ms is None else max(start_ms, cycle_start_ms)
        if cycle_end_ms is not None:
            end_ms = cycle_end_ms if end_ms is None else min(end_ms, cycle_end_ms)

    if start_ms is not None and end_ms is not None and start_ms > end_ms:
        start_ms, end_ms = end_ms, start_ms

    page_data = OrderDB.get_orders_paginated(
        keyword=keyword,
        limit=1,
        offset=0,
        agent_id=selected_agent_id,
        address_ids=selected_address_ids,
        building_ids=selected_building_ids,
        exclude_address_ids=exclude_address_ids,
        exclude_building_ids=exclude_building_ids,
        start_time_ms=start_ms,
        end_time_ms=end_ms,
        unified_status=unified_status,
        filter_admin_orders=filter_admin_orders,
    )
    total = int(page_data.get("total") or 0)
    if total <= 0:
        return error_response("当前筛选条件下没有可导出的订单", 400)

    agent_name_map = build_agent_name_map()
    scope_label = resolve_scope_label(selected_filter, staff, agent_name_map)
    owner_id = get_owner_id_for_staff(staff)
    if not owner_id:
        return error_response("无法解析归属范围，请重新登录", 401)
    filename = build_export_filename(start_ms, end_ms)

    job = OrderExportDB.create_job(
        owner_id=owner_id,
        role=staff.get("type"),
        agent_filter=selected_filter,
        keyword=keyword,
        status_filter=unified_status,
        start_time_ms=start_ms,
        end_time_ms=end_ms,
        scope_label=scope_label,
        filename=filename,
        total_count=total,
        client_tz_offset=tz_offset,
    )

    history_rows = OrderExportDB.list_jobs_for_owner(owner_id, limit=12)
    history = [serialize_export_job(entry, staff_prefix) for entry in history_rows]

    return success_response(
        "导出任务已创建",
        {
            "job_id": job["id"],
            "stream_path": f"{staff_prefix}/orders/export/stream/{job['id']}",
            "history": history,
            "expires_at": job.get("expires_at"),
            "total": total,
            "filename": job.get("filename"),
            "range_label": format_export_range_label(start_ms, end_ms, tz_offset),
            "scope_label": scope_label,
        },
    )


async def stream_export_for_staff(request: Request, staff: Dict[str, Any], staff_prefix: str, job_id: str):
    owner_id = get_owner_id_for_staff(staff)
    if not owner_id:
        raise HTTPException(status_code=401, detail="无法解析归属范围")
    job = OrderExportDB.get_job(job_id)
    if not job or job.get("owner_id") != owner_id:
        raise HTTPException(status_code=404, detail="导出任务不存在")

    agent_name_map = build_agent_name_map()
    selected_filter_value = job.get("agent_filter") or "self"
    (
        selected_agent_id,
        selected_address_ids,
        selected_building_ids,
        exclude_address_ids,
        exclude_building_ids,
        _resolved_filter,
        filter_admin_orders,
    ) = prepare_export_scope(staff, selected_filter_value)

    unified_status = job.get("status_filter") or None
    keyword = job.get("keyword") or None
    start_ms = job.get("start_time_ms")
    end_ms = job.get("end_time_ms")
    tz_offset = job.get("client_tz_offset")
    is_admin_role = staff.get("type") == "admin"
    safe_filename = os.path.basename(job.get("filename") or "") or f"{job_id}.xlsx"
    file_path = os.path.abspath(os.path.join(EXPORTS_DIR, safe_filename))
    safe_root = os.path.abspath(EXPORTS_DIR)
    if not file_path.startswith(safe_root):
        file_path = os.path.join(safe_root, f"{job_id}.xlsx")

    def is_expired(expires_at: Optional[str]) -> bool:
        if not expires_at:
            return False
        try:
            expire_dt = datetime.strptime(expires_at, "%Y-%m-%d %H:%M:%S")
            return expire_dt <= datetime.now()
        except Exception:
            return False

    async def event_generator():
        nonlocal job
        try:
            if is_expired(job.get("expires_at")):
                OrderExportDB.update_job(job_id, status="expired", message="导出链接已过期")
                history_rows = OrderExportDB.list_jobs_for_owner(owner_id, limit=12)
                history = [serialize_export_job(entry, staff_prefix) for entry in history_rows]
                yield {"data": json.dumps({"status": "expired", "message": "导出链接已过期，请重新生成", "history": history, "range_label": format_export_range_label(start_ms, end_ms, tz_offset)})}
                return

            if job.get("status") == "completed" and os.path.exists(file_path):
                history_rows = OrderExportDB.list_jobs_for_owner(owner_id, limit=12)
                history = [serialize_export_job(entry, staff_prefix) for entry in history_rows]
                final_job = serialize_export_job(job, staff_prefix)
                final_job.update(
                    {
                        "status": "completed",
                        "progress": 100,
                        "stage": "已完成",
                        "exported": job.get("exported_count"),
                        "total": job.get("total_count"),
                        "history": history,
                    }
                )
                yield {"data": json.dumps(final_job)}
                return

            OrderExportDB.update_job(job_id, status="running", message="正在准备导出")
            yield {"data": json.dumps({"status": "running", "stage": "准备导出", "progress": 5, "total": job.get("total_count"), "range_label": format_export_range_label(start_ms, end_ms, tz_offset)})}

            exported_rows: List[List[str]] = []
            exported_count = 0
            total_count = 0
            offset = 0
            batch_size = 200
            progress = 5

            while True:
                page_data = OrderDB.get_orders_paginated(
                    keyword=keyword,
                    limit=batch_size,
                    offset=offset,
                    agent_id=selected_agent_id,
                    address_ids=selected_address_ids,
                    building_ids=selected_building_ids,
                    exclude_address_ids=exclude_address_ids,
                    exclude_building_ids=exclude_building_ids,
                    start_time_ms=start_ms,
                    end_time_ms=end_ms,
                    unified_status=unified_status,
                    filter_admin_orders=filter_admin_orders,
                    allow_large_limit=True,
                )
                orders_batch = page_data.get("orders") or []
                if offset == 0:
                    total_count = int(page_data.get("total") or 0)
                    OrderExportDB.update_job(job_id, total_count=total_count)

                if not orders_batch:
                    break

                for order in orders_batch:
                    exported_rows.append(build_export_row(order, agent_name_map, staff, is_admin_role, tz_offset))

                exported_count = len(exported_rows)
                OrderExportDB.update_job(job_id, exported_count=exported_count)
                progress = 10 if total_count == 0 else min(96, max(10, int(exported_count / max(total_count, 1) * 85)))
                yield {
                    "data": json.dumps(
                        {
                            "status": "running",
                            "stage": "正在解析数据",
                            "progress": progress,
                            "exported": exported_count,
                            "total": total_count,
                            "message": f"正在解析... {exported_count}/{total_count or '未知'}",
                        }
                    )
                }

                offset += len(orders_batch)
                if len(orders_batch) < batch_size:
                    break

            if exported_count == 0:
                OrderExportDB.update_job(job_id, status="failed", message="当前筛选无数据")
                yield {"data": json.dumps({"status": "failed", "message": "当前筛选条件下没有可导出的订单"})}
                return

            OrderExportDB.update_job(job_id, exported_count=exported_count, message="正在生成文件")
            yield {"data": json.dumps({"status": "running", "stage": "生成文件", "progress": min(98, max(progress, 90)), "exported": exported_count, "total": total_count})}

            await asyncio.to_thread(write_export_workbook, exported_rows, file_path)

            OrderExportDB.update_job(
                job_id,
                status="completed",
                exported_count=exported_count,
                total_count=total_count,
                file_path=file_path,
                message="导出完成",
                filename=os.path.basename(file_path),
            )
            job = OrderExportDB.get_job(job_id)
            history_rows = OrderExportDB.list_jobs_for_owner(owner_id, limit=12)
            history = [serialize_export_job(entry, staff_prefix) for entry in history_rows]
            final_job = serialize_export_job(job, staff_prefix)
            final_job.update(
                {
                    "status": "completed",
                    "progress": 100,
                    "stage": "已完成",
                    "exported": exported_count,
                    "total": total_count,
                    "history": history,
                }
            )
            yield {"data": json.dumps(final_job)}
        except Exception as exc:
            logger.error(f"导出订单失败({job_id}): {exc}")
            OrderExportDB.update_job(job_id, status="failed", message=str(exc))
            yield {"data": json.dumps({"status": "failed", "message": str(exc) or "导出失败"})}

    return EventSourceResponse(event_generator(), ping=15000)


async def download_export_for_staff(staff: Dict[str, Any], job_id: str, token: Optional[str]):
    owner_id = get_owner_id_for_staff(staff)
    if not owner_id:
        raise HTTPException(status_code=401, detail="无法解析归属范围")
    job = OrderExportDB.get_job(job_id)
    if not job or job.get("owner_id") != owner_id:
        raise HTTPException(status_code=404, detail="导出记录不存在")
    if token is None or token != job.get("download_token"):
        raise HTTPException(status_code=403, detail="下载链接已失效，请重新导出")
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="文件尚未生成，请稍后重试")
    expires_at = job.get("expires_at")
    if expires_at:
        try:
            expire_dt = datetime.strptime(expires_at, "%Y-%m-%d %H:%M:%S")
            if expire_dt <= datetime.now():
                OrderExportDB.update_job(job_id, status="expired", message="导出链接已过期")
                raise HTTPException(status_code=410, detail="导出链接已过期，请重新导出")
        except ValueError:
            pass

    file_path = job.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="导出文件不存在，请重新导出")

    filename = os.path.basename(job.get("filename") or file_path) or f"{job_id}.xlsx"
    return FileResponse(file_path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=filename)


async def get_export_history_for_staff(staff: Dict[str, Any], staff_prefix: str):
    owner_id = get_owner_id_for_staff(staff)
    if not owner_id:
        raise HTTPException(status_code=401, detail="无法解析归属范围")
    rows = OrderExportDB.list_jobs_for_owner(owner_id, limit=12)
    history = [serialize_export_job(row, staff_prefix) for row in rows]
    return success_response("获取导出记录成功", {"history": history})


@router.post("/admin/orders/export")
async def admin_create_order_export(request: Request, payload: OrderExportRequest):
    staff = get_current_staff_required_from_cookie(request)
    return await create_export_job_for_staff(staff, payload, "/admin")


@router.post("/agent/orders/export")
async def agent_create_order_export(request: Request, payload: OrderExportRequest):
    agent, _ = require_agent_with_scope(request)
    return await create_export_job_for_staff(agent, payload, "/agent")


@router.get("/admin/orders/export/stream/{job_id}")
async def admin_stream_order_export(job_id: str, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    return await stream_export_for_staff(request, staff, "/admin", job_id)


@router.get("/agent/orders/export/stream/{job_id}")
async def agent_stream_order_export(job_id: str, request: Request):
    agent, _ = require_agent_with_scope(request)
    return await stream_export_for_staff(request, agent, "/agent", job_id)


@router.get("/admin/orders/export/download/{job_id}")
async def admin_download_order_export(job_id: str, request: Request, token: Optional[str] = None):
    staff = get_current_staff_required_from_cookie(request)
    return await download_export_for_staff(staff, job_id, token)


@router.get("/agent/orders/export/download/{job_id}")
async def agent_download_order_export(job_id: str, request: Request, token: Optional[str] = None):
    agent, _ = require_agent_with_scope(request)
    return await download_export_for_staff(agent, job_id, token)


@router.get("/admin/orders/export/history")
async def admin_export_history(request: Request):
    staff = get_current_staff_required_from_cookie(request)
    return await get_export_history_for_staff(staff, "/admin")


@router.get("/agent/orders/export/history")
async def agent_export_history(request: Request):
    agent, _ = require_agent_with_scope(request)
    return await get_export_history_for_staff(agent, "/agent")


@router.delete("/admin/orders/{order_id}")
async def admin_delete_orders(order_id: str, request: Request, delete_request: Optional[OrderDeleteRequest] = None):
    """删除订单（支持单个或批量）。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        scope = build_staff_scope(staff)
        if delete_request and delete_request.order_ids:
            ids = delete_request.order_ids
            if len(ids) > 500:
                return error_response("批量删除数量不能超过500笔订单", 400)
            try:
                orders_before = [OrderDB.get_order_by_id(i) for i in ids]
            except Exception:
                orders_before = []
            accessible_ids: List[str] = []
            blocked_ids: List[str] = []
            for od in orders_before:
                if not od:
                    continue
                if not staff_can_access_order(staff, od, scope):
                    return error_response("无权删除部分订单", 403)
                agent_id = od.get("agent_id")
                if agent_id and AdminDB.is_agent_deleted(agent_id):
                    blocked_ids.append(od["id"])
                    continue
                accessible_ids.append(od["id"])
            if not accessible_ids:
                if blocked_ids:
                    return error_response("已删除代理的订单不可删除", 400)
                return success_response("未找到可删除的订单", {"deleted_count": 0, "deleted_ids": [], "not_found_ids": ids})
            result = OrderDB.batch_delete_orders(accessible_ids)
            if not result.get("success"):
                return error_response(result.get("message", "批量删除失败"), 400)
            try:
                for od in orders_before or []:
                    if not od:
                        continue
                    payment_status = od.get("payment_status") or "pending"
                    if payment_status == "succeeded":
                        try:
                            restore_ok = OrderDB.restore_stock_from_order(od.get("id"))
                            if not restore_ok:
                                logger.warning(f"批量删除时恢复库存失败: order_id={od.get('id')}")
                        except Exception as exc:
                            logger.warning(f"批量删除时恢复库存异常: {exc}")
                    if payment_status != "succeeded":
                        try:
                            c_id = od.get("coupon_id")
                            d_amt = float(od.get("discount_amount") or 0)
                            if c_id and d_amt > 0:
                                CouponDB.unlock_for_order(c_id, od.get("id"))
                        except Exception:
                            continue
            except Exception as exc:
                logger.warning(f"批量删除后处理失败: {exc}")
            result["blocked_ids"] = blocked_ids
            return success_response(result.get("message", "批量删除成功"), result)
        else:
            try:
                od = OrderDB.get_order_by_id(order_id)
                if not staff_can_access_order(staff, od, scope):
                    return error_response("无权删除此订单", 403)
                if od and od.get("agent_id") and AdminDB.is_agent_deleted(od.get("agent_id")):
                    return error_response("已删除代理的订单不可删除", 400)
                if od:
                    payment_status = od.get("payment_status") or "pending"
                    if payment_status == "succeeded":
                        try:
                            restore_ok = OrderDB.restore_stock_from_order(order_id)
                            if not restore_ok:
                                logger.warning(f"删除订单时恢复库存失败: order_id={order_id}")
                        except Exception as exc:
                            logger.warning(f"删除订单时恢复库存异常: {exc}")
                    if payment_status != "succeeded":
                        try:
                            c_id = od.get("coupon_id")
                            d_amt = float(od.get("discount_amount") or 0)
                            if c_id and d_amt > 0:
                                CouponDB.unlock_for_order(c_id, order_id)
                        except Exception:
                            pass
            except Exception as exc:
                logger.warning(f"单笔删除前处理失败: {exc}")
            ok = OrderDB.delete_order(order_id)
            if not ok:
                return error_response("删除订单失败或订单不存在", 400)
            return success_response("订单删除成功")
    except Exception as exc:
        logger.error(f"删除订单失败: {exc}")
        return error_response("删除订单失败", 500)


@router.patch("/admin/orders/{order_id}/status")
async def update_order_status(order_id: str, status_request: OrderStatusUpdateRequest, request: Request):
    """更新订单状态（管理员）。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        valid_statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"]
        if status_request.status not in valid_statuses:
            return error_response("无效的订单状态", 400)

        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)
        scope = build_staff_scope(staff)
        if not staff_can_access_order(staff, order, scope):
            return error_response("无权操作该订单", 403)
        if order.get("agent_id") and AdminDB.is_agent_deleted(order.get("agent_id")):
            return error_response("已删除代理的订单不可修改", 400)

        success = OrderDB.update_order_status(order_id, status_request.status)
        if not success:
            return error_response("更新订单状态失败", 500)

        return success_response("订单状态更新成功", {"order_id": order_id, "new_status": status_request.status})
    except Exception as exc:
        logger.error(f"更新订单状态失败: {exc}")
        return error_response("更新订单状态失败", 500)


@router.get("/admin/order-stats")
async def get_order_statistics(request: Request, agent_id: Optional[str] = None):
    """获取订单统计信息（管理员）。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        scope = build_staff_scope(staff)
        (
            selected_agent_id,
            selected_address_ids,
            selected_building_ids,
            exclude_address_ids,
            exclude_building_ids,
            resolved_filter,
        ) = resolve_staff_order_scope(staff, scope, agent_id)

        reference_end = None
        if selected_agent_id:
            agent_record = AdminDB.get_admin_by_agent_id(selected_agent_id, include_disabled=True, include_deleted=True)
            if agent_record and agent_record.get("deleted_at"):
                reference_end = OrderDB.get_last_order_time(
                    agent_id=selected_agent_id,
                    address_ids=selected_address_ids,
                    building_ids=selected_building_ids,
                    filter_admin_orders=scope.get("filter_admin_orders", False),
                )

        stats = OrderDB.get_order_stats(
            agent_id=selected_agent_id,
            address_ids=selected_address_ids,
            building_ids=selected_building_ids,
            exclude_address_ids=exclude_address_ids,
            exclude_building_ids=exclude_building_ids,
            reference_end=reference_end,
        )
        stats["scope"] = scope
        stats["selected_agent_filter"] = resolved_filter
        return success_response("获取订单统计成功", stats)
    except Exception as exc:
        logger.error(f"获取订单统计失败: {exc}")
        return error_response("获取订单统计失败", 500)


@router.get("/admin/dashboard-stats")
async def get_dashboard_statistics(
    request: Request,
    period: str = "week",
    range_start: Optional[str] = None,
    range_end: Optional[str] = None,
    agent_id: Optional[str] = None,
    cycle_id: Optional[str] = None,
    timezone_offset_minutes: Optional[int] = None,
):
    """获取仪表盘详细统计信息（管理员）。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        if period not in ["day", "week", "month"]:
            period = "week"

        scope = build_staff_scope(staff)
        selected_agent_id, selected_address_ids, selected_building_ids, _, _, selected_filter = resolve_staff_order_scope(staff, scope, agent_id)
        filter_admin_orders = scope.get("filter_admin_orders", False)
        if selected_filter and selected_filter != "self":
            filter_admin_orders = False

        cycle_start = None
        cycle_end = None
        if cycle_id:
            if (selected_filter or "").lower() != "all":
                owner_type = "agent" if selected_filter and selected_filter != "self" else "admin"
                owner_id = selected_agent_id if owner_type == "agent" else "admin"
                cycle_range = SalesCycleDB.resolve_cycle_range(owner_type, owner_id, cycle_id)
                if not cycle_range:
                    return error_response("周期不存在", 404)
                cycle_start = cycle_range.get("start_time")
                cycle_end = cycle_range.get("end_time")
            else:
                return error_response("全部订单不支持周期筛选", 400)

        reference_end = None
        if selected_agent_id:
            agent_record = AdminDB.get_admin_by_agent_id(selected_agent_id, include_disabled=True, include_deleted=True)
            if agent_record and agent_record.get("deleted_at"):
                reference_end = OrderDB.get_last_order_time(
                    agent_id=selected_agent_id,
                    address_ids=selected_address_ids,
                    building_ids=selected_building_ids,
                    filter_admin_orders=filter_admin_orders,
                )

        stats = OrderDB.get_dashboard_stats(
            period,
            agent_id=selected_agent_id,
            address_ids=selected_address_ids,
            building_ids=selected_building_ids,
            filter_admin_orders=filter_admin_orders,
            top_range_start=range_start,
            top_range_end=range_end,
            cycle_start=cycle_start,
            cycle_end=cycle_end,
            reference_end=reference_end,
            timezone_offset_minutes=timezone_offset_minutes,
        )
        stats["scope"] = scope
        stats["selected_agent_id"] = selected_agent_id
        return success_response("获取仪表盘统计成功", stats)
    except Exception as exc:
        logger.error(f"获取仪表盘统计失败: {exc}")
        return error_response("获取仪表盘统计失败", 500)


@router.get("/agent/dashboard-stats")
async def get_agent_dashboard_statistics(
    request: Request,
    period: str = "week",
    range_start: Optional[str] = None,
    range_end: Optional[str] = None,
    cycle_id: Optional[str] = None,
    timezone_offset_minutes: Optional[int] = None,
):
    """获取仪表盘详细统计信息（代理）。"""
    _agent, scope = require_agent_with_scope(request)
    try:
        if period not in ["day", "week", "month"]:
            period = "week"

        cycle_start = None
        cycle_end = None
        if cycle_id:
            cycle_range = SalesCycleDB.resolve_cycle_range("agent", scope.get("agent_id"), cycle_id)
            if not cycle_range:
                return error_response("周期不存在", 404)
            cycle_start = cycle_range.get("start_time")
            cycle_end = cycle_range.get("end_time")

        stats = OrderDB.get_dashboard_stats(
            period,
            agent_id=scope.get("agent_id"),
            address_ids=scope.get("address_ids"),
            building_ids=scope.get("building_ids"),
            top_range_start=range_start,
            top_range_end=range_end,
            cycle_start=cycle_start,
            cycle_end=cycle_end,
            timezone_offset_minutes=timezone_offset_minutes,
        )
        stats["scope"] = scope
        return success_response("获取仪表盘统计成功", stats)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"代理获取仪表盘统计失败: {exc}")
        return error_response("获取仪表盘统计失败", 500)


@router.get("/admin/customers")
async def get_customers_with_purchases(
    request: Request,
    limit: Optional[int] = 5,
    offset: Optional[int] = 0,
    agent_id: Optional[str] = None,
    cycle_id: Optional[str] = None,
    cycle_start: Optional[str] = None,
    cycle_end: Optional[str] = None,
):
    """获取购买过商品的客户列表（管理员）。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        try:
            limit_val = int(limit or 5)
        except Exception:
            limit_val = 5
        if limit_val <= 0:
            limit_val = 5
        if limit_val > 50:
            limit_val = 50

        try:
            offset_val = int(offset or 0)
        except Exception:
            offset_val = 0
        if offset_val < 0:
            offset_val = 0

        scope = build_staff_scope(staff)
        (
            selected_agent_id,
            selected_address_ids,
            selected_building_ids,
            _,
            _,
            selected_filter,
        ) = resolve_staff_order_scope(staff, scope, agent_id)
        filter_admin_orders = scope.get("filter_admin_orders", False)
        if selected_filter and selected_filter != "self":
            filter_admin_orders = False

        cycle_start_value = None
        cycle_end_value = None
        cycle_start_param = cycle_start
        cycle_end_param = cycle_end
        if cycle_id:
            if (selected_filter or "").lower() == "all":
                return error_response("全部订单不支持周期筛选", 400)
            owner_type = "agent" if staff.get("type") == "agent" else "admin"
            owner_id = staff.get("agent_id") if staff.get("type") == "agent" else "admin"
            if staff.get("type") != "agent":
                owner_type = "agent" if selected_filter and selected_filter != "self" else "admin"
                owner_id = selected_agent_id if owner_type == "agent" else "admin"
            cycle_range = SalesCycleDB.resolve_cycle_range(owner_type, owner_id, cycle_id)
            if not cycle_range:
                fallback_cycle = SalesCycleDB.get_cycle_by_id_any(cycle_id)
                if fallback_cycle:
                    if staff.get("type") == "agent":
                        agent_id_value = staff.get("agent_id")
                        account_id_value = staff.get("id")
                        owner_matches = (
                            fallback_cycle.get("owner_type") == "agent"
                            and fallback_cycle.get("owner_id") in (agent_id_value, account_id_value)
                        )
                        if not owner_matches:
                            fallback_cycle = None
                if fallback_cycle:
                    cycle_start_value = fallback_cycle.get("start_time")
                    cycle_end_value = fallback_cycle.get("end_time")
                elif cycle_start_param or cycle_end_param:
                    cycle_start_value = cycle_start_param
                    cycle_end_value = cycle_end_param
                else:
                    return error_response("周期不存在", 404)
            else:
                cycle_start_value = cycle_range.get("start_time")
                cycle_end_value = cycle_range.get("end_time")
        elif cycle_start_param or cycle_end_param:
            cycle_start_value = cycle_start_param
            cycle_end_value = cycle_end_param

        customers_data = OrderDB.get_customers_with_purchases(
            limit=limit_val,
            offset=offset_val,
            agent_id=selected_agent_id,
            address_ids=selected_address_ids,
            building_ids=selected_building_ids,
            filter_admin_orders=filter_admin_orders,
            cycle_start=cycle_start_value,
            cycle_end=cycle_end_value,
        )
        customers_data["scope"] = scope
        return success_response("获取客户列表成功", customers_data)
    except Exception as exc:
        logger.error(f"获取客户列表失败: {exc}")
        return error_response("获取客户列表失败", 500)


@router.post("/orders/{order_id}/mark-paid")
async def mark_order_paid_pending(order_id: str, request: Request):
    """用户扫码后手动标记为待验证（processing）。"""
    user = get_current_user_required_from_cookie(request)
    try:
        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)
        if order["student_id"] != user["id"]:
            return error_response("无权操作此订单", 403)

        current = order.get("payment_status") or "pending"
        if current == "succeeded":
            return error_response("订单已支付，无需重复操作", 400)
        if current == "processing":
            return success_response("订单已处于待验证状态")

        if current not in ["pending", "failed"]:
            return error_response("当前订单支付状态不允许此操作", 400)

        ok = OrderDB.update_payment_status(order_id, "processing")
        if not ok:
            return error_response("更新订单支付状态失败", 500)
        return success_response("已标记为待验证", {"order_id": order_id, "payment_status": "processing"})
    except Exception as exc:
        logger.error(f"用户标记订单待验证失败: {exc}")
        return error_response("操作失败", 500)


@router.post("/orders/{order_id}/lottery/draw")
async def draw_lottery(order_id: str, request: Request):
    """订单点击“已付款”后触发抽奖（订单商品金额满足门槛；每单一次）。"""
    user = get_current_user_required_from_cookie(request)
    try:
        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)
        if order["student_id"] != user["id"]:
            return error_response("无权操作此订单", 403)

        items = order.get("items") or []
        items_subtotal = 0.0
        for it in items:
            if isinstance(it, dict) and (it.get("is_lottery") or it.get("is_auto_gift")):
                continue
            try:
                items_subtotal += float(it.get("subtotal", 0) or 0)
            except Exception:
                pass
        owner_id = LotteryConfigDB.normalize_owner(order.get("agent_id"))
        lottery_enabled = LotteryConfigDB.get_enabled(owner_id)
        if not lottery_enabled:
            return error_response("抽奖功能已禁用", 400)
        threshold_amount = LotteryConfigDB.get_threshold(owner_id)
        if items_subtotal < threshold_amount:
            return error_response(f"本单商品金额未满{threshold_amount:.2f}元，不参与抽奖", 400)

        existing = LotteryDB.get_draw_by_order(order_id)
        if existing:
            prize_name = existing.get("prize_name")
            prize_detail = None
            if prize_name and prize_name != "谢谢参与":
                prize_detail = {
                    "display_name": prize_name,
                    "product_id": existing.get("prize_product_id"),
                    "product_name": existing.get("prize_product_name"),
                    "variant_id": existing.get("prize_variant_id"),
                    "variant_name": existing.get("prize_variant_name"),
                    "group_id": existing.get("prize_group_id"),
                }
            return success_response(
                "抽奖已完成",
                {
                    "prize_name": prize_name,
                    "already_drawn": True,
                    "names": [prize_name] if prize_name else [],
                    "prize": prize_detail,
                    "threshold_amount": threshold_amount,
                },
            )

        prize_groups = LotteryDB.get_active_prizes_for_draw(owner_id)
        names = [p.get("display_name") for p in prize_groups if p.get("display_name")]
        weights = [max(0.0, float(p.get("weight") or 0)) for p in prize_groups]
        sum_w = sum(weights)
        is_fraction = sum_w <= 1.000001
        scale = 1.0 if is_fraction else 100.0
        leftover = max(0.0, scale - sum_w)
        total_w = sum_w + leftover
        if total_w <= 0:
            return error_response("抽奖配置权重无效", 500)

        rnd = random.random() * total_w
        acc = 0.0
        selected_group = None
        for group, weight in zip(prize_groups, weights):
            if weight <= 0:
                continue
            acc += weight
            if rnd <= acc:
                selected_group = group
                break

        selected_item = None
        if selected_group:
            available_items = [item for item in selected_group.get("items", []) if item.get("available")]
            total_stock = sum(max(0, int(item.get("stock") or 0)) for item in available_items)
            if total_stock > 0:
                max_stock = 0
                selected_item = None
                for item in available_items:
                    stock_val = max(0, int(item.get("stock") or 0))
                    if stock_val > max_stock:
                        max_stock = stock_val
                        selected_item = item
            if not selected_item:
                selected_group = None

        prize_payload = None
        prize_product_id = None
        prize_variant_id = None
        prize_product_name = None
        prize_variant_name = None
        prize_unit_price = 0.0
        prize_group_id = None

        if selected_group is None:
            selected_name = "谢谢参与"
        else:
            selected_name = selected_group.get("display_name") or ""
            prize_product_id = selected_item.get("product_id") if selected_item else None
            prize_variant_id = selected_item.get("variant_id") if selected_item else None
            prize_product_name = selected_item.get("product_name") if selected_item else None
            prize_variant_name = selected_item.get("variant_name") if selected_item else None
            try:
                prize_unit_price = float(selected_item.get("retail_price") or 0.0) if selected_item else 0.0
            except Exception:
                prize_unit_price = 0.0
            prize_group_id = selected_group.get("id") if selected_group else None
            if selected_item:
                prize_payload = {
                    "display_name": selected_name,
                    "product_id": prize_product_id,
                    "product_name": prize_product_name,
                    "variant_id": prize_variant_id,
                    "variant_name": prize_variant_name,
                    "group_id": prize_group_id,
                }

        LotteryDB.create_draw(
            order_id,
            user["id"],
            selected_name,
            prize_product_id,
            1,
            owner_id=owner_id,
            prize_group_id=prize_group_id,
            prize_product_name=prize_product_name,
            prize_variant_id=prize_variant_id,
            prize_variant_name=prize_variant_name,
            prize_unit_price=prize_unit_price,
        )

        thanks_prob_percent = (leftover / scale) * 100.0 if total_w > 0 else 0.0
        return success_response(
            "抽奖完成",
            {
                "prize_name": selected_name,
                "already_drawn": False,
                "names": names,
                "thanks_probability": round(thanks_prob_percent, 2),
                "prize": prize_payload,
                "threshold_amount": threshold_amount,
            },
        )
    except Exception as exc:
        logger.error(f"抽奖失败: {exc}")
        return error_response("抽奖失败", 500)


@router.get("/rewards/eligible")
async def get_eligible_rewards(request: Request, owner_id: Optional[str] = None, restrict_owner: Optional[bool] = False):
    """获取当前用户可用的抽奖奖品列表。"""
    user = get_current_user_required_from_cookie(request)
    try:
        if owner_id is None:
            normalized_owner: Optional[str] = None
        else:
            value = owner_id.strip()
            normalized_owner = None if value.lower() in {"", "none", "null", "undefined"} else value

        if isinstance(restrict_owner, bool):
            restrict_flag = restrict_owner
        else:
            restrict_flag = str(restrict_owner).strip().lower() in {"1", "true", "yes"}

        rewards = RewardDB.get_eligible_rewards(user["id"], normalized_owner, restrict_owner=restrict_flag) or []
        return success_response("获取奖品成功", {"rewards": rewards})
    except Exception as exc:
        logger.error(f"获取奖品失败: {exc}")
        return error_response("获取奖品失败", 500)


@router.patch("/admin/orders/{order_id}/payment-status")
async def admin_update_payment_status(order_id: str, payload: PaymentStatusUpdateRequest, request: Request):
    """管理员更新订单支付状态：pending/processing/succeeded/failed。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        new_status = payload.payment_status
        if new_status not in ["pending", "processing", "succeeded", "failed"]:
            return error_response("无效的支付状态", 400)

        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)
        scope = build_staff_scope(staff)
        if not staff_can_access_order(staff, order, scope):
            return error_response("无权操作该订单", 403)
        if order.get("agent_id") and AdminDB.is_agent_deleted(order.get("agent_id")):
            return error_response("已删除代理的订单不可修改", 400)

        if new_status == "succeeded":
            ok, missing_items = OrderDB.complete_payment_and_update_stock(order_id)
            if not ok:
                message = "处理支付成功失败，可能库存不足或状态异常"
                details: Dict[str, Any] = {}
                if missing_items:
                    message = f"以下商品库存不足：{'、'.join(missing_items)}"
                    details["out_of_stock_items"] = missing_items
                return error_response(message, 400, details)
            order_owner_id = LotteryConfigDB.normalize_owner(order.get("agent_id"))
            try:
                CartDB.update_cart(order["student_id"], {})
                if isinstance(order.get("shipping_info"), dict):
                    try:
                        UserProfileDB.upsert_shipping(order["student_id"], order["shipping_info"])
                    except Exception as exc:
                        logger.warning(f"缓存用户收货信息失败: {exc}")
                try:
                    draw = LotteryDB.get_draw_by_order(order_id)
                    if draw and draw.get("prize_name") != "谢谢参与":
                        RewardDB.add_reward_from_order(
                            user_identifier=order["student_id"],
                            prize_name=draw.get("prize_name"),
                            prize_product_id=draw.get("prize_product_id"),
                            quantity=int(draw.get("prize_quantity") or 1),
                            source_order_id=order_id,
                            owner_id=order_owner_id,
                            prize_group_id=draw.get("prize_group_id"),
                            prize_product_name=draw.get("prize_product_name"),
                            prize_variant_id=draw.get("prize_variant_id"),
                            prize_variant_name=draw.get("prize_variant_name"),
                            prize_unit_price=draw.get("prize_unit_price"),
                        )
                except Exception as exc:
                    logger.warning(f"生成抽奖奖品失败: {exc}")
                try:
                    items = order.get("items") or []
                    items_subtotal = 0.0
                    for item in items:
                        if isinstance(item, dict) and not (item.get("is_lottery") or item.get("is_auto_gift")):
                            try:
                                items_subtotal += float(item.get("subtotal", 0) or 0)
                            except Exception:
                                pass
                    applicable_thresholds = GiftThresholdDB.get_applicable_thresholds(items_subtotal, order_owner_id)
                    for threshold in applicable_thresholds:
                        gift_coupon = threshold.get("gift_coupon", 0) == 1
                        coupon_amount = threshold.get("coupon_amount", 0)
                        applicable_times = threshold.get("applicable_times", 0)
                        threshold_amount = threshold.get("threshold_amount", 0)
                        if gift_coupon and coupon_amount > 0 and applicable_times > 0:
                            for _ in range(applicable_times):
                                coupon_ids = CouponDB.issue_coupons(
                                    user_identifier=order["student_id"],
                                    amount=coupon_amount,
                                    quantity=1,
                                    expires_at=None,
                                    owner_id=order_owner_id,
                                )
                                if coupon_ids:
                                    logger.info(f"支付成功后为用户 {order['student_id']} 发放满额优惠券 {coupon_amount} 元（门槛{threshold_amount}）")
                except Exception as exc:
                    logger.warning(f"发放满额优惠券失败: {exc}")
                try:
                    c_id = order.get("coupon_id")
                    d_amt = float(order.get("discount_amount") or 0)
                    if c_id and d_amt > 0:
                        CouponDB.delete_coupon(c_id)
                except Exception as exc:
                    logger.warning(f"删除已用优惠券失败: {exc}")
            except Exception as exc:
                logger.warning(f"清空购物车失败: {exc}")
            return success_response("已标记为已支付", {"order_id": order_id, "payment_status": "succeeded"})

        current_status = order.get("payment_status")
        if current_status == "succeeded" and new_status in ["pending", "processing", "failed"]:
            try:
                restore_ok = OrderDB.restore_stock_from_order(order_id)
                if not restore_ok:
                    logger.warning(f"恢复库存失败，但继续处理状态更新: order_id={order_id}")
            except Exception as exc:
                logger.warning(f"恢复库存异常: {exc}")

        ok = OrderDB.update_payment_status(order_id, new_status)
        if not ok:
            return error_response("更新支付状态失败", 500)
        try:
            if new_status in ["pending", "failed"]:
                c_id = order.get("coupon_id")
                d_amt = float(order.get("discount_amount") or 0)
                if c_id and d_amt > 0:
                    CouponDB.unlock_for_order(c_id, order_id)
        except Exception as exc:
            logger.warning(f"返还优惠券失败: {exc}")
        return success_response("支付状态已更新", {"order_id": order_id, "payment_status": new_status})
    except Exception as exc:
        logger.error(f"管理员更新支付状态失败: {exc}")
        return error_response("更新支付状态失败", 500)
