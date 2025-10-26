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
                              "Chrome/107.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI "
                              "MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13) XWEB/8555",
                "Referer": "",
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "xweb_xhr": "1",
                "1235d6": "true"
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
                        
                        # 如果响应内容看起来像压缩数据但没有明确的Content-Encoding头
                        # 检查前几个字节来识别gzip格式 (magic number: 1f 8b)
                        elif len(raw_content) >= 2 and raw_content[:2] == b'\x1f\x8b':
                            try:
                                import gzip
                                logger.warning("检测到gzip magic number，尝试强制解压缩...")
                                decompressed_content = gzip.decompress(raw_content)
                                raw_content = decompressed_content
                                logger.info(f"强制gzip解压缩成功，内容长度: {len(raw_content)}")
                            except Exception as decompress_error:
                                logger.error(f"强制gzip解压缩失败: {decompress_error}")
                        
                        # 检查其他可能的压缩格式特征
                        elif len(raw_content) >= 4:
                            # 检查是否可能是损坏的压缩数据或其他格式
                            first_bytes = raw_content[:4]
                            logger.warning(f"未识别的数据格式，前4字节: {first_bytes.hex()}")
                            
                            # 尝试作为deflate数据处理
                            try:
                                import zlib
                                logger.info("尝试作为deflate数据解压缩...")
                                decompressed_content = zlib.decompress(raw_content)
                                raw_content = decompressed_content
                                logger.info(f"deflate解压缩成功，内容长度: {len(raw_content)}")
                            except Exception:
                                # 尝试作为原始deflate数据处理
                                try:
                                    decompressed_content = zlib.decompress(raw_content, -zlib.MAX_WBITS)
                                    raw_content = decompressed_content
                                    logger.info(f"原始deflate解压缩成功，内容长度: {len(raw_content)}")
                                except Exception as e:
                                    logger.warning(f"所有解压缩尝试都失败: {e}")
                        
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
                                "bio": user_data.get("bio", "")
                            }
                        else:
                            # 登录失败（账号密码错误等）
                            error_msg = data.get("msg", "登录失败")
                            logger.warning(f"API登录失败: {student_id} - {error_msg}")
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
        # 1. 首先检查本地数据库中是否存在用户
        local_user = UserDB.get_user(student_id)
        
        if local_user:
            # 用户存在，使用 UserDB.verify_user 来验证密码（会自动处理哈希和明文密码）
            verified_user = UserDB.verify_user(student_id, password)
            if verified_user:
                # 密码正确，直接登录
                logger.info(f"用户 {student_id} 使用本地凭据登录成功")
                
                # 生成JWT令牌
                token_data = {
                    "sub": student_id,
                    "type": "user",
                    "name": local_user['name']
                }
                access_token = AuthManager.create_access_token(token_data)
                
                return {
                    "access_token": access_token,
                    "token_type": "bearer",
                    "user": {
                        "id": local_user['id'],
                        "name": local_user['name'],
                        "created_at": local_user['created_at']
                    }
                }
            else:
                # 密码不正确，尝试第三方API验证
                logger.info(f"用户 {student_id} 本地密码验证失败，尝试第三方API验证")
        else:
            # 用户不存在，直接尝试第三方API验证
            logger.info(f"用户 {student_id} 不存在于本地数据库，尝试第三方API验证")
        
        # 2. 使用第三方API验证
        result = await AuthManager.verify_login(student_id, password)
        if not result:
            logger.warning(f"用户 {student_id} 第三方API验证也失败")
            return None
        
        logger.info(f"用户 {student_id} 第三方API验证成功")
        
        # 3. 第三方验证成功，更新或创建本地用户记录
        if local_user:
            # 用户存在但密码不同，更新本地密码
            logger.info(f"更新用户 {student_id} 的本地密码")
            # 这里需要添加一个更新密码的方法，或者先删除再创建
            # 为了简单起见，我们可以直接更新
            UserDB.update_user_password(student_id, password)
            # 更新用户名（如果第三方返回的不同）
            if local_user['name'] != result['name']:
                UserDB.update_user_name(student_id, result['name'])
            # 重新获取更新后的用户信息
            local_user = UserDB.get_user(student_id)
        else:
            # 用户不存在，创建新用户
            logger.info(f"创建新用户 {student_id}")
            success = UserDB.create_user(
                student_id=student_id,
                password=password,
                name=result['name']
            )
            if not success:
                logger.error(f"创建用户失败: {student_id}")
                return None
            local_user = UserDB.get_user(student_id)
        
        # 4. 生成JWT令牌
        token_data = {
            "sub": student_id,
            "type": "user",
            "name": local_user['name']
        }
        access_token = AuthManager.create_access_token(token_data)
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": local_user['id'],
                "name": local_user['name'],
                "created_at": local_user['created_at']
            }
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
            assignments = AgentAssignmentDB.get_buildings_for_agent(admin_id)
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
            "token_version": token_version
        }
        access_token = AuthManager.create_access_token(token_data)

        account_payload = {
            "id": admin['id'],
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
        assignments = AgentAssignmentDB.get_buildings_for_agent(admin_id)
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
