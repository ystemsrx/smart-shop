from fastapi import APIRouter, Request

from auth import error_response, get_current_user_required_from_cookie, success_response
from database import AddressDB, AgentAssignmentDB, BuildingDB, CartDB, UserProfileDB
from ..context import logger
from ..schemas import LocationUpdateRequest


router = APIRouter()


@router.get("/profile/shipping")
async def get_profile_shipping(request: Request):
    """获取用户收货资料。"""
    user = get_current_user_required_from_cookie(request)
    try:
        prof = UserProfileDB.get_shipping(user["id"])
        return success_response("获取收货资料成功", {"shipping": prof})
    except Exception as exc:
        logger.error("Failed to fetch shipping profile: %s", exc)
        return error_response("获取收货资料失败", 500)


@router.post("/profile/location")
async def update_profile_location(payload: LocationUpdateRequest, request: Request):
    """更新用户配送地址并清空购物车。"""
    user = get_current_user_required_from_cookie(request)
    try:
        address = AddressDB.get_by_id(payload.address_id)
        if not address or int(address.get("enabled", 1) or 1) != 1:
            return error_response("地址不存在或未启用", 400)

        building = BuildingDB.get_by_id(payload.building_id)
        if not building or building.get("address_id") != address.get("id") or int(building.get("enabled", 1) or 1) != 1:
            return error_response("楼栋不存在或未启用", 400)

        assignment = AgentAssignmentDB.get_agent_for_building(building.get("id"))
        agent_id = assignment.get("agent_id") if assignment else None

        existing = UserProfileDB.get_shipping(user["id"]) or {}
        dormitory_name = address.get("name") or ""
        building_name = building.get("name") or ""
        room = existing.get("room") or ""
        full_address = f"{dormitory_name} {building_name} {room}".strip()

        updated_profile = {
            "name": existing.get("name") or "",
            "phone": existing.get("phone") or "",
            "room": room,
            "dormitory": dormitory_name,
            "building": building_name,
            "full_address": full_address,
            "address_id": address.get("id"),
            "building_id": building.get("id"),
            "agent_id": agent_id,
        }

        UserProfileDB.upsert_shipping(user["id"], updated_profile)
        try:
            CartDB.update_cart(user["id"], {})
        except Exception as exc:
            logger.warning("Failed to clear cart after location change: %s", exc)

        return success_response("配送地址已更新", {"shipping": updated_profile})
    except Exception as exc:
        logger.error("Failed to update delivery location: %s", exc)
        return error_response("更新配送地址失败", 500)
