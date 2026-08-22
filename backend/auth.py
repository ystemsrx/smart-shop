# /backend/auth.py
import os
import base64
import hashlib
import jwt
import httpx
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from urllib.parse import urlencode, urlparse, urlunparse
from fastapi import HTTPException, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt as jose_jwt
from database import UserDB, AdminDB, AddressDB, AgentAssignmentDB, BuildingDB
from config import get_settings

# 配置
settings = get_settings()
SECRET_KEY = settings.jwt_secret_key
ALGORITHM = settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_DAYS = settings.access_token_expire_days

# 第三方登录API配置
LOGIN_API = settings.login_api
LOGIN_API_TOKEN = settings.login_api_token
OIDC_STATE_COOKIE = "smart_shop_oidc_state"
OIDC_HANDOFF_COOKIE = "smart_shop_sso_handoff"
OIDC_PASSIVE_LOGIN_HINT = "lc-passive-v1"

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)
_oidc_metadata_cache: Optional[Dict[str, Any]] = None
_oidc_jwks_cache: Optional[Dict[str, Any]] = None


async def _get_oidc_metadata(force: bool = False) -> Dict[str, Any]:
    global _oidc_metadata_cache
    if _oidc_metadata_cache is not None and not force:
        return _oidc_metadata_cache
    if not settings.oidc_issuer:
        raise AuthError("统一身份登录未配置", 503)
    discovery_url = f"{settings.oidc_issuer.rstrip('/')}/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
        response = await client.get(discovery_url)
        response.raise_for_status()
        payload = response.json()
    if payload.get("issuer") != settings.oidc_issuer:
        raise AuthError("统一身份服务配置不匹配", 503)
    _oidc_metadata_cache = payload
    return payload


async def _get_oidc_jwks(metadata: Dict[str, Any], force: bool = False) -> Dict[str, Any]:
    global _oidc_jwks_cache
    if _oidc_jwks_cache is not None and not force:
        return _oidc_jwks_cache
    jwks_uri = metadata.get("jwks_uri")
    if not jwks_uri:
        raise AuthError("统一身份服务缺少签名密钥地址", 503)
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
        response = await client.get(jwks_uri)
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload.get("keys"), list) or not payload["keys"]:
        raise AuthError("统一身份服务签名密钥无效", 503)
    _oidc_jwks_cache = payload
    return payload


