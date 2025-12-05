import os
import re
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, Request, UploadFile

from auth import (
    error_response,
    get_current_staff_required_from_cookie,
    get_current_super_admin_required_from_cookie,
    get_current_user_from_cookie,
    success_response,
)
from database import (
    AdminDB,
    AgentAssignmentDB,
    AgentDeletionDB,
    OrderDB,
    PaymentQrDB,
    UserProfileDB,
    get_db_connection,
)
from ..context import PUBLIC_DIR, logger
from ..dependencies import build_staff_scope, check_address_and_building
from ..services.admin import serialize_agent_account, validate_building_ids
from ..services.products import resolve_single_owner_for_staff
from ..utils import convert_sqlite_timestamp_to_unix
from ..schemas import (
    AgentCreateRequest,
    AgentUpdateRequest,
    PaymentQrStatusRequest,
    PaymentQrUpdateRequest,
)


router = APIRouter()


@router.get("/admin/students/search")
async def admin_search_students(request: Request, q: str = "", limit: int = 20):
    """
    按学号、用户姓名、配送名模糊搜索
    - 管理员可以搜索所有用户
    - 代理只能搜索配送地址在其管辖区域内的用户
    """
    staff = get_current_staff_required_from_cookie(request)
    try:
        like = f"%{q.strip()}%" if q else "%"
        scope = build_staff_scope(staff)
        address_ids = [aid for aid in (scope.get("address_ids") or []) if aid]
        building_ids = [bid for bid in (scope.get("building_ids") or []) if bid]

        with get_db_connection() as conn:
            cur = conn.cursor()
            params: List[Any] = [like, like, like]
            search_condition = "(u.id LIKE ? OR u.name LIKE ? OR up.name LIKE ?)"
            filters: List[str] = [search_condition]

            if staff.get("type") == "agent":
                if not address_ids and not building_ids:
                    return success_response("搜索成功", {"students": []})
                coverage_parts: List[str] = []
                if address_ids:
                    placeholders = ",".join("?" * len(address_ids))
                    coverage_parts.append(f"up.address_id IN ({placeholders})")
                    params.extend(address_ids)
                if building_ids:
                    placeholders = ",".join("?" * len(building_ids))
                    coverage_parts.append(f"up.building_id IN ({placeholders})")
                    params.extend(building_ids)
                filters.append("(" + " OR ".join(coverage_parts) + ")")
                filters.append("((up.address_id IS NOT NULL AND TRIM(up.address_id) != '') OR (up.building_id IS NOT NULL AND TRIM(up.building_id) != ''))")

            query = f"""
                SELECT DISTINCT
                    u.id AS student_id,
                    u.name AS user_name,
                    up.name AS profile_name,
                    COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(up.name), ''), u.id) AS display_name
                FROM users u
                LEFT JOIN user_profiles up
                  ON (up.user_id = u.user_id OR (up.user_id IS NULL AND up.student_id = u.id))
                WHERE {" AND ".join(filters)}
                ORDER BY u.id ASC
                LIMIT ?
            """
            params.append(max(1, min(limit, 50)))
            cur.execute(query, tuple(params))
            rows = cur.fetchall() or []

        items = []
        for row in rows:
            items.append({
                "id": row["student_id"],
                "name": row["display_name"],
                "user_name": row["user_name"],
                "profile_name": row["profile_name"],
            })
        return success_response("搜索成功", {"students": items})
    except Exception as exc:
        logger.error(f"搜索学号失败: {exc}")
        return error_response("搜索失败", 500)


