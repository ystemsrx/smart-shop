# /backend/main.py
import os
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException, Depends, Request, Response, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from pydantic import BaseModel
import uvicorn
import json
import random

# 导入自定义模块
from database import (
    init_database, cleanup_old_chat_logs,
    UserDB, ProductDB, CartDB, ChatLogDB, AdminDB, CategoryDB, OrderDB, AddressDB, BuildingDB, UserProfileDB,
    VariantDB, SettingsDB, LotteryDB, RewardDB, CouponDB
)
from auth import (
    AuthManager, get_current_user_optional, get_current_user_required,
    get_current_admin, set_auth_cookie, clear_auth_cookie,
    get_current_user_from_cookie, get_current_admin_required_from_cookie,
    get_current_user_required_from_cookie, success_response, error_response
)


def convert_sqlite_timestamp_to_unix(created_at_str: str, order_id: str = None) -> int:
    """
    将SQLite的CURRENT_TIMESTAMP字符串转换为Unix时间戳（秒）
    SQLite返回的是UTC时间，需要正确处理时区
    """
    try:
        from datetime import datetime, timezone
        import time
        
        # SQLite的CURRENT_TIMESTAMP返回UTC时间，需要明确指定为UTC时区
        if " " in created_at_str:
            # SQLite格式：YYYY-MM-DD HH:MM:SS (UTC)
            dt = datetime.strptime(created_at_str, "%Y-%m-%d %H:%M:%S")
            # 明确指定为UTC时区
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            # ISO格式：YYYY-MM-DDTHH:MM:SS
            dt = datetime.fromisoformat(created_at_str)
            if dt.tzinfo is None:
                # 如果没有时区信息，假设为UTC
                dt = dt.replace(tzinfo=timezone.utc)
        
        # 转换为时间戳（秒）
        timestamp = int(dt.timestamp())
        
        # 调试日志
        current_timestamp = int(time.time())
        age_minutes = (current_timestamp - timestamp) // 60
        order_info = f"订单 {order_id}" if order_id else "时间"
        logger.info(f"{order_info} 时间转换: {created_at_str} (UTC) -> {timestamp}, 创建于 {age_minutes} 分钟前")
        
        return timestamp
        
    except Exception as e:
        order_info = f"订单 {order_id}" if order_id else "时间"
        logger.warning(f"{order_info} 转换失败: {e}, 原始时间: {created_at_str}")
        # 如果转换失败，使用当前时间戳减去1小时（确保倒计时能正常显示）
        import time
        return int(time.time() - 3600)

# 配置日志
import os
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# 为特定模块设置更详细的日志级别
auth_logger = logging.getLogger("auth")
if log_level == "DEBUG":
    auth_logger.setLevel(logging.DEBUG)

logger = logging.getLogger(__name__)

