# /backend/main.py
import os
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException, Depends, Request, Response, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

# 导入自定义模块
from database import (
    init_database, cleanup_old_chat_logs,
    UserDB, ProductDB, CartDB, ChatLogDB, AdminDB, CategoryDB, OrderDB
)
from auth import (
    AuthManager, get_current_user_optional, get_current_user_required,
    get_current_admin, set_auth_cookie, clear_auth_cookie,
    get_current_user_from_cookie, get_current_admin_required_from_cookie,
    get_current_user_required_from_cookie, success_response, error_response
)


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
    allow_origins=["*"],  # 生产环境应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件服务
items_dir = os.path.join(os.path.dirname(__file__), "items")
os.makedirs(items_dir, exist_ok=True)
app.mount("/items", StaticFiles(directory=items_dir), name="items")

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
    description: Optional[str] = None

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

class OrderCreateRequest(BaseModel):
    shipping_info: Dict[str, str]
    payment_method: str = 'wechat'
    note: str = ''

class OrderStatusUpdateRequest(BaseModel):
    status: str


class PaymentStatusUpdateRequest(BaseModel):
    payment_status: str

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

# ==================== 商品路由 ====================

@app.get("/products")
async def get_products(category: Optional[str] = None):
    """获取商品列表"""
    try:
        if category:
            products = ProductDB.get_products_by_category(category)
        else:
            products = ProductDB.get_all_products()
        
        return success_response("获取商品列表成功", {"products": products})
    
    except Exception as e:
        logger.error(f"获取商品失败: {e}")
        return error_response("获取商品失败", 500)

