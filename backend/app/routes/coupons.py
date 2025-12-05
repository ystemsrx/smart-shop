from typing import Optional

from fastapi import APIRouter, Request

from auth import error_response, get_current_admin_required_from_cookie, get_current_user_required_from_cookie, success_response
from database import CouponDB
from ..dependencies import (
    get_owner_id_for_staff,
    get_owner_id_from_scope,
    require_agent_with_scope,
    resolve_shopping_scope,
)
from ..services.products import resolve_single_owner_for_staff
from ..context import logger
from ..schemas import CouponIssueRequest


router = APIRouter()


@router.get("/coupons/my")
async def my_coupons(request: Request):
    """
    获取当前用户可用的优惠券列表。
    仅返回当前配送范围对应代理发放的优惠券。
    """
    user = get_current_user_required_from_cookie(request)
    try:
        scope = resolve_shopping_scope(request)
        owner_id = get_owner_id_from_scope(scope)

        coupons = CouponDB.get_active_for_student(user["id"], owner_id=owner_id, restrict_owner=True) or []
        return success_response("获取优惠券成功", {"coupons": coupons})
    except Exception as exc:
        logger.error(f"获取优惠券失败: {exc}")
        return error_response("获取优惠券失败", 500)


@router.get("/admin/coupons")
async def admin_list_coupons(request: Request, student_id: Optional[str] = None, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        items = CouponDB.list_all(student_id, owner_id=owner_id)
        return success_response("获取优惠券列表成功", {"coupons": items})
    except Exception as exc:
        logger.error(f"管理员获取优惠券失败: {exc}")
        return error_response("获取优惠券失败", 500)


@router.get("/agent/coupons")
async def agent_list_coupons(request: Request, student_id: Optional[str] = None):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        items = CouponDB.list_all(student_id, owner_id=owner_id)
        return success_response("获取优惠券列表成功", {"coupons": items})
    except Exception as exc:
        logger.error(f"代理获取优惠券失败: {exc}")
        return error_response("获取优惠券失败", 500)


@router.post("/admin/coupons/issue")
async def admin_issue_coupons(payload: CouponIssueRequest, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        amt = float(payload.amount)
        if amt <= 0:
            return error_response("金额必须大于0", 400)
        qty = int(payload.quantity or 1)
        if qty <= 0 or qty > 200:
            return error_response("发放数量需为 1-200", 400)
        expires_at = None
        if payload.expires_at:
            try:
                from datetime import datetime as _dt

                try:
                    dt = _dt.fromisoformat(payload.expires_at)
                except Exception:
                    dt = _dt.strptime(payload.expires_at, "%Y-%m-%d %H:%M:%S")
                expires_at = dt.strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                return error_response("无效的过期时间格式", 400)
        ids = CouponDB.issue_coupons(payload.student_id, amt, qty, expires_at, owner_id=owner_id)
        if not ids:
            return error_response("发放失败，学号不存在或其他错误", 400)
        return success_response("发放成功", {"issued": len(ids), "coupon_ids": ids})
    except Exception as exc:
        logger.error(f"发放优惠券失败: {exc}")
        return error_response("发放优惠券失败", 500)


@router.post("/agent/coupons/issue")
async def agent_issue_coupons(payload: CouponIssueRequest, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        amt = float(payload.amount)
        if amt <= 0:
            return error_response("金额必须大于0", 400)
        qty = int(payload.quantity or 1)
        if qty <= 0 or qty > 200:
            return error_response("发放数量需为 1-200", 400)
        expires_at = None
        if payload.expires_at:
            try:
                from datetime import datetime as _dt

                try:
                    dt = _dt.fromisoformat(payload.expires_at)
                except Exception:
                    dt = _dt.strptime(payload.expires_at, "%Y-%m-%d %H:%M:%S")
                expires_at = dt.strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                return error_response("无效的过期时间格式", 400)
        ids = CouponDB.issue_coupons(payload.student_id, amt, qty, expires_at, owner_id=owner_id)
        if not ids:
            return error_response("发放失败，学号不存在或其他错误", 400)
        return success_response("发放成功", {"issued": len(ids), "coupon_ids": ids})
    except Exception as exc:
        logger.error(f"代理发放优惠券失败: {exc}")
        return error_response("发放优惠券失败", 500)


@router.patch("/admin/coupons/{coupon_id}/revoke")
async def admin_revoke_coupon(coupon_id: str, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        ok = CouponDB.revoke(coupon_id, owner_id)
        if not ok:
            return error_response("撤回失败或已撤回/不存在", 400)
        return success_response("已撤回")
    except Exception as exc:
        logger.error(f"撤回优惠券失败: {exc}")
        return error_response("撤回失败", 500)


@router.patch("/agent/coupons/{coupon_id}/revoke")
async def agent_revoke_coupon(coupon_id: str, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        ok = CouponDB.revoke(coupon_id, owner_id)
        if not ok:
            return error_response("撤回失败或已撤回/不存在", 400)
        return success_response("已撤回")
    except Exception as exc:
        logger.error(f"代理撤回优惠券失败: {exc}")
        return error_response("撤回失败", 500)


@router.delete("/admin/coupons/{coupon_id}")
async def admin_delete_coupon(coupon_id: str, request: Request, owner_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    owner_id, _ = resolve_single_owner_for_staff(admin, owner_id)
    try:
        ok = CouponDB.permanently_delete_coupon(coupon_id, owner_id)
        if not ok:
            return error_response("删除失败，可能优惠券不存在或未撤回", 400)
        return success_response("已删除")
    except Exception as exc:
        logger.error(f"删除优惠券失败: {exc}")
        return error_response("删除失败", 500)


@router.delete("/agent/coupons/{coupon_id}")
async def agent_delete_coupon(coupon_id: str, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        ok = CouponDB.permanently_delete_coupon(coupon_id, owner_id)
        if not ok:
            return error_response("删除失败，可能优惠券不存在或未撤回", 400)
        return success_response("已删除")
    except Exception as exc:
        logger.error(f"代理删除优惠券失败: {exc}")
        return error_response("删除失败", 500)