# FastAPI应用实例
app = FastAPI(
    title="宿舍智能小商城API",
    description="基于FastAPI的宿舍智能小商城后端系统",
    version="1.0.0"
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://shop.your_domain.com", "http://localhost:3000", "https://chatapi.your_domain.com"],  # 生产环境应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件服务
items_dir = os.path.join(os.path.dirname(__file__), "items")
os.makedirs(items_dir, exist_ok=True)

class CachedStaticFiles(StaticFiles):
    def __init__(self, *args, max_age: int = 60 * 60 * 24 * 30, **kwargs):
        super().__init__(*args, **kwargs)
        self._max_age = max_age

    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        if hasattr(resp, 'headers') and resp.status_code == 200:
            resp.headers["Cache-Control"] = f"public, max-age={self._max_age}, immutable"
            # CORS for static assets (images) to allow cross-origin caching/fetch
            try:
                origin = None
                for k, v in scope.get('headers', []):
                    if k.decode().lower() == 'origin':
                        origin = v.decode()
                        break
                allowed = ["https://shop.your_domain.com", "http://localhost:3000", "https://chatapi.your_domain.com"]
                if origin and origin in allowed:
                    resp.headers["Access-Control-Allow-Origin"] = origin
                    resp.headers["Vary"] = "Origin"
                else:
                    resp.headers["Access-Control-Allow-Origin"] = "*"
                resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
                resp.headers["Access-Control-Allow-Headers"] = "*"
            except Exception:
                pass
        return resp

# Wrap static app with CORS to ensure ACAO header is set for images
_static = CachedStaticFiles(directory=items_dir)
_static_cors = CORSMiddleware(
    _static,
    allow_origins=["https://shop.your_domain.com", "http://localhost:3000"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=True,
    expose_headers=["Content-Length", "Content-Type"]
)
app.mount("/items", _static_cors, name="items")

# Pydantic模型
class LoginRequest(BaseModel):
    student_id: str
    password: str

class AdminLoginRequest(BaseModel):
    admin_id: str
    password: str

class ProductCreate(BaseModel):
    name: str
    category: str
    price: float
    stock: int = 0
    description: str = ""

class CartUpdateRequest(BaseModel):
    action: str  # add, update, remove, clear
    product_id: Optional[str] = None
    quantity: Optional[int] = None
    variant_id: Optional[str] = None

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None
    discount: Optional[float] = None  # 折扣（以折为单位，10为不打折，0.5为五折）
    description: Optional[str] = None
    is_active: Optional[bool] = None

class StockUpdateRequest(BaseModel):
    stock: int

class CategoryCreateRequest(BaseModel):
    name: str
    description: str = ""

class CategoryUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class ProductDeleteRequest(BaseModel):
    product_ids: List[str]

class BulkProductUpdateRequest(BaseModel):
    product_ids: List[str]
    discount: Optional[float] = None

class OrderCreateRequest(BaseModel):
    shipping_info: Dict[str, str]
    payment_method: str = 'wechat'
    note: str = ''
    coupon_id: Optional[str] = None  # 选用的优惠券ID（可选）
    apply_coupon: Optional[bool] = True  # 是否应用优惠券（默认应用）

class OrderStatusUpdateRequest(BaseModel):
    status: str


class PaymentStatusUpdateRequest(BaseModel):
    payment_status: str

# 地址管理模型
class AddressCreateRequest(BaseModel):
    name: str
    enabled: bool = True
    sort_order: int = 0

class AddressUpdateRequest(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    sort_order: Optional[int] = None

# 楼栋管理模型
class BuildingCreateRequest(BaseModel):
    address_id: str
    name: str
    enabled: bool = True
    sort_order: int = 0

class BuildingUpdateRequest(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    sort_order: Optional[int] = None

class AddressReorderRequest(BaseModel):
    order: List[str]

class BuildingReorderRequest(BaseModel):
    address_id: str
    order: List[str]

# 优惠券模型
class CouponIssueRequest(BaseModel):
    student_id: str
    amount: float
    quantity: int = 1
    # ISO字符串或 'YYYY-MM-DD HH:MM:SS'，为空代表永久
    expires_at: Optional[str] = None

# 启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时初始化"""
    logger.info("正在启动宿舍智能小商城API...")
    
    # 初始化数据库
    init_database()
    # 启动时清理无商品的空分类
    try:
        CategoryDB.cleanup_orphan_categories()
    except Exception as e:
        logger.warning(f"启动时清理空分类失败: {e}")
    
    # 启动定时清理任务
    asyncio.create_task(periodic_cleanup())
    # 每分钟清理一次过期未付款订单
    asyncio.create_task(expired_unpaid_cleanup())
    
    logger.info("宿舍智能小商城API启动完成")

async def periodic_cleanup():
    """定时清理任务"""
    while True:
        try:
            # 每天凌晨3点清理过期聊天记录
            await asyncio.sleep(24 * 60 * 60)  # 24小时
            cleanup_old_chat_logs()
            # 顺带清理无商品的空分类
            try:
                CategoryDB.cleanup_orphan_categories()
            except Exception as e:
                logger.warning(f"定时清理空分类失败: {e}")
        except Exception as e:
            logger.error(f"定时清理任务失败: {e}")

async def expired_unpaid_cleanup():
    """清理超过15分钟未付款订单"""
    while True:
        try:
            await asyncio.sleep(60)
            from database import OrderDB
            deleted = OrderDB.purge_expired_unpaid_orders(15)
            if deleted:
                logger.info(f"清理过期未付款订单: 删除 {deleted} 笔")
        except Exception as e:
            logger.error(f"清理过期未付款订单任务失败: {e}")

# ==================== 认证路由 ====================

@app.post("/auth/login")
async def login(request: LoginRequest, response: Response):
    """用户登录"""
    try:
        result = await AuthManager.login_user(request.student_id, request.password)
        if not result:
            return error_response("学号或密码错误", 401)
        
        # 设置Cookie
        set_auth_cookie(response, result["access_token"])
        
        return success_response("登录成功", result)
    
    except Exception as e:
        logger.error(f"登录失败: {e}")
        return error_response("登录失败，请稍后重试", 500)

@app.post("/auth/admin-login")
async def admin_login(request: AdminLoginRequest, response: Response):
    """管理员登录"""
    try:
        result = AuthManager.login_admin(request.admin_id, request.password)
        if not result:
            return error_response("管理员账号或密码错误", 401)
        
        # 设置Cookie
        set_auth_cookie(response, result["access_token"])
        
        return success_response("管理员登录成功", result)
    
    except Exception as e:
        logger.error(f"管理员登录失败: {e}")
        return error_response("管理员登录失败，请稍后重试", 500)

@app.post("/auth/logout")
async def logout(response: Response):
    """用户登出"""
    clear_auth_cookie(response)
    return success_response("登出成功")

@app.get("/auth/me")
async def get_current_user_info(request: Request):
    """获取当前用户信息"""
    # 首先尝试作为用户获取
    user = get_current_user_from_cookie(request)
    if user:
        return success_response("获取用户信息成功", user)
    
    # 如果不是用户，尝试作为管理员获取
    from auth import get_current_admin_from_cookie
    admin = get_current_admin_from_cookie(request)
    if admin:
        return success_response("获取管理员信息成功", admin)
    
    return error_response("未登录", 401)

@app.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    """刷新令牌"""
    # 首先尝试作为用户获取
    user = get_current_user_from_cookie(request)
    if user:
        # 生成新的用户令牌
        token_data = {
            "sub": user["id"],
            "type": "user",
            "name": user["name"]
        }
        new_token = AuthManager.create_access_token(token_data)
        set_auth_cookie(response, new_token)
        return success_response("令牌刷新成功", {"access_token": new_token})
    
    # 如果不是用户，尝试作为管理员获取
    from auth import get_current_admin_from_cookie
    admin = get_current_admin_from_cookie(request)
    if admin:
        # 生成新的管理员令牌
        token_data = {
            "sub": admin["id"],
            "type": "admin",
            "name": admin["name"],
            "role": admin["role"]
        }
        new_token = AuthManager.create_access_token(token_data)
        set_auth_cookie(response, new_token)
        return success_response("管理员令牌刷新成功", {"access_token": new_token})
    
    return error_response("令牌无效", 401)

# ==================== 学号搜索（管理员） ====================

@app.get("/admin/students/search")
async def admin_search_students(request: Request, q: str = ""):
    """按学号模糊搜索（基于已存在的学号）。每输入1个字符就查询。"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        like = f"%{q.strip()}%" if q else "%"
        from database import get_db_connection
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT id, name FROM users WHERE id LIKE ? ORDER BY id ASC LIMIT 20', (like,))
            rows = cur.fetchall() or []
            items = [{"id": r[0], "name": r[1]} for r in rows]
        return success_response("搜索成功", {"students": items})
    except Exception as e:
        logger.error(f"搜索学号失败: {e}")
        return error_response("搜索失败", 500)

# ==================== 优惠券（用户/管理员） ====================

@app.get("/coupons/my")
async def my_coupons(request: Request):
    user = get_current_user_required_from_cookie(request)
    try:
        coupons = CouponDB.get_active_for_student(user["id"]) or []
        return success_response("获取优惠券成功", {"coupons": coupons})
    except Exception as e:
        logger.error(f"获取优惠券失败: {e}")
        return error_response("获取优惠券失败", 500)

@app.get("/admin/coupons")
async def admin_list_coupons(request: Request, student_id: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    try:
        items = CouponDB.list_all(student_id)
        return success_response("获取优惠券列表成功", {"coupons": items})
    except Exception as e:
        logger.error(f"管理员获取优惠券失败: {e}")
        return error_response("获取优惠券失败", 500)

@app.post("/admin/coupons/issue")
async def admin_issue_coupons(payload: CouponIssueRequest, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    try:
        amt = float(payload.amount)
        if amt <= 0:
            return error_response("金额必须大于0", 400)
        qty = int(payload.quantity or 1)
        if qty <= 0 or qty > 200:
            return error_response("发放数量需为 1-200", 400)
        # 规范化时间格式
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
        ids = CouponDB.issue_coupons(payload.student_id, amt, qty, expires_at)
        if not ids:
            return error_response("发放失败，学号不存在或其他错误", 400)
        return success_response("发放成功", {"issued": len(ids), "coupon_ids": ids})
    except Exception as e:
        logger.error(f"发放优惠券失败: {e}")
        return error_response("发放优惠券失败", 500)

@app.patch("/admin/coupons/{coupon_id}/revoke")
async def admin_revoke_coupon(coupon_id: str, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    try:
        ok = CouponDB.revoke(coupon_id)
        if not ok:
            return error_response("撤回失败或已撤回/不存在", 400)
        return success_response("已撤回")
    except Exception as e:
        logger.error(f"撤回优惠券失败: {e}")
        return error_response("撤回失败", 500)

# ==================== 商品路由 ====================

@app.get("/products")
async def get_products(category: Optional[str] = None):
    """获取商品列表"""
    try:
        if category:
            products = ProductDB.get_products_by_category(category)
        else:
            products = ProductDB.get_all_products()
        # 补充规格信息
        product_ids = [p["id"] for p in products]
        variants_map = VariantDB.get_for_products(product_ids)
        for p in products:
            vts = variants_map.get(p["id"], [])
            p["variants"] = vts
            p["has_variants"] = len(vts) > 0
            if p["has_variants"]:
                p["total_variant_stock"] = sum(v.get("stock", 0) for v in vts)
        return success_response("获取商品列表成功", {"products": products})
    
    except Exception as e:
        logger.error(f"获取商品失败: {e}")
        return error_response("获取商品失败", 500)

@app.get("/products/search")
async def search_products(q: str):
    """搜索商品"""
    try:
        products = ProductDB.search_products(q)
        product_ids = [p["id"] for p in products]
        variants_map = VariantDB.get_for_products(product_ids)
        for p in products:
            vts = variants_map.get(p["id"], [])
            p["variants"] = vts
            p["has_variants"] = len(vts) > 0
            if p["has_variants"]:
                p["total_variant_stock"] = sum(v.get("stock", 0) for v in vts)
        return success_response("搜索成功", {"products": products, "query": q})
    
    except Exception as e:
        logger.error(f"搜索商品失败: {e}")
        return error_response("搜索失败", 500)

@app.get("/products/categories")
async def get_categories():
    """获取商品分类（只返回有商品的分类）"""
    try:
        # 返回前自动清理空分类
        try:
            CategoryDB.cleanup_orphan_categories()
        except Exception:
            pass
        categories = CategoryDB.get_categories_with_products()
        return success_response("获取分类成功", {"categories": categories})
    
    except Exception as e:
        logger.error(f"获取分类失败: {e}")
        return error_response("获取分类失败", 500)

# ==================== 地址（宿舍区/自提点等）路由 ====================

@app.get("/addresses")
async def get_enabled_addresses():
    """获取启用的地址列表；若为空，返回默认 '桃园' 作为回退"""
    try:
        addrs = AddressDB.get_enabled_addresses()
        if not addrs:
            # 回退默认值，不写入数据库，仅供前端选择
            addrs = [{
                "id": "addr_default_taoyuan",
                "name": "桃园",
                "enabled": 1,
                "sort_order": 0,
                "created_at": None,
                "updated_at": None
            }]
        return success_response("获取地址成功", {"addresses": addrs})
    except Exception as e:
        logger.error(f"获取地址失败: {e}")
        return error_response("获取地址失败", 500)

@app.get("/admin/addresses")
async def admin_get_addresses(request: Request):
    """获取全部地址（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        addrs = AddressDB.get_all_addresses(include_disabled=True)
        # 若为空，则自动创建默认 桃园/六舍，便于管理员直接看到并管理
        if not addrs:
            try:
                addr_id = AddressDB.create_address("桃园", True, 0)
                if addr_id:
                    # 创建默认楼栋 六舍
                    try:
                        from database import BuildingDB
                        BuildingDB.create_building(addr_id, "六舍", True, 0)
                    except Exception:
                        pass
                    addrs = AddressDB.get_all_addresses(include_disabled=True)
            except Exception:
                pass
        return success_response("获取地址成功", {"addresses": addrs})
    except Exception as e:
        logger.error(f"管理员获取地址失败: {e}")
        return error_response("获取地址失败", 500)

@app.post("/admin/addresses")
async def admin_create_address(payload: AddressCreateRequest, request: Request):
    """创建地址（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        if AddressDB.get_by_name(payload.name):
            return error_response("地址名称已存在", 400)
        addr_id = AddressDB.create_address(payload.name, payload.enabled, payload.sort_order)
        if not addr_id:
            return error_response("创建地址失败，名称可能冲突", 400)
        return success_response("地址创建成功", {"address_id": addr_id})
    except Exception as e:
        logger.error(f"创建地址失败: {e}")
        return error_response("创建地址失败", 500)

@app.put("/admin/addresses/{address_id}")
async def admin_update_address(address_id: str, payload: AddressUpdateRequest, request: Request):
    """更新地址（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        existing = AddressDB.get_by_id(address_id)
        if not existing:
            return error_response("地址不存在", 404)
        # 名称冲突检查
        if payload.name and payload.name != existing.get("name"):
            if AddressDB.get_by_name(payload.name):
                return error_response("地址名称已存在", 400)
        ok = AddressDB.update_address(address_id, payload.name, payload.enabled, payload.sort_order)
        if not ok:
            return error_response("更新地址失败", 400)
        return success_response("地址更新成功")
    except Exception as e:
        logger.error(f"更新地址失败: {e}")
        return error_response("更新地址失败", 500)

@app.delete("/admin/addresses/{address_id}")
async def admin_delete_address(address_id: str, request: Request):
    """删除地址（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        existing = AddressDB.get_by_id(address_id)
        if not existing:
            return error_response("地址不存在", 404)
        # 允许级联删除：先删除楼栋，再删除地址（由 AddressDB 实现）
        ok = AddressDB.delete_address(address_id)
        if not ok:
            return error_response("删除地址失败", 400)
        return success_response("地址删除成功")
    except Exception as e:
        logger.error(f"删除地址失败: {e}")
        return error_response("删除地址失败", 500)

@app.post("/admin/addresses/reorder")
async def admin_reorder_addresses(payload: AddressReorderRequest, request: Request):
    """批量重排地址顺序（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        if not payload.order or not isinstance(payload.order, list):
            return error_response("无效排序数据", 400)
        ok = AddressDB.reorder(payload.order)
        if not ok:
            return error_response("重排失败", 400)
        return success_response("重排成功")
    except Exception as e:
        logger.error(f"地址重排失败: {e}")
        return error_response("地址重排失败", 500)

# ==================== 楼栋路由 ====================

@app.get("/buildings")
async def get_enabled_buildings(address_id: Optional[str] = None, address_name: Optional[str] = None):
    """根据地址获取启用的楼栋，若为空则回退默认“六舍”"""
    try:
        addr_id = address_id
        if not addr_id and address_name:
            addr = AddressDB.get_by_name(address_name)
            addr_id = addr.get('id') if addr else None

        buildings = []
        if addr_id:
            buildings = BuildingDB.get_enabled_buildings(addr_id)

        if not buildings:
            buildings = [{
                "id": "bld_default_6she",
                "address_id": addr_id or "addr_default_taoyuan",
                "name": "六舍",
                "enabled": 1,
                "sort_order": 0,
                "created_at": None,
                "updated_at": None
            }]
        return success_response("获取楼栋成功", {"buildings": buildings})
    except Exception as e:
        logger.error(f"获取楼栋失败: {e}")
        return error_response("获取楼栋失败", 500)

@app.get("/admin/buildings")
async def admin_get_buildings(request: Request, address_id: Optional[str] = None):
    """获取楼栋（可按地址过滤）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        blds = BuildingDB.get_all_buildings(address_id=address_id, include_disabled=True)
        return success_response("获取楼栋成功", {"buildings": blds})
    except Exception as e:
        logger.error(f"管理员获取楼栋失败: {e}")
        return error_response("获取楼栋失败", 500)

@app.post("/admin/buildings")
async def admin_create_building(payload: BuildingCreateRequest, request: Request):
    """创建楼栋（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        addr = AddressDB.get_by_id(payload.address_id)
        if not addr:
            return error_response("所属地址不存在", 400)
        if BuildingDB.get_by_name_in_address(payload.address_id, payload.name):
            return error_response("该地址下楼栋名称已存在", 400)
        bld_id = BuildingDB.create_building(payload.address_id, payload.name, payload.enabled, payload.sort_order)
        if not bld_id:
            return error_response("创建楼栋失败，名称冲突", 400)
        return success_response("楼栋创建成功", {"building_id": bld_id})
    except Exception as e:
        logger.error(f"创建楼栋失败: {e}")
        return error_response("创建楼栋失败", 500)

@app.put("/admin/buildings/{building_id}")
async def admin_update_building(building_id: str, payload: BuildingUpdateRequest, request: Request):
    """更新楼栋（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        existing = BuildingDB.get_by_id(building_id)
        if not existing:
            return error_response("楼栋不存在", 404)
        # 名称冲突校验（同地址下唯一）
        if payload.name and payload.name != existing.get('name'):
            if BuildingDB.get_by_name_in_address(existing.get('address_id'), payload.name):
                return error_response("该地址下楼栋名称已存在", 400)
        ok = BuildingDB.update_building(building_id, payload.name, payload.enabled, payload.sort_order)
        if not ok:
            return error_response("更新楼栋失败", 400)
        return success_response("楼栋更新成功")
    except Exception as e:
        logger.error(f"更新楼栋失败: {e}")
        return error_response("更新楼栋失败", 500)

@app.delete("/admin/buildings/{building_id}")
async def admin_delete_building(building_id: str, request: Request):
    """删除楼栋（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        existing = BuildingDB.get_by_id(building_id)
        if not existing:
            return error_response("楼栋不存在", 404)
        ok = BuildingDB.delete_building(building_id)
        if not ok:
            return error_response("删除楼栋失败", 400)
        return success_response("楼栋删除成功")
    except Exception as e:
        logger.error(f"删除楼栋失败: {e}")
        return error_response("删除楼栋失败", 500)

@app.post("/admin/buildings/reorder")
async def admin_reorder_buildings(payload: BuildingReorderRequest, request: Request):
    """对某地址下的楼栋批量重排（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        if not payload.order or not isinstance(payload.order, list):
            return error_response("无效排序数据", 400)
        # 校验地址存在
        addr = AddressDB.get_by_id(payload.address_id)
        if not addr:
            return error_response("地址不存在", 404)
        ok = BuildingDB.reorder(payload.address_id, payload.order)
        if not ok:
            return error_response("重排失败", 400)
        return success_response("重排成功")
    except Exception as e:
        logger.error(f"楼栋重排失败: {e}")
        return error_response("楼栋重排失败", 500)

# ==================== 购物车路由 ====================

@app.get("/cart")
async def get_cart(request: Request):
    """获取购物车"""
    # 验证用户登录状态
    user = get_current_user_required_from_cookie(request)
    
    try:
        logger.info(f"获取购物车请求 - 用户ID: {user['id']}")
        
        cart_data = CartDB.get_cart(user["id"])
        if not cart_data:
            logger.info(f"用户 {user['id']} 没有购物车数据，返回空购物车")
            return success_response("获取购物车成功", {
                "items": [], 
                "total_quantity": 0, 
                "total_price": 0.0
            })
        
        # 获取购物车中的商品信息
        items_dict = cart_data["items"]
        logger.info(f"购物车原始数据: {items_dict}")
        
        # 获取所有商品信息
        all_products = ProductDB.get_all_products()
        product_dict = {p["id"]: p for p in all_products}
        
        # 构建前端需要的购物车商品列表
        cart_items = []
        total_quantity = 0  # 仅统计上架商品
        total_price = 0.0   # 仅统计上架商品（折扣后小计之和）
        
        SEP = '@@'
        for key, quantity in items_dict.items():
            product_id = key
            variant_id = None
            if isinstance(key, str) and SEP in key:
                product_id, variant_id = key.split(SEP, 1)
            if product_id in product_dict:
                product = product_dict[product_id]
                is_active = 1 if int(product.get("is_active", 1) or 1) == 1 else 0
                # 应用折扣（以折为单位，10为不打折）
                zhe = float(product.get("discount", 10.0) or 10.0)
                unit_price = round(float(product["price"]) * (zhe / 10.0), 2)
                subtotal = unit_price * quantity

                # 仅将上架商品计入总数量与总价
                if is_active == 1:
                    total_quantity += quantity
                    total_price += subtotal

                item = {
                    "product_id": product_id,
                    "name": product["name"],
                    "unit_price": round(unit_price, 2),
                    "quantity": quantity,
                    "subtotal": round(subtotal, 2),
                    "stock": product["stock"],
                    "category": product.get("category", ""),
                    "img_path": product.get("img_path", ""),
                    "is_active": is_active
                }
                if variant_id:
                    variant = VariantDB.get_by_id(variant_id)
                    if variant:
                        item["variant_id"] = variant_id
                        item["variant_name"] = variant.get("name")
                        item["stock"] = variant.get("stock", 0)
                cart_items.append(item)
                
        logger.info(f"处理后的购物车数据 - 商品数: {len(cart_items)}, 总数量: {total_quantity}, 总价: {total_price}")
        
        # 运费：不足10元收1元，满10元免运费（购物车为空不收取）
        shipping_fee = 0.0 if total_quantity == 0 or total_price >= 10.0 else 1.0
        cart_result = {
            "items": cart_items,
            "total_quantity": total_quantity,
            "total_price": round(total_price, 2),
            "shipping_fee": round(shipping_fee, 2),
            "payable_total": round(total_price + shipping_fee, 2)
        }
        
        return success_response("获取购物车成功", cart_result)
    
    except Exception as e:
        logger.error(f"获取购物车失败: {e}")
        return error_response("获取购物车失败", 500)

@app.post("/cart/update")
async def update_cart(
    cart_request: CartUpdateRequest,
    request: Request
):
    """更新购物车"""
    # 验证用户登录状态
    user = get_current_user_required_from_cookie(request)
    
    try:
        # 添加详细的日志记录
        logger.info(f"购物车更新请求 - 用户ID: {user['id']}, 动作: {cart_request.action}, 商品ID: {cart_request.product_id}, 数量: {cart_request.quantity}")
        
        current_cart = CartDB.get_cart(user["id"])
        items = current_cart["items"] if current_cart else {}
        logger.info(f"当前购物车内容: {items}")
        
        if cart_request.action == "clear":
            items = {}
        elif cart_request.action == "remove" and cart_request.product_id:
            key = cart_request.product_id
            if cart_request.variant_id:
                key = f"{key}@@{cart_request.variant_id}"
            items.pop(key, None)
        elif cart_request.action in ["add", "update"] and cart_request.product_id and cart_request.quantity is not None:
            # 验证商品是否存在并获取商品信息
            all_products = ProductDB.get_all_products()
            product = next((p for p in all_products if p["id"] == cart_request.product_id), None)
            
            if not product:
                logger.error(f"商品不存在: {cart_request.product_id}")
                return error_response("商品不存在", 400)

            # 禁止对下架商品进行添加或正数更新（允许通过数量<=0来移除）
            try:
                is_active = 1 if int(product.get("is_active", 1) or 1) == 1 else 0
            except Exception:
                is_active = 1
            if is_active != 1 and cart_request.quantity and cart_request.quantity > 0:
                return error_response("该商品已下架，无法添加或更新数量", 400)
            
            # 处理规格键与库存
            key = cart_request.product_id
            limit_stock = product["stock"]
            if cart_request.variant_id:
                key = f"{key}@@{cart_request.variant_id}"
                v = VariantDB.get_by_id(cart_request.variant_id)
                if not v or v.get('product_id') != cart_request.product_id:
                    return error_response("规格不存在", 400)
                limit_stock = int(v.get('stock', 0))

            if cart_request.action == "add":
                if cart_request.quantity <= 0:
                    logger.error(f"无效的数量: {cart_request.quantity}")
                    return error_response("数量必须大于0", 400)
                
                # 库存验证
                current_quantity = items.get(key, 0)
                new_quantity = current_quantity + cart_request.quantity
                if new_quantity > limit_stock:
                    logger.error(f"库存不足 - 商品: {cart_request.product_id}, 规格: {cart_request.variant_id or '-'}, 当前购物车数量: {current_quantity}, 尝试添加: {cart_request.quantity}, 库存: {limit_stock}")
                    return error_response(f"库存不足，当前库存: {limit_stock}，购物车中已有: {current_quantity}", 400)
                items[key] = new_quantity
                logger.info(f"添加商品后的购物车: {items}")
            else:  # update
                if cart_request.quantity > 0:
                    # 更新时也需要验证库存
                    if cart_request.quantity > limit_stock:
                        logger.error(f"更新数量超过库存 - 商品: {cart_request.product_id}, 规格: {cart_request.variant_id or '-'}, 尝试设置: {cart_request.quantity}, 库存: {limit_stock}")
                        return error_response(f"数量超过库存，最大可设置: {limit_stock}", 400)
                    items[key] = cart_request.quantity
                else:
                    items.pop(key, None)
        else:
            # 如果没有匹配任何条件，记录错误日志
            logger.error(f"购物车更新条件不匹配 - 动作: {cart_request.action}, 商品ID: {cart_request.product_id}, 数量: {cart_request.quantity}")
            return error_response("无效的购物车更新请求", 400)
        
        # 额外清理一次：移除购物车内的已下架商品，防止残留
        all_products = ProductDB.get_all_products()
        product_dict = {p["id"]: p for p in all_products}
        cleaned = {}
        for k, v in items.items():
            pid = k.split('@@', 1)[0] if isinstance(k, str) else k
            p = product_dict.get(pid)
            try:
                active = 1 if int(p.get("is_active", 1) or 1) == 1 else 0
            except Exception:
                active = 1
            if active == 1 and v > 0:
                cleaned[k] = v

        # 更新数据库
        update_result = CartDB.update_cart(user["id"], cleaned)
        logger.info(f"数据库更新结果: {update_result}, 最终购物车内容: {items}")
        
        return success_response("购物车更新成功", {"action": cart_request.action, "items": cleaned})
    
    except Exception as e:
        logger.error(f"更新购物车失败: {e}")
        return error_response("更新购物车失败", 500)

# ==================== 商店状态（打烊） ====================

@app.get("/shop/status")
async def get_shop_status():
    """获取店铺开关状态"""
    try:
        is_open = SettingsDB.get('shop_is_open', '1') != '0'
        note = SettingsDB.get('shop_closed_note', '')
        return success_response("获取店铺状态成功", {"is_open": is_open, "note": note})
    except Exception as e:
        logger.error(f"获取店铺状态失败: {e}")
        return error_response("获取店铺状态失败", 500)

class ShopStatusUpdate(BaseModel):
    is_open: bool
    note: Optional[str] = None

@app.patch("/admin/shop/status")
async def update_shop_status(payload: ShopStatusUpdate, request: Request):
    """更新店铺开关（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        SettingsDB.set('shop_is_open', '1' if payload.is_open else '0')
        if payload.note is not None:
            SettingsDB.set('shop_closed_note', payload.note)
        return success_response("店铺状态已更新", {"is_open": payload.is_open})
    except Exception as e:
        logger.error(f"更新店铺状态失败: {e}")
        return error_response("更新店铺状态失败", 500)

# ==================== 规格管理（管理员） ====================

class VariantCreate(BaseModel):
    name: str
    stock: int

class VariantUpdate(BaseModel):
    name: Optional[str] = None
    stock: Optional[int] = None

@app.get("/admin/products/{product_id}/variants")
async def list_variants(product_id: str, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    try:
        return success_response("获取规格成功", {"variants": VariantDB.get_by_product(product_id)})
    except Exception as e:
        logger.error(f"获取规格失败: {e}")
        return error_response("获取规格失败", 500)

@app.post("/admin/products/{product_id}/variants")
async def create_variant(product_id: str, payload: VariantCreate, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    try:
        if not ProductDB.get_product_by_id(product_id):
            return error_response("商品不存在", 404)
        vid = VariantDB.create_variant(product_id, payload.name, payload.stock)
        return success_response("规格创建成功", {"variant_id": vid})
    except Exception as e:
        logger.error(f"规格创建失败: {e}")
        return error_response("规格创建失败", 500)

@app.put("/admin/variants/{variant_id}")
async def update_variant(variant_id: str, payload: VariantUpdate, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    try:
        ok = VariantDB.update_variant(variant_id, payload.name, payload.stock)
        if not ok:
            return error_response("无有效更新项", 400)
        return success_response("规格已更新")
    except Exception as e:
        logger.error(f"规格更新失败: {e}")
        return error_response("规格更新失败", 500)

@app.delete("/admin/variants/{variant_id}")
async def delete_variant(variant_id: str, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    try:
        ok = VariantDB.delete_variant(variant_id)
        if not ok:
            return error_response("规格不存在", 404)
        return success_response("规格已删除")
    except Exception as e:
        logger.error(f"规格删除失败: {e}")
        return error_response("规格删除失败", 500)

# ==================== 管理员路由 ====================

@app.post("/admin/products")
async def create_product(
    request: Request,
    name: str = Form(...),
    category: str = Form(...),
    price: float = Form(...),
    stock: int = Form(0),
    description: str = Form(""),
    image: Optional[UploadFile] = File(None)
):
    """管理员创建商品"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        # 处理图片上传
        img_path = ""
        if image:
            # 创建目录结构: items/类别/
            category_dir = os.path.join(items_dir, category)
            os.makedirs(category_dir, exist_ok=True)
            
            # 生成文件名
            timestamp = int(datetime.now().timestamp())
            file_extension = os.path.splitext(image.filename or "")[1] or ".jpg"
            filename = f"{name}_{timestamp}{file_extension}"
            file_path = os.path.join(category_dir, filename)
            
            # 保存文件
            content = await image.read()
            with open(file_path, "wb") as f:
                f.write(content)
            
            img_path = f"items/{category}/{filename}"
        
        # 创建商品
        product_data = {
            "name": name,
            "category": category,
            "price": price,
            "stock": stock,
            "discount": 10.0,
            "description": description,
            "img_path": img_path
        }
        
        product_id = ProductDB.create_product(product_data)
        
        return success_response("商品创建成功", {"product_id": product_id})
    
    except Exception as e:
        logger.error(f"创建商品失败: {e}")
        return error_response("创建商品失败", 500)

@app.get("/admin/stats")
async def get_admin_stats(request: Request):
    """获取管理统计信息"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        products = ProductDB.get_all_products()
        try:
            CategoryDB.cleanup_orphan_categories()
        except Exception:
            pass
        try:
            CategoryDB.cleanup_orphan_categories()
        except Exception:
            pass
        categories = CategoryDB.get_all_categories()
        # 注册人数
        try:
            users_count = UserDB.count_users()
        except Exception:
            users_count = 0
        
        stats = {
            "total_products": len(products),
            "categories": len(categories),
            "total_stock": sum(p['stock'] for p in products),
            "recent_products": products[:5],  # 最近5个商品
            "users_count": users_count
        }
        
        return success_response("获取统计信息成功", stats)
    
    except Exception as e:
        logger.error(f"获取统计信息失败: {e}")
        return error_response("获取统计信息失败", 500)

@app.get("/admin/users/count")
async def get_users_count(request: Request):
    """获取注册人数（users 表中的学号数量）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        cnt = UserDB.count_users()
        return success_response("获取注册人数成功", {"count": cnt})
    except Exception as e:
        logger.error(f"获取注册人数失败: {e}")
        return error_response("获取注册人数失败", 500)

@app.get("/admin/products/{product_id}")
async def get_product_details(product_id: str, request: Request):
    """获取商品详情"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        product = ProductDB.get_product_by_id(product_id)
        if not product:
            return error_response("商品不存在", 404)
        
        return success_response("获取商品详情成功", {"product": product})
    
    except Exception as e:
        logger.error(f"获取商品详情失败: {e}")
        return error_response("获取商品详情失败", 500)

@app.put("/admin/products/{product_id}")
async def update_product(
    product_id: str,
    product_data: ProductUpdateRequest,
    request: Request
):
    """更新商品信息"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        # 检查商品是否存在
        existing_product = ProductDB.get_product_by_id(product_id)
        if not existing_product:
            return error_response("商品不存在", 404)
        
        # 构建更新数据
        update_data = {}
        if product_data.name is not None:
            update_data['name'] = product_data.name
        if product_data.category is not None:
            update_data['category'] = product_data.category
        if product_data.price is not None:
            update_data['price'] = product_data.price
        if product_data.stock is not None:
            update_data['stock'] = product_data.stock
        if product_data.description is not None:
            update_data['description'] = product_data.description
        if product_data.discount is not None:
            # 约束范围：0.5 ~ 10（单位：折）
            try:
                d = float(product_data.discount)
                if d < 0.5 or d > 10:
                    return error_response("折扣范围应为0.5~10折", 400)
                update_data['discount'] = d
            except Exception:
                return error_response("无效的折扣", 400)
        if product_data.is_active is not None:
            update_data['is_active'] = 1 if product_data.is_active else 0
        
        if not update_data:
            return error_response("没有提供更新数据", 400)
        
        # 注意：分类会自动创建，不需要验证是否存在
        
        # 注意：分类会自动创建，不需要验证是否存在
        # 使用数据库更新方法
        from database import SettingsDB
        success = SettingsDB.update_product(product_id, update_data)
        if not success:
            return error_response("更新商品失败", 500)

        # 如果设置为下架，则从所有购物车中移除此商品
        try:
            old_is_active = int(existing_product.get('is_active', 1) or 1)
        except Exception:
            old_is_active = 1
        new_is_active = update_data.get('is_active', old_is_active)
        if old_is_active == 1 and new_is_active == 0:
            try:
                removed = CartDB.remove_product_from_all_carts(product_id)
                logger.info(f"商品 {product_id} 已下架，已从 {removed} 个购物车中移除")
            except Exception as e:
                logger.warning(f"下架后移除购物车商品失败: {e}")

        return success_response("商品更新成功")
    
    except Exception as e:
        logger.error(f"更新商品失败: {e}")
        return error_response("更新商品失败", 500)

@app.put("/admin/products/0")
async def bulk_update_products(payload: BulkProductUpdateRequest, request: Request):
    """批量更新商品（目前支持批量折扣）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        if not payload.product_ids:
            return error_response("未提供商品ID", 400)

        update_fields: Dict[str, Any] = {}
        # 仅支持折扣批量更新
        if payload.discount is not None:
            try:
                d = float(payload.discount)
                if d < 0.5 or d > 10:
                    return error_response("折扣范围应为0.5~10折", 400)
                update_fields['discount'] = d
            except Exception:
                return error_response("无效的折扣", 400)

        if not update_fields:
            return error_response("没有可更新的字段", 400)

        updated = 0
        not_found: List[str] = []
        for pid in payload.product_ids:
            p = ProductDB.get_product_by_id(pid)
            if not p:
                not_found.append(pid)
                continue
            ok = SettingsDB.update_product(pid, update_fields)
            if ok:
                updated += 1
        return success_response("批量更新完成", {"updated": updated, "not_found": not_found})
    except Exception as e:
        logger.error(f"批量更新商品失败: {e}")
        return error_response("批量更新商品失败", 500)

# 兼容：支持直接 PUT /admin/products 进行批量更新（避免某些环境对路径"/0"的特殊处理）
@app.put("/admin/products")
async def bulk_update_products_alt(payload: BulkProductUpdateRequest, request: Request):
    return await bulk_update_products(payload, request)

@app.patch("/admin/products/{product_id}/stock")
async def update_product_stock(
    product_id: str,
    stock_data: StockUpdateRequest,
    request: Request
):
    """更新商品库存"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        # 检查商品是否存在
        existing_product = ProductDB.get_product_by_id(product_id)
        if not existing_product:
            return error_response("商品不存在", 404)
        
        if stock_data.stock < 0:
            return error_response("库存不能为负数", 400)
        
        success = ProductDB.update_stock(product_id, stock_data.stock)
        if not success:
            return error_response("更新库存失败", 500)
        
        return success_response("库存更新成功", {"new_stock": stock_data.stock})
    
    except Exception as e:
        logger.error(f"更新库存失败: {e}")
        return error_response("更新库存失败", 500)

@app.delete("/admin/products/{product_id}")
async def delete_products(
    product_id: str, 
    request: Request,
    delete_request: Optional[ProductDeleteRequest] = None
):
    """删除商品（支持单个或批量）"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        # 判断是批量删除还是单个删除
        if delete_request and delete_request.product_ids:
            # 批量删除
            product_ids = delete_request.product_ids
            
            if len(product_ids) > 100:  # 限制批量操作的数量
                return error_response("批量删除数量不能超过100件商品", 400)
            
            logger.info(f"管理员 {admin['id']} 请求批量删除商品: {product_ids}")
            
            # 调用数据库批量删除方法
            result = ProductDB.batch_delete_products(product_ids)
            
            if result["success"]:
                logger.info(f"批量删除成功: {result}")
                # 同步：从所有购物车移除这些商品
                try:
                    for pid in result.get("deleted_ids", []) or []:
                        try:
                            removed = CartDB.remove_product_from_all_carts(pid)
                            logger.info(f"商品 {pid} 批量删除后，已从 {removed} 个购物车中移除")
                        except Exception as er:
                            logger.warning(f"批量删除后移除购物车商品失败 {pid}: {er}")
                except Exception as e:
                    logger.warning(f"批量移除购物车商品异常: {e}")
                
                # 删除对应的图片文件
                deleted_img_paths = result.get("deleted_img_paths", [])
                if deleted_img_paths:
                    for img_path in deleted_img_paths:
                        try:
                            img_file_path = os.path.join(os.path.dirname(__file__), img_path)
                            if os.path.exists(img_file_path):
                                os.remove(img_file_path)
                                logger.info(f"成功删除商品图片: {img_file_path}")
                        except Exception as e:
                            # 删除图片失败不影响主要功能，只记录日志
                            logger.warning(f"删除商品图片失败 {img_path}: {e}")
                
                return success_response(result["message"], {
                    "deleted_count": result["deleted_count"],
                    "deleted_ids": result["deleted_ids"],
                    "not_found_ids": result["not_found_ids"]
                })
            else:
                logger.error(f"批量删除失败: {result['message']}")
                return error_response(result["message"], 400)
        else:
            # 单个删除
            logger.info(f"管理员 {admin['id']} 请求删除商品: {product_id}")
            
            # 检查商品是否存在
            existing_product = ProductDB.get_product_by_id(product_id)
            if not existing_product:
                return error_response("商品不存在", 404)
            
            # 保存图片路径用于删除
            img_path = existing_product.get("img_path", "")
            
            success = ProductDB.delete_product(product_id)
            if not success:
                return error_response("删除商品失败", 500)
            # 同步：从所有购物车移除此商品
            try:
                removed = CartDB.remove_product_from_all_carts(product_id)
                logger.info(f"商品 {product_id} 删除后，已从 {removed} 个购物车中移除")
            except Exception as e:
                logger.warning(f"删除后移除购物车商品失败: {e}")
            
            # 删除成功后，删除对应的图片文件
            if img_path and img_path.strip():
                try:
                    img_file_path = os.path.join(os.path.dirname(__file__), img_path)
                    if os.path.exists(img_file_path):
                        os.remove(img_file_path)
                        logger.info(f"成功删除商品图片: {img_file_path}")
                except Exception as e:
                    # 删除图片失败不影响主要功能，只记录日志
                    logger.warning(f"删除商品图片失败 {img_path}: {e}")
            
            return success_response("商品删除成功")
    
    except Exception as e:
        logger.error(f"删除商品失败: {e}")
        return error_response("删除商品失败", 500)

@app.post("/admin/products/{product_id}/image")
async def update_product_image(
    product_id: str,
    request: Request,
    image: Optional[UploadFile] = File(None)
):
    """更新商品图片（仅图片）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        existing = ProductDB.get_product_by_id(product_id)
        if not existing:
            return error_response("商品不存在", 404)
        if not image:
            return error_response("未上传图片", 400)

        # 保存原图片路径，用于后续删除
        old_img_path = existing.get("img_path", "")

        # 使用商品分类作为目录
        category = existing.get("category", "misc") or "misc"
        category_dir = os.path.join(items_dir, category)
        os.makedirs(category_dir, exist_ok=True)

        timestamp = int(datetime.now().timestamp())
        file_extension = os.path.splitext(image.filename or "")[1] or ".jpg"
        filename = f"{existing.get('name','prod')}_{timestamp}{file_extension}"
        file_path = os.path.join(category_dir, filename)

        content = await image.read()
        with open(file_path, "wb") as f:
            f.write(content)

        img_path = f"items/{category}/{filename}"
        from database import SettingsDB as _DB
        ok = _DB.update_image_path(product_id, img_path)
        if not ok:
            # 如果数据库更新失败，删除刚创建的新图片文件
            try:
                os.remove(file_path)
            except:
                pass
            return error_response("更新图片失败", 500)
        
        # 数据库更新成功后，删除原图片文件
        if old_img_path and str(old_img_path).strip():
            try:
                # 规范化旧图路径，防止前导斜杠影响 join
                rel_path = str(old_img_path).lstrip('/\\')
                # 只允许删除 items 目录下的文件
                old_file_path = os.path.normpath(os.path.join(os.path.dirname(__file__), rel_path))
                items_root = os.path.normpath(items_dir)
                if old_file_path.startswith(items_root) and os.path.exists(old_file_path):
                    os.remove(old_file_path)
                    logger.info(f"成功删除原图片: {old_file_path}")
                else:
                    logger.warning(f"跳过删除原图片（路径不安全或不存在）: {old_img_path} -> {old_file_path}")
            except Exception as e:
                # 删除原图片失败不影响主要功能，只记录日志
                logger.warning(f"删除原图片失败 {old_img_path}: {e}")
        
        return success_response("图片更新成功", {"img_path": img_path})
    except Exception as e:
        logger.error(f"更新商品图片失败: {e}")
        return error_response("更新商品图片失败", 500)

# ==================== 分类管理路由 ====================

@app.get("/admin/categories")
async def get_admin_categories(request: Request):
    """获取所有分类（管理员）"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        # 返回前清理无商品的空分类，保持分类表干净
        try:
            CategoryDB.cleanup_orphan_categories()
        except Exception:
            pass
        categories = CategoryDB.get_all_categories()
        return success_response("获取分类成功", {"categories": categories})
    
    except Exception as e:
        logger.error(f"获取分类失败: {e}")
        return error_response("获取分类失败", 500)

@app.post("/admin/categories")
async def create_category(
    category_data: CategoryCreateRequest,
    request: Request
):
    """创建新分类"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        # 检查分类名称是否已存在
        existing_category = CategoryDB.get_category_by_name(category_data.name)
        if existing_category:
            return error_response("分类名称已存在", 400)
        
        category_id = CategoryDB.create_category(category_data.name, category_data.description)
        if not category_id:
            return error_response("创建分类失败", 500)
        
        return success_response("分类创建成功", {"category_id": category_id})
    
    except Exception as e:
        logger.error(f"创建分类失败: {e}")
        return error_response("创建分类失败", 500)

@app.put("/admin/categories/{category_id}")
async def update_category(
    category_id: str,
    category_data: CategoryUpdateRequest,
    request: Request
):
    """更新分类"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        # 检查分类是否存在
        existing_category = CategoryDB.get_category_by_id(category_id)
        if not existing_category:
            return error_response("分类不存在", 404)
        
        # 如果要更新名称，检查新名称是否已存在
        if category_data.name and category_data.name != existing_category['name']:
            name_exists = CategoryDB.get_category_by_name(category_data.name)
            if name_exists:
                return error_response("分类名称已存在", 400)
        
        success = CategoryDB.update_category(category_id, category_data.name, category_data.description)
        if not success:
            return error_response("更新分类失败", 500)
        
        return success_response("分类更新成功")
    
    except Exception as e:
        logger.error(f"更新分类失败: {e}")
        return error_response("更新分类失败", 500)

@app.delete("/admin/categories/{category_id}")
async def delete_category(category_id: str, request: Request):
    """删除分类"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        # 检查分类是否存在
        existing_category = CategoryDB.get_category_by_id(category_id)
        if not existing_category:
            return error_response("分类不存在", 404)
        
        success = CategoryDB.delete_category(category_id)
        if not success:
            return error_response("删除失败，该分类下还有商品", 400)
        
        return success_response("分类删除成功")
    
    except Exception as e:
        logger.error(f"删除分类失败: {e}")
        return error_response("删除分类失败", 500)

# ==================== 订单路由 ====================

@app.post("/orders")
async def create_order(
    order_request: OrderCreateRequest,
    request: Request
):
    """创建订单"""
    # 验证用户登录状态
    user = get_current_user_required_from_cookie(request)
    
    try:
        # 获取用户购物车
        cart_data = CartDB.get_cart(user["id"])
        if not cart_data or not cart_data["items"]:
            return error_response("购物车为空，无法创建订单", 400)
        
        # 获取购物车中的商品信息
        items_dict = cart_data["items"]
        all_products = ProductDB.get_all_products()
        product_dict = {p["id"]: p for p in all_products}
        
        # 构建订单商品列表并计算总金额（应用折扣）
        order_items = []
        total_amount = 0.0
        
        SEP = '@@'
        for key, quantity in items_dict.items():
            product_id = key
            variant_id = None
            if isinstance(key, str) and SEP in key:
                product_id, variant_id = key.split(SEP, 1)
            if product_id in product_dict:
                product = product_dict[product_id]
                # 忽略下架商品
                if int(product.get("is_active", 1) or 1) != 1:
                    continue
                
                # 折扣后单价
                zhe = float(product.get("discount", 10.0) or 10.0)
                unit_price = round(float(product["price"]) * (zhe / 10.0), 2)
                
                # 库存检查：有规格则检查规格库存，否则检查商品库存
                if variant_id:
                    from database import VariantDB
                    variant = VariantDB.get_by_id(variant_id)
                    if not variant or variant.get('product_id') != product_id:
                        return error_response("规格不存在", 400)
                    if quantity > int(variant.get('stock', 0)):
                        return error_response(f"商品 {product['name']}（{variant.get('name')}）库存不足", 400)
                else:
                    if quantity > product.get("stock", 0):
                        return error_response(f"商品 {product['name']} 库存不足", 400)
                
                subtotal = unit_price * quantity
                total_amount += subtotal
                
                item = {
                    "product_id": product_id,
                    "name": product["name"],
                    "unit_price": round(unit_price, 2),
                    "quantity": quantity,
                    "subtotal": round(subtotal, 2),
                    "category": product.get("category", ""),
                    "img_path": product.get("img_path", "")
                }
                if variant_id:
                    item["variant_id"] = variant_id
                    item["variant_name"] = variant.get("name")
                order_items.append(item)
        
        # 保存商品金额小计（不含运费），用于满额判断
        items_subtotal = round(total_amount, 2)

        # 若已达满10门槛，则自动附加可用抽奖奖品（不计入总价）
        rewards_attached_ids: List[str] = []
        if items_subtotal >= 10.0:
            try:
                rewards = RewardDB.get_eligible_rewards(user["id"]) or []
                for r in rewards:
                    qty = int(r.get("prize_quantity") or 1)
                    prize_name = r.get("prize_name") or "抽奖奖品"
                    prize_pid = r.get("prize_product_id") or f"prize_{int(datetime.now().timestamp())}"
                    order_items.append({
                        "product_id": prize_pid,
                        "name": prize_name,
                        "unit_price": 0.0,
                        "quantity": qty,
                        "subtotal": 0.0,
                        "category": "抽奖",
                        "is_lottery": True
                    })
                    rewards_attached_ids.append(r.get("id"))
            except Exception as e:
                logger.warning(f"附加抽奖奖品失败: {e}")

        # 运费规则：不足10元收取1元，满10元免运费（仅计算上架商品金额）
        shipping_fee = 0.0 if items_subtotal >= 10.0 else (1.0 if items_subtotal > 0 else 0.0)

        # 处理优惠券（每单最多1张；仅当商品金额严格大于券额时可用）
        discount_amount = 0.0
        used_coupon_id = None
        if order_request.apply_coupon and order_request.coupon_id:
            try:
                coupon = CouponDB.check_valid_for_student(order_request.coupon_id, user["id"])  # 校验归属、状态、未过期
                if coupon:
                    try:
                        amt = float(coupon.get('amount') or 0)
                    except Exception:
                        amt = 0.0
                    if items_subtotal > amt and amt > 0:
                        discount_amount = round(amt, 2)
                        used_coupon_id = coupon.get('id')
            except Exception as e:
                logger.warning(f"校验优惠券失败: {e}")

        # 订单总金额 = 商品小计 - 优惠 + 运费（不为负）
        total_amount = round(max(0.0, items_subtotal - discount_amount) + shipping_fee, 2)

        if not order_items:
            return error_response("购物车中没有可结算的上架商品", 400)

        # 创建订单（暂不扣减库存，等待支付成功）
        order_id = OrderDB.create_order(
            student_id=user["id"],
            total_amount=round(total_amount, 2),
            shipping_info=order_request.shipping_info,
            items=order_items,
            payment_method=order_request.payment_method,
            note=order_request.note,
            discount_amount=discount_amount,
            coupon_id=used_coupon_id
        )
        # 锁定优惠券，防止未付款或待确认期间被重复使用
        if used_coupon_id and discount_amount > 0:
            try:
                CouponDB.lock_for_order(used_coupon_id, order_id)
            except Exception as e:
                logger.warning(f"锁定优惠券失败: {e}")
        # 标记已附加的奖品为已消费（绑定到本订单）
        if rewards_attached_ids:
            try:
                RewardDB.consume_rewards(user["id"], rewards_attached_ids, order_id)
            except Exception as e:
                logger.warning(f"标记抽奖奖品消费失败: {e}")
        
        # 立即更新用户的最新收货信息，确保下次自动填写使用最新数据
        try:
            UserProfileDB.upsert_shipping(user["id"], order_request.shipping_info)
            logger.info(f"已更新用户 {user['id']} 的最新收货信息")
        except Exception as e:
            logger.warning(f"更新用户收货信息失败: {e}")
        
        # 注意：库存扣减移到支付成功后处理
        # 购物车清空也移到支付成功后处理
        
        return success_response("订单创建成功", {"order_id": order_id, "total_amount": round(total_amount, 2), "discount_amount": round(discount_amount, 2), "coupon_id": used_coupon_id})
    
    except Exception as e:
        logger.error(f"创建订单失败: {e}")
        return error_response("创建订单失败", 500)

@app.get("/orders/my")
async def get_my_orders(request: Request):
    """获取用户的订单列表"""
    # 验证用户登录状态
    user = get_current_user_required_from_cookie(request)
    
    try:
        orders = OrderDB.get_orders_by_student(user["id"])
        
        # 将创建时间转换为时间戳（秒），正确处理时区问题
        for order in orders:
            if order.get("created_at"):
                order["created_at_timestamp"] = convert_sqlite_timestamp_to_unix(order["created_at"], order["id"])
        
        return success_response("获取订单列表成功", {"orders": orders})
    
    except Exception as e:
        logger.error(f"获取订单列表失败: {e}")
        return error_response("获取订单列表失败", 500)

@app.get("/orders/{order_id}")
async def get_order_detail(order_id: str, request: Request):
    """获取订单详情"""
    # 验证用户登录状态
    user = get_current_user_required_from_cookie(request)
    
    try:
        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)
        
        # 检查权限（只有订单创建者或管理员可以查看）
        if order["student_id"] != user["id"] and user.get("type") != "admin":
            return error_response("无权查看此订单", 403)
        
        # 添加时间戳转换（与订单列表接口保持一致）
        if order.get("created_at"):
            order["created_at_timestamp"] = convert_sqlite_timestamp_to_unix(order["created_at"], order["id"])
        
        return success_response("获取订单详情成功", {"order": order})
    
    except Exception as e:
        logger.error(f"获取订单详情失败: {e}")
        return error_response("获取订单详情失败", 500)

# ==================== 管理员订单路由 ====================

@app.get("/admin/orders")
async def get_all_orders(request: Request, limit: Optional[int] = 20, offset: Optional[int] = 0, order_id: Optional[str] = None):
    """获取订单（管理员）——支持分页与按订单ID精确搜索。
    默认每次最多返回20条，通过翻页继续获取，避免一次拿全表。
    """
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        # 后端兜底保护，强制限制最大单次返回数量
        try:
            limit_val = int(limit or 20)
        except Exception:
            limit_val = 20
        if limit_val <= 0:
            limit_val = 20
        if limit_val > 100:
            limit_val = 100
        try:
            offset_val = int(offset or 0)
        except Exception:
            offset_val = 0
        if offset_val < 0:
            offset_val = 0

        page_data = OrderDB.get_orders_paginated(order_id=order_id, limit=limit_val, offset=offset_val)
        orders = page_data.get("orders", [])
        total = int(page_data.get("total", 0))
        
        # 为管理员订单列表也添加时间戳转换
        for order in orders:
            if order.get("created_at"):
                order["created_at_timestamp"] = convert_sqlite_timestamp_to_unix(order["created_at"], order["id"])
        
        stats = OrderDB.get_order_stats()
        has_more = (offset_val + len(orders)) < total
        return success_response("获取订单列表成功", {
            "orders": orders,
            "stats": stats,
            "total": total,
            "limit": limit_val,
            "offset": offset_val,
            "has_more": has_more
        })
    
    except Exception as e:
        logger.error(f"获取订单列表失败: {e}")
        return error_response("获取订单列表失败", 500)

@app.get("/admin/lottery-config")
async def admin_get_lottery_config(request: Request):
    """读取抽奖配置（管理员）。若文件不存在，返回空对象，便于前端直接创建。"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        cfg_path = os.path.join(os.path.dirname(__file__), "lottery_config.json")
        if not os.path.exists(cfg_path):
            return success_response("获取抽奖配置成功", {"config": {}})
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        if not isinstance(cfg, dict):
            return error_response("抽奖配置格式无效", 500)
        return success_response("获取抽奖配置成功", {"config": cfg})
    except Exception as e:
        logger.error(f"读取抽奖配置失败: {e}")
        return error_response("读取抽奖配置失败", 500)

class LotteryConfigUpdateRequest(BaseModel):
    config: Dict[str, Any]

@app.put("/admin/lottery-config")
async def admin_update_lottery_config(payload: LotteryConfigUpdateRequest, request: Request):
    """覆盖写入抽奖配置（管理员）。前端可在任一字段编辑后整体提交保存。"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        cfg = payload.config or {}
        if not isinstance(cfg, dict):
            return error_response("配置格式应为对象", 400)
        # 归一化权重为浮点
        norm_cfg = {}
        for k, v in cfg.items():
            try:
                norm_cfg[str(k)] = float(v)
            except Exception:
                return error_response(f"权重无效: {k}", 400)
        cfg_path = os.path.join(os.path.dirname(__file__), "lottery_config.json")
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(norm_cfg, f, ensure_ascii=False, indent=2)
        return success_response("抽奖配置已更新", {"config": norm_cfg})
    except Exception as e:
        logger.error(f"更新抽奖配置失败: {e}")
        return error_response("更新抽奖配置失败", 500)

class OrderDeleteRequest(BaseModel):
    order_ids: Optional[List[str]] = None

@app.delete("/admin/orders/{order_id}")
async def admin_delete_orders(order_id: str, request: Request, delete_request: Optional[OrderDeleteRequest] = None):
    """删除订单（支持单个或批量）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        if delete_request and delete_request.order_ids:
            ids = delete_request.order_ids
            if len(ids) > 500:
                return error_response("批量删除数量不能超过500笔订单", 400)
            from database import OrderDB
            # 预取订单，用于返还锁定的优惠券
            try:
                orders_before = [OrderDB.get_order_by_id(i) for i in ids]
            except Exception:
                orders_before = []
            result = OrderDB.batch_delete_orders(ids)
            if not result.get("success"):
                return error_response(result.get("message", "批量删除失败"), 400)
            # 返还相关优惠券（仅对未支付订单）
            try:
                for od in (orders_before or []):
                    if not od:
                        continue
                    try:
                        if (od.get("payment_status") or "pending") != "succeeded":
                            c_id = od.get("coupon_id")
                            d_amt = float(od.get("discount_amount") or 0)
                            if c_id and d_amt > 0:
                                CouponDB.unlock_for_order(c_id, od.get("id"))
                    except Exception:
                        pass
            except Exception as e:
                logger.warning(f"批量删除返还优惠券失败: {e}")
            return success_response(result.get("message", "批量删除成功"), result)
        else:
            from database import OrderDB
            # 单笔：删除前返还优惠券（仅未支付）
            try:
                od = OrderDB.get_order_by_id(order_id)
                if od and (od.get("payment_status") or "pending") != "succeeded":
                    c_id = od.get("coupon_id")
                    d_amt = float(od.get("discount_amount") or 0)
                    if c_id and d_amt > 0:
                        CouponDB.unlock_for_order(c_id, order_id)
            except Exception as e:
                logger.warning(f"单笔删除返还优惠券失败: {e}")
            ok = OrderDB.delete_order(order_id)
            if not ok:
                return error_response("删除订单失败或订单不存在", 400)
            return success_response("订单删除成功")
    except Exception as e:
        logger.error(f"删除订单失败: {e}")
        return error_response("删除订单失败", 500)

@app.patch("/admin/orders/{order_id}/status")
async def update_order_status(
    order_id: str,
    status_request: OrderStatusUpdateRequest,
    request: Request
):
    """更新订单状态（管理员）"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        # 验证状态值
        valid_statuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']
        if status_request.status not in valid_statuses:
            return error_response("无效的订单状态", 400)
        
        # 检查订单是否存在
        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)
        
        # 更新状态
        success = OrderDB.update_order_status(order_id, status_request.status)
        if not success:
            return error_response("更新订单状态失败", 500)
        
        return success_response("订单状态更新成功", {"order_id": order_id, "new_status": status_request.status})
    
    except Exception as e:
        logger.error(f"更新订单状态失败: {e}")
        return error_response("更新订单状态失败", 500)

@app.get("/admin/order-stats")
async def get_order_statistics(request: Request):
    """获取订单统计信息（管理员）"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        stats = OrderDB.get_order_stats()
        return success_response("获取订单统计成功", stats)
    
    except Exception as e:
        logger.error(f"获取订单统计失败: {e}")
        return error_response("获取订单统计失败", 500)

@app.get("/admin/dashboard-stats")
async def get_dashboard_statistics(request: Request, period: str = 'week'):
    """获取仪表盘详细统计信息（管理员）"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        if period not in ['day', 'week', 'month']:
            period = 'week'
        
        stats = OrderDB.get_dashboard_stats(period)
        return success_response("获取仪表盘统计成功", stats)
    
    except Exception as e:
        logger.error(f"获取仪表盘统计失败: {e}")
        return error_response("获取仪表盘统计失败", 500)

@app.get("/admin/customers")
async def get_customers_with_purchases(request: Request, limit: Optional[int] = 5, offset: Optional[int] = 0):
    """获取购买过商品的客户列表（管理员）"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        # 参数验证和限制
        try:
            limit_val = int(limit or 5)
        except Exception:
            limit_val = 5
        if limit_val <= 0:
            limit_val = 5
        if limit_val > 50:  # 限制单次最多返回50个
            limit_val = 50
            
        try:
            offset_val = int(offset or 0)
        except Exception:
            offset_val = 0
        if offset_val < 0:
            offset_val = 0
        
        customers_data = OrderDB.get_customers_with_purchases(limit=limit_val, offset=offset_val)
        return success_response("获取客户列表成功", customers_data)
    
    except Exception as e:
        logger.error(f"获取客户列表失败: {e}")
        return error_response("获取客户列表失败", 500)

# ==================== AI聊天路由 ====================

from ai_chat import stream_chat

@app.post("/ai/chat")
async def ai_chat(
    request: ChatRequest,
    http_request: Request
):
    """AI聊天接口（支持未登录用户，但功能受限）"""
    try:
        # 尝试从Cookie获取用户信息，允许未登录
        user = None
        try:
            user = get_current_user_from_cookie(http_request)
            logger.info(f"AI聊天请求 - 用户ID: {user['id'] if user else 'anonymous'}")
        except Exception as e:
            logger.info(f"AI聊天请求 - 用户未登录: {e}")
        
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
        return await stream_chat(user, messages)
    except Exception as e:
        logger.error(f"AI聊天失败: {e}")
        raise HTTPException(status_code=500, detail="AI聊天服务暂时不可用")

 # ==================== 微信扫码支付相关（人工确认） ====================

@app.post("/orders/{order_id}/mark-paid")
async def mark_order_paid_pending(order_id: str, request: Request):
    """用户扫码后手动标记为待验证（processing）"""
    user = get_current_user_required_from_cookie(request)
    try:
        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)
        if order["student_id"] != user["id"]:
            return error_response("无权操作此订单", 403)

        current = order.get("payment_status") or "pending"
        if current == "succeeded":
            return error_response("订单已支付，无需重复操作", 400)
        if current == "processing":
            return success_response("订单已处于待验证状态")

        # 允许从 pending/failed 进入 processing
        if current not in ["pending", "failed"]:
            return error_response("当前订单支付状态不允许此操作", 400)

        ok = OrderDB.update_payment_status(order_id, "processing")
        if not ok:
            return error_response("更新订单支付状态失败", 500)
        return success_response("已标记为待验证", {"order_id": order_id, "payment_status": "processing"})
    except Exception as e:
        logger.error(f"用户标记订单待验证失败: {e}")
        return error_response("操作失败", 500)

# ==================== 抽奖功能 ====================

@app.post("/orders/{order_id}/lottery/draw")
async def draw_lottery(order_id: str, request: Request):
    """订单点击“已付款”后触发抽奖（订单商品金额满10元；每单一次）。"""
    user = get_current_user_required_from_cookie(request)
    try:
        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)
        if order["student_id"] != user["id"]:
            return error_response("无权操作此订单", 403)

        # 仅计算非抽奖项的小计（老订单不会有 is_lottery 字段，默认参与计算）
        items = order.get("items") or []
        items_subtotal = 0.0
        for it in items:
            if isinstance(it, dict) and it.get("is_lottery"):
                continue
            try:
                items_subtotal += float(it.get("subtotal", 0) or 0)
            except Exception:
                pass
        if items_subtotal < 10.0:
            return error_response("本单商品金额未满10元，不参与抽奖", 400)

        # 每个订单仅允许一次抽奖
        existing = LotteryDB.get_draw_by_order(order_id)
        if existing:
            return success_response("抽奖已完成", {
                "prize_name": existing.get("prize_name"),
                "already_drawn": True,
                "names": []
            })

        # 读取抽奖配置（每次读取）
        cfg_path = os.path.join(os.path.dirname(__file__), "lottery_config.json")
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        if not isinstance(cfg, dict):
            return error_response("抽奖配置无效", 500)
        # 允许空配置，此时100%为“谢谢参与”
        names = list(cfg.keys())
        # 过滤负值，转为非负数
        weights = [max(0.0, float(cfg.get(k, 0))) for k in names]
        sum_w = sum(weights)
        # 自动识别权重单位：
        # - 若总和 <= 1.000001，则视为小数形式（0.05=5%）
        # - 否则视为百分制（5=5% 或 50=50%）
        is_fraction = sum_w <= 1.000001
        scale = 1.0 if is_fraction else 100.0
        # 剩余“谢谢参与”概率
        leftover = max(0.0, scale - sum_w)
        total_w = sum_w + leftover
        if total_w <= 0:
            return error_response("抽奖配置权重无效", 500)
        # 随机抽取，包括“谢谢参与”（若leftover>0）
        rnd = random.random() * total_w
        acc = 0.0
        selected = None
        # 先在配置项中抽取
        for n, w in zip(names, weights):
            if w <= 0:
                continue
            acc += w
            if rnd <= acc:
                selected = n
                break
        # 若未命中且有剩余概率，则判定为“谢谢参与”
        if selected is None:
            selected = "谢谢参与"

        # 映射为商品ID（如果存在对应在售商品）；“谢谢参与”不映射
        prize_pid = None
        if selected != "谢谢参与":
            try:
                candidates = ProductDB.search_products(selected, active_only=True)
                exact = next((p for p in candidates if p.get("name") == selected), None)
                if exact:
                    prize_pid = exact.get("id")
                elif candidates:
                    prize_pid = candidates[0].get("id")
            except Exception:
                prize_pid = None

        # 记录抽奖结果
        LotteryDB.create_draw(order_id, user["id"], selected, prize_pid, 1)

        # 统一以百分比返回“谢谢参与”概率，便于调试/展示
        thanks_prob_percent = (leftover / scale) * 100.0 if total_w > 0 else 0.0
        return success_response("抽奖完成", {
            "prize_name": selected,
            "already_drawn": False,
            "names": names,
            "thanks_probability": round(thanks_prob_percent, 2)
        })
    except Exception as e:
        logger.error(f"抽奖失败: {e}")
        return error_response("抽奖失败", 500)

@app.get("/rewards/eligible")
async def get_eligible_rewards(request: Request):
    """获取当前用户可用（未消费）的抽奖奖品列表"""
    user = get_current_user_required_from_cookie(request)
    try:
        rewards = RewardDB.get_eligible_rewards(user["id"]) or []
        return success_response("获取奖品成功", {"rewards": rewards})
    except Exception as e:
        logger.error(f"获取奖品失败: {e}")
        return error_response("获取奖品失败", 500)

@app.patch("/admin/orders/{order_id}/payment-status")
async def admin_update_payment_status(order_id: str, payload: PaymentStatusUpdateRequest, request: Request):
    """管理员更新订单支付状态：pending/processing/succeeded/failed"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        new_status = payload.payment_status
        # 允许管理员将支付状态设置为 pending/processing/succeeded/failed
        if new_status not in ["pending", "processing", "succeeded", "failed"]:
            return error_response("无效的支付状态", 400)

        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)

        # 成功付款：扣减库存、更新状态、清空购物车
        if new_status == "succeeded":
            ok = OrderDB.complete_payment_and_update_stock(order_id)
            if not ok:
                return error_response("处理支付成功失败，可能库存不足或状态异常", 400)
            try:
                # 清空该用户购物车
                CartDB.update_cart(order["student_id"], {})
                # 缓存用户最近的收货信息
                if isinstance(order.get("shipping_info"), dict):
                    try:
                        UserProfileDB.upsert_shipping(order["student_id"], order["shipping_info"])
                    except Exception as e:
                        logger.warning(f"缓存用户收货信息失败: {e}")
                # 若该订单曾进行抽奖，确认成功后生成可用奖品
                try:
                    draw = LotteryDB.get_draw_by_order(order_id)
                    if draw:
                        RewardDB.add_reward_from_order(
                            student_id=order["student_id"],
                            prize_name=draw.get("prize_name"),
                            prize_product_id=draw.get("prize_product_id"),
                            quantity=int(draw.get("prize_quantity") or 1),
                            source_order_id=order_id
                        )
                except Exception as e:
                    logger.warning(f"生成抽奖奖品失败: {e}")
                # 若本单使用了优惠券，支付成功后删除该券（已使用不再显示）
                try:
                    c_id = order.get("coupon_id")
                    d_amt = float(order.get("discount_amount") or 0)
                    if c_id and d_amt > 0:
                        CouponDB.delete_coupon(c_id)
                except Exception as e:
                    logger.warning(f"删除已用优惠券失败: {e}")
            except Exception as e:
                logger.warning(f"清空购物车失败: {e}")
            return success_response("已标记为已支付", {"order_id": order_id, "payment_status": "succeeded"})

        # 失败、待验证或回退为未付款：仅更新支付状态
        ok = OrderDB.update_payment_status(order_id, new_status)
        if not ok:
            return error_response("更新支付状态失败", 500)
        # 若标记为未付款或失败，返还被锁定的优惠券
        try:
            if new_status in ["pending", "failed"]:
                c_id = order.get("coupon_id")
                d_amt = float(order.get("discount_amount") or 0)
                if c_id and d_amt > 0:
                    CouponDB.unlock_for_order(c_id, order_id)
        except Exception as e:
            logger.warning(f"返还优惠券失败: {e}")
        return success_response("支付状态已更新", {"order_id": order_id, "payment_status": new_status})
    except Exception as e:
        logger.error(f"管理员更新支付状态失败: {e}")
        return error_response("更新支付状态失败", 500)

@app.get("/healthz")
async def health_check():
    """健康检查"""
    return success_response("服务运行正常")

# ============== 用户资料（收货信息缓存） ==============

@app.get("/profile/shipping")
async def get_profile_shipping(request: Request):
    user = get_current_user_required_from_cookie(request)
    try:
        prof = UserProfileDB.get_shipping(user["id"])
        return success_response("获取收货资料成功", {"shipping": prof})
    except Exception as e:
        logger.error(f"获取收货资料失败: {e}")
        return error_response("获取收货资料失败", 500)

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=9099,
        reload=True,
        log_level="info"
    )
