from typing import List, Optional

from fastapi import APIRouter, Request

from auth import (
    error_response,
    get_current_admin_required_from_cookie,
    get_current_staff_required_from_cookie,
    success_response,
)
from database import AddressDB, AgentAssignmentDB, BuildingDB
from ..context import logger
from ..services.admin import expire_agent_tokens_for_address
from ..schemas import (
    AddressCreateRequest,
    AddressReorderRequest,
    AddressUpdateRequest,
    BuildingCreateRequest,
    BuildingReorderRequest,
    BuildingUpdateRequest,
)


router = APIRouter()


@router.get("/addresses")
async def get_enabled_addresses():
    """获取启用且有启用楼栋的地址列表。"""
    try:
        addrs = AddressDB.get_enabled_addresses_with_buildings()

        if not addrs:
            addrs = []

        return success_response("获取地址成功", {"addresses": addrs})
    except Exception as exc:
        logger.error("Failed to fetch addresses: %s", exc)
        return error_response("获取地址失败", 500)


@router.get("/admin/addresses")
async def admin_get_addresses(request: Request):
    """获取全部地址（管理员）。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        addrs = AddressDB.get_all_addresses(include_disabled=True)
        if not addrs:
            try:
                addr_id = AddressDB.create_address("桃园", True, 0)
                if addr_id:
                    try:
                        BuildingDB.create_building(addr_id, "六舍", True, 0)
                    except Exception:
                        pass
                    addrs = AddressDB.get_all_addresses(include_disabled=True)
            except Exception:
                pass
        return success_response("获取地址成功", {"addresses": addrs})
    except Exception as exc:
        logger.error("Admin failed to fetch addresses: %s", exc)
        return error_response("获取地址失败", 500)


@router.post("/admin/addresses")
async def admin_create_address(payload: AddressCreateRequest, request: Request):
    """创建地址（管理员）。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        if AddressDB.get_by_name(payload.name):
            return error_response("地址名称已存在", 400)
        addr_id = AddressDB.create_address(payload.name, payload.enabled, payload.sort_order)
        if not addr_id:
            return error_response("创建地址失败，名称可能冲突", 400)
        return success_response("地址创建成功", {"address_id": addr_id})
    except Exception as exc:
        logger.error("Failed to create address: %s", exc)
        return error_response("创建地址失败", 500)


@router.put("/admin/addresses/{address_id}")
async def admin_update_address(address_id: str, payload: AddressUpdateRequest, request: Request):
    """更新地址（管理员）。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        existing = AddressDB.get_by_id(address_id)
        if not existing:
            return error_response("地址不存在", 404)
        if payload.name and payload.name != existing.get("name"):
            if AddressDB.get_by_name(payload.name):
                return error_response("地址名称已存在", 400)
        agent_ids_to_expire: Optional[List[str]] = None
        if payload.enabled is not None:
            try:
                was_enabled = 1 if int(existing.get("enabled", 1) or 1) == 1 else 0
            except Exception:
                was_enabled = 1
            will_enable = 1 if payload.enabled else 0
            if was_enabled == 1 and will_enable == 0:
                agent_ids_to_expire = AgentAssignmentDB.get_agent_ids_for_address(address_id)
        ok = AddressDB.update_address(address_id, payload.name, payload.enabled, payload.sort_order)
        if not ok:
            return error_response("更新地址失败", 400)
        if agent_ids_to_expire:
            expire_agent_tokens_for_address(address_id, agent_ids_to_expire)
        return success_response("地址更新成功")
    except Exception as exc:
        logger.error("Failed to update address: %s", exc)
        return error_response("更新地址失败", 500)


@router.delete("/admin/addresses/{address_id}")
async def admin_delete_address(address_id: str, request: Request):
    """删除地址（管理员）。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        existing = AddressDB.get_by_id(address_id)
        if not existing:
            return error_response("地址不存在", 404)
        agent_ids_to_expire = AgentAssignmentDB.get_agent_ids_for_address(address_id)
        ok = AddressDB.delete_address(address_id)
        if not ok:
            return error_response("删除地址失败", 400)
        if agent_ids_to_expire:
            expire_agent_tokens_for_address(address_id, agent_ids_to_expire)
        return success_response("地址删除成功")
    except Exception as exc:
        logger.error("Failed to delete address: %s", exc)
        return error_response("删除地址失败", 500)


