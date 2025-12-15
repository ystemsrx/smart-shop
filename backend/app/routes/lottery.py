from typing import Dict, List, Optional, Set

from fastapi import APIRouter, Request

from auth import error_response, get_current_admin_required_from_cookie, success_response
from database import (
    AutoGiftDB,
    DeliverySettingsDB,
    GiftThresholdDB,
    LotteryConfigDB,
    LotteryDB,
    get_db_connection,
)
from ..context import logger
from ..dependencies import get_owner_id_for_staff, get_owner_id_from_scope, require_agent_with_scope, resolve_shopping_scope
from ..schemas import (
    AutoGiftUpdateRequest,
    DeliverySettingsCreate,
    GiftThresholdCreate,
    GiftThresholdUpdate,
    LotteryConfigUpdateRequest,
    LotteryEnabledUpdateRequest,
    LotteryPrizeInput,
    LotteryThresholdUpdateRequest,
)
from ..services.lottery import normalize_per_order_limit, persist_lottery_prize_from_payload, search_inventory_for_selector
from ..services.products import resolve_single_owner_for_staff


router = APIRouter()


@router.get("/admin/lottery-config")
async def admin_get_lottery_config(request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        prizes = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True)
        config = LotteryConfigDB.get_config(owner_id)
        return success_response("获取抽奖配置成功", {"prizes": prizes, "threshold_amount": config["threshold_amount"], "is_enabled": config["is_enabled"]})
    except Exception as exc:
        logger.error(f"读取抽奖配置失败: {exc}")
        return error_response("读取抽奖配置失败", 500)


@router.get("/agent/lottery-config")
async def agent_get_lottery_config(request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        prizes = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True)
        config = LotteryConfigDB.get_config(owner_id)
        return success_response("获取抽奖配置成功", {"prizes": prizes, "threshold_amount": config["threshold_amount"], "is_enabled": config["is_enabled"]})
    except Exception as exc:
        logger.error(f"代理读取抽奖配置失败: {exc}")
        return error_response("读取抽奖配置失败", 500)


@router.put("/admin/lottery-config")
async def admin_update_lottery_config(payload: LotteryConfigUpdateRequest, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        prizes_payload = payload.prizes or []
        saved_ids: List[str] = []
        for prize in prizes_payload:
            saved_id = persist_lottery_prize_from_payload(prize, owner_id)
            saved_ids.append(saved_id)
        LotteryDB.delete_prizes_not_in(saved_ids, owner_id)
        refreshed = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True)
        if payload.threshold_amount is not None:
            LotteryConfigDB.set_threshold(owner_id, payload.threshold_amount)
        threshold_value = LotteryConfigDB.get_threshold(owner_id)
        return success_response("抽奖配置已更新", {"prizes": refreshed, "threshold_amount": threshold_value})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as exc:
        logger.error(f"更新抽奖配置失败: {exc}")
        return error_response("更新抽奖配置失败", 500)


@router.put("/agent/lottery-config")
async def agent_update_lottery_config(payload: LotteryConfigUpdateRequest, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        prizes_payload = payload.prizes or []
        saved_ids: List[str] = []
        for prize in prizes_payload:
            saved_id = persist_lottery_prize_from_payload(prize, owner_id)
            saved_ids.append(saved_id)
        LotteryDB.delete_prizes_not_in(saved_ids, owner_id)
        refreshed = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True)
        if payload.threshold_amount is not None:
            LotteryConfigDB.set_threshold(owner_id, payload.threshold_amount)
        threshold_value = LotteryConfigDB.get_threshold(owner_id)
        return success_response("抽奖配置已更新", {"prizes": refreshed, "threshold_amount": threshold_value})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as exc:
        logger.error(f"代理更新抽奖配置失败: {exc}")
        return error_response("更新抽奖配置失败", 500)