@router.get("/admin/agents")
async def admin_list_agents(request: Request, include_inactive: bool = False):
    staff = get_current_super_admin_required_from_cookie(request)
    include_disabled = str(include_inactive).lower() in ("1", "true", "yes")
    include_deleted_param = request.query_params.get("include_deleted")
    include_deleted = include_disabled or (
        include_deleted_param is not None and str(include_deleted_param).lower() in ("1", "true", "yes")
    )
    try:
        agents = AdminDB.list_admins(role="agent", include_disabled=include_disabled, include_deleted=False)
        data = [serialize_agent_account(agent) for agent in agents]
        deleted_agents: List[Dict[str, Any]] = []
        if include_deleted:
            for record in AgentDeletionDB.list_active_records():
                agent_id = record.get("agent_id")
                has_orders = False
                if agent_id:
                    with get_db_connection() as conn:
                        cursor = conn.cursor()
                        cursor.execute("SELECT COUNT(*) FROM orders WHERE agent_id = ?", (agent_id,))
                        order_count = cursor.fetchone()[0]
                        has_orders = order_count > 0

                if has_orders:
                    deleted_at_raw = record.get("deleted_at")
                    deleted_at_timestamp = None
                    if deleted_at_raw:
                        try:
                            deleted_at_timestamp = convert_sqlite_timestamp_to_unix(deleted_at_raw, agent_id)
                        except Exception as exc:
                            logger.warning(f"转换删除时间失败 {agent_id}: {exc}")

                    deleted_agents.append(
                        {
                            "id": agent_id,
                            "name": record.get("agent_name") or agent_id,
                            "deleted_at": deleted_at_timestamp,
                            "address_ids": record.get("address_ids") or [],
                            "building_ids": record.get("building_ids") or [],
                            "is_deleted": True,
                        }
                    )
        return success_response("获取代理列表成功", {"agents": data, "deleted_agents": deleted_agents})
    except Exception as exc:
        logger.error(f"获取代理列表失败: {exc}")
        return error_response("获取代理列表失败", 500)


@router.post("/admin/agents")
async def admin_create_agent(payload: AgentCreateRequest, request: Request):
    staff = get_current_super_admin_required_from_cookie(request)
    try:
        account = payload.account.strip()
        if not account:
            return error_response("账号不能为空", 400)
        if not payload.password or len(payload.password) < 3:
            return error_response("密码至少3位", 400)
        name = payload.name.strip() if payload.name else payload.account
        created = AdminDB.create_admin(account, payload.password, name, role="agent")
        if not created:
            return error_response("账号已存在", 400)

        valid_buildings, invalid_buildings = validate_building_ids(payload.building_ids)
        inherited_orders_count = 0
        if valid_buildings:
            AgentAssignmentDB.set_agent_buildings(account, valid_buildings)
            new_assignments = AgentAssignmentDB.get_buildings_for_agent(account)
            if new_assignments:
                address_ids = [item.get("address_id") for item in new_assignments]
                building_ids = [item.get("building_id") for item in new_assignments]
                inherited_orders_count = AgentDeletionDB.inherit_deleted_agent_orders(address_ids, building_ids, account, name)
                if inherited_orders_count > 0:
                    logger.info(f"新代理 {account} 继承了 {inherited_orders_count} 个订单")
        else:
            new_assignments = []

        agent = AdminDB.get_admin(account, include_disabled=True, include_deleted=True)
        data = serialize_agent_account(agent)
        data["invalid_buildings"] = invalid_buildings
        data["inherited_orders_count"] = inherited_orders_count

        message = "代理创建成功"
        if inherited_orders_count > 0:
            message = f"代理创建成功，已自动继承相同区域已删除代理的所有数据（订单 {inherited_orders_count} 个及商品、配置、收款码等）"

        return success_response(message, {"agent": data})
    except Exception as exc:
        logger.error(f"创建代理失败: {exc}")
        return error_response("创建代理失败", 500)


