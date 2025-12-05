from typing import Any, Dict, List, Optional, Set, Tuple

from database import AdminDB, AgentAssignmentDB, BuildingDB, UserProfileDB
from ..context import logger


def expire_agent_tokens_for_address(address_id: str, agent_ids: Optional[List[str]] = None) -> int:
    """让指定地址下代理的登录token立即失效。"""
    if not address_id and not agent_ids:
        return 0
    ids = agent_ids if agent_ids is not None else AgentAssignmentDB.get_agent_ids_for_address(address_id)
    expired = 0
    seen: Set[str] = set()
    for agent_id in ids or []:
        if not agent_id or agent_id in seen:
            continue
        seen.add(agent_id)
        if AdminDB.bump_token_version(agent_id):
            expired += 1
    if expired:
        logger.info(f"地址 {address_id} 已使 {expired} 个代理登录状态失效")
    return expired


def serialize_agent_account(agent: Dict[str, Any], include_buildings: bool = True) -> Dict[str, Any]:
    """将数据库中的管理员记录转换为前端需要的结构。"""
    data = {
        "id": agent.get("id"),
        "name": agent.get("name"),
        "role": agent.get("role"),
        "type": "agent" if (agent.get("role") or "").lower() == "agent" else "admin",
        "created_at": agent.get("created_at"),
        "payment_qr_path": agent.get("payment_qr_path"),
        "is_active": False if str(agent.get("is_active", 1)).strip() in ("0", "False", "false") else True,
        "deleted_at": agent.get("deleted_at"),
        "is_deleted": bool(agent.get("deleted_at")),
    }
    if include_buildings:
        data["buildings"] = AgentAssignmentDB.get_buildings_for_agent(agent.get("id"))
    return data


def compute_registered_user_count(owner_ids: Optional[List[str]]) -> int:
    """
    根据归属范围统计注册用户数量。
    - owner_ids 为 None 时统计所有用户
    - owner_ids 包含 'admin' 时同样统计所有用户
    - 其余情况根据代理分配的地址/楼栋统计
    """
    try:
        if not owner_ids:
            return UserProfileDB.count_users_by_scope()

        agent_ids = [oid for oid in owner_ids if oid and oid != "admin"]
        if not agent_ids:
            return UserProfileDB.count_users_by_scope()

        address_ids: Set[str] = set()
        building_ids: Set[str] = set()
        for agent_id in agent_ids:
            assignments = AgentAssignmentDB.get_buildings_for_agent(agent_id)
            for record in assignments or []:
                addr = record.get("address_id")
                bld = record.get("building_id")
                if addr:
                    address_ids.add(addr)
                if bld:
                    building_ids.add(bld)

        agent_id_filter = agent_ids[0] if len(agent_ids) == 1 else None
        if agent_id_filter and not address_ids and not building_ids:
            return UserProfileDB.count_users_by_scope(agent_id=agent_id_filter)

        return UserProfileDB.count_users_by_scope(
            address_ids=list(address_ids), building_ids=list(building_ids), agent_id=agent_id_filter
        )
    except Exception as exc:
        logger.error(f"计算注册用户数量失败: {exc}")
        return 0


def validate_building_ids(building_ids: Optional[List[str]]) -> Tuple[List[str], List[str]]:
    valid: List[str] = []
    invalid: List[str] = []
    if not building_ids:
        return valid, invalid
    seen = set()
    for bid in building_ids:
        if not bid or bid in seen:
            continue
        seen.add(bid)
        building = BuildingDB.get_by_id(bid)
        if building:
            valid.append(bid)
        else:
            invalid.append(bid)
    return valid, invalid
