from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException, Request

from auth import (
    get_current_agent_from_cookie,
    get_current_staff_from_cookie,
    get_current_user_from_cookie,
    is_super_admin_role,
)
from database import (
    AddressDB,
    AgentAssignmentDB,
    BuildingDB,
    UserProfileDB,
    get_db_connection,
)
from .context import logger


def build_staff_scope(staff: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """根据工作人员信息计算可访问的订单/商品范围。"""
    scope = {
        "owner_ids": None,
        "address_ids": None,
        "building_ids": None,
        "is_super_admin": False,
        "agent_id": None,
        "filter_admin_orders": False,
    }
    if not staff:
        return scope

    scope["is_super_admin"] = is_super_admin_role(staff.get("role"))

    if staff.get("type") == "agent":
        assignments = AgentAssignmentDB.get_buildings_for_agent(staff.get("agent_id"))
        building_ids = [item["building_id"] for item in assignments if item.get("building_id")]
        address_ids = list({item["address_id"] for item in assignments if item.get("address_id")})
        scope.update(
            {
                "owner_ids": [staff.get("agent_id")],
                "address_ids": address_ids,
                "building_ids": building_ids,
                "agent_id": staff.get("agent_id"),
            }
        )
    else:
        scope.update(
            {
                "owner_ids": ["admin"],
                "filter_admin_orders": True,
            }
        )

    return scope


def require_agent_with_scope(request: Request) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Ensure the requester is an agent and return (agent, scope)."""
    agent = get_current_agent_from_cookie(request)
    if not agent:
        raise HTTPException(status_code=401, detail="需要代理权限")
    scope = build_staff_scope(agent)
    return agent, scope


def get_owner_id_for_staff(staff: Dict[str, Any]) -> Optional[str]:
    """Return the owner_id used to segregate staff resources."""
    if not staff:
        return None
    if staff.get("type") == "agent":
        return staff.get("agent_id")
    return "admin"


def get_owner_id_from_scope(scope: Optional[Dict[str, Any]]) -> Optional[str]:
    if not scope:
        return None
    agent_id = scope.get("agent_id")
    if agent_id:
        return agent_id
    return "admin"


def check_address_and_building(address_id: Optional[str], building_id: Optional[str]) -> Dict[str, Any]:
    """校验地址与楼栋状态，返回可供前端与后端共用的结构。"""
    result: Dict[str, Any] = {
        "is_valid": False,
        "reason": "missing_address",
        "message": "请先选择配送地址",
        "address": None,
        "building": None,
        "address_id": address_id,
        "building_id": building_id,
        "should_force_reselect": True,
    }

    if not address_id:
        return result

    address = AddressDB.get_by_id(address_id)
    if not address:
        result.update(
            {
                "reason": "address_missing",
                "message": "地址不存在，请联系管理员",
                "address": None,
            }
        )
        return result

    result["address"] = address

    address_enabled = str(address.get("enabled", 1)).strip().lower() in ("1", "true")
    if not address_enabled:
        result.update({"reason": "address_disabled", "message": "该地址未启用，请重新选择"})
        return result

    if not building_id:
        result.update({"reason": "missing_building", "message": "请先选择配送地址"})
        return result

    building = BuildingDB.get_by_id(building_id)
    if not building:
        result.update(
            {
                "reason": "building_missing",
                "message": "楼栋不存在或未启用，请重新选择",
                "building": None,
            }
        )
        return result

    result["building"] = building

    if building.get("address_id") != address_id:
        result.update({"reason": "building_mismatch", "message": "配送地址信息已失效，请重新选择"})
        return result

    building_enabled = str(building.get("enabled", 1)).strip().lower() in ("1", "true")
    if not building_enabled:
        result.update({"reason": "building_disabled", "message": "楼栋未启用，请重新选择"})
        return result

    result.update({"is_valid": True, "reason": None, "message": "", "should_force_reselect": False})
    return result


def resolve_shopping_scope(request: Request, address_id: Optional[str] = None, building_id: Optional[str] = None) -> Dict[str, Optional[str]]:
    """根据请求参数和用户资料确定购物范围与归属代理。"""
    resolved_address_id = address_id
    resolved_building_id = building_id
    agent_id: Optional[str] = None

    staff = get_current_staff_from_cookie(request)
    if staff and staff.get("type") == "agent":
        staff_agent_id = staff.get("agent_id")
        owner_ids = [staff_agent_id] if staff_agent_id else None
        return {"agent_id": staff_agent_id, "address_id": None, "building_id": None, "owner_ids": owner_ids}

    user = get_current_user_from_cookie(request)
    if user:
        logger.info(f"resolve_shopping_scope - 用户: {user['id']}")
        profile = UserProfileDB.get_shipping(user["id"])
        logger.info(f"resolve_shopping_scope - 用户配置: {profile}")
        if profile:
            if not resolved_address_id:
                resolved_address_id = profile.get("address_id") or profile.get("dormitory")
            if not resolved_building_id:
                resolved_building_id = profile.get("building_id")
        logger.info(f"resolve_shopping_scope - 解析后地址: {resolved_address_id}, 楼栋: {resolved_building_id}")
    else:
        logger.warning("resolve_shopping_scope - 未获取到用户信息")

    if resolved_address_id or resolved_building_id:
        validation = check_address_and_building(resolved_address_id, resolved_building_id)
        if not validation["is_valid"]:
            resolved_address_id = None
            resolved_building_id = None
    else:
        validation = check_address_and_building(None, None)

    if resolved_building_id:
        assignment = AgentAssignmentDB.get_agent_for_building(resolved_building_id)
        if assignment and assignment.get("agent_id"):
            agent_id = assignment["agent_id"]
            if not resolved_address_id:
                resolved_address_id = assignment.get("address_id")
    elif resolved_address_id:
        agents = AgentAssignmentDB.get_agent_ids_for_address(resolved_address_id)
        if len(agents) == 1:
            agent_id = agents[0]

    if agent_id:
        owner_ids = [agent_id]
    else:
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM admins WHERE (role = 'super_admin' OR role = 'admin') AND is_active = 1")
                admin_count = cursor.fetchone()[0]
                if admin_count > 0:
                    owner_ids = ["admin"]
                else:
                    owner_ids = None
        except Exception:
            owner_ids = None

    result = {
        "agent_id": agent_id,
        "address_id": resolved_address_id,
        "building_id": resolved_building_id,
        "owner_ids": owner_ids,
        "address_validation": validation,
    }
    logger.info(f"resolve_shopping_scope - 最终结果: {result}")
    return result


def staff_can_access_product(staff: Dict[str, Any], product: Optional[Dict[str, Any]]) -> bool:
    if not product:
        return False
    if staff.get("type") == "agent":
        return product.get("owner_id") == staff.get("agent_id")
    return True


def staff_can_access_order(staff: Dict[str, Any], order: Optional[Dict[str, Any]], scope: Optional[Dict[str, Any]] = None) -> bool:
    if not order:
        return False
    scope = scope or build_staff_scope(staff)
    if scope.get("is_super_admin"):
        return True
    agent_id = scope.get("agent_id")
    if agent_id:
        if order.get("agent_id") == agent_id:
            return True
        buildings = scope.get("building_ids") or []
        addresses = scope.get("address_ids") or []
        if order.get("building_id") and order.get("building_id") in buildings:
            return True
        if order.get("address_id") and order.get("address_id") in addresses:
            return True
    return False