@router.put("/admin/agents/{agent_id}")
async def admin_update_agent(agent_id: str, payload: AgentUpdateRequest, request: Request):
    staff = get_current_super_admin_required_from_cookie(request)
    try:
        agent = AdminDB.get_admin(agent_id, include_disabled=True, include_deleted=True)
        if not agent or (agent.get("role") or "").lower() != "agent":
            return error_response("代理不存在", 404)
        if agent.get("deleted_at"):
            return error_response("该代理已删除，无法编辑", 400)

        def normalize_active(value: Any) -> bool:
            try:
                return int(value) == 1
            except Exception:
                return str(value).strip().lower() in ("1", "true", "yes", "on")

        original_active = normalize_active(agent.get("is_active", 1))
        needs_token_reset = False

        update_fields: Dict[str, Any] = {}
        updated_name = agent.get("name")
        if payload.password:
            if len(payload.password) < 3:
                return error_response("密码至少3位", 400)
            update_fields["password"] = payload.password
            needs_token_reset = True
        if payload.name:
            updated_name = payload.name.strip()
            update_fields["name"] = updated_name
        if payload.is_active is not None:
            new_active = normalize_active(payload.is_active)
            update_fields["is_active"] = 1 if new_active else 0
            if new_active != original_active:
                needs_token_reset = True

        if update_fields:
            updated = AdminDB.update_admin(agent_id, **update_fields)
            if not updated:
                return error_response("更新代理信息失败", 400)

        invalid_buildings: List[str] = []
        inherited_orders_count = 0
        if payload.building_ids is not None:
            valid_buildings, invalid_buildings = validate_building_ids(payload.building_ids)
            assignments_ok = AgentAssignmentDB.set_agent_buildings(agent_id, valid_buildings)
            if not assignments_ok:
                return error_response("更新代理负责楼栋失败", 500)
            fresh_assignments = AgentAssignmentDB.get_buildings_for_agent(agent_id)
            if fresh_assignments:
                address_ids = [item.get("address_id") for item in fresh_assignments]
                building_ids = [item.get("building_id") for item in fresh_assignments]
                inherited_orders_count = AgentDeletionDB.inherit_deleted_agent_orders(
                    address_ids, building_ids, agent_id, updated_name or agent_id
                )
                if inherited_orders_count > 0:
                    logger.info(f"代理 {agent_id} 更新楼栋后继承了 {inherited_orders_count} 个订单")

        if needs_token_reset:
            AdminDB.bump_token_version(agent_id)

        refreshed = AdminDB.get_admin(agent_id, include_disabled=True, include_deleted=True)
        data = serialize_agent_account(refreshed)
        if payload.building_ids is not None:
            data["invalid_buildings"] = invalid_buildings
            data["inherited_orders_count"] = inherited_orders_count

        message = "代理更新成功"
        if inherited_orders_count > 0:
            message = f"代理更新成功，已自动继承相同区域已删除代理的所有数据（订单 {inherited_orders_count} 个及商品、配置、收款码等）"

        return success_response(message, {"agent": data})
    except Exception as exc:
        logger.error(f"更新代理失败: {exc}")
        return error_response("更新代理失败", 500)


@router.delete("/admin/agents/{agent_id}")
async def admin_delete_agent(agent_id: str, request: Request):
    staff = get_current_super_admin_required_from_cookie(request)
    try:
        if agent_id in AdminDB.SAFE_SUPER_ADMINS:
            return error_response("禁止删除系统管理员", 400)
        agent = AdminDB.get_admin(agent_id, include_disabled=True, include_deleted=True)
        if not agent or (agent.get("role") or "").lower() != "agent":
            return error_response("代理不存在", 404)
        assignments = AgentAssignmentDB.get_buildings_for_agent(agent_id)
        deleted = AdminDB.soft_delete_admin(agent_id)
        if not deleted:
            return error_response("停用代理失败", 400)
        address_ids = [item.get("address_id") for item in assignments or []]
        building_ids = [item.get("building_id") for item in assignments or []]
        if not AgentDeletionDB.record_deletion(agent_id, agent.get("name") or agent_id, address_ids, building_ids):
            logger.warning(f"记录代理删除信息失败: {agent_id}")
        if not AgentAssignmentDB.set_agent_buildings(agent_id, []):
            logger.warning(f"清空代理 {agent_id} 的楼栋关联失败")
        return success_response("代理已删除")
    except Exception as exc:
        logger.error(f"删除代理失败: {exc}")
        return error_response("删除代理失败", 500)


