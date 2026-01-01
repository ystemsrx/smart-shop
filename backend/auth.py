# /backend/auth.py
import os
import jwt
import httpx
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from fastapi import HTTPException, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import UserDB, AdminDB, AddressDB, AgentAssignmentDB, BuildingDB
from config import get_settings

# 配置
settings = get_settings()
SECRET_KEY = settings.jwt_secret_key
ALGORITHM = settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_DAYS = settings.access_token_expire_days

# 第三方登录API配置
LOGIN_API = settings.login_api

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


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
            logger.warning("Token已过期")
            return None
        except jwt.JWTError as e:
            logger.warning(f"Token验证失败: {e}")
            return None
    
    @staticmethod
    async def verify_login(student_id: str, password: str) -> Optional[Dict[str, Any]]:
        """验证登录API"""
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
            
            payload = {
                "account": student_id,
                "password": password
            }
            
            # 配置httpx客户端以正确处理压缩响应
            async with httpx.AsyncClient(
                 timeout=10.0,
                 follow_redirects=True  # 跟随重定向
             ) as client:
                logger.info(f"登录API地址: {LOGIN_API}")
                response = await client.post(
                    LOGIN_API,
                    json=payload,
                    headers=headers
                )
                
                # 记录响应的基本信息用于调试
                logger.debug(f"API响应状态: {response.status_code}")
                logger.debug(f"API响应头: {dict(response.headers)}")
                
                if response.status_code == 200:
                    try:
                        # 获取原始响应内容
                        raw_content = response.content
                        response_headers = response.headers
                        
                        # 记录原始内容的十六进制信息用于调试
                        hex_preview = ' '.join(f'{b:02x}' for b in raw_content[:20])
                        logger.debug(f"响应内容前20字节(hex): {hex_preview}")
                        
                        # 检查是否为压缩响应
                        content_encoding = response_headers.get('content-encoding', '').lower()
                        logger.debug(f"Content-Encoding: {content_encoding}")
                        
                        # 处理压缩内容 - 优先尝试解压缩
                        if content_encoding in ['gzip', 'deflate', 'br']:
                            decompression_success = False
                            try:
                                if content_encoding == 'gzip':
                                    import gzip
                                    logger.info("检测到gzip压缩，正在解压缩...")
                                    decompressed_content = gzip.decompress(raw_content)
                                    decompression_success = True
                                    
                                elif content_encoding == 'deflate':
                                    import zlib
                                    logger.info("检测到deflate压缩，正在解压缩...")
                                    decompressed_content = zlib.decompress(raw_content)
                                    decompression_success = True
                                    
                                elif content_encoding == 'br':
                                    try:
                                        import brotli
                                        logger.info("检测到brotli压缩，正在解压缩...")
                                        decompressed_content = brotli.decompress(raw_content)
                                        decompression_success = True
                                    except ImportError:
                                        logger.error("brotli包未安装！请安装: pip install brotli")
                                        logger.info("尝试使用原始数据...")
                                
                                if decompression_success:
                                    raw_content = decompressed_content
                                    logger.info(f"✅ 解压缩成功，内容长度: {len(raw_content)}")
                                
                            except Exception as decompress_error:
                                logger.warning(f"❌ 解压缩失败: {decompress_error}")
                                logger.info("🔄 尝试使用原始数据...")
                                
                                # 检查原始数据是否看起来像未压缩的JSON
                                if (len(raw_content) > 0 and 
                                    raw_content[0:1] in [b'{', b'['] and 
                                    raw_content[-1:] in [b'}', b']']):
                                    logger.info("💡 原始数据似乎是未压缩的JSON，可能是服务器配置错误")
                                else:
                                    logger.error("⚠️  原始数据不是有效的JSON格式")
                        
                        # 不再对未声明编码的内容进行启发式解压，交由 httpx/default 处理
                        
                        # 现在尝试解码为文本
                        try:
                            # 首先尝试以UTF-8解码
                            response_text = raw_content.decode('utf-8')
                            logger.debug("成功使用UTF-8解码响应")
                        except UnicodeDecodeError:
                            # 如果UTF-8失败，尝试其他编码
                            logger.warning("UTF-8解码失败，尝试其他编码...")
                            
                            # 尝试常见的中文编码
                            for encoding in ['gb2312', 'gbk', 'big5', 'latin-1']:
                                try:
                                    response_text = raw_content.decode(encoding)
                                    logger.info(f"成功使用 {encoding} 编码解码响应")
                                    break
                                except UnicodeDecodeError:
                                    continue
                            else:
                                # 所有编码都失败，使用错误替换模式
                                response_text = raw_content.decode('utf-8', errors='replace')
                                logger.warning("使用错误替换模式解码响应")
                        
                        # 检查响应内容是否为空或损坏
                        if not response_text.strip():
                            logger.error("API返回空响应")
                            return None
                        
                        # 尝试解析JSON
                        try:
                            import json
                            data = json.loads(response_text)
                        except json.JSONDecodeError as e:
                            logger.error(f"API响应JSON解析失败: {e}")
                            logger.error(f"响应内容前100字符: {response_text[:100]}")
                            return None
                        
                        # 检查API返回的success字段
                        if data.get("success") and data.get("code") == 200:
                            # 成功登录，提取用户信息
                            user_data = data.get("data", {})
                            return {
                                "student_id": student_id,
                                "name": user_data.get("name", "未知用户"),
                                "verified": True,
                                "account_id": user_data.get("accountId", ""),
                                "avatar_url": user_data.get("avatarUrl", ""),
                                "id_number": user_data.get("idNumber")
                            }
                        else:
                            # 登录失败（账号密码错误等）
                            error_msg = data.get("msg") or data.get("message") or "登录失败"
                            logger.warning(
                                f"API登录失败: {student_id} - {error_msg}; status={response.status_code}; body={response_text[:200]}"
                            )
                            return None
                            
                    except Exception as decode_error:
                        logger.error(f"处理 API响应时发生错误: {decode_error}")
                        logger.error(f"响应状态码: {response.status_code}")
                        logger.error(f"响应头: {dict(response.headers)}")
                        # 记录原始字节内容的十六进制表示（仅前50字节）
                        raw_bytes = response.content[:50]
                        hex_content = ' '.join(f'{b:02x}' for b in raw_bytes)
                        logger.error(f"响应内容(hex前50字节): {hex_content}")
                        return None
                        
                elif response.status_code == 401:
                    logger.warning(f"API返回401: {student_id}")
                    return None
                else:
                    logger.error(f"API异常响应: {response.status_code}")
                    try:
                        logger.error(f"错误响应内容: {response.text}")
                    except Exception:
                        logger.error(f"无法解码错误响应内容")
                    return None
                    
        except httpx.TimeoutException:
            logger.error("API超时")
            return None
        except Exception as e:
            logger.error(f"API调用失败: {e}")
            return None
    
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
        # 使用 verify_user 验证密码（支持加密密码）
        is_local_password_valid = bool(UserDB.verify_user(student_id, password))

        async def _ensure_identity(current_user: Optional[Dict[str, Any]], payload: Optional[Dict[str, Any]]) -> int:
            """仅在状态为0时尝试获取身份证号"""
            status_now = UserDB.normalize_id_status(current_user.get('id_status') if current_user else None)
            if status_now != 0:
                return status_now

            nonlocal api_result
            active_payload = payload or api_result
            if active_payload is None:
                active_payload = await AuthManager.verify_login(student_id, password)
                api_result = active_payload

            id_number_value = _clean_id_number(active_payload.get('id_number') if active_payload else None) if active_payload else None
            new_status = 1 if id_number_value else 2
            UserDB.update_user_identity(student_id, id_number_value, new_status)
            return new_status
        
        if local_user and is_local_password_valid:
            logger.info(f"用户 {student_id} 使用本地凭据登录成功")
            if id_status == 0:
                # 老数据：本地密码正确，但需要获取身份证号
                id_status = await _ensure_identity(local_user, None)
                local_user = UserDB.get_user(student_id)
        else:
            # 本地密码不匹配或用户不存在，尝试第三方API验证
            logger.info(f"用户 {student_id} 需要第三方API验证")
            api_result = await AuthManager.verify_login(student_id, password)
            if not api_result:
                logger.warning(f"用户 {student_id} 第三方API验证失败")
                return None
            logger.info(f"用户 {student_id} 第三方API验证成功")
            # 远端成功后，首次登录/凭据失效：无论原状态为何都重新写入身份证状态
            id_number_value = _clean_id_number(api_result.get('id_number'))
            new_status = 1 if id_number_value else 2
            UserDB.update_user_identity(student_id, id_number_value, new_status)
            id_status = new_status
        
        # 3. 第三方验证成功，更新或创建本地用户记录
        if local_user:
            if not is_local_password_valid and api_result:
                logger.info(f"更新用户 {student_id} 的本地密码")
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
            logger.info(f"创建新用户 {student_id}")
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
                logger.error(f"创建用户失败: {student_id}")
                return None
            local_user = UserDB.get_user(student_id)
        
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
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_payload
        }
    
    @staticmethod
    def login_admin(admin_id: str, password: str) -> Optional[Dict[str, Any]]:
        """管理员/代理登录"""
        admin = AdminDB.verify_admin(admin_id, password)
        if not admin:
            return None

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
            logger.warning(f"代理 {admin_id} 没有可用的启用地址/楼栋，强制登出")
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
