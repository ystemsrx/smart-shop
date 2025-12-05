from fastapi import APIRouter, Request, Response

from auth import (
    AuthError,
    AuthManager,
    clear_auth_cookie,
    error_response,
    get_current_admin_from_cookie,
    get_current_admin_required_from_cookie,
    get_current_staff_from_cookie,
    get_current_user_from_cookie,
    set_auth_cookie,
    success_response,
)
from database import AdminDB, SettingsDB, UserDB
from ..context import logger
from ..schemas import AdminLoginRequest, LoginRequest, RegisterRequest
from ..utils import is_truthy


router = APIRouter()


@router.post("/auth/login")
async def login(request: LoginRequest, response: Response):
    """用户登录。"""
    try:
        try:
            staff_result = AuthManager.login_admin(request.student_id, request.password)
        except AuthError as exc:
            return error_response(exc.message, exc.status_code)
        if staff_result:
            set_auth_cookie(response, staff_result["access_token"])
            return success_response("登录成功", staff_result)

        result = await AuthManager.login_user(request.student_id, request.password)
        if not result:
            return error_response("账号或密码错误", 401)

        set_auth_cookie(response, result["access_token"])
        return success_response("登录成功", result)

    except Exception as exc:
        logger.error(f"登录失败: {exc}")
        return error_response("登录失败，请稍后重试", 500)


@router.post("/auth/admin-login")
async def admin_login(request: AdminLoginRequest, response: Response):
    """管理员登录。"""
    try:
        try:
            result = AuthManager.login_admin(request.admin_id, request.password)
        except AuthError as exc:
            return error_response(exc.message, exc.status_code)
        if not result:
            return error_response("账号或密码错误", 401)

        set_auth_cookie(response, result["access_token"])
        return success_response("管理员登录成功", result)

    except Exception as exc:
        logger.error(f"管理员登录失败: {exc}")
        return error_response("管理员登录失败，请稍后重试", 500)


@router.post("/auth/logout")
async def logout(response: Response):
    """用户登出。"""
    clear_auth_cookie(response)
    return success_response("登出成功")


@router.get("/auth/me")
async def get_current_user_info(request: Request):
    """获取当前用户信息。"""
    user = get_current_user_from_cookie(request)
    if user:
        return success_response("获取用户信息成功", user)

    admin = get_current_staff_from_cookie(request)
    if admin:
        return success_response("获取工作人员信息成功", admin)

    return error_response("未登录", 401)


@router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    """刷新令牌。"""
    user = get_current_user_from_cookie(request)
    if user:
        token_data = {"sub": user["id"], "type": "user", "name": user["name"]}
        new_token = AuthManager.create_access_token(token_data)
        set_auth_cookie(response, new_token)
        return success_response("令牌刷新成功", {"access_token": new_token})

    admin = get_current_admin_from_cookie(request)
    if admin:
        token_data = {
            "sub": admin["id"],
            "type": "admin",
            "name": admin["name"],
            "role": admin["role"],
        }
        new_token = AuthManager.create_access_token(token_data)
        set_auth_cookie(response, new_token)
        return success_response("管理员令牌刷新成功", {"access_token": new_token})

    return error_response("令牌无效", 401)


@router.get("/auth/registration-status")
async def get_registration_status():
    """获取注册功能是否启用。"""
    try:
        enabled = SettingsDB.get("registration_enabled", "false").lower() == "true"
        reservation_enabled = SettingsDB.get("shop_reservation_enabled", "false") == "true"
        return success_response(
            "获取注册状态成功",
            {"enabled": enabled, "reservation_enabled": reservation_enabled},
        )
    except Exception as exc:
        logger.error(f"获取注册状态失败: {exc}")
        return error_response("获取注册状态失败", 500)


@router.post("/auth/register")
async def register_user(request: RegisterRequest, response: Response):
    """用户注册。"""
    try:
        enabled = SettingsDB.get("registration_enabled", "false").lower() == "true"
        if not enabled:
            return error_response("注册功能未启用", 403)

        username = request.username.strip()
        password = request.password.strip()

        if len(username) < 2:
            return error_response("用户名至少需要2个字符", 400)

        import re

        if len(password) < 6:
            return error_response("密码至少需要6个字符", 400)

        has_letter = bool(re.search(r"[a-zA-Z]", password))
        has_digit = bool(re.search(r"\d", password))

        if not (has_letter and has_digit):
            return error_response("密码必须包含数字和字母", 400)

        existing_user = UserDB.get_user(username)
        if existing_user:
            return error_response("用户名已存在", 400)

        existing_admin = AdminDB.get_admin(username)
        if existing_admin:
            return error_response("用户名已存在", 400)

        display_name = request.nickname.strip() if request.nickname and request.nickname.strip() else username
        success = UserDB.create_user(username, password, display_name, id_status=2)
        if not success:
            return error_response("注册失败，请稍后重试", 500)

        result = await AuthManager.login_user(username, password)
        if result:
            set_auth_cookie(response, result["access_token"])
            return success_response("注册成功，已自动登录", result)
        else:
            return error_response("注册成功但自动登录失败，请手动登录", 500)

    except Exception as exc:
        logger.error(f"用户注册失败: {exc}")
        return error_response("注册失败，请稍后重试", 500)


@router.post("/admin/registration-settings")
async def update_registration_settings(request: Request):
    """管理员更新注册/预约设置。"""
    _admin = get_current_admin_required_from_cookie(request)
    try:
        params = request.query_params or {}
        enabled_param = params.get("enabled")
        reservation_param = params.get("reservation_enabled")
        payload = {}

        content_type = request.headers.get("content-type", "").lower()
        if "application/json" in content_type:
            try:
                payload = await request.json()
            except Exception:
                payload = {}

        def resolve_bool(value):
            if value is None:
                return None
            if isinstance(value, bool):
                return value
            if isinstance(value, (int, float)):
                return bool(value)
            return is_truthy(str(value))

        enabled_value = resolve_bool(payload.get("enabled")) if "enabled" in payload else resolve_bool(enabled_param)
        reservation_value = (
            resolve_bool(payload.get("reservation_enabled")) if "reservation_enabled" in payload else resolve_bool(reservation_param)
        )

        if enabled_value is not None:
            SettingsDB.set("registration_enabled", "true" if enabled_value else "false")
        if reservation_value is not None:
            SettingsDB.set("shop_reservation_enabled", "true" if reservation_value else "false")

        current_enabled = SettingsDB.get("registration_enabled", "false").lower() == "true"
        current_reservation = SettingsDB.get("shop_reservation_enabled", "false") == "true"

        return success_response(
            "注册设置更新成功",
            {"enabled": current_enabled, "reservation_enabled": current_reservation},
        )
    except Exception as exc:
        logger.error(f"更新注册设置失败: {exc}")
        return error_response("更新注册设置失败", 500)