@router.get("/admin/payment-qrs")
async def admin_get_payment_qrs(request: Request, owner_id: Optional[str] = None):
    """管理员获取收款码列表，支持切换归属。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        target_owner_id, normalized = resolve_single_owner_for_staff(staff, owner_id)
        owner_type = "agent" if (normalized not in ("self", None) or staff.get("type") == "agent") else "admin"
        qrs = PaymentQrDB.get_payment_qrs(target_owner_id, owner_type, include_disabled=True)
        return success_response("获取收款码列表成功", {"payment_qrs": qrs})
    except Exception as exc:
        logger.error(f"获取管理员收款码列表失败: {exc}")
        return error_response("获取收款码列表失败", 500)


@router.get("/agent/payment-qrs")
async def agent_get_payment_qrs(request: Request):
    """代理获取自己的收款码列表。"""
    staff = get_current_staff_required_from_cookie(request)
    if staff.get("role") != "agent":
        return error_response("权限不足", 403)
    try:
        qrs = PaymentQrDB.get_payment_qrs(staff["id"], "agent", include_disabled=True)
        return success_response("获取收款码列表成功", {"payment_qrs": qrs})
    except Exception as exc:
        logger.error(f"获取代理收款码列表失败: {exc}")
        return error_response("获取收款码列表失败", 500)


@router.post("/admin/payment-qrs")
async def admin_create_payment_qr(
    request: Request,
    name: str = Form(...),
    file: UploadFile = File(...),
    owner_id: Optional[str] = None,
):
    """管理员创建收款码。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        if not file or not file.filename:
            return error_response("请上传图片文件", 400)

        target_owner_id, normalized = resolve_single_owner_for_staff(staff, owner_id)
        owner_type = "agent" if (normalized not in ("self", None) or staff.get("type") == "agent") else "admin"

        allowed_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in allowed_extensions:
            return error_response("只支持图片格式：jpg, jpeg, png, gif, webp", 400)

        timestamp = int(time.time() * 1000)
        safe_name = re.sub(r"[^0-9A-Za-z\u4e00-\u9fa5_-]+", "_", name)
        filename = f"payment_qr_{target_owner_id}_{timestamp}_{safe_name}{ext}"
        target_path = os.path.join(PUBLIC_DIR, filename)

        content = await file.read()
        with open(target_path, "wb") as f:
            f.write(content)

        web_path = f"/public/{filename}"

        qr_id = PaymentQrDB.create_payment_qr(target_owner_id, owner_type, name, web_path)
        qr = PaymentQrDB.get_payment_qr(qr_id)

        return success_response("收款码创建成功", {"payment_qr": qr})
    except Exception as exc:
        logger.error(f"创建管理员收款码失败: {exc}")
        return error_response("创建收款码失败", 500)


@router.post("/agent/payment-qrs")
async def agent_create_payment_qr(request: Request, name: str = Form(...), file: UploadFile = File(...)):
    """代理创建收款码。"""
    staff = get_current_staff_required_from_cookie(request)
    if staff.get("role") != "agent":
        return error_response("权限不足", 403)
    try:
        if not file or not file.filename:
            return error_response("请上传图片文件", 400)

        allowed_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in allowed_extensions:
            return error_response("只支持图片格式：jpg, jpeg, png, gif, webp", 400)

        timestamp = int(time.time() * 1000)
        safe_name = re.sub(r"[^0-9A-Za-z\u4e00-\u9fa5_-]+", "_", name)
        filename = f"payment_qr_{staff['id']}_{timestamp}_{safe_name}{ext}"
        target_path = os.path.join(PUBLIC_DIR, filename)

        content = await file.read()
        with open(target_path, "wb") as f:
            f.write(content)

        web_path = f"/public/{filename}"

        qr_id = PaymentQrDB.create_payment_qr(staff["id"], "agent", name, web_path)
        qr = PaymentQrDB.get_payment_qr(qr_id)

        return success_response("收款码创建成功", {"payment_qr": qr})
    except Exception as exc:
        logger.error(f"创建代理收款码失败: {exc}")
        return error_response("创建收款码失败", 500)