class AuthError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class AuthManager:
    """认证管理器"""
    
    @staticmethod
    def create_access_token(data: Dict[str, Any]) -> str:
        """创建JWT访问令牌"""
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    
    @staticmethod
    def verify_token(token: str) -> Optional[Dict[str, Any]]:
        """验证JWT令牌"""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("Token expired")
            return None
        except jwt.PyJWTError as e:
            logger.warning("Token validation failed: %s", e)
            return None
    
    @staticmethod
    async def verify_login(
        student_id: str,
        password: str,
        create_sso_handoff: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """验证登录API"""
        if not LOGIN_API:
            logger.info("LOGIN_API is not configured; skipping third-party login verification")
            return None
        try:
            # 构建完整的headers以模拟微信小程序环境（可修改）
            headers = {
                "Content-Type": "application/json",
                "Accept": "*/*",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                              "Chrome/107.0.0.0 Safari/537.36",
                "Referer": "",
                # 关闭压缩，避免上游返回 br/deflate 造成兼容性差异
                "Accept-Encoding": "identity",
                "Accept-Language": "zh-CN,zh;q=0.9"
            }
            if LOGIN_API_TOKEN:
                headers["Authorization"] = f"Bearer {LOGIN_API_TOKEN}"
            
            payload = {
                "account": student_id,
                "password": password
            }
            if create_sso_handoff:
                payload["create_sso_handoff"] = True
            
            # 配置httpx客户端以正确处理压缩响应
            async with httpx.AsyncClient(
                 timeout=10.0,
                 follow_redirects=True  # 跟随重定向
             ) as client:
                response = await client.post(
                    LOGIN_API,
                    json=payload,
                    headers=headers
                )
                
                if response.status_code == 200:
                    try:
                        # 获取原始响应内容
                        raw_content = response.content
                        response_headers = response.headers

                        # 检查是否为压缩响应
                        content_encoding = response_headers.get('content-encoding', '').lower()
                        
                        # 处理压缩内容 - 优先尝试解压缩
                        if content_encoding in ['gzip', 'deflate', 'br']:
                            decompression_success = False
                            try:
                                if content_encoding == 'gzip':
                                    import gzip
                                    decompressed_content = gzip.decompress(raw_content)
                                    decompression_success = True
                                    
                                elif content_encoding == 'deflate':
                                    import zlib
                                    decompressed_content = zlib.decompress(raw_content)
                                    decompression_success = True
                                    
                                elif content_encoding == 'br':
                                    try:
                                        import brotli
                                        decompressed_content = brotli.decompress(raw_content)
                                        decompression_success = True
                                    except ImportError:
                                        logger.error("Brotli package is missing; install it with: pip install brotli")
                                
                                if decompression_success:
                                    raw_content = decompressed_content
                                
                            except Exception as decompress_error:
                                logger.warning("Response decompression failed: %s", decompress_error)
                                
                                # 检查原始数据是否看起来像未压缩的JSON
                                if (len(raw_content) > 0 and 
                                    raw_content[0:1] in [b'{', b'['] and 
                                    raw_content[-1:] in [b'}', b']']):
                                    logger.info("Raw response looks like uncompressed JSON; upstream may be misconfigured")
                                else:
                                    logger.error("Raw response is not valid JSON")
                        
                        # 不再对未声明编码的内容进行启发式解压，交由 httpx/default 处理
                        
                        # 现在尝试解码为文本
                        try:
                            # 首先尝试以UTF-8解码
                            response_text = raw_content.decode('utf-8')
                        except UnicodeDecodeError:
                            # 如果UTF-8失败，尝试其他编码
                            logger.warning("UTF-8 decoding failed, trying fallback encodings")
                            
                            # 尝试常见的中文编码
                            for encoding in ['gb2312', 'gbk', 'big5', 'latin-1']:
                                try:
                                    response_text = raw_content.decode(encoding)
                                    break
                                except UnicodeDecodeError:
                                    continue
                            else:
                                # 所有编码都失败，使用错误替换模式
                                response_text = raw_content.decode('utf-8', errors='replace')
                                logger.warning("Decoded response using replacement characters")
                        
                        # 检查响应内容是否为空或损坏
                        if not response_text.strip():
                            logger.error("Login API returned an empty response")
                            raise AuthError("认证服务暂时不可用，请稍后重试", 503)
                        
                        # 尝试解析JSON
                        try:
                            import json
                            data = json.loads(response_text)
                        except json.JSONDecodeError as e:
                            logger.error("Failed to parse login API JSON: %s", e)
                            raise AuthError("认证服务暂时不可用，请稍后重试", 503) from e
                        
                        # 检查API返回的success字段
                        if data.get("success") and data.get("code") == 200:
                            # 成功登录，提取用户信息
                            user_data = data.get("data", {})
                            result = {
                                "student_id": student_id,
                                "name": user_data.get("name", "未知用户"),
                                "verified": True,
                                "account_id": user_data.get("accountId", ""),
                                "avatar_url": user_data.get("avatarUrl", ""),
                                "id_number": user_data.get("idNumber")
                            }
                            handoff = AuthManager.normalize_sso_handoff(user_data.get("ssoHandoff"))
                            if create_sso_handoff and handoff:
                                result["_sso_handoff"] = handoff
                            return result
                        else:
                            upstream_code = str(data.get("code") or "").upper()
                            if upstream_code in {
                                "403",
                                "ACCOUNT_DISABLED",
                                "CAMPUS_AUTH_FORBIDDEN",
                            }:
                                raise AuthError("账号不可用", 403)
                            if upstream_code in {
                                "429",
                                "RATE_LIMITED",
                            }:
                                raise AuthError("请稍后重试", 429)
                            if upstream_code in {
                                "500",
                                "502",
                                "503",
                                "504",
                                "CAMPUS_AUTH_UNAVAILABLE",
                            }:
                                raise AuthError("认证服务暂时不可用，请稍后重试", 503)

                            # 兼容使用 HTTP 200 表示账号验证失败的旧登录 API
                            error_msg = data.get("msg") or data.get("message") or "Login failed"
                            logger.warning(
                                "Login API rejected credentials for %s: %s (status=%s)",
                                student_id,
                                error_msg,
                                response.status_code,
                            )
                            return None
                    except AuthError:
                        raise
                    except Exception as decode_error:
                        logger.error("Failed to process login API response: %s", decode_error)
                        raise AuthError("认证服务暂时不可用，请稍后重试", 503) from decode_error
                        
                elif response.status_code == 401:
                    logger.warning("Login API returned 401 for %s", student_id)
                    return None
                elif response.status_code == 403:
                    logger.warning("Login API returned 403 for %s", student_id)
                    raise AuthError("账号不可用", 403)
                elif response.status_code == 429:
                    logger.warning("Login API rate limited %s", student_id)
                    raise AuthError("请稍后重试", 429)
                else:
                    logger.error("Unexpected login API status: %s", response.status_code)
                    try:
                        logger.error("Login API error response: %s", response.text[:200])
                    except Exception:
                        logger.error("Failed to decode login API error response")
                    raise AuthError("认证服务暂时不可用，请稍后重试", 503)
                    
        except httpx.TimeoutException as exc:
            logger.error("Login API timeout")
            raise AuthError("认证服务暂时不可用，请稍后重试", 503) from exc
        except AuthError:
            raise
        except Exception as e:
            logger.error("Login API request failed: %s", e)
            raise AuthError("认证服务暂时不可用，请稍后重试", 503) from e
    
    @staticmethod
    async def login_user(student_id: str, password: str) -> Optional[Dict[str, Any]]:
        """用户登录流程"""
        def _clean_id_number(value: Any) -> Optional[str]:
            if value is None:
                return None
            text = str(value).strip()
            return text or None

        # 1. 首先检查本地数据库中是否存在用户
        local_user = UserDB.get_user(student_id)
        id_status = UserDB.normalize_id_status(local_user.get('id_status') if local_user else None)
        api_result: Optional[Dict[str, Any]] = None
        api_check_attempted = False
        # 使用 verify_user 验证密码（支持加密密码）
        is_local_password_valid = bool(UserDB.verify_user(student_id, password))

        async def _ensure_identity(current_user: Optional[Dict[str, Any]], payload: Optional[Dict[str, Any]]) -> int:
            """仅在状态为0时尝试获取身份证号"""
            status_now = UserDB.normalize_id_status(current_user.get('id_status') if current_user else None)
            if status_now != 0:
                return status_now

            nonlocal api_result, api_check_attempted
            active_payload = payload or api_result
            if active_payload is None:
                api_check_attempted = True
                active_payload = await AuthManager.verify_login(
                    student_id,
                    password,
                    create_sso_handoff=AuthManager.sso_upgrade_enabled(),
                )
                api_result = active_payload

            id_number_value = _clean_id_number(active_payload.get('id_number') if active_payload else None) if active_payload else None
            new_status = 1 if id_number_value else 2
            UserDB.update_user_identity(student_id, id_number_value, new_status)
            return new_status
        
        if local_user and is_local_password_valid:
            logger.info("User %s logged in with local credentials", student_id)
            if id_status == 0:
                # 老数据：本地密码正确，但需要获取身份证号
                try:
                    id_status = await _ensure_identity(local_user, None)
                    local_user = UserDB.get_user(student_id)
                except AuthError as exc:
                    logger.warning(
                        "Optional identity refresh unavailable for %s: %s",
                        student_id,
                        exc.message,
                    )
        else:
            # 本地密码不匹配或用户不存在，尝试第三方API验证
            logger.info("User %s requires third-party API verification", student_id)
            api_check_attempted = True
            api_result = await AuthManager.verify_login(
                student_id,
                password,
                create_sso_handoff=AuthManager.sso_upgrade_enabled(),
            )
            if not api_result:
                logger.warning("Third-party API verification failed for %s", student_id)
                return None
            logger.info("Third-party API verification succeeded for %s", student_id)
            # 远端成功后，首次登录/凭据失效：无论原状态为何都重新写入身份证状态
            id_number_value = _clean_id_number(api_result.get('id_number'))
            new_status = 1 if id_number_value else 2
            UserDB.update_user_identity(student_id, id_number_value, new_status)
            id_status = new_status
        
        # 3. 第三方验证成功，更新或创建本地用户记录
        if local_user:
            if not is_local_password_valid and api_result:
                logger.info("Updating local password for %s", student_id)
                UserDB.update_user_password(student_id, password)
                if local_user['name'] != api_result['name']:
                    UserDB.update_user_name(student_id, api_result['name'])

                # 凭据失效后走远端，按远端结果更新身份证状态（不论原状态为何）
                id_number_value = _clean_id_number(api_result.get('id_number')) if api_result else None
                new_status = 1 if id_number_value else 2
                UserDB.update_user_identity(student_id, id_number_value, new_status)
                id_status = new_status

            local_user = UserDB.get_user(student_id)
        else:
            # 用户不存在，创建新用户
            logger.info("Creating new user %s", student_id)
            id_number_value = _clean_id_number(api_result.get('id_number') if api_result else None)
            create_status = 1 if id_number_value else 2
            success = UserDB.create_user(
                student_id=student_id,
                password=password,
                name=api_result['name'] if api_result else student_id,
                id_number=id_number_value,
                id_status=create_status
            )
            if not success:
                logger.error("Failed to create user %s", student_id)
                return None
            local_user = UserDB.get_user(student_id)
        
        if AuthManager.sso_upgrade_enabled() and not api_check_attempted:
            api_check_attempted = True
            try:
                api_result = await AuthManager.verify_login(
                    student_id,
                    password,
                    create_sso_handoff=True,
                )
            except AuthError as exc:
                logger.warning(
                    "Optional SSO upgrade unavailable for %s: %s",
                    student_id,
                    exc.message,
                )
                api_result = None

        # 4. 生成JWT令牌
        def _format_created_at(value: Any) -> Any:
            """格式化时间为UTC+8字符串"""
            try:
                if value is None:
                    return None
                if isinstance(value, datetime):
                    dt = value
                else:
                    txt = str(value).replace('T', ' ')
                    dt = datetime.fromisoformat(txt)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                dt_cn = dt.astimezone(timezone(timedelta(hours=8)))
                return dt_cn.strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                return value

        token_data = {
            "sub": student_id,
            "type": "user",
            "name": local_user['name']
        }
        access_token = AuthManager.create_access_token(token_data)

        user_payload = {
            "id": local_user['id'],
            "name": local_user['name'],
            "created_at": _format_created_at(local_user.get('created_at')),
            "id_number": local_user.get('id_number'),
            "id_status": UserDB.normalize_id_status(local_user.get('id_status'))
        }
        
        result = {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_payload
        }
        sso_handoff = AuthManager.normalize_sso_handoff(
            api_result.get("_sso_handoff") if api_result else None
        )
        if sso_handoff:
            result["_sso_handoff"] = sso_handoff
        return result

    @staticmethod
    def oidc_enabled() -> bool:
        return bool(
            settings.oidc_issuer
            and settings.oidc_client_id
            and settings.oidc_client_secret
            and settings.oidc_redirect_uri
            and settings.oidc_frontend_url
        )

    @staticmethod
    def sso_upgrade_enabled() -> bool:
        return AuthManager.oidc_enabled() and bool(LOGIN_API)

    @staticmethod
    def normalize_sso_handoff(value: Any) -> Optional[str]:
        handoff = str(value or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9._~-]{20,255}", handoff):
            return None
        return handoff

    @staticmethod
    def oidc_login_url() -> str:
        if not AuthManager.oidc_enabled():
            raise AuthError("统一身份登录未配置", 503)
        callback = urlparse(settings.oidc_redirect_uri)
        base_path = callback.path.rsplit("/", 1)[0]
        return urlunparse(
            (
                callback.scheme,
                callback.netloc,
                f"{base_path}/login",
                "",
                "",
                "",
            )
        )

    @staticmethod
    async def create_oidc_authorization(
        redirect_path: str = "/c",
        login_handoff: Optional[str] = None,
        passive: bool = False,
    ) -> tuple[str, str]:
        if not AuthManager.oidc_enabled():
            raise AuthError("统一身份登录未配置", 503)
        safe_redirect = redirect_path if redirect_path.startswith("/") and not redirect_path.startswith("//") else "/c"
        safe_handoff = AuthManager.normalize_sso_handoff(login_handoff)
        passive = bool(passive and not safe_handoff)
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(24)
        verifier = secrets.token_urlsafe(64)
        challenge = base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode("utf-8")).digest()
        ).decode("ascii").rstrip("=")
        now = datetime.now(timezone.utc)
        state_cookie = jwt.encode(
            {
                "purpose": "oidc_state",
                "state": state,
                "nonce": nonce,
                "verifier": verifier,
                "redirect": safe_redirect,
                "upgrade": bool(safe_handoff),
                "passive": passive,
                "iat": now,
                "exp": now + timedelta(minutes=10),
            },
            SECRET_KEY,
            algorithm=ALGORITHM,
        )
        metadata = await _get_oidc_metadata()
        params = {
            "client_id": settings.oidc_client_id,
            "redirect_uri": settings.oidc_redirect_uri,
            "response_type": "code",
            "scope": "openid profile email",
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        if safe_handoff:
            params["login_hint"] = safe_handoff
            if settings.oidc_idp_hint:
                params["kc_idp_hint"] = settings.oidc_idp_hint
        elif passive:
            params["login_hint"] = OIDC_PASSIVE_LOGIN_HINT
            if settings.oidc_idp_hint:
                params["kc_idp_hint"] = settings.oidc_idp_hint
        return f"{metadata['authorization_endpoint']}?{urlencode(params)}", state_cookie

    @staticmethod
    def decode_oidc_state(state: str, state_cookie: str) -> Dict[str, Any]:
        try:
            payload = jwt.decode(state_cookie, SECRET_KEY, algorithms=[ALGORITHM])
        except jwt.PyJWTError as exc:
            raise AuthError("登录请求已失效，请重新发起", 400) from exc
        expected_state = str(payload.get("state") or "")
        if (
            payload.get("purpose") != "oidc_state"
            or not expected_state
            or not secrets.compare_digest(expected_state, str(state or ""))
        ):
            raise AuthError("登录请求无效", 400)
        return payload

    @staticmethod
    async def exchange_oidc_code(
        code: str,
        state: str,
        state_cookie: str,
    ) -> tuple[Dict[str, Any], str]:
        state_payload = AuthManager.decode_oidc_state(state, state_cookie)
        metadata = await _get_oidc_metadata()
        token_payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.oidc_redirect_uri,
            "client_id": settings.oidc_client_id,
            "client_secret": settings.oidc_client_secret,
            "code_verifier": state_payload["verifier"],
        }
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
                response = await client.post(
                    metadata["token_endpoint"],
                    data=token_payload,
                    headers={"Accept": "application/json"},
                )
                response.raise_for_status()
                tokens = response.json()
            id_token = tokens.get("id_token")
            if not id_token:
                raise AuthError("统一身份服务未返回身份令牌", 502)
            jwks = await _get_oidc_jwks(metadata)
            try:
                claims = jose_jwt.decode(
                    id_token,
                    jwks,
                    algorithms=["RS256", "PS256", "ES256"],
                    audience=settings.oidc_client_id,
                    issuer=settings.oidc_issuer,
                    options={"verify_at_hash": False},
                )
            except Exception:
                jwks = await _get_oidc_jwks(metadata, force=True)
                claims = jose_jwt.decode(
                    id_token,
                    jwks,
                    algorithms=["RS256", "PS256", "ES256"],
                    audience=settings.oidc_client_id,
                    issuer=settings.oidc_issuer,
                    options={"verify_at_hash": False},
                )
            if claims.get("nonce") != state_payload.get("nonce"):
                raise AuthError("统一身份登录校验失败", 401)
            if not claims.get("sub"):
                raise AuthError("统一身份信息不完整", 401)
            return claims, state_payload.get("redirect") or "/c"
        except AuthError:
            raise
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            logger.error("OIDC code exchange failed: %s", exc)
            raise AuthError("统一身份服务暂时不可用", 503) from exc

    @staticmethod
    async def create_oidc_logout_url() -> str:
        if not AuthManager.oidc_enabled():
            raise AuthError("统一身份登录未配置", 503)
        metadata = await _get_oidc_metadata()
        endpoint = metadata.get("end_session_endpoint")
        if not endpoint:
            raise AuthError("统一身份服务不支持统一注销", 503)
        params = {
            "client_id": settings.oidc_client_id,
            "post_logout_redirect_uri": f"{settings.oidc_frontend_url.rstrip('/')}/login",
        }
        return f"{endpoint}?{urlencode(params)}"

    @staticmethod
    def oidc_roles(claims: Dict[str, Any]) -> set[str]:
        roles = set(claims.get("realm_access", {}).get("roles") or [])
        client_roles = (
            claims.get("resource_access", {})
            .get(settings.oidc_client_id or "", {})
            .get("roles")
            or []
        )
        roles.update(client_roles)
        return {str(role) for role in roles}

    @staticmethod
    def login_oidc(claims: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        username = str(
            claims.get("student_number")
            or claims.get("preferred_username")
            or ""
        ).strip()
        if not username:
            return None

        if settings.oidc_admin_role in AuthManager.oidc_roles(claims):
            admin = AdminDB.get_admin(settings.oidc_admin_username or username)
            return AuthManager._create_admin_session(admin) if admin else None

        keycloak_sub = str(claims.get("sub") or "").strip()
        identity_id = str(claims.get("identity_id") or "").strip() or None
        id_number = str(claims.get("id_number") or "").strip() or None
        name = str(claims.get("name") or username).strip() or username
        linked_user = UserDB.get_user_by_keycloak_sub(keycloak_sub)
        account_user = UserDB.get_user(username)
        if linked_user and account_user and linked_user.get("user_id") != account_user.get("user_id"):
            return None
        local_user = linked_user or account_user
        if local_user is None:
            if not UserDB.create_user(
                student_id=username,
                password=secrets.token_urlsafe(48),
                name=name,
                id_number=id_number,
                id_status=1 if id_number else 2,
            ):
                return None
        local_user = UserDB.link_oidc_identity(
            username,
            keycloak_sub,
            identity_id,
            id_number,
            name,
        )
        if not local_user:
            return None
        token_data = {
            "sub": username,
            "type": "user",
            "name": local_user["name"],
            "keycloak_sub": keycloak_sub,
        }
        access_token = AuthManager.create_access_token(token_data)
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": local_user["id"],
                "name": local_user["name"],
                "created_at": local_user.get("created_at"),
                "id_number": local_user.get("id_number"),
                "id_status": UserDB.normalize_id_status(local_user.get("id_status")),
            },
        }
    
    @staticmethod
    def login_admin(admin_id: str, password: str) -> Optional[Dict[str, Any]]:
        """管理员/代理登录"""
        admin = AdminDB.verify_admin(admin_id, password)
        if not admin:
            return None

        return AuthManager._create_admin_session(admin)

    @staticmethod
    def _create_admin_session(admin: Dict[str, Any]) -> Dict[str, Any]:
        admin_id = admin["id"]

        role = admin.get('role') or 'admin'
        account_type = 'admin' if role in ('admin', 'super_admin') else 'agent'

        if account_type == 'agent':
            assignments = AgentAssignmentDB.get_buildings_for_agent(admin.get('agent_id'))
            if not assignments:
                raise AuthError("地址不存在，请联系管理员")
            has_valid_assignment = False
            for item in assignments:
                address_id = item.get('address_id')
                building_id = item.get('building_id')
                if not address_id or not building_id:
                    continue
                addr_flag = str(item.get('address_enabled', 1)).strip().lower()
                bld_flag = str(item.get('building_enabled', 1)).strip().lower()
                if addr_flag not in ('1', 'true'):
                    continue
                if bld_flag not in ('1', 'true'):
                    continue
                has_valid_assignment = True
                break
            if not has_valid_assignment:
                raise AuthError("地址不存在，请联系管理员")

        token_version = int(admin.get('token_version', 0) or 0)

        token_data = {
            "sub": admin_id,
            "type": account_type,
            "name": admin['name'],
            "role": role,
            "token_version": token_version,
            "agent_id": admin.get("agent_id")
        }
        access_token = AuthManager.create_access_token(token_data)

        account_payload = {
            "id": admin['id'],
            "agent_id": admin.get("agent_id"),
            "name": admin['name'],
            "role": role,
            "type": account_type,
            "created_at": admin.get('created_at'),
            "payment_qr_path": admin.get('payment_qr_path'),
            "token_version": token_version
        }

        result: Dict[str, Any] = {
            "access_token": access_token,
            "token_type": "bearer",
            "admin": account_payload
        }
        if account_type == 'agent':
            result["agent"] = account_payload
        return result

