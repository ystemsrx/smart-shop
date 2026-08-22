from urllib.parse import urlencode

from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse

from auth import (
    AuthError,
    AuthManager,
    OIDC_HANDOFF_COOKIE,
    OIDC_STATE_COOKIE,
    clear_auth_cookie,
    error_response,
    get_current_admin_from_cookie,
    get_current_admin_required_from_cookie,
    get_current_staff_from_cookie,
    get_current_user_from_cookie,
    set_auth_cookie,
    success_response,
)
from database import AdminDB, SalesCycleDB, SettingsDB, UserDB
from config import get_settings
from ..context import logger
from ..schemas import (
    AdminLoginRequest,
    CaptchaDiscardRequest,
    CaptchaChallengeRequest,
    CaptchaVerifyRequest,
    LoginRequest,
    RegisterRequest,
)
from ..services.captcha import CaptchaError, CaptchaService
from ..services.registration_validation_runtime import (
    get_registration_username_placeholder,
    validate_registration_username,
)
from ..utils import is_truthy


router = APIRouter()
settings = get_settings()


@router.post("/auth/captcha/challenge")
async def create_captcha_challenge(request: Request, payload: CaptchaChallengeRequest):
    """创建验证码挑战。"""
    try:
        result = await CaptchaService.create_challenge(request, payload.scene)
        return success_response("获取验证码挑战成功", result)
    except CaptchaError as exc:
        return error_response(exc.message, exc.status_code)
    except Exception as exc:
        logger.error("Failed to create captcha challenge: %s", exc)
        return error_response("创建验证码挑战失败", 500)


@router.post("/auth/captcha/verify")
async def verify_captcha_challenge(request: Request, payload: CaptchaVerifyRequest):
    """验证验证码挑战并签发一次性凭证。"""
    try:
        result = await CaptchaService.verify_challenge_and_issue_token(
            request=request,
            challenge_id=payload.challenge_id,
            scene=payload.scene,
            verify_payload={
                "x": payload.x,
                "y": payload.y,
                "slider_offset_x": payload.slider_offset_x,
                "duration": payload.duration,
                "trail": payload.trail,
            },
        )
        return success_response("验证码验证成功", result)
    except CaptchaError as exc:
        return error_response(exc.message, exc.status_code)
    except Exception as exc:
        logger.error("Captcha verification failed: %s", exc)
        return error_response("验证码验证失败", 500)


@router.post("/auth/captcha/discard")
async def discard_captcha_challenge(request: Request, payload: CaptchaDiscardRequest):
    """主动废弃验证码挑战并清理相关图片。"""
    try:
        removed = await CaptchaService.discard_challenge(
            request=request,
            challenge_id=payload.challenge_id,
            scene=payload.scene,
        )
        return success_response("验证码挑战已处理", {"removed": removed})
    except CaptchaError as exc:
        return error_response(exc.message, exc.status_code)
    except Exception as exc:
        logger.error("Failed to discard captcha challenge: %s", exc)
        return error_response("验证码挑战废弃失败", 500)


@router.post("/auth/login")
async def login(http_request: Request, request: LoginRequest, response: Response):
    """用户登录。"""
    try:
        requires_captcha = await CaptchaService.should_require_login_captcha(http_request)
        if requires_captcha:
            await CaptchaService.consume_pass_token(http_request, request.captcha_token, scene="login")

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

        handoff = result.pop("_sso_handoff", None)
        set_auth_cookie(response, result["access_token"])
        if handoff:
            _set_oidc_handoff_cookie(response, handoff)
            result["sso_upgrade_url"] = AuthManager.oidc_login_url()
        return success_response("登录成功", result)

    except AuthError as exc:
        return error_response(exc.message, exc.status_code)
    except CaptchaError as exc:
        return error_response(exc.message, exc.status_code)
    except Exception as exc:
        logger.error("User login failed: %s", exc)
        return error_response("登录失败，请稍后重试", 500)