@router.put("/admin/payment-qrs/{qr_id}")
async def admin_update_payment_qr(qr_id: str, payload: PaymentQrUpdateRequest, request: Request, owner_id: Optional[str] = None):
    """管理员更新收款码。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        target_owner_id, normalized = resolve_single_owner_for_staff(staff, owner_id)
        owner_type = "agent" if (normalized not in ("self", None) or staff.get("type") == "agent") else "admin"
        qr = PaymentQrDB.get_payment_qr(qr_id)
        if not qr or qr["owner_id"] != target_owner_id or qr["owner_type"] != owner_type:
            return error_response("收款码不存在或无权限", 404)

        if payload.name:
            PaymentQrDB.update_payment_qr(qr_id, name=payload.name)

        updated_qr = PaymentQrDB.get_payment_qr(qr_id)
        return success_response("收款码更新成功", {"payment_qr": updated_qr})
    except Exception as exc:
        logger.error(f"更新管理员收款码失败: {exc}")
        return error_response("更新收款码失败", 500)


@router.put("/agent/payment-qrs/{qr_id}")
async def agent_update_payment_qr(qr_id: str, payload: PaymentQrUpdateRequest, request: Request):
    """代理更新收款码。"""
    staff = get_current_staff_required_from_cookie(request)
    if staff.get("role") != "agent":
        return error_response("权限不足", 403)
    try:
        qr = PaymentQrDB.get_payment_qr(qr_id)
        if not qr or qr["owner_id"] != staff["id"] or qr["owner_type"] != "agent":
            return error_response("收款码不存在或无权限", 404)

        if payload.name:
            PaymentQrDB.update_payment_qr(qr_id, name=payload.name)

        updated_qr = PaymentQrDB.get_payment_qr(qr_id)
        return success_response("收款码更新成功", {"payment_qr": updated_qr})
    except Exception as exc:
        logger.error(f"更新代理收款码失败: {exc}")
        return error_response("更新收款码失败", 500)


@router.patch("/admin/payment-qrs/{qr_id}/status")
async def admin_update_payment_qr_status(qr_id: str, payload: PaymentQrStatusRequest, request: Request, owner_id: Optional[str] = None):
    """管理员更新收款码启用状态。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        target_owner_id, normalized = resolve_single_owner_for_staff(staff, owner_id)
        owner_type = "agent" if (normalized not in ("self", None) or staff.get("type") == "agent") else "admin"
        qr = PaymentQrDB.get_payment_qr(qr_id)
        if not qr or qr["owner_id"] != target_owner_id or qr["owner_type"] != owner_type:
            return error_response("收款码不存在或无权限", 404)

        if not payload.is_enabled:
            enabled_qrs = PaymentQrDB.get_enabled_payment_qrs(target_owner_id, owner_type)
            if len(enabled_qrs) <= 1 and qr["is_enabled"] == 1:
                return error_response("至少需要保留一个启用的收款码", 400)

        PaymentQrDB.update_payment_qr_status(qr_id, payload.is_enabled)
        updated_qr = PaymentQrDB.get_payment_qr(qr_id)
        return success_response("收款码状态更新成功", {"payment_qr": updated_qr})
    except Exception as exc:
        logger.error(f"更新管理员收款码状态失败: {exc}")
        return error_response("更新收款码状态失败", 500)


@router.patch("/agent/payment-qrs/{qr_id}/status")
async def agent_update_payment_qr_status(qr_id: str, payload: PaymentQrStatusRequest, request: Request):
    """代理更新收款码启用状态。"""
    staff = get_current_staff_required_from_cookie(request)
    if staff.get("role") != "agent":
        return error_response("权限不足", 403)
    try:
        qr = PaymentQrDB.get_payment_qr(qr_id)
        if not qr or qr["owner_id"] != staff["id"] or qr["owner_type"] != "agent":
            return error_response("收款码不存在或无权限", 404)

        if not payload.is_enabled:
            enabled_qrs = PaymentQrDB.get_enabled_payment_qrs(staff["id"], "agent")
            if len(enabled_qrs) <= 1 and qr["is_enabled"] == 1:
                return error_response("至少需要保留一个启用的收款码", 400)

        PaymentQrDB.update_payment_qr_status(qr_id, payload.is_enabled)
        updated_qr = PaymentQrDB.get_payment_qr(qr_id)
        return success_response("收款码状态更新成功", {"payment_qr": updated_qr})
    except Exception as exc:
        logger.error(f"更新代理收款码状态失败: {exc}")
        return error_response("更新收款码状态失败", 500)