@app.get("/products/search")
async def search_products(q: str):
    """搜索商品"""
    try:
        products = ProductDB.search_products(q)
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
        total_quantity = 0
        total_price = 0.0
        
        for product_id, quantity in items_dict.items():
            if product_id in product_dict:
                product = product_dict[product_id]
                subtotal = product["price"] * quantity
                total_quantity += quantity
                total_price += subtotal
                
                cart_items.append({
                    "product_id": product_id,
                    "name": product["name"],
                    "unit_price": product["price"],
                    "quantity": quantity,
                    "subtotal": round(subtotal, 2),
                    "stock": product["stock"],
                    "category": product.get("category", ""),
                    "img_path": product.get("img_path", "")
                })
                
        logger.info(f"处理后的购物车数据 - 商品数: {len(cart_items)}, 总数量: {total_quantity}, 总价: {total_price}")
        
        cart_result = {
            "items": cart_items,
            "total_quantity": total_quantity,
            "total_price": round(total_price, 2)
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
            items.pop(cart_request.product_id, None)
        elif cart_request.action in ["add", "update"] and cart_request.product_id and cart_request.quantity is not None:
            # 验证商品是否存在并获取商品信息
            all_products = ProductDB.get_all_products()
            product = next((p for p in all_products if p["id"] == cart_request.product_id), None)
            
            if not product:
                logger.error(f"商品不存在: {cart_request.product_id}")
                return error_response("商品不存在", 400)
            
            if cart_request.action == "add":
                if cart_request.quantity <= 0:
                    logger.error(f"无效的数量: {cart_request.quantity}")
                    return error_response("数量必须大于0", 400)
                
                # 库存验证
                current_quantity = items.get(cart_request.product_id, 0)
                new_quantity = current_quantity + cart_request.quantity
                
                if new_quantity > product["stock"]:
                    logger.error(f"库存不足 - 商品: {cart_request.product_id}, 当前购物车数量: {current_quantity}, 尝试添加: {cart_request.quantity}, 总库存: {product['stock']}")
                    return error_response(f"库存不足，当前库存: {product['stock']}，购物车中已有: {current_quantity}", 400)
                
                items[cart_request.product_id] = new_quantity
                logger.info(f"添加商品后的购物车: {items}")
            else:  # update
                if cart_request.quantity > 0:
                    # 更新时也需要验证库存
                    if cart_request.quantity > product["stock"]:
                        logger.error(f"更新数量超过库存 - 商品: {cart_request.product_id}, 尝试设置: {cart_request.quantity}, 库存: {product['stock']}")
                        return error_response(f"数量超过库存，最大可设置: {product['stock']}", 400)
                    items[cart_request.product_id] = cart_request.quantity
                else:
                    items.pop(cart_request.product_id, None)
        else:
            # 如果没有匹配任何条件，记录错误日志
            logger.error(f"购物车更新条件不匹配 - 动作: {cart_request.action}, 商品ID: {cart_request.product_id}, 数量: {cart_request.quantity}")
            return error_response("无效的购物车更新请求", 400)
        
        # 更新数据库
        update_result = CartDB.update_cart(user["id"], items)
        logger.info(f"数据库更新结果: {update_result}, 最终购物车内容: {items}")
        
        return success_response("购物车更新成功", {"action": cart_request.action, "items": items})
    
    except Exception as e:
        logger.error(f"更新购物车失败: {e}")
        return error_response("更新购物车失败", 500)

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
        
        stats = {
            "total_products": len(products),
            "categories": len(categories),
            "total_stock": sum(p['stock'] for p in products),
            "recent_products": products[:5]  # 最近5个商品
        }
        
        return success_response("获取统计信息成功", stats)
    
    except Exception as e:
        logger.error(f"获取统计信息失败: {e}")
        return error_response("获取统计信息失败", 500)

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
        
        if not update_data:
            return error_response("没有提供更新数据", 400)
        
        # 注意：分类会自动创建，不需要验证是否存在
        
        success = ProductDB.update_product(product_id, update_data)
        if not success:
            return error_response("更新商品失败", 500)
        
        return success_response("商品更新成功")
    
    except Exception as e:
        logger.error(f"更新商品失败: {e}")
        return error_response("更新商品失败", 500)

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
            
            success = ProductDB.delete_product(product_id)
            if not success:
                return error_response("删除商品失败", 500)
            
            return success_response("商品删除成功")
    
    except Exception as e:
        logger.error(f"删除商品失败: {e}")
        return error_response("删除商品失败", 500)

# ==================== 分类管理路由 ====================

@app.get("/admin/categories")
async def get_admin_categories(request: Request):
    """获取所有分类（管理员）"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
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
        
        # 构建订单商品列表并计算总金额
        order_items = []
        total_amount = 0.0
        
        for product_id, quantity in items_dict.items():
            if product_id in product_dict:
                product = product_dict[product_id]
                
                # 检查库存
                if quantity > product["stock"]:
                    return error_response(f"商品 {product['name']} 库存不足", 400)
                
                subtotal = product["price"] * quantity
                total_amount += subtotal
                
                order_items.append({
                    "product_id": product_id,
                    "name": product["name"],
                    "unit_price": product["price"],
                    "quantity": quantity,
                    "subtotal": round(subtotal, 2),
                    "category": product.get("category", ""),
                    "img_path": product.get("img_path", "")
                })
        
        # 创建订单（暂不扣减库存，等待支付成功）
        order_id = OrderDB.create_order(
            student_id=user["id"],
            total_amount=round(total_amount, 2),
            shipping_info=order_request.shipping_info,
            items=order_items,
            payment_method=order_request.payment_method,
            note=order_request.note
        )
        
        # 注意：库存扣减移到支付成功后处理
        # 购物车清空也移到支付成功后处理
        
        return success_response("订单创建成功", {"order_id": order_id, "total_amount": round(total_amount, 2)})
    
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
        
        return success_response("获取订单详情成功", {"order": order})
    
    except Exception as e:
        logger.error(f"获取订单详情失败: {e}")
        return error_response("获取订单详情失败", 500)

# ==================== 管理员订单路由 ====================

@app.get("/admin/orders")
async def get_all_orders(request: Request):
    """获取所有订单（管理员）"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        orders = OrderDB.get_all_orders()
        stats = OrderDB.get_order_stats()
        return success_response("获取订单列表成功", {"orders": orders, "stats": stats})
    
    except Exception as e:
        logger.error(f"获取订单列表失败: {e}")
        return error_response("获取订单列表失败", 500)

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

@app.patch("/admin/orders/{order_id}/payment-status")
async def admin_update_payment_status(order_id: str, payload: PaymentStatusUpdateRequest, request: Request):
    """管理员更新订单支付状态：processing/succeeded/failed"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        new_status = payload.payment_status
        if new_status not in ["processing", "succeeded", "failed"]:
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
            except Exception as e:
                logger.warning(f"清空购物车失败: {e}")
            return success_response("已标记为已支付", {"order_id": order_id, "payment_status": "succeeded"})

        # 失败或待验证：仅更新支付状态
        ok = OrderDB.update_payment_status(order_id, new_status)
        if not ok:
            return error_response("更新支付状态失败", 500)
        return success_response("支付状态已更新", {"order_id": order_id, "payment_status": new_status})
    except Exception as e:
        logger.error(f"管理员更新支付状态失败: {e}")
        return error_response("更新支付状态失败", 500)

@app.get("/healthz")
async def health_check():
    """健康检查"""
    return success_response("服务运行正常")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