@router.patch("/admin/lottery-config/threshold")
async def admin_update_lottery_threshold(payload: LotteryThresholdUpdateRequest, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        value = LotteryConfigDB.set_threshold(owner_id, payload.threshold_amount)
        return success_response("抽奖门槛已更新", {"threshold_amount": value})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as exc:
        logger.error(f"更新抽奖门槛失败: {exc}")
        return error_response("更新抽奖门槛失败", 500)


@router.patch("/agent/lottery-config/threshold")
async def agent_update_lottery_threshold(payload: LotteryThresholdUpdateRequest, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        value = LotteryConfigDB.set_threshold(owner_id, payload.threshold_amount)
        return success_response("抽奖门槛已更新", {"threshold_amount": value})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as exc:
        logger.error(f"代理更新抽奖门槛失败: {exc}")
        return error_response("更新抽奖门槛失败", 500)


@router.patch("/admin/lottery-config/enabled")
async def admin_update_lottery_enabled(payload: LotteryEnabledUpdateRequest, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        is_enabled = LotteryConfigDB.set_enabled(owner_id, payload.is_enabled)
        return success_response("抽奖启用状态已更新", {"is_enabled": is_enabled})
    except Exception as exc:
        logger.error(f"更新抽奖启用状态失败: {exc}")
        return error_response("更新抽奖启用状态失败", 500)


@router.patch("/agent/lottery-config/enabled")
async def agent_update_lottery_enabled(payload: LotteryEnabledUpdateRequest, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        is_enabled = LotteryConfigDB.set_enabled(owner_id, payload.is_enabled)
        return success_response("抽奖启用状态已更新", {"is_enabled": is_enabled})
    except Exception as exc:
        logger.error(f"代理更新抽奖启用状态失败: {exc}")
        return error_response("更新抽奖启用状态失败", 500)


@router.get("/admin/auto-gifts")
async def admin_get_auto_gifts(request: Request):
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        items = AutoGiftDB.list_items(owner_id)
        return success_response("获取满额赠品配置成功", {"items": items})
    except Exception as exc:
        logger.error(f"读取满额赠品配置失败: {exc}")
        return error_response("读取满额赠品配置失败", 500)


@router.put("/admin/auto-gifts")
async def admin_update_auto_gifts(payload: AutoGiftUpdateRequest, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        items = payload.items or []
        unique: Set = set()
        normalized: List[Dict[str, Optional[str]]] = []
        for item in items:
            key = (item.product_id, item.variant_id or None)
            if key in unique:
                continue
            unique.add(key)
            normalized.append({"product_id": item.product_id, "variant_id": item.variant_id})
        AutoGiftDB.replace_items(owner_id, normalized)
        refreshed = AutoGiftDB.list_items(owner_id)
        return success_response("满额赠品配置已更新", {"items": refreshed})
    except Exception as exc:
        logger.error(f"更新满额赠品配置失败: {exc}")
        return error_response("更新满额赠品配置失败", 500)


@router.get("/admin/auto-gifts/search")
async def admin_search_auto_gift_items(request: Request, query: Optional[str] = None, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    try:
        owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
        results = search_inventory_for_selector(query, staff=admin, owner_override=owner_id)
        return success_response("搜索成功", {"items": results})
    except Exception as exc:
        logger.error(f"搜索满额赠品候选失败: {exc}")
        return error_response("搜索满额赠品候选失败", 500)


@router.get("/agent/auto-gifts")
async def agent_get_auto_gifts(request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        items = AutoGiftDB.list_items(owner_id)
        return success_response("获取满额赠品配置成功", {"items": items})
    except Exception as exc:
        logger.error(f"代理读取满额赠品配置失败: {exc}")
        return error_response("读取满额赠品配置失败", 500)


@router.put("/agent/auto-gifts")
async def agent_update_auto_gifts(payload: AutoGiftUpdateRequest, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        items = payload.items or []
        unique: Set = set()
        normalized: List[Dict[str, Optional[str]]] = []
        for item in items:
            key = (item.product_id, item.variant_id or None)
            if key in unique:
                continue
            unique.add(key)
            normalized.append({"product_id": item.product_id, "variant_id": item.variant_id})
        AutoGiftDB.replace_items(owner_id, normalized)
        refreshed = AutoGiftDB.list_items(owner_id)
        return success_response("满额赠品配置已更新", {"items": refreshed})
    except Exception as exc:
        logger.error(f"代理更新满额赠品配置失败: {exc}")
        return error_response("更新满额赠品配置失败", 500)


@router.get("/agent/auto-gifts/search")
async def agent_search_auto_gift_items(request: Request, query: Optional[str] = None):
    agent, _ = require_agent_with_scope(request)
    try:
        results = search_inventory_for_selector(query, staff=agent)
        return success_response("搜索成功", {"items": results})
    except Exception as exc:
        logger.error(f"代理搜索满额赠品候选失败: {exc}")
        return error_response("搜索满额赠品候选失败", 500)


@router.get("/auto-gifts")
async def public_get_auto_gifts():
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM auto_gift_items ORDER BY created_at ASC")
            rows = [dict(r) for r in cursor.fetchall() or []]

            if not rows:
                return success_response("获取满额赠品成功", {"items": []})

            product_ids = {row["product_id"] for row in rows if row.get("product_id")}
            variant_ids = {row["variant_id"] for row in rows if row.get("variant_id")}

            product_map = {}
            if product_ids:
                placeholders = ",".join("?" * len(product_ids))
                cursor.execute(f"SELECT * FROM products WHERE id IN ({placeholders})", list(product_ids))
                product_map = {row["id"]: dict(row) for row in cursor.fetchall() or []}

            variant_map = {}
            if variant_ids:
                placeholders = ",".join("?" * len(variant_ids))
                cursor.execute(f"SELECT * FROM product_variants WHERE id IN ({placeholders})", list(variant_ids))
                variant_map = {row["id"]: dict(row) for row in cursor.fetchall() or []}

            items = []
            for row in rows:
                product_id = row.get("product_id")
                variant_id = row.get("variant_id")

                product_info = product_map.get(product_id) if product_id else None
                variant_info = variant_map.get(variant_id) if variant_id else None

                if not product_info:
                    continue

                if variant_id and variant_info:
                    stock = variant_info.get("stock", 0) or 0
                    product_name = f"{product_info.get('name', '')}（{variant_info.get('name', '')}）"
                else:
                    stock = product_info.get("stock", 0) or 0
                    product_name = product_info.get("name", "")

                available = (product_info.get("is_active", 1) == 1) and (stock > 0)

                item = {"id": row.get("id"), "product_id": product_id, "variant_id": variant_id, "product_name": product_name, "stock": stock, "available": available, "available_stock": stock}

                if available:
                    items.append(item)

        return success_response("获取满额赠品成功", {"items": items})
    except Exception as exc:
        logger.error(f"获取满额赠品失败: {exc}")
        return error_response("获取满额赠品失败", 500)


@router.get("/gift-thresholds")
async def public_get_gift_thresholds(request: Request):
    try:
        scope = resolve_shopping_scope(request)
        owner_id = get_owner_id_from_scope(scope)
        thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=False)

        simplified_thresholds = []
        for threshold in thresholds:
            available_items = [item for item in threshold.get("items", []) if item.get("available")]
            selected_product_name = ""
            if available_items:
                sorted_items = sorted(available_items, key=lambda x: x.get("stock", 0), reverse=True)
                chosen_item = sorted_items[0]
                name = chosen_item.get("product_name", "")
                if chosen_item.get("variant_name"):
                    name += f"（{chosen_item.get('variant_name')}）"
                selected_product_name = name

            simplified_thresholds.append(
                {
                    "threshold_amount": threshold.get("threshold_amount"),
                    "gift_products": threshold.get("gift_products", 0) == 1,
                    "gift_coupon": threshold.get("gift_coupon", 0) == 1,
                    "coupon_amount": threshold.get("coupon_amount", 0),
                    "products_count": len(available_items),
                    "selected_product_name": selected_product_name,
                }
            )

        return success_response("获取满额门槛配置成功", {"thresholds": simplified_thresholds, "owner_id": owner_id})
    except Exception as exc:
        logger.error(f"获取满额门槛配置失败: {exc}")
        return error_response("获取满额门槛配置失败", 500)


@router.get("/delivery-config")
async def get_delivery_config(request: Request):
    try:
        scope = resolve_shopping_scope(request)
        owner_id = get_owner_id_from_scope(scope)
        delivery_config = DeliverySettingsDB.get_delivery_config(owner_id)
        return success_response("获取配送费配置成功", {"delivery_config": delivery_config})
    except Exception as exc:
        logger.error(f"获取配送费配置失败: {exc}")
        return error_response("获取配送费配置失败", 500)


@router.get("/admin/delivery-settings")
async def admin_get_delivery_settings(request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        settings = DeliverySettingsDB.get_settings(owner_id)
        return success_response("获取配送费设置成功", {"settings": settings})
    except Exception as exc:
        logger.error(f"获取配送费设置失败: {exc}")
        return error_response("获取配送费设置失败", 500)


@router.post("/admin/delivery-settings")
async def admin_create_or_update_delivery_settings(payload: DeliverySettingsCreate, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        if payload.delivery_fee < 0:
            return error_response("配送费不能为负数", 400)

        if payload.free_delivery_threshold < 0:
            return error_response("免配送费门槛不能为负数", 400)

        DeliverySettingsDB.create_or_update_settings(owner_id=owner_id, delivery_fee=payload.delivery_fee, free_delivery_threshold=payload.free_delivery_threshold)

        settings = DeliverySettingsDB.get_settings(owner_id)
        return success_response("配送费设置保存成功", {"settings": settings})
    except Exception as exc:
        logger.error(f"保存配送费设置失败: {exc}")
        return error_response("保存配送费设置失败", 500)


@router.get("/agent/delivery-settings")
async def agent_get_delivery_settings(request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        settings = DeliverySettingsDB.get_settings(owner_id)
        return success_response("获取配送费设置成功", {"settings": settings})
    except Exception as exc:
        logger.error(f"获取配送费设置失败: {exc}")
        return error_response("获取配送费设置失败", 500)


@router.post("/agent/delivery-settings")
async def agent_create_or_update_delivery_settings(payload: DeliverySettingsCreate, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        if payload.delivery_fee < 0:
            return error_response("配送费不能为负数", 400)

        if payload.free_delivery_threshold < 0:
            return error_response("免配送费门槛不能为负数", 400)

        DeliverySettingsDB.create_or_update_settings(owner_id=owner_id, delivery_fee=payload.delivery_fee, free_delivery_threshold=payload.free_delivery_threshold)

        settings = DeliverySettingsDB.get_settings(owner_id)
        return success_response("配送费设置保存成功", {"settings": settings})
    except Exception as exc:
        logger.error(f"保存配送费设置失败: {exc}")
        return error_response("保存配送费设置失败", 500)


@router.post("/admin/lottery-prizes")
async def admin_create_lottery_prize(payload: LotteryPrizeInput, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        prize_id = persist_lottery_prize_from_payload(payload, owner_id)
        prize = next((p for p in LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True) if p.get("id") == prize_id), None)
        return success_response("抽奖奖项已创建", {"prize": prize})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as exc:
        logger.error(f"创建抽奖奖项失败: {exc}")
        return error_response("创建抽奖奖项失败", 500)


@router.post("/agent/lottery-prizes")
async def agent_create_lottery_prize(payload: LotteryPrizeInput, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        prize_id = persist_lottery_prize_from_payload(payload, owner_id)
        prize = next((p for p in LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True) if p.get("id") == prize_id), None)
        return success_response("抽奖奖项已创建", {"prize": prize})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as exc:
        logger.error(f"代理创建抽奖奖项失败: {exc}")
        return error_response("创建抽奖奖项失败", 500)


@router.put("/admin/lottery-prizes/{prize_id}")
async def admin_update_lottery_prize(prize_id: str, payload: LotteryPrizeInput, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        updated_id = persist_lottery_prize_from_payload(payload, owner_id, override_id=prize_id)
        prize = next((p for p in LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True) if p.get("id") == updated_id), None)
        if not prize:
            return error_response("奖项不存在", 404)
        return success_response("抽奖奖项已更新", {"prize": prize})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as exc:
        logger.error(f"更新抽奖奖项失败: {exc}")
        return error_response("更新抽奖奖项失败", 500)


@router.put("/agent/lottery-prizes/{prize_id}")
async def agent_update_lottery_prize(prize_id: str, payload: LotteryPrizeInput, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        updated_id = persist_lottery_prize_from_payload(payload, owner_id, override_id=prize_id)
        prize = next((p for p in LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True) if p.get("id") == updated_id), None)
        if not prize:
            return error_response("奖项不存在", 404)
        return success_response("抽奖奖项已更新", {"prize": prize})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as exc:
        logger.error(f"代理更新抽奖奖项失败: {exc}")
        return error_response("更新抽奖奖项失败", 500)


@router.delete("/admin/lottery-prizes/{prize_id}")
async def admin_delete_lottery_prize(prize_id: str, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        ok = LotteryDB.delete_prize(prize_id, owner_id)
        if not ok:
            return error_response("奖项不存在", 404)
        return success_response("抽奖奖项已删除")
    except Exception as exc:
        logger.error(f"删除抽奖奖项失败: {exc}")
        return error_response("删除抽奖奖项失败", 500)


@router.delete("/agent/lottery-prizes/{prize_id}")
async def agent_delete_lottery_prize(prize_id: str, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        ok = LotteryDB.delete_prize(prize_id, owner_id)
        if not ok:
            return error_response("奖项不存在", 404)
        return success_response("抽奖奖项已删除")
    except Exception as exc:
        logger.error(f"代理删除抽奖奖项失败: {exc}")
        return error_response("删除抽奖奖项失败", 500)


@router.get("/admin/lottery-prizes/search")
async def admin_search_lottery_prize_items(request: Request, query: Optional[str] = None, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    try:
        owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
        results = search_inventory_for_selector(query, staff=admin, owner_override=owner_id)
        return success_response("搜索成功", {"items": results})
    except Exception as exc:
        logger.error(f"搜索抽奖候选商品失败: {exc}")
        return error_response("搜索抽奖候选商品失败", 500)


@router.get("/agent/lottery-prizes/search")
async def agent_search_lottery_prize_items(request: Request, query: Optional[str] = None):
    agent, _ = require_agent_with_scope(request)
    try:
        results = search_inventory_for_selector(query, staff=agent)
        return success_response("搜索成功", {"items": results})
    except Exception as exc:
        logger.error(f"代理搜索抽奖候选商品失败: {exc}")
        return error_response("搜索抽奖候选商品失败", 500)


@router.get("/admin/gift-thresholds")
async def admin_get_gift_thresholds(request: Request, include_inactive: bool = False, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=include_inactive)
        return success_response("获取满额门槛配置成功", {"thresholds": thresholds})
    except Exception as exc:
        logger.error(f"获取满额门槛配置失败: {exc}")
        return error_response("获取满额门槛配置失败", 500)


@router.get("/agent/gift-thresholds")
async def agent_get_gift_thresholds(request: Request, include_inactive: bool = False):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=include_inactive)
        return success_response("获取满额门槛配置成功", {"thresholds": thresholds})
    except Exception as exc:
        logger.error(f"代理获取满额门槛配置失败: {exc}")
        return error_response("获取满额门槛配置失败", 500)


@router.post("/admin/gift-thresholds")
async def admin_create_gift_threshold(payload: GiftThresholdCreate, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        if payload.threshold_amount <= 0:
            return error_response("门槛金额必须大于0", 400)

        if payload.gift_coupon and payload.coupon_amount <= 0:
            return error_response("优惠券金额必须大于0", 400)

        normalized_limit = None
        if payload.per_order_limit is not None:
            raw_limit = int(payload.per_order_limit)
            if raw_limit < 0:
                return error_response("每单赠品上限必须为正整数或留空", 400)
            normalized_limit = normalize_per_order_limit(raw_limit)

        threshold_id = GiftThresholdDB.create_threshold(
            owner_id=owner_id,
            threshold_amount=payload.threshold_amount,
            gift_products=payload.gift_products,
            gift_coupon=payload.gift_coupon,
            coupon_amount=payload.coupon_amount if payload.gift_coupon else 0.0,
            per_order_limit=normalized_limit,
        )

        items = payload.items or []
        if items:
            normalized_items = []
            for item in items:
                normalized_items.append({"product_id": item.product_id, "variant_id": item.variant_id, "quantity": item.quantity if hasattr(item, "quantity") else 1})
            GiftThresholdDB.add_items_to_threshold(threshold_id, owner_id, normalized_items)

        thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=True)
        return success_response("满额门槛创建成功", {"thresholds": thresholds})
    except Exception as exc:
        logger.error(f"创建满额门槛失败: {exc}")
        return error_response("创建满额门槛失败", 500)


@router.post("/agent/gift-thresholds")
async def agent_create_gift_threshold(payload: GiftThresholdCreate, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        if payload.threshold_amount <= 0:
            return error_response("门槛金额必须大于0", 400)

        if payload.gift_coupon and payload.coupon_amount <= 0:
            return error_response("优惠券金额必须大于0", 400)

        normalized_limit = None
        if payload.per_order_limit is not None:
            raw_limit = int(payload.per_order_limit)
            if raw_limit < 0:
                return error_response("每单赠品上限必须为正整数或留空", 400)
            normalized_limit = normalize_per_order_limit(raw_limit)

        threshold_id = GiftThresholdDB.create_threshold(
            owner_id=owner_id,
            threshold_amount=payload.threshold_amount,
            gift_products=payload.gift_products,
            gift_coupon=payload.gift_coupon,
            coupon_amount=payload.coupon_amount if payload.gift_coupon else 0.0,
            per_order_limit=normalized_limit,
        )

        items = payload.items or []
        if items:
            normalized_items = []
            for item in items:
                normalized_items.append({"product_id": item.product_id, "variant_id": item.variant_id, "quantity": item.quantity if hasattr(item, "quantity") else 1})
            GiftThresholdDB.add_items_to_threshold(threshold_id, owner_id, normalized_items)

        thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=True)
        return success_response("满额门槛创建成功", {"thresholds": thresholds})
    except Exception as exc:
        logger.error(f"代理创建满额门槛失败: {exc}")
        return error_response("创建满额门槛失败", 500)


@router.put("/admin/gift-thresholds/{threshold_id}")
async def admin_update_gift_threshold(threshold_id: str, payload: GiftThresholdUpdate, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        existing = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        if not existing:
            return error_response("门槛不存在", 404)

        normalized_limit = existing.get("per_order_limit")
        if payload.per_order_limit is not None:
            raw_limit = int(payload.per_order_limit)
            if raw_limit < 0:
                return error_response("每单赠品上限必须为正整数或留空", 400)
            normalized_limit = normalize_per_order_limit(raw_limit)

        ok = GiftThresholdDB.update_threshold(
            threshold_id,
            owner_id=owner_id,
            threshold_amount=payload.threshold_amount,
            gift_products=payload.gift_products,
            gift_coupon=payload.gift_coupon,
            coupon_amount=payload.coupon_amount,
            per_order_limit=normalized_limit,
            is_active=payload.is_active,
        )
        if not ok:
            return error_response("更新失败或无变化", 400)

        if payload.items is not None:
            normalized_items = []
            for item in payload.items or []:
                normalized_items.append({"product_id": item.product_id, "variant_id": item.variant_id, "quantity": item.quantity if hasattr(item, "quantity") else 1})
            GiftThresholdDB.add_items_to_threshold(threshold_id, owner_id, normalized_items)

        updated_thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=True)
        return success_response("满额门槛更新成功", {"thresholds": updated_thresholds})
    except Exception as exc:
        logger.error(f"更新满额门槛失败: {exc}")
        return error_response("更新满额门槛失败", 500)


@router.put("/agent/gift-thresholds/{threshold_id}")
async def agent_update_gift_threshold(threshold_id: str, payload: GiftThresholdUpdate, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        existing = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        if not existing:
            return error_response("门槛不存在", 404)

        normalized_limit = existing.get("per_order_limit")
        if payload.per_order_limit is not None:
            raw_limit = int(payload.per_order_limit)
            if raw_limit < 0:
                return error_response("每单赠品上限必须为正整数或留空", 400)
            normalized_limit = normalize_per_order_limit(raw_limit)

        ok = GiftThresholdDB.update_threshold(
            threshold_id,
            owner_id=owner_id,
            threshold_amount=payload.threshold_amount,
            gift_products=payload.gift_products,
            gift_coupon=payload.gift_coupon,
            coupon_amount=payload.coupon_amount,
            per_order_limit=normalized_limit,
            is_active=payload.is_active,
        )
        if not ok:
            return error_response("更新失败或无变化", 400)

        if payload.items is not None:
            normalized_items = []
            for item in payload.items or []:
                normalized_items.append({"product_id": item.product_id, "variant_id": item.variant_id, "quantity": item.quantity if hasattr(item, "quantity") else 1})
            GiftThresholdDB.add_items_to_threshold(threshold_id, owner_id, normalized_items)

        updated_thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=True)
        return success_response("满额门槛更新成功", {"thresholds": updated_thresholds})
    except Exception as exc:
        logger.error(f"代理更新满额门槛失败: {exc}")
        return error_response("更新满额门槛失败", 500)


@router.delete("/admin/gift-thresholds/{threshold_id}")
async def admin_delete_gift_threshold(threshold_id: str, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        ok = GiftThresholdDB.delete_threshold(threshold_id, owner_id)
        if not ok:
            return error_response("门槛不存在", 404)
        return success_response("满额门槛已删除")
    except Exception as exc:
        logger.error(f"删除满额门槛失败: {exc}")
        return error_response("删除满额门槛失败", 500)


@router.delete("/agent/gift-thresholds/{threshold_id}")
async def agent_delete_gift_threshold(threshold_id: str, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        ok = GiftThresholdDB.delete_threshold(threshold_id, owner_id)
        if not ok:
            return error_response("门槛不存在", 404)
        return success_response("满额门槛已删除")
    except Exception as exc:
        logger.error(f"代理删除满额门槛失败: {exc}")
        return error_response("删除满额门槛失败", 500)


@router.get("/admin/gift-thresholds/search")
async def admin_search_gift_threshold_items(request: Request, query: Optional[str] = None, owner_id: Optional[str] = None):
    """搜索满额门槛赠品候选商品（管理员）。"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
        results = search_inventory_for_selector(query, staff=admin, owner_override=owner_id)
        return success_response("搜索成功", {"items": results})
    except Exception as exc:
        logger.error(f"搜索满额门槛赠品候选失败: {exc}")
        return error_response("搜索满额门槛赠品候选失败", 500)


@router.get("/agent/gift-thresholds/search")
async def agent_search_gift_threshold_items(request: Request, query: Optional[str] = None):
    """搜索满额门槛赠品候选商品（代理）。"""
    agent, _ = require_agent_with_scope(request)
    try:
        results = search_inventory_for_selector(query, staff=agent)
        return success_response("搜索成功", {"items": results})
    except Exception as exc:
        logger.error(f"代理搜索满额门槛赠品候选失败: {exc}")
        return error_response("搜索满额门槛赠品候选失败", 500)


@router.get("/admin/lottery-prizes/search-items")
async def admin_search_lottery_prize_items_alt(request: Request, query: Optional[str] = None, owner_id: Optional[str] = None):
    return await admin_search_lottery_prize_items(request, query, owner_id)


@router.get("/agent/lottery-prizes/search-items")
async def agent_search_lottery_prize_items_alt(request: Request, query: Optional[str] = None):
    return await agent_search_lottery_prize_items(request, query)