@router.post("/auth/admin-login")
async def admin_login(http_request: Request, request: AdminLoginRequest, response: Response):
    """管理员登录。"""
    try:
        requires_captcha = await CaptchaService.should_require_login_captcha(http_request)
        if requires_captcha:
            await CaptchaService.consume_pass_token(http_request, request.captcha_token, scene="login")

        try:
            result = AuthManager.login_admin(request.admin_id, request.password)
        except AuthError as exc:
            return error_response(exc.message, exc.status_code)
        if not result:
            return error_response("账号或密码错误", 401)

        set_auth_cookie(response, result["access_token"])
        return success_response("管理员登录成功", result)

    except CaptchaError as exc:
        return error_response(exc.message, exc.status_code)
    except Exception as exc:
        logger.error("Admin login failed: %s", exc)
        return error_response("管理员登录失败，请稍后重试", 500)


@router.get("/auth/oidc/status")
async def oidc_status():
    """返回统一身份登录是否可用。"""
    return success_response("获取成功", {"enabled": AuthManager.oidc_enabled()})


@router.get("/auth/oidc/login")
async def oidc_login(request: Request, redirect: str = "/c", passive: bool = False):
    """发起统一身份登录。"""
    try:
        handoff = AuthManager.normalize_sso_handoff(
            request.cookies.get(OIDC_HANDOFF_COOKIE, "")
        )
        authorization_url, state_cookie = await AuthManager.create_oidc_authorization(
            redirect,
            handoff,
            passive,
        )
        response = RedirectResponse(authorization_url, status_code=302)
        _clear_oidc_handoff_cookie(response)
        response.set_cookie(
            key=OIDC_STATE_COOKIE,
            value=state_cookie,
            max_age=10 * 60,
            httponly=True,
            secure=not settings.is_development,
            samesite="lax",
            path="/auth/oidc",
        )
        return response
    except AuthError:
        return _oidc_error_redirect(
            fallback_redirect=(
                redirect
                if handoff
                else _passive_login_redirect(redirect)
                if passive
                else None
            ),
            clear_handoff=True,
        )
    except Exception as exc:
        logger.error("Failed to start OIDC login: %s", exc)
        return _oidc_error_redirect(
            fallback_redirect=(
                redirect
                if handoff
                else _passive_login_redirect(redirect)
                if passive
                else None
            ),
            clear_handoff=True,
        )


@router.get("/auth/oidc/callback")
async def oidc_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    """完成统一身份登录并建立现有业务会话。"""
    if error or not code or not state:
        return _oidc_error_redirect(
            request=request,
            state=state,
            clear_state=True,
        )
    try:
        state_cookie = request.cookies.get(OIDC_STATE_COOKIE, "")
        claims, redirect_path = await AuthManager.exchange_oidc_code(code, state, state_cookie)
        result = AuthManager.login_oidc(claims)
        if not result:
            return _oidc_error_redirect(
                request=request,
                state=state,
                clear_state=True,
            )
        account = result.get("agent") or result.get("admin") or result.get("user") or {}
        if account.get("type") == "admin":
            redirect_path = "/admin/dashboard"
        elif account.get("type") == "agent":
            redirect_path = "/agent/dashboard"
        target = f"{settings.oidc_frontend_url.rstrip('/')}{redirect_path}"
        response = RedirectResponse(target, status_code=302)
        _clear_oidc_state_cookie(response)
        set_auth_cookie(response, result["access_token"])
        return response
    except AuthError as exc:
        logger.warning("OIDC login rejected: %s", exc.message)
        return _oidc_error_redirect(
            request=request,
            state=state,
            clear_state=True,
        )
    except Exception as exc:
        logger.error("OIDC callback failed: %s", exc)
        return _oidc_error_redirect(
            request=request,
            state=state,
            clear_state=True,
        )


@router.get("/auth/oidc/logout")
async def oidc_logout():
    """清除应用会话并发起统一注销。"""
    try:
        target = await AuthManager.create_oidc_logout_url()
    except Exception as exc:
        logger.warning("OIDC logout fallback: %s", exc)
        target = f"{settings.oidc_frontend_url.rstrip('/')}/login" if settings.oidc_frontend_url else "/"
    response = RedirectResponse(target, status_code=302)
    clear_auth_cookie(response)
    _clear_oidc_state_cookie(response)
    return response