def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[Dict[str, Any]]:
    """获取当前用户（可选，支持匿名访问）"""
    if not credentials:
        return None
    
    payload = AuthManager.verify_token(credentials.credentials)
    if not payload or payload.get("type") != "user":
        return None
    
    return {
        "id": payload.get("sub"),
        "name": payload.get("name"),
        "type": "user"
    }

def get_current_user_required(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """获取当前用户（必需）"""
    if not credentials:
        raise HTTPException(status_code=401, detail="未提供认证令牌")
    
    payload = AuthManager.verify_token(credentials.credentials)
    if not payload or payload.get("type") != "user":
        raise HTTPException(status_code=401, detail="无效的认证令牌")
    
    return {
        "id": payload.get("sub"),
        "name": payload.get("name"),
        "type": "user"
    }

def get_current_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """获取当前管理员"""
    if not credentials:
        raise HTTPException(status_code=401, detail="需要管理员权限")

    payload = AuthManager.verify_token(credentials.credentials)
    staff = _load_staff_from_payload(payload)
    if not staff:
        raise HTTPException(status_code=401, detail="认证已失效，请重新登录")
    if staff.get('type') != 'admin':
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return staff

def get_current_staff(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """获取当前工作人员（总管理员或代理）"""
    if not credentials:
        raise HTTPException(status_code=401, detail="需要工作人员权限")

    payload = AuthManager.verify_token(credentials.credentials)
    staff = _load_staff_from_payload(payload)
    if not staff:
        raise HTTPException(status_code=401, detail="认证已失效，请重新登录")
    return staff

def set_auth_cookie(response: Response, token: str):
    """设置认证Cookie（30天有效）"""
    # 在开发环境中不使用secure=True
    is_development = os.getenv("NODE_ENV") != "production"
    response.set_cookie(
        key="auth_token",
        value=token,
        max_age=30 * 24 * 60 * 60,  # 30天
        httponly=True,
        secure=not is_development,  # 仅在生产环境中启用HTTPS要求
        samesite="lax"
    )

def get_token_from_cookie(request: Request) -> Optional[str]:
    """从Cookie获取令牌"""
    return request.cookies.get("auth_token")


def _load_staff_from_payload(payload: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not payload:
        return None
    staff_type = payload.get("type")
    if staff_type not in ("admin", "agent"):
        return None
    admin_id = payload.get("sub")
    if not admin_id:
        return None

    admin = AdminDB.get_admin(admin_id, include_disabled=True)
    if not admin:
        return None

    try:
        if int(admin.get('is_active', 1) or 1) != 1:
            return None
    except Exception:
        return None

    expected_type = 'agent' if (admin.get('role') or '').lower() == 'agent' else 'admin'
    if expected_type != staff_type:
        return None

    try:
        token_version_db = int(admin.get('token_version', 0) or 0)
    except Exception:
        token_version_db = 0
    try:
        token_version_payload = int(payload.get('token_version', 0) or 0)
    except Exception:
        token_version_payload = 0

    if token_version_db != token_version_payload:
        return None

    if expected_type == 'agent':
        assignments = AgentAssignmentDB.get_buildings_for_agent(admin.get("agent_id"))
        has_active_assignment = False
        for assignment in assignments or []:
            addr_flag = str(assignment.get('address_enabled', 1)).strip().lower()
            bld_flag = str(assignment.get('building_enabled', 1)).strip().lower()
            addr_enabled = addr_flag in ('1', 'true')
            bld_enabled = bld_flag in ('1', 'true')
            if addr_enabled and bld_enabled:
                has_active_assignment = True
                break
        if not has_active_assignment:
            logger.warning(
                "Agent %s has no active address/building assignment; forcing logout",
                admin_id,
            )
            AdminDB.bump_token_version(admin_id)
            return None

    return {
        "id": admin.get('id'),
        "agent_id": admin.get("agent_id"),
        "name": admin.get('name'),
        "role": admin.get('role'),
        "type": expected_type,
        "payment_qr_path": admin.get('payment_qr_path'),
        "token_version": token_version_db,
        "created_at": admin.get('created_at')
    }

def get_current_user_from_cookie(request: Request) -> Optional[Dict[str, Any]]:
    """从Cookie获取当前用户"""
    token = get_token_from_cookie(request)
    if not token:
        return None
    
    payload = AuthManager.verify_token(token)
    if not payload or payload.get("type") != "user":
        return None
    
    return {
        "id": payload.get("sub"),
        "name": payload.get("name"),
        "type": "user"
    }

def get_current_admin_from_cookie(request: Request) -> Optional[Dict[str, Any]]:
    """从Cookie获取当前管理员"""
    token = get_token_from_cookie(request)
    if not token:
        return None

    payload = AuthManager.verify_token(token)
    staff = _load_staff_from_payload(payload)
    if not staff or staff.get('type') != 'admin':
        return None
    return staff

def get_current_staff_from_cookie(request: Request) -> Optional[Dict[str, Any]]:
    """从Cookie获取当前工作人员（管理员/代理）"""
    token = get_token_from_cookie(request)
    if not token:
        return None

    payload = AuthManager.verify_token(token)
    return _load_staff_from_payload(payload)

def get_current_admin_required_from_cookie(request: Request) -> Dict[str, Any]:
    """从Cookie获取当前管理员（必需）"""
    admin = get_current_admin_from_cookie(request)
    if not admin:
        raise HTTPException(status_code=401, detail="需要管理员权限")
    return admin

def get_current_staff_required_from_cookie(request: Request) -> Dict[str, Any]:
    staff = get_current_staff_from_cookie(request)
    if not staff:
        raise HTTPException(status_code=401, detail="需要工作人员权限")
    return staff

def get_current_agent_from_cookie(request: Request) -> Optional[Dict[str, Any]]:
    staff = get_current_staff_from_cookie(request)
    if not staff or staff.get('type') != 'agent':
        return None
    return staff

def is_super_admin_role(role: Optional[str]) -> bool:
    return str(role or '').lower() in ("admin", "super_admin")

def get_current_super_admin_required_from_cookie(request: Request) -> Dict[str, Any]:
    staff = get_current_staff_required_from_cookie(request)
    if not is_super_admin_role(staff.get('role')):
        raise HTTPException(status_code=403, detail="需要总管理员权限")
    return staff

def get_current_user_required_from_cookie(request: Request) -> Dict[str, Any]:
    """从Cookie获取当前用户（必需）"""
    user = get_current_user_from_cookie(request)
    if not user:
        raise HTTPException(status_code=401, detail="用户未登录")
    return user

def clear_auth_cookie(response: Response):
    """清除认证Cookie"""
    response.delete_cookie(key="auth_token")

# 响应模型
class LoginRequest:
    def __init__(self, student_id: str, password: str):
        self.student_id = student_id
        self.password = password

class AdminLoginRequest:
    def __init__(self, admin_id: str, password: str):
        self.admin_id = admin_id
        self.password = password

class AuthResponse:
    def __init__(self, success: bool, message: str, data: Optional[Dict] = None):
        self.success = success
        self.message = message
        self.data = data or {}

# 统一响应格式
def success_response(message: str = "操作成功", data: Any = None) -> Dict[str, Any]:
    """成功响应"""
    return {
        "success": True,
        "message": message,
        "data": data or {},
        "code": 200
    }

def error_response(message: str, code: int = 400, details: Any = None) -> Dict[str, Any]:
    """错误响应"""
    response = {
        "success": False,
        "message": message,
        "code": code,
        "data": {}
    }
    if details:
        response["details"] = details
    return response