@router.delete("/admin/payment-qrs/{qr_id}")
async def admin_delete_payment_qr(qr_id: str, request: Request, owner_id: Optional[str] = None):
    """管理员删除收款码。"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        target_owner_id, normalized = resolve_single_owner_for_staff(staff, owner_id)
        owner_type = "agent" if (normalized not in ("self", None) or staff.get("type") == "agent") else "admin"
        qr = PaymentQrDB.get_payment_qr(qr_id)
        if not qr or qr["owner_id"] != target_owner_id or qr["owner_type"] != owner_type:
            return error_response("收款码不存在或无权限", 404)

        try:
            if qr["image_path"] and qr["image_path"].startswith("/"):
                file_path = os.path.join(PUBLIC_DIR, qr["image_path"][1:])
                if os.path.exists(file_path):
                    os.remove(file_path)
        except Exception as exc:
            logger.warning(f"删除收款码文件失败: {exc}")

        PaymentQrDB.delete_payment_qr(qr_id)
        PaymentQrDB.ensure_at_least_one_enabled(target_owner_id, owner_type)

        return success_response("收款码删除成功")
    except Exception as exc:
        logger.error(f"删除管理员收款码失败: {exc}")
        return error_response("删除收款码失败", 500)


@router.delete("/agent/payment-qrs/{qr_id}")
async def agent_delete_payment_qr(qr_id: str, request: Request):
    """代理删除收款码。"""
    staff = get_current_staff_required_from_cookie(request)
    if staff.get("role") != "agent":
        return error_response("权限不足", 403)
    try:
        qr = PaymentQrDB.get_payment_qr(qr_id)
        if not qr or qr["owner_id"] != staff["id"] or qr["owner_type"] != "agent":
            return error_response("收款码不存在或无权限", 404)

        try:
            if qr["image_path"] and qr["image_path"].startswith("/"):
                file_path = os.path.join(PUBLIC_DIR, qr["image_path"][1:])
                if os.path.exists(file_path):
                    os.remove(file_path)
        except Exception as exc:
            logger.warning(f"删除收款码文件失败: {exc}")

        PaymentQrDB.delete_payment_qr(qr_id)
        PaymentQrDB.ensure_at_least_one_enabled(staff["id"], "agent")

        return success_response("收款码删除成功")
    except Exception as exc:
        logger.error(f"删除代理收款码失败: {exc}")
        return error_response("删除收款码失败", 500)


@router.get("/payment-qr")
async def get_payment_qr(address_id: str = None, building_id: str = None, request: Request = None):
    """根据地址信息获取对应的收款码。"""
    user = get_current_user_from_cookie(request)
    if not user:
        return error_response("未登录", 401)

    try:
        query_address_id = address_id
        query_building_id = building_id
        if not query_address_id or not query_building_id:
            profile = UserProfileDB.get_shipping(user["id"])
            if profile:
                query_address_id = query_address_id or profile.get("address_id")
                query_building_id = query_building_id or profile.get("building_id")

        validation = check_address_and_building(query_address_id, query_building_id)
        if not validation.get("is_valid"):
            reason = validation.get("reason")
            if reason in ("missing_address", "missing_building"):
                message = validation.get("message") or "请先选择配送地址"
            else:
                message = "地址不存在或未启用，请联系管理员"
            return error_response(message, 400)

        address_id = validation.get("address", {}).get("id") if validation.get("address") else query_address_id
        building_id = validation.get("building", {}).get("id") if validation.get("building") else query_building_id

        qr_owner_id = None
        qr_owner_type = None

        if building_id:
            assignment_map = AgentAssignmentDB.get_assignment_map_for_buildings([building_id])
            agent_id = assignment_map.get(building_id)

            if agent_id:
                qr_owner_id = agent_id
                qr_owner_type = "agent"
            else:
                qr_owner_id = "admin"
                qr_owner_type = "admin"
        else:
            qr_owner_id = "admin"
            qr_owner_type = "admin"

        qr = PaymentQrDB.get_random_enabled_qr(qr_owner_id, qr_owner_type)

        if not qr:
            if qr_owner_type == "agent":
                agent = AdminDB.get_admin(qr_owner_id)
                if agent and agent.get("payment_qr_path"):
                    return success_response(
                        "获取收款码成功",
                        {
                            "payment_qr": {
                                "image_path": agent["payment_qr_path"],
                                "name": f"{agent.get('name', qr_owner_id)}的收款码",
                                "owner_type": qr_owner_type,
                            }
                        },
                    )

            return success_response("获取收款码成功", {"payment_qr": {"name": "无收款码", "owner_type": "default"}})

        return success_response("获取收款码成功", {"payment_qr": qr})

    except Exception as exc:
        logger.error(f"获取收款码失败: {exc}")
        return error_response("获取收款码失败", 500)


@router.get("/orders/{order_id}/payment-qr")
async def get_order_payment_qr(order_id: str, request: Request):
    """获取订单对应的收款码。"""
    user = get_current_user_from_cookie(request)
    if not user:
        return error_response("未登录", 401)

    try:
        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)

        if order["student_id"] != user["id"]:
            return error_response("无权限访问该订单", 403)

        return await get_payment_qr(address_id=order.get("address_id"), building_id=order.get("building_id"), request=request)

    except Exception as exc:
        logger.error(f"获取订单收款码失败: {exc}")
        return error_response("获取收款码失败", 500)