@router.post("/admin/addresses/reorder")
async def admin_reorder_addresses(payload: AddressReorderRequest, request: Request):
    """批量重排地址顺序（管理员）。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        if not payload.order or not isinstance(payload.order, list):
            return error_response("无效排序数据", 400)
        ok = AddressDB.reorder(payload.order)
        if not ok:
            return error_response("重排失败", 400)
        return success_response("重排成功")
    except Exception as exc:
        logger.error("Failed to reorder addresses: %s", exc)
        return error_response("地址重排失败", 500)


@router.get("/buildings")
async def get_enabled_buildings(address_id: Optional[str] = None, address_name: Optional[str] = None):
    """根据地址获取启用的楼栋，若为空则回退默认“六舍”。"""
    try:
        addr_id = address_id
        if not addr_id and address_name:
            addr = AddressDB.get_by_name(address_name)
            addr_id = addr.get("id") if addr else None

        buildings = []
        if addr_id:
            buildings = BuildingDB.get_enabled_buildings(addr_id)

        if not buildings:
            buildings = [
                {
                    "id": "bld_default_6she",
                    "address_id": addr_id or "addr_default_taoyuan",
                    "name": "六舍",
                    "enabled": 1,
                    "sort_order": 0,
                    "created_at": None,
                    "updated_at": None,
                }
            ]
        return success_response("获取楼栋成功", {"buildings": buildings})
    except Exception as exc:
        logger.error("Failed to fetch buildings: %s", exc)
        return error_response("获取楼栋失败", 500)


@router.get("/admin/buildings")
async def admin_get_buildings(request: Request, address_id: Optional[str] = None):
    """获取楼栋（可按地址过滤）。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        blds = BuildingDB.get_all_buildings(address_id=address_id, include_disabled=True)
        return success_response("获取楼栋成功", {"buildings": blds})
    except Exception as exc:
        logger.error("Admin failed to fetch buildings: %s", exc)
        return error_response("获取楼栋失败", 500)


@router.post("/admin/buildings")
async def admin_create_building(payload: BuildingCreateRequest, request: Request):
    """创建楼栋（管理员）。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        addr = AddressDB.get_by_id(payload.address_id)
        if not addr:
            return error_response("所属地址不存在", 400)
        if BuildingDB.get_by_name_in_address(payload.address_id, payload.name):
            return error_response("该地址下楼栋名称已存在", 400)
        bld_id = BuildingDB.create_building(payload.address_id, payload.name, payload.enabled, payload.sort_order)
        if not bld_id:
            return error_response("创建楼栋失败，名称冲突", 400)
        return success_response("楼栋创建成功", {"building_id": bld_id})
    except Exception as exc:
        logger.error("Failed to create building: %s", exc)
        return error_response("创建楼栋失败", 500)


@router.put("/admin/buildings/{building_id}")
async def admin_update_building(building_id: str, payload: BuildingUpdateRequest, request: Request):
    """更新楼栋（管理员）。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        existing = BuildingDB.get_by_id(building_id)
        if not existing:
            return error_response("楼栋不存在", 404)
        if payload.name and payload.name != existing.get("name"):
            if BuildingDB.get_by_name_in_address(existing.get("address_id"), payload.name):
                return error_response("该地址下楼栋名称已存在", 400)
        ok = BuildingDB.update_building(building_id, payload.name, payload.enabled, payload.sort_order)
        if not ok:
            return error_response("更新楼栋失败", 400)
        return success_response("楼栋更新成功")
    except Exception as exc:
        logger.error("Failed to update building: %s", exc)
        return error_response("更新楼栋失败", 500)


@router.delete("/admin/buildings/{building_id}")
async def admin_delete_building(building_id: str, request: Request):
    """删除楼栋（管理员）。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        existing = BuildingDB.get_by_id(building_id)
        if not existing:
            return error_response("楼栋不存在", 404)
        ok = BuildingDB.delete_building(building_id)
        if not ok:
            return error_response("删除楼栋失败", 400)
        return success_response("楼栋删除成功")
    except Exception as exc:
        logger.error("Failed to delete building: %s", exc)
        return error_response("删除楼栋失败", 500)


@router.post("/admin/buildings/reorder")
async def admin_reorder_buildings(payload: BuildingReorderRequest, request: Request):
    """对某地址下的楼栋批量重排（管理员）。"""
    _staff = get_current_staff_required_from_cookie(request)
    try:
        if not payload.order or not isinstance(payload.order, list):
            return error_response("无效排序数据", 400)
        addr = AddressDB.get_by_id(payload.address_id)
        if not addr:
            return error_response("地址不存在", 404)
        ok = BuildingDB.reorder(payload.address_id, payload.order)
        if not ok:
            return error_response("重排失败", 400)
        return success_response("重排成功")
    except Exception as exc:
        logger.error("Failed to reorder buildings: %s", exc)
        return error_response("楼栋重排失败", 500)
