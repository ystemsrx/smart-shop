from typing import Optional

from fastapi import APIRouter, Request

from auth import error_response, get_current_admin_required_from_cookie, success_response
from database import AgentStatusDB, SalesCycleDB, SettingsDB
from ..context import logger
from ..dependencies import require_agent_with_scope


router = APIRouter()


def _serialize_cycles(owner_type: str, owner_id: str):
    cycles = SalesCycleDB.list_cycles(owner_type, owner_id)
    active_cycle = SalesCycleDB.get_current_cycle(owner_type, owner_id)
    latest_cycle = SalesCycleDB.get_latest_cycle(owner_type, owner_id)
    locked = SalesCycleDB.is_locked(owner_type, owner_id)

    serialized = []
    for index, cycle in enumerate(cycles, start=1):
        item = dict(cycle)
        item["sequence"] = index
        item["is_active"] = cycle.get("end_time") is None
        serialized.append(item)

    return {
        "cycles": serialized,
        "active_cycle_id": active_cycle.get("id") if active_cycle else None,
        "latest_cycle_id": latest_cycle.get("id") if latest_cycle else None,
        "locked": locked,
    }


def _resolve_admin_owner(agent_id: Optional[str]):
    raw = (agent_id or "").strip()
    if not raw or raw.lower() in ("admin", "self"):
        return {"owner_type": "admin", "owner_id": "admin"}
    if raw.lower() == "all":
        return None
    return {"owner_type": "agent", "owner_id": raw}


@router.get("/admin/sales-cycles")
async def admin_get_sales_cycles(request: Request, agent_id: Optional[str] = None):
    _admin = get_current_admin_required_from_cookie(request)
    try:
        owner = _resolve_admin_owner(agent_id)
        if not owner:
            return error_response("全部订单不支持周期切换", 400)
        payload = _serialize_cycles(owner["owner_type"], owner["owner_id"])
        payload["owner_type"] = owner["owner_type"]
        payload["owner_id"] = owner["owner_id"]
        return success_response("获取销售周期成功", payload)
    except Exception as exc:
        logger.error("获取销售周期失败: %s", exc)
        return error_response("获取销售周期失败", 500)


@router.post("/admin/sales-cycles/end")
async def admin_end_sales_cycle(request: Request, agent_id: Optional[str] = None):
    _admin = get_current_admin_required_from_cookie(request)
    try:
        owner = _resolve_admin_owner(agent_id)
        if not owner:
            return error_response("全部订单不支持周期操作", 400)

        pre_open = None
        if owner["owner_type"] == "admin":
            pre_open = SettingsDB.get("shop_is_open", "1") != "0"
        else:
            status = AgentStatusDB.get_agent_status(owner["owner_id"])
            pre_open = bool(status.get("is_open", 1))

        cycle = SalesCycleDB.end_current_cycle(owner["owner_type"], owner["owner_id"], pre_end_is_open=pre_open)
        if not cycle:
            return error_response("当前没有进行中的周期", 400)

        if owner["owner_type"] == "admin":
            SettingsDB.set("shop_is_open", "0")
        else:
            status = AgentStatusDB.get_agent_status(owner["owner_id"])
            AgentStatusDB.update_agent_status(
                owner["owner_id"],
                False,
                status.get("closed_note", ""),
                bool(status.get("allow_reservation", 0)),
            )

        payload = _serialize_cycles(owner["owner_type"], owner["owner_id"])
        payload["owner_type"] = owner["owner_type"]
        payload["owner_id"] = owner["owner_id"]
        return success_response("周期已结束", payload)
    except Exception as exc:
        logger.error("结束销售周期失败: %s", exc)
        return error_response("结束销售周期失败", 500)


@router.post("/admin/sales-cycles/cancel-end")
async def admin_cancel_sales_cycle_end(request: Request, agent_id: Optional[str] = None):
    _admin = get_current_admin_required_from_cookie(request)
    try:
        owner = _resolve_admin_owner(agent_id)
        if not owner:
            return error_response("全部订单不支持周期操作", 400)

        cycle = SalesCycleDB.cancel_end(owner["owner_type"], owner["owner_id"])
        if not cycle:
            return error_response("当前没有可取消的结束周期", 400)

        pre_open_flag = cycle.get("pre_end_is_open")
        if pre_open_flag is not None:
            pre_open = bool(pre_open_flag)
            if owner["owner_type"] == "admin":
                SettingsDB.set("shop_is_open", "1" if pre_open else "0")
            else:
                status = AgentStatusDB.get_agent_status(owner["owner_id"])
                AgentStatusDB.update_agent_status(
                    owner["owner_id"],
                    pre_open,
                    status.get("closed_note", ""),
                    bool(status.get("allow_reservation", 0)),
                )

        payload = _serialize_cycles(owner["owner_type"], owner["owner_id"])
        payload["owner_type"] = owner["owner_type"]
        payload["owner_id"] = owner["owner_id"]
        return success_response("已取消结束周期", payload)
    except Exception as exc:
        logger.error("取消结束周期失败: %s", exc)
        return error_response("取消结束周期失败", 500)


