from typing import Optional

from fastapi import APIRouter, Request

from auth import (
    error_response,
    get_current_admin_required_from_cookie,
    get_current_agent_from_cookie,
    success_response,
)
from database import AgentStatusDB, SalesCycleDB, SettingsDB
from ..context import logger
from ..dependencies import resolve_shopping_scope
from ..schemas import AgentStatusUpdateRequest, ShopStatusUpdate


router = APIRouter()


@router.get("/admin/shop-settings")
async def get_shop_settings(request: Request):
    """获取商城设置。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        show_inactive = SettingsDB.get("show_inactive_in_shop", "false") == "true"
        return success_response("获取商城设置成功", {"show_inactive_in_shop": show_inactive})
    except Exception as exc:
        logger.error(f"获取商城设置失败: {exc}")
        return error_response("获取商城设置失败", 500)


@router.put("/admin/shop-settings")
async def update_shop_settings(request: Request):
    """更新商城设置。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        body = await request.json()
        show_inactive = body.get("show_inactive_in_shop", False)

        SettingsDB.set("show_inactive_in_shop", "true" if show_inactive else "false")
        return success_response("商城设置更新成功", {"show_inactive_in_shop": show_inactive})
    except Exception as exc:
        logger.error(f"更新商城设置失败: {exc}")
        return error_response("更新商城设置失败", 500)


@router.get("/shop/status")
async def get_shop_status():
    """获取店铺开关状态。"""
    try:
        is_open = SettingsDB.get("shop_is_open", "1") != "0"
        note = SettingsDB.get("shop_closed_note", "")
        allow_reservation = SettingsDB.get("shop_reservation_enabled", "false") == "true"
        cycle_locked = SalesCycleDB.is_locked("admin", "admin")
        return success_response(
            "获取店铺状态成功",
            {
                "is_open": is_open,
                "note": note,
                "allow_reservation": allow_reservation,
                "cycle_locked": cycle_locked,
            },
        )
    except Exception as exc:
        logger.error(f"获取店铺状态失败: {exc}")
        return error_response("获取店铺状态失败", 500)


@router.patch("/admin/shop/status")
async def update_shop_status(payload: ShopStatusUpdate, request: Request):
    """更新店铺开关（管理员）。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        if SalesCycleDB.is_locked("admin", "admin"):
            return error_response("当前周期已结束，请取消结束或开启新周期后再切换营业状态", 400)
        SettingsDB.set("shop_is_open", "1" if payload.is_open else "0")
        if payload.note is not None:
            SettingsDB.set("shop_closed_note", payload.note)
        return success_response("店铺状态已更新", {"is_open": payload.is_open})
    except Exception as exc:
        logger.error(f"更新店铺状态失败: {exc}")
        return error_response("更新店铺状态失败", 500)


@router.get("/agent/status")
async def get_agent_status(request: Request):
    """获取代理的营业状态。"""
    agent = get_current_agent_from_cookie(request)
    if not agent:
        return error_response("需要代理权限", 403)

    try:
        status = AgentStatusDB.get_agent_status(agent.get("agent_id"))
        cycle_locked = SalesCycleDB.is_locked("agent", agent.get("agent_id"))
        return success_response(
            "获取代理状态成功",
            {
                "is_open": bool(status.get("is_open", 1)),
                "closed_note": status.get("closed_note", ""),
                "allow_reservation": bool(status.get("allow_reservation", 0)),
                "cycle_locked": cycle_locked,
            },
        )
    except Exception as exc:
        logger.error(f"获取代理状态失败: {exc}")
        return error_response("获取代理状态失败", 500)


@router.patch("/agent/status")
async def update_agent_status(payload: AgentStatusUpdateRequest, request: Request):
    """更新代理的营业状态。"""
    agent = get_current_agent_from_cookie(request)
    if not agent:
        return error_response("需要代理权限", 403)

    try:
        if SalesCycleDB.is_locked("agent", agent.get("agent_id")):
            return error_response("当前周期已结束，请取消结束或开启新周期后再切换营业状态", 400)
        success = AgentStatusDB.update_agent_status(
            agent.get("agent_id"), payload.is_open, payload.closed_note or "", bool(payload.allow_reservation)
        )
        if success:
            return success_response(
                "代理状态已更新",
                {
                    "is_open": payload.is_open,
                    "closed_note": payload.closed_note or "",
                    "allow_reservation": bool(payload.allow_reservation),
                },
            )
        else:
            return error_response("更新代理状态失败", 500)
    except Exception as exc:
        logger.error(f"更新代理状态失败: {exc}")
        return error_response("更新代理状态失败", 500)


@router.get("/shop/agent-status")
async def get_user_agent_status(request: Request, address_id: Optional[str] = None, building_id: Optional[str] = None):
    """获取用户所属代理的营业状态。"""
    try:
        scope = resolve_shopping_scope(request, address_id, building_id)
        agent_id = scope.get("agent_id")

        if not agent_id:
            is_open = SettingsDB.get("shop_is_open", "1") != "0"
            note = SettingsDB.get("shop_closed_note", "")
            allow_reservation = SettingsDB.get("shop_reservation_enabled", "false") == "true"
            cycle_locked = SalesCycleDB.is_locked("admin", "admin")
            return success_response(
                "获取店铺状态成功",
                {
                    "is_open": is_open,
                    "note": note,
                    "is_agent": False,
                    "allow_reservation": allow_reservation,
                    "cycle_locked": cycle_locked,
                },
            )

        status = AgentStatusDB.get_agent_status(agent_id)
        cycle_locked = SalesCycleDB.is_locked("agent", agent_id)
        return success_response(
            "获取代理状态成功",
            {
                "is_open": bool(status.get("is_open", 1)),
                "note": status.get("closed_note", ""),
                "is_agent": True,
                "agent_id": agent_id,
                "allow_reservation": bool(status.get("allow_reservation", 0)),
                "cycle_locked": cycle_locked,
            },
        )
    except Exception as exc:
        logger.error(f"获取用户代理状态失败: {exc}")
        return error_response("获取状态失败", 500)