def _oidc_error_redirect(
    request: Request | None = None,
    state: str = "",
    fallback_redirect: str | None = None,
    clear_state: bool = False,
    clear_handoff: bool = False,
) -> RedirectResponse:
    redirect_path = fallback_redirect
    if request and state:
        try:
            payload = AuthManager.decode_oidc_state(
                state,
                request.cookies.get(OIDC_STATE_COOKIE, ""),
            )
            if payload.get("passive"):
                redirect_path = _passive_login_redirect(
                    payload.get("redirect") or "/c"
                )
            elif payload.get("upgrade"):
                redirect_path = payload.get("redirect") or "/c"
        except AuthError:
            pass
    if redirect_path and settings.oidc_frontend_url:
        safe_redirect = (
            redirect_path
            if redirect_path.startswith("/") and not redirect_path.startswith("//")
            else "/c"
        )
        response = RedirectResponse(
            f"{settings.oidc_frontend_url.rstrip('/')}{safe_redirect}",
            status_code=302,
        )
    elif not settings.oidc_frontend_url:
        response = RedirectResponse("/", status_code=302)
    else:
        query = urlencode({"oidc_error": "1"})
        response = RedirectResponse(
            f"{settings.oidc_frontend_url.rstrip('/')}/login?{query}",
            status_code=302,
        )
    if clear_state:
        _clear_oidc_state_cookie(response)
    if clear_handoff:
        _clear_oidc_handoff_cookie(response)
    return response


def _clear_oidc_state_cookie(response: Response) -> None:
    response.delete_cookie(key=OIDC_STATE_COOKIE, path="/auth/oidc")


def _set_oidc_handoff_cookie(response: Response, handoff: str) -> None:
    response.set_cookie(
        key=OIDC_HANDOFF_COOKIE,
        value=handoff,
        max_age=90,
        httponly=True,
        secure=not settings.is_development,
        samesite="lax",
        path="/auth/oidc",
    )


def _clear_oidc_handoff_cookie(response: Response) -> None:
    response.delete_cookie(key=OIDC_HANDOFF_COOKIE, path="/auth/oidc")


def _passive_login_redirect(redirect: str) -> str:
    safe_redirect = (
        redirect
        if redirect.startswith("/") and not redirect.startswith("//")
        else "/c"
    )
    return f"/login?{urlencode({'sso_checked': '1', 'redirect': safe_redirect})}"


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
        cycle_locked = SalesCycleDB.is_locked("admin", "admin")
        return success_response(
            "获取注册状态成功",
            {
                "enabled": enabled,
                "reservation_enabled": reservation_enabled,
                "cycle_locked": cycle_locked,
                "username_placeholder": get_registration_username_placeholder(),
            },
        )
    except Exception as exc:
        logger.error("Failed to fetch registration status: %s", exc)
        return error_response("获取注册状态失败", 500)


@router.post("/auth/register")
async def register_user(http_request: Request, request: RegisterRequest, response: Response):
    """用户注册。"""
    try:
        await CaptchaService.consume_pass_token(http_request, request.captcha_token, scene="register")

        enabled = SettingsDB.get("registration_enabled", "false").lower() == "true"
        if not enabled:
            return error_response("注册功能未启用", 403)

        username = request.username.strip()
        password = request.password.strip()

        username_validation = validate_registration_username(username)
        if not username_validation.passed:
            return error_response(username_validation.message, 400)

        import re

        if len(password) < 6:
            return error_response("密码至少需要6个字符", 400)

        has_letter = bool(re.search(r"[a-zA-Z]", password))
        has_digit = bool(re.search(r"\d", password))

        if not (has_letter and has_digit):
            return error_response("密码必须包含数字和字母", 400)

        existing_user = UserDB.get_user(username)
        if existing_user:
            return error_response("用户已存在", 400)

        existing_admin = AdminDB.get_admin(username)
        if existing_admin:
            return error_response("用户已存在", 400)

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

    except CaptchaError as exc:
        return error_response(exc.message, exc.status_code)
    except Exception as exc:
        logger.error("User registration failed: %s", exc)
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

        current_reservation = SettingsDB.get("shop_reservation_enabled", "false") == "true"
        if reservation_value is not None and reservation_value != current_reservation:
            if SalesCycleDB.is_locked("admin", "admin"):
                return error_response("当前周期已结束，暂不支持调整预约设置", 400)

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
        logger.error("Failed to update registration settings: %s", exc)
        return error_response("更新注册设置失败", 500)