@router.post("/admin/sales-cycles/start")
async def admin_start_sales_cycle(request: Request, agent_id: Optional[str] = None):
    _admin = get_current_admin_required_from_cookie(request)
    try:
        owner = _resolve_admin_owner(agent_id)
        if not owner:
            return error_response("全部订单不支持周期操作", 400)

        cycle = SalesCycleDB.start_new_cycle(owner["owner_type"], owner["owner_id"])
        if not cycle:
            return error_response("当前已有进行中的周期，请先结束后再开启新周期", 400)

        payload = _serialize_cycles(owner["owner_type"], owner["owner_id"])
        payload["owner_type"] = owner["owner_type"]
        payload["owner_id"] = owner["owner_id"]
        return success_response("已开启新周期", payload)
    except Exception as exc:
        logger.error("开启新周期失败: %s", exc)
        return error_response("开启新周期失败", 500)


@router.get("/agent/sales-cycles")
async def agent_get_sales_cycles(request: Request):
    agent, _scope = require_agent_with_scope(request)
    try:
        payload = _serialize_cycles("agent", agent.get("id"))
        payload["owner_type"] = "agent"
        payload["owner_id"] = agent.get("id")
        return success_response("获取销售周期成功", payload)
    except Exception as exc:
        logger.error("代理获取销售周期失败: %s", exc)
        return error_response("获取销售周期失败", 500)


@router.post("/agent/sales-cycles/end")
async def agent_end_sales_cycle(request: Request):
    agent, _scope = require_agent_with_scope(request)
    try:
        status = AgentStatusDB.get_agent_status(agent.get("id"))
        pre_open = bool(status.get("is_open", 1))
        cycle = SalesCycleDB.end_current_cycle("agent", agent.get("id"), pre_end_is_open=pre_open)
        if not cycle:
            return error_response("当前没有进行中的周期", 400)

        AgentStatusDB.update_agent_status(
            agent.get("id"),
            False,
            status.get("closed_note", ""),
            bool(status.get("allow_reservation", 0)),
        )

        payload = _serialize_cycles("agent", agent.get("id"))
        payload["owner_type"] = "agent"
        payload["owner_id"] = agent.get("id")
        return success_response("周期已结束", payload)
    except Exception as exc:
        logger.error("代理结束周期失败: %s", exc)
        return error_response("结束周期失败", 500)


@router.post("/agent/sales-cycles/cancel-end")
async def agent_cancel_sales_cycle_end(request: Request):
    agent, _scope = require_agent_with_scope(request)
    try:
        cycle = SalesCycleDB.cancel_end("agent", agent.get("id"))
        if not cycle:
            return error_response("当前没有可取消的结束周期", 400)

        pre_open_flag = cycle.get("pre_end_is_open")
        if pre_open_flag is not None:
            pre_open = bool(pre_open_flag)
            status = AgentStatusDB.get_agent_status(agent.get("id"))
            AgentStatusDB.update_agent_status(
                agent.get("id"),
                pre_open,
                status.get("closed_note", ""),
                bool(status.get("allow_reservation", 0)),
            )

        payload = _serialize_cycles("agent", agent.get("id"))
        payload["owner_type"] = "agent"
        payload["owner_id"] = agent.get("id")
        return success_response("已取消结束周期", payload)
    except Exception as exc:
        logger.error("代理取消结束周期失败: %s", exc)
        return error_response("取消结束周期失败", 500)


@router.post("/agent/sales-cycles/start")
async def agent_start_sales_cycle(request: Request):
    agent, _scope = require_agent_with_scope(request)
    try:
        cycle = SalesCycleDB.start_new_cycle("agent", agent.get("id"))
        if not cycle:
            return error_response("当前已有进行中的周期，请先结束后再开启新周期", 400)

        payload = _serialize_cycles("agent", agent.get("id"))
        payload["owner_type"] = "agent"
        payload["owner_id"] = agent.get("id")
        return success_response("已开启新周期", payload)
    except Exception as exc:
        logger.error("代理开启新周期失败: %s", exc)
        return error_response("开启新周期失败", 500)

