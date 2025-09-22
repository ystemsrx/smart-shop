# /backend/main.py
import os
import re
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple, Set
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
    init_database, cleanup_old_chat_logs, get_db_connection,
    UserDB, ProductDB, CartDB, ChatLogDB, AdminDB, CategoryDB, OrderDB, AddressDB, BuildingDB, UserProfileDB,
    VariantDB, SettingsDB, LotteryDB, RewardDB, CouponDB, AutoGiftDB, GiftThresholdDB
)
from database import AgentAssignmentDB
from auth import (
    AuthManager, get_current_user_optional, get_current_user_required,
    get_current_admin, set_auth_cookie, clear_auth_cookie,
    get_current_user_from_cookie, get_current_admin_required_from_cookie,
    get_current_user_required_from_cookie, success_response, error_response,
    get_current_staff_required_from_cookie, get_current_super_admin_required_from_cookie,
    get_current_staff_from_cookie, get_current_agent_from_cookie, is_super_admin_role
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


def build_staff_scope(staff: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """根据工作人员信息计算可访问的订单/商品范围"""
    scope = {
        "owner_ids": None,
        "address_ids": None,
        "building_ids": None,
        "is_super_admin": False,
        "agent_id": None
    }
    if not staff:
        return scope

    scope["is_super_admin"] = is_super_admin_role(staff.get('role'))

    if staff.get('type') == 'agent':
        assignments = AgentAssignmentDB.get_buildings_for_agent(staff['id'])
        building_ids = [item['building_id'] for item in assignments if item.get('building_id')]
        address_ids = list({item['address_id'] for item in assignments if item.get('address_id')})
        scope.update({
            "owner_ids": [staff['id']],
            "address_ids": address_ids,
            "building_ids": building_ids,
            "agent_id": staff['id']
        })

    return scope


def require_agent_with_scope(request: Request) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Ensure the requester is an agent and return (agent, scope)."""
    agent = get_current_agent_from_cookie(request)
    if not agent:
        raise HTTPException(status_code=401, detail="需要代理权限")
    scope = build_staff_scope(agent)
    return agent, scope


def get_owner_id_for_staff(staff: Dict[str, Any]) -> Optional[str]:
    """Return the owner_id used to segregate staff resources."""
    if not staff:
        return None
    return staff.get('id') if staff.get('type') == 'agent' else None


def get_owner_id_from_scope(scope: Optional[Dict[str, Any]]) -> Optional[str]:
    if not scope:
        return None
    agent_id = scope.get('agent_id')
    return agent_id


def fix_legacy_product_ownership():
    """修复旧系统遗留的owner_id为None的商品，分配给统一的'admin'"""
    logger.info("开始检查并修复旧商品的归属...")
    
    try:
        # 获取所有owner_id为None的商品
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM products WHERE owner_id IS NULL OR owner_id = ''")
            count = cursor.fetchone()[0]
            
            if count == 0:
                logger.info("没有发现需要修复的商品")
                return
                
            logger.info(f"发现 {count} 个需要修复归属的商品")
            
            # 确保系统中有管理员存在
            cursor.execute("SELECT COUNT(*) FROM admins WHERE (role = 'super_admin' OR role = 'admin') AND is_active = 1")
            admin_count = cursor.fetchone()[0]
            
            if admin_count > 0:
                logger.info("将使用统一的'admin'作为默认归属")
                
                # 更新所有owner_id为None的商品，统一设置为'admin'
                cursor.execute(
                    "UPDATE products SET owner_id = ? WHERE owner_id IS NULL OR owner_id = ''",
                    ('admin',)
                )
                
                updated_count = cursor.rowcount
                conn.commit()
                logger.info(f"成功修复 {updated_count} 个商品的归属")
            else:
                logger.warning("未找到可用的管理员账户，跳过商品归属修复")
                
    except Exception as e:
        logger.error(f"修复商品归属时发生错误: {e}")
        raise


def migrate_admin_products_to_unified_owner():
    """将现有admin拥有的商品迁移到统一的'admin'owner_id"""
    logger.info("开始迁移现有admin商品到统一的owner_id...")
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 获取所有活跃的管理员ID
            cursor.execute("SELECT id FROM admins WHERE (role = 'super_admin' OR role = 'admin') AND is_active = 1")
            admin_ids = [row[0] for row in cursor.fetchall()]
            
            if not admin_ids:
                logger.info("没有找到活跃的管理员，跳过迁移")
                return
            
            # 查找所有属于这些管理员的商品
            placeholders = ', '.join(['?' for _ in admin_ids])
            cursor.execute(f"SELECT COUNT(*) FROM products WHERE owner_id IN ({placeholders})", admin_ids)
            count = cursor.fetchone()[0]
            
            if count == 0:
                logger.info("没有发现需要迁移的管理员商品")
                return
                
            logger.info(f"发现 {count} 个需要迁移到统一owner_id的管理员商品")
            
            # 更新所有属于管理员的商品，统一设置为'admin'
            cursor.execute(f"UPDATE products SET owner_id = ? WHERE owner_id IN ({placeholders})", ['admin'] + admin_ids)
            
            updated_count = cursor.rowcount
            conn.commit()
            logger.info(f"成功迁移 {updated_count} 个管理员商品到统一的'admin'归属")
                
    except Exception as e:
        logger.error(f"迁移管理员商品归属时发生错误: {e}")
        raise


def resolve_owner_id_for_staff(staff: Dict[str, Any], requested_owner_id: Optional[str]) -> Optional[str]:
    """Resolve the final owner_id a staff member is allowed to use."""
    if staff.get('type') == 'agent':
        return staff.get('id')
    
    # 对于admin：统一使用'admin'作为owner_id
    if requested_owner_id:
        # 如果指定了owner_id，验证其有效性
        owner_record = AdminDB.get_admin(requested_owner_id, include_disabled=True)
        if not owner_record:
            raise HTTPException(status_code=400, detail="指定的代理不存在")
        role = (owner_record.get('role') or '').lower()
        if role != 'agent' and not is_super_admin_role(role):
            raise HTTPException(status_code=400, detail="owner_id 必须为代理账号")
        return requested_owner_id
    else:
        # admin创建的商品统一归属为'admin'
        return 'admin'


def ensure_product_accessible(staff: Dict[str, Any], product_id: str) -> Dict[str, Any]:
    product = ProductDB.get_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    if not staff_can_access_product(staff, product):
        raise HTTPException(status_code=403, detail="无权操作该商品")
    return product


async def store_product_image(category: str, base_name: str, image: UploadFile) -> Tuple[str, str]:
    if not image:
        raise HTTPException(status_code=400, detail="未上传图片")
    safe_category = (category or "misc").strip() or "misc"
    category_dir = os.path.join(items_dir, safe_category)
    os.makedirs(category_dir, exist_ok=True)

    timestamp = int(datetime.now().timestamp())
    file_extension = os.path.splitext(image.filename or "")[1] or ".jpg"
    filename = f"{base_name}_{timestamp}{file_extension}"
    file_path = os.path.join(category_dir, filename)

    content = await image.read()
    with open(file_path, "wb") as f:
        f.write(content)

    relative_path = f"items/{safe_category}/{filename}"
    return relative_path, file_path


async def handle_product_creation(
    staff: Dict[str, Any],
    *,
    name: str,
    category: str,
    price: float,
    stock: int,
    description: str,
    cost: float,
    owner_id: Optional[str],
    image: Optional[UploadFile]
) -> Dict[str, Any]:
    new_file_path: Optional[str] = None
    try:
        assigned_owner_id = resolve_owner_id_for_staff(staff, owner_id)
        img_path = ""
        if image:
            img_path, new_file_path = await store_product_image(category, name, image)

        product_data = {
            "name": name,
            "category": category,
            "price": price,
            "stock": stock,
            "discount": 10.0,
            "description": description,
            "img_path": img_path,
            "cost": cost,
            "owner_id": assigned_owner_id
        }

        product_id = ProductDB.create_product(product_data)
        return success_response("商品创建成功", {"product_id": product_id})

    except HTTPException as exc:
        if new_file_path:
            try:
                os.remove(new_file_path)
            except Exception:
                pass
        return error_response(exc.detail, exc.status_code)
    except Exception as e:
        if new_file_path:
            try:
                os.remove(new_file_path)
            except Exception:
                pass
        logger.error(f"创建商品失败: {e}")
        return error_response("创建商品失败", 500)


async def handle_product_update(
    staff: Dict[str, Any],
    product_id: str,
    payload: "ProductUpdateRequest"
) -> Dict[str, Any]:
    try:
        existing_product = ensure_product_accessible(staff, product_id)
    except HTTPException as exc:
        return error_response(exc.detail, exc.status_code)

    update_data: Dict[str, Any] = {}

    if payload.name is not None:
        update_data['name'] = payload.name
    if payload.category is not None:
        update_data['category'] = payload.category
    if payload.price is not None:
        update_data['price'] = payload.price
    if payload.stock is not None:
        update_data['stock'] = payload.stock
    if payload.description is not None:
        update_data['description'] = payload.description
    if payload.discount is not None:
        try:
            discount_value = float(payload.discount)
            if discount_value < 0.5 or discount_value > 10:
                return error_response("折扣范围应为0.5~10折", 400)
            update_data['discount'] = discount_value
        except Exception:
            return error_response("无效的折扣", 400)
    if payload.is_active is not None:
        update_data['is_active'] = 1 if payload.is_active else 0
    if payload.cost is not None:
        if payload.cost < 0:
            return error_response("商品成本不能为负数", 400)
        update_data['cost'] = payload.cost

    if staff.get('type') == 'agent':
        update_data['owner_id'] = staff.get('id')
    elif payload.owner_id is not None:
        try:
            resolved_owner = resolve_owner_id_for_staff(staff, payload.owner_id)
        except HTTPException as exc:
            return error_response(exc.detail, exc.status_code)
        update_data['owner_id'] = resolved_owner

    if not update_data:
        return error_response("没有提供更新数据", 400)

    try:
        success = SettingsDB.update_product(product_id, update_data)
        if not success:
            return error_response("更新商品失败", 500)
    except Exception as e:
        logger.error(f"更新商品失败: {e}")
        return error_response("更新商品失败", 500)

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


async def handle_product_image_update(
    staff: Dict[str, Any],
    product_id: str,
    image: Optional[UploadFile]
) -> Dict[str, Any]:
    try:
        existing = ensure_product_accessible(staff, product_id)
    except HTTPException as exc:
        return error_response(exc.detail, exc.status_code)

    if not image:
        return error_response("未上传图片", 400)

    old_img_path = existing.get("img_path", "")
    category = existing.get("category", "misc") or "misc"
    base_name = existing.get("name", "prod") or "prod"

    try:
        img_path, new_file_path = await store_product_image(category, base_name, image)
    except HTTPException as exc:
        return error_response(exc.detail, exc.status_code)

    try:
        ok = SettingsDB.update_image_path(product_id, img_path)
    except Exception as e:
        ok = False
        logger.error(f"商品图片数据库更新失败: {e}")

    if not ok:
        try:
            os.remove(new_file_path)
        except Exception:
            pass
        return error_response("更新图片失败", 500)

    if old_img_path and str(old_img_path).strip():
        try:
            rel_path = str(old_img_path).lstrip('/\\')
            old_file_path = os.path.normpath(os.path.join(os.path.dirname(__file__), rel_path))
            items_root = os.path.normpath(items_dir)
            if old_file_path.startswith(items_root) and os.path.exists(old_file_path):
                os.remove(old_file_path)
                logger.info(f"成功删除原图片: {old_file_path}")
            else:
                logger.warning(f"跳过删除原图片（路径不安全或不存在）: {old_img_path} -> {old_file_path}")
        except Exception as e:
            logger.warning(f"删除原图片失败 {old_img_path}: {e}")

    return success_response("图片更新成功", {"img_path": img_path})


def build_product_listing_for_staff(
    staff: Dict[str, Any],
    scope: Dict[str, Any],
    *,
    query: Optional[str] = None,
    category: Optional[str] = None,
    include_inactive: bool = True
) -> Dict[str, Any]:
    owner_ids = scope.get('owner_ids')

    # 仅对拥有超级管理员权限的账号展示未归属商品，代理查看范围严格限制为自身数据
    include_unassigned = bool(scope.get('is_super_admin'))

    if staff.get('type') != 'agent':
        if owner_ids is None and not include_unassigned:
            owner_ids = []
            include_unassigned = True

    if query:
        products = ProductDB.search_products(
            query,
            active_only=not include_inactive,
            owner_ids=owner_ids,
            include_unassigned=include_unassigned
        )
    elif category:
        products = ProductDB.get_products_by_category(
            category,
            owner_ids=owner_ids,
            include_unassigned=include_unassigned
        )
    else:
        products = ProductDB.get_all_products(
            owner_ids=owner_ids,
            include_unassigned=include_unassigned
        )

    def is_active(product: Dict[str, Any]) -> bool:
        try:
            return int(product.get('is_active', 1) or 1) == 1
        except Exception:
            return True

    if not include_inactive:
        products = [p for p in products if is_active(p)]

    product_ids = [p['id'] for p in products if p.get('id')]
    variant_map = VariantDB.get_for_products(product_ids)
    for p in products:
        p['variants'] = variant_map.get(p.get('id'), [])

    categories = sorted({p.get('category') for p in products if p.get('category')})
    active_count = sum(1 for p in products if is_active(p))
    inactive_count = len(products) - active_count
    total_stock = 0
    for p in products:
        try:
            total_stock += max(int(p.get('stock', 0) or 0), 0)
        except Exception:
            continue

    return {
        "products": products,
        "stats": {
            "total": len(products),
            "active": active_count,
            "inactive": inactive_count,
            "total_stock": total_stock
        },
        "categories": categories,
        "scope": scope
    }


def resolve_owner_filter_for_staff(
    staff: Dict[str, Any],
    scope: Dict[str, Any],
    owner_param: Optional[str]
) -> Tuple[Optional[List[str]], bool, str]:
    """解析商品/分类统计的归属过滤"""
    if staff.get('type') == 'agent':
        return scope.get('owner_ids'), bool(scope.get('is_super_admin')), 'self'

    filter_value = (owner_param or '').strip() or 'self'
    lower = filter_value.lower()

    if lower == 'self':
        return [], True, 'self'

    if lower == 'all':
        return None, True, 'all'

    target = AdminDB.get_admin(filter_value, include_disabled=True)
    if not target or (target.get('role') or '').lower() != 'agent':
        raise HTTPException(status_code=400, detail="指定的代理不存在")

    return [filter_value], False, filter_value


def resolve_staff_order_scope(
    staff: Dict[str, Any],
    scope: Dict[str, Any],
    agent_param: Optional[str]
) -> Tuple[Optional[str], Optional[List[str]], Optional[List[str]], Optional[List[str]], Optional[List[str]], str]:
    selected_agent_id = scope.get('agent_id')
    selected_address_ids = scope.get('address_ids')
    selected_building_ids = scope.get('building_ids')
    exclude_address_ids: Optional[List[str]] = None
    exclude_building_ids: Optional[List[str]] = None

    if staff.get('type') == 'agent':
        return (
            staff.get('id'),
            selected_address_ids,
            selected_building_ids,
            None,
            None,
            'self'
        )

    filter_value = (agent_param or '').strip() or 'self'
    lower = filter_value.lower()

    if lower == 'all':
        return None, None, None, None, None, 'all'

    if lower == 'self':
        assignments = AgentAssignmentDB.list_agents_with_buildings(include_disabled=True)
        address_set: Set[str] = set()
        building_set: Set[str] = set()
        for entry in assignments:
            for record in entry.get('buildings') or []:
                addr_id = record.get('address_id')
                bld_id = record.get('building_id')
                if addr_id:
                    address_set.add(addr_id)
                if bld_id:
                    building_set.add(bld_id)
        return (
            None,
            None,
            None,
            list(address_set) if address_set else None,
            list(building_set) if building_set else None,
            'self'
        )

    target = AdminDB.get_admin(filter_value, include_disabled=True)
    if not target or (target.get('role') or '').lower() != 'agent':
        raise HTTPException(status_code=400, detail="指定的代理不存在")

    assignments = AgentAssignmentDB.get_buildings_for_agent(filter_value)
    address_ids = list({record.get('address_id') for record in assignments if record.get('address_id')}) or None
    building_ids = [record.get('building_id') for record in assignments if record.get('building_id')]

    return filter_value, address_ids, building_ids, None, None, filter_value


async def handle_product_stock_update(
    staff: Dict[str, Any],
    product_id: str,
    stock_data: "StockUpdateRequest"
) -> Dict[str, Any]:
    try:
        ensure_product_accessible(staff, product_id)
    except HTTPException as exc:
        return error_response(exc.detail, exc.status_code)

    if stock_data.stock < 0:
        return error_response("库存不能为负数", 400)

    try:
        success = ProductDB.update_stock(product_id, stock_data.stock)
    except Exception as e:
        logger.error(f"更新库存失败: {e}")
        return error_response("更新库存失败", 500)

    if not success:
        return error_response("更新库存失败", 500)

    return success_response("库存更新成功", {"new_stock": stock_data.stock})


def serialize_agent_account(agent: Dict[str, Any], include_buildings: bool = True) -> Dict[str, Any]:
    """将数据库中的管理员记录转换为前端需要的结构"""
    data = {
        "id": agent.get('id'),
        "name": agent.get('name'),
        "role": agent.get('role'),
        "type": 'agent' if (agent.get('role') or '').lower() == 'agent' else 'admin',
        "created_at": agent.get('created_at'),
        "payment_qr_path": agent.get('payment_qr_path'),
        "is_active": False if str(agent.get('is_active', 1)).strip() in ('0', 'False', 'false') else True
    }
    if include_buildings:
        data["buildings"] = AgentAssignmentDB.get_buildings_for_agent(agent.get('id'))
    return data


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


def resolve_shopping_scope(request: Request, address_id: Optional[str] = None, building_id: Optional[str] = None) -> Dict[str, Optional[str]]:
    """根据请求参数和用户资料确定购物范围与归属代理"""
    resolved_address_id = address_id
    resolved_building_id = building_id
    agent_id: Optional[str] = None

    staff = get_current_staff_from_cookie(request)
    if staff and staff.get('type') == 'agent':
        staff_agent_id = staff.get('id')
        owner_ids = [staff_agent_id] if staff_agent_id else None
        return {
            "agent_id": staff_agent_id,
            "address_id": None,
            "building_id": None,
            "owner_ids": owner_ids
        }

    user = get_current_user_from_cookie(request)
    if user:
        profile = UserProfileDB.get_shipping(user['id'])
        if profile:
            if not resolved_address_id:
                resolved_address_id = profile.get('address_id') or profile.get('dormitory')
            if not resolved_building_id:
                resolved_building_id = profile.get('building_id')

    # 修复Agent商品权限控制：
    # 1. 如果选择了具体楼栋，检查该楼栋是否分配给Agent
    # 2. 如果选择了地址但没有具体楼栋，检查该地址下是否有Agent分配
    # 3. 只有在明确有Agent分配的情况下，才限制显示Agent商品
    if resolved_building_id:
        assignment = AgentAssignmentDB.get_agent_for_building(resolved_building_id)
        if assignment and assignment.get('agent_id'):
            # 楼栋被分配给了Agent，显示该Agent的商品
            agent_id = assignment['agent_id']
            if not resolved_address_id:
                resolved_address_id = assignment.get('address_id')
    elif resolved_address_id:
        agents = AgentAssignmentDB.get_agent_ids_for_address(resolved_address_id)
        # 只有当地址下只有一个Agent时，才限制显示该Agent的商品
        # 如果地址下有多个Agent或没有Agent，则显示Admin商品
        if len(agents) == 1:
            agent_id = agents[0]
        # 如果len(agents) == 0 或 > 1，则agent_id保持为None，显示Admin商品

    # 修改owner_ids逻辑：
    # - 如果找到了唯一的agent_id，则只显示该Agent的商品
    # - 如果没有找到agent_id，则显示Admin的商品（统一使用'admin'）
    if agent_id:
        owner_ids = [agent_id]
    else:
        # 没有找到Agent，显示统一的Admin商品
        try:
            # 确认系统中有管理员存在
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM admins WHERE (role = 'super_admin' OR role = 'admin') AND is_active = 1")
                admin_count = cursor.fetchone()[0]
                if admin_count > 0:
                    owner_ids = ['admin']  # 使用统一的'admin'显示所有Admin商品
                else:
                    owner_ids = None  # 回退到显示未分配商品
        except Exception:
            owner_ids = None  # 出错时回退到显示未分配商品

    return {
        "agent_id": agent_id,
        "address_id": resolved_address_id,
        "building_id": resolved_building_id,
        "owner_ids": owner_ids
    }


def staff_can_access_product(staff: Dict[str, Any], product: Optional[Dict[str, Any]]) -> bool:
    if not product:
        return False
    if staff.get('type') == 'agent':
        return product.get('owner_id') == staff.get('id')
    return True


def staff_can_access_order(staff: Dict[str, Any], order: Optional[Dict[str, Any]], scope: Optional[Dict[str, Any]] = None) -> bool:
    if not order:
        return False
    scope = scope or build_staff_scope(staff)
    if scope.get('is_super_admin'):
        return True
    agent_id = scope.get('agent_id')
    if agent_id:
        if order.get('agent_id') == agent_id:
            return True
        buildings = scope.get('building_ids') or []
        addresses = scope.get('address_ids') or []
        if order.get('building_id') and order.get('building_id') in buildings:
            return True
        if order.get('address_id') and order.get('address_id') in addresses:
            return True
    return False

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

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
public_dir = os.path.join(project_root, "public")
os.makedirs(public_dir, exist_ok=True)

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
    cost: Optional[float] = None  # 商品成本
    owner_id: Optional[str] = None

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
    owner_id: Optional[str] = None
    is_active: Optional[bool] = None


class AgentCreateRequest(BaseModel):
    account: str
    password: str
    name: str
    building_ids: List[str] = []


class AgentUpdateRequest(BaseModel):
    password: Optional[str] = None
    name: Optional[str] = None
    building_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None


class LocationUpdateRequest(BaseModel):
    address_id: str
    building_id: str

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
    
    # 修复旧系统遗留的owner_id为None的商品，分配给默认admin
    try:
        fix_legacy_product_ownership()
    except Exception as e:
        logger.warning(f"修复旧商品归属失败: {e}")
    
    # 迁移现有admin商品到统一的'admin'owner_id
    try:
        migrate_admin_products_to_unified_owner()
    except Exception as e:
        logger.warning(f"迁移admin商品归属失败: {e}")
    
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
        staff_result = AuthManager.login_admin(request.student_id, request.password)
        if staff_result:
            set_auth_cookie(response, staff_result["access_token"])
            return success_response("登录成功", staff_result)

        result = await AuthManager.login_user(request.student_id, request.password)
        if not result:
            return error_response("账号或密码错误", 401)

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
            return error_response("账号或密码错误", 401)

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
    from auth import get_current_staff_from_cookie
    admin = get_current_staff_from_cookie(request)
    if admin:
        return success_response("获取工作人员信息成功", admin)

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
    staff = get_current_staff_required_from_cookie(request)
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
    owner_id = get_owner_id_for_staff(admin)
    try:
        items = CouponDB.list_all(student_id, owner_id=owner_id)
        return success_response("获取优惠券列表成功", {"coupons": items})
    except Exception as e:
        logger.error(f"管理员获取优惠券失败: {e}")
        return error_response("获取优惠券失败", 500)


@app.get("/agent/coupons")
async def agent_list_coupons(request: Request, student_id: Optional[str] = None):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        items = CouponDB.list_all(student_id, owner_id=owner_id)
        return success_response("获取优惠券列表成功", {"coupons": items})
    except Exception as e:
        logger.error(f"代理获取优惠券失败: {e}")
        return error_response("获取优惠券失败", 500)

@app.post("/admin/coupons/issue")
async def admin_issue_coupons(payload: CouponIssueRequest, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
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
        ids = CouponDB.issue_coupons(payload.student_id, amt, qty, expires_at, owner_id=owner_id)
        if not ids:
            return error_response("发放失败，学号不存在或其他错误", 400)
        return success_response("发放成功", {"issued": len(ids), "coupon_ids": ids})
    except Exception as e:
        logger.error(f"发放优惠券失败: {e}")
        return error_response("发放优惠券失败", 500)


@app.post("/agent/coupons/issue")
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
    except Exception as e:
        logger.error(f"代理发放优惠券失败: {e}")
        return error_response("发放优惠券失败", 500)

@app.patch("/admin/coupons/{coupon_id}/revoke")
async def admin_revoke_coupon(coupon_id: str, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        ok = CouponDB.revoke(coupon_id, owner_id)
        if not ok:
            return error_response("撤回失败或已撤回/不存在", 400)
        return success_response("已撤回")
    except Exception as e:
        logger.error(f"撤回优惠券失败: {e}")
        return error_response("撤回失败", 500)


@app.patch("/agent/coupons/{coupon_id}/revoke")
async def agent_revoke_coupon(coupon_id: str, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        ok = CouponDB.revoke(coupon_id, owner_id)
        if not ok:
            return error_response("撤回失败或已撤回/不存在", 400)
        return success_response("已撤回")
    except Exception as e:
        logger.error(f"代理撤回优惠券失败: {e}")
        return error_response("撤回失败", 500)

# ==================== 商品路由 ====================

@app.get("/products")
async def get_products(request: Request, category: Optional[str] = None, address_id: Optional[str] = None, building_id: Optional[str] = None):
    """获取商品列表"""
    try:
        scope = resolve_shopping_scope(request, address_id, building_id)
        owner_ids = scope["owner_ids"]
        
        # 修复Agent商品权限控制：
        # 现在所有商品都有owner_id，所以统一使用owner_ids过滤，不再依赖include_unassigned
        include_unassigned = False

        if category:
            products = ProductDB.get_products_by_category(category, owner_ids=owner_ids, include_unassigned=include_unassigned)
        else:
            products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
        # 补充规格信息
        product_ids = [p["id"] for p in products]
        variants_map = VariantDB.get_for_products(product_ids)
        for p in products:
            vts = variants_map.get(p["id"], [])
            p["variants"] = vts
            p["has_variants"] = len(vts) > 0
            if p["has_variants"]:
                p["total_variant_stock"] = sum(v.get("stock", 0) for v in vts)
        return success_response("获取商品列表成功", {"products": products, "scope": scope})
    
    except Exception as e:
        logger.error(f"获取商品失败: {e}")
        return error_response("获取商品失败", 500)

@app.get("/products/search")
async def search_products(request: Request, q: str, address_id: Optional[str] = None, building_id: Optional[str] = None):
    """搜索商品"""
    try:
        scope = resolve_shopping_scope(request, address_id, building_id)
        owner_ids = scope["owner_ids"]
        
        # 修复Agent商品权限控制：现在所有商品都有owner_id，统一使用owner_ids过滤
        include_unassigned = False
            
        products = ProductDB.search_products(q, owner_ids=owner_ids, include_unassigned=include_unassigned)
        product_ids = [p["id"] for p in products]
        variants_map = VariantDB.get_for_products(product_ids)
        for p in products:
            vts = variants_map.get(p["id"], [])
            p["variants"] = vts
            p["has_variants"] = len(vts) > 0
            if p["has_variants"]:
                p["total_variant_stock"] = sum(v.get("stock", 0) for v in vts)
        return success_response("搜索成功", {"products": products, "query": q, "scope": scope})
    
    except Exception as e:
        logger.error(f"搜索商品失败: {e}")
        return error_response("搜索失败", 500)

@app.get("/products/categories")
async def get_categories(request: Request, address_id: Optional[str] = None, building_id: Optional[str] = None):
    """获取商品分类（只返回有商品的分类）"""
    try:
        scope = resolve_shopping_scope(request, address_id, building_id)
        owner_ids = scope["owner_ids"]
        
        # 修复Agent商品权限控制：现在所有商品都有owner_id，统一使用owner_ids过滤
        include_unassigned = False
            
        # 返回前自动清理空分类
        try:
            CategoryDB.cleanup_orphan_categories()
        except Exception:
            pass
        categories = CategoryDB.get_categories_with_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
        return success_response("获取分类成功", {"categories": categories, "scope": scope})
    
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
    staff = get_current_staff_required_from_cookie(request)
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

# ==================== 代理管理 ====================

@app.get("/admin/agents")
async def admin_list_agents(request: Request, include_inactive: bool = False):
    staff = get_current_super_admin_required_from_cookie(request)
    include_disabled = str(include_inactive).lower() in ("1", "true", "yes")
    try:
        agents = AdminDB.list_admins(role='agent', include_disabled=include_disabled)
        data = [serialize_agent_account(agent) for agent in agents]
        return success_response("获取代理列表成功", {"agents": data})
    except Exception as e:
        logger.error(f"获取代理列表失败: {e}")
        return error_response("获取代理列表失败", 500)


@app.post("/admin/agents")
async def admin_create_agent(payload: AgentCreateRequest, request: Request):
    staff = get_current_super_admin_required_from_cookie(request)
    try:
        account = payload.account.strip()
        if not account:
            return error_response("账号不能为空", 400)
        if not payload.password or len(payload.password) < 4:
            return error_response("密码至少4位", 400)
        name = payload.name.strip() if payload.name else payload.account
        created = AdminDB.create_admin(account, payload.password, name, role='agent')
        if not created:
            return error_response("账号已存在", 400)

        valid_buildings, invalid_buildings = validate_building_ids(payload.building_ids)
        if valid_buildings:
            AgentAssignmentDB.set_agent_buildings(account, valid_buildings)

        agent = AdminDB.get_admin(account, include_disabled=True)
        data = serialize_agent_account(agent)
        data['invalid_buildings'] = invalid_buildings
        return success_response("代理创建成功", {"agent": data})
    except Exception as e:
        logger.error(f"创建代理失败: {e}")
        return error_response("创建代理失败", 500)


@app.put("/admin/agents/{agent_id}")
async def admin_update_agent(agent_id: str, payload: AgentUpdateRequest, request: Request):
    staff = get_current_super_admin_required_from_cookie(request)
    try:
        agent = AdminDB.get_admin(agent_id, include_disabled=True)
        if not agent or (agent.get('role') or '').lower() != 'agent':
            return error_response("代理不存在", 404)

        update_fields: Dict[str, Any] = {}
        if payload.password:
            if len(payload.password) < 4:
                return error_response("密码至少4位", 400)
            update_fields['password'] = payload.password
        if payload.name:
            update_fields['name'] = payload.name.strip()
        if payload.is_active is not None:
            update_fields['is_active'] = 1 if payload.is_active else 0

        if update_fields:
            AdminDB.update_admin(agent_id, **update_fields)

        invalid_buildings: List[str] = []
        if payload.building_ids is not None:
            valid_buildings, invalid_buildings = validate_building_ids(payload.building_ids)
            AgentAssignmentDB.set_agent_buildings(agent_id, valid_buildings)

        refreshed = AdminDB.get_admin(agent_id, include_disabled=True)
        data = serialize_agent_account(refreshed)
        if payload.building_ids is not None:
            data['invalid_buildings'] = invalid_buildings
        return success_response("代理更新成功", {"agent": data})
    except Exception as e:
        logger.error(f"更新代理失败: {e}")
        return error_response("更新代理失败", 500)


@app.delete("/admin/agents/{agent_id}")
async def admin_delete_agent(agent_id: str, request: Request):
    staff = get_current_super_admin_required_from_cookie(request)
    try:
        if agent_id in AdminDB.SAFE_SUPER_ADMINS:
            return error_response("禁止删除系统管理员", 400)
        agent = AdminDB.get_admin(agent_id, include_disabled=True)
        if not agent or (agent.get('role') or '').lower() != 'agent':
            return error_response("代理不存在", 404)
        AdminDB.soft_delete_admin(agent_id)
        AgentAssignmentDB.set_agent_buildings(agent_id, [])
        return success_response("代理已停用")
    except Exception as e:
        logger.error(f"删除代理失败: {e}")
        return error_response("删除代理失败", 500)


@app.post("/admin/agents/{agent_id}/payment-qr")
async def admin_upload_agent_qr(agent_id: str, request: Request, file: UploadFile = File(...)):
    staff = get_current_super_admin_required_from_cookie(request)
    try:
        agent = AdminDB.get_admin(agent_id, include_disabled=True)
        if not agent or (agent.get('role') or '').lower() != 'agent':
            return error_response("代理不存在", 404)
        if not file or not file.filename:
            return error_response("请上传图片文件", 400)

        ext = os.path.splitext(file.filename)[1].lower() or '.png'
        safe_name = agent.get('name') or agent_id
        safe_name = re.sub(r'[^0-9A-Za-z\u4e00-\u9fa5_-]+', '_', safe_name)
        filename = f"{safe_name}{ext}"
        target_path = os.path.join(public_dir, filename)

        content = await file.read()
        with open(target_path, 'wb') as f:
            f.write(content)

        web_path = f"/{filename}"
        previous = agent.get('payment_qr_path')
        if previous and previous != web_path:
            prev_rel = previous[1:] if previous.startswith('/') else previous
            prev_abs = os.path.join(public_dir, prev_rel)
            try:
                if os.path.exists(prev_abs) and os.path.isfile(prev_abs) and prev_abs != target_path:
                    os.remove(prev_abs)
            except Exception:
                logger.warning(f"删除旧收款码失败: {prev_abs}")

        AdminDB.update_admin(agent_id, payment_qr_path=web_path)
        refreshed = AdminDB.get_admin(agent_id, include_disabled=True)
        data = serialize_agent_account(refreshed)
        return success_response("收款码上传成功", {"agent": data})
    except Exception as e:
        logger.error(f"上传代理收款码失败: {e}")
        return error_response("上传收款码失败", 500)

# ==================== 购物车路由 ====================

@app.get("/cart")
async def get_cart(request: Request):
    """获取购物车"""
    # 验证用户登录状态
    user = get_current_user_required_from_cookie(request)

    try:
        logger.info(f"获取购物车请求 - 用户ID: {user['id']}")

        scope = resolve_shopping_scope(request)
        owner_ids = scope["owner_ids"]
        
        # 修复Agent商品权限控制：现在所有商品都有owner_id，统一使用owner_ids过滤
        include_unassigned = False

        cart_data = CartDB.get_cart(user["id"])
        if not cart_data:
            logger.info(f"用户 {user['id']} 没有购物车数据，返回空购物车")
            return success_response("获取购物车成功", {
                "items": [], 
                "total_quantity": 0, 
                "total_price": 0.0,
                "scope": scope
            })

        # 获取购物车中的商品信息
        items_dict = cart_data["items"]
        logger.info(f"购物车原始数据: {items_dict}")

        # 获取所有商品信息
        all_products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
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
        
        cart_result["scope"] = scope
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

        scope = resolve_shopping_scope(request)
        owner_ids = scope["owner_ids"]
        include_unassigned = False if owner_ids else True

        accessible_products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
        product_dict = {p["id"]: p for p in accessible_products}

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
            product = product_dict.get(cart_request.product_id)

            if not product:
                logger.error(f"商品无权访问或不存在: {cart_request.product_id}")
                return error_response("商品不在当前地址的可售范围内", 403)

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
        
        return success_response("购物车更新成功", {"action": cart_request.action, "items": cleaned, "scope": scope})
    
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
    staff = get_current_staff_required_from_cookie(request)
    try:
        product = ProductDB.get_product_by_id(product_id)
        if not product:
            return error_response("商品不存在", 404)
        if not staff_can_access_product(staff, product):
            return error_response("无权访问该商品", 403)
        return success_response("获取规格成功", {"variants": VariantDB.get_by_product(product_id)})
    except Exception as e:
        logger.error(f"获取规格失败: {e}")
        return error_response("获取规格失败", 500)


@app.get("/agent/products/{product_id}/variants")
async def agent_list_variants(product_id: str, request: Request):
    require_agent_with_scope(request)
    return await list_variants(product_id, request)


@app.post("/admin/products/{product_id}/variants")
async def create_variant(product_id: str, payload: VariantCreate, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        product = ProductDB.get_product_by_id(product_id)
        if not product:
            return error_response("商品不存在", 404)
        if not staff_can_access_product(staff, product):
            return error_response("无权访问该商品", 403)
        vid = VariantDB.create_variant(product_id, payload.name, payload.stock)
        return success_response("规格创建成功", {"variant_id": vid})
    except Exception as e:
        logger.error(f"规格创建失败: {e}")
        return error_response("规格创建失败", 500)


@app.post("/agent/products/{product_id}/variants")
async def agent_create_variant(product_id: str, payload: VariantCreate, request: Request):
    require_agent_with_scope(request)
    return await create_variant(product_id, payload, request)


@app.put("/admin/variants/{variant_id}")
async def update_variant(variant_id: str, payload: VariantUpdate, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        variant = VariantDB.get_by_id(variant_id)
        if not variant:
            return error_response("规格不存在", 404)
        product = ProductDB.get_product_by_id(variant.get('product_id'))
        if not staff_can_access_product(staff, product):
            return error_response("无权访问该商品", 403)
        ok = VariantDB.update_variant(variant_id, payload.name, payload.stock)
        if not ok:
            return error_response("无有效更新项", 400)
        return success_response("规格已更新")
    except Exception as e:
        logger.error(f"规格更新失败: {e}")
        return error_response("规格更新失败", 500)


@app.put("/agent/variants/{variant_id}")
async def agent_update_variant(variant_id: str, payload: VariantUpdate, request: Request):
    require_agent_with_scope(request)
    return await update_variant(variant_id, payload, request)


@app.delete("/admin/variants/{variant_id}")
async def delete_variant(variant_id: str, request: Request):
    staff = get_current_staff_required_from_cookie(request)
    try:
        variant = VariantDB.get_by_id(variant_id)
        if not variant:
            return error_response("规格不存在", 404)
        product = ProductDB.get_product_by_id(variant.get('product_id'))
        if not staff_can_access_product(staff, product):
            return error_response("无权访问该商品", 403)
        ok = VariantDB.delete_variant(variant_id)
        if not ok:
            return error_response("规格不存在", 404)
        return success_response("规格已删除")
    except Exception as e:
        logger.error(f"规格删除失败: {e}")
        return error_response("规格删除失败", 500)


@app.delete("/agent/variants/{variant_id}")
async def agent_delete_variant(variant_id: str, request: Request):
    require_agent_with_scope(request)
    return await delete_variant(variant_id, request)


# ==================== 管理员路由 ====================

@app.post("/admin/products")
async def create_product(
    request: Request,
    name: str = Form(...),
    category: str = Form(...),
    price: float = Form(...),
    stock: int = Form(0),
    description: str = Form(""),
    cost: float = Form(0.0),
    owner_id: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None)
):
    """管理员创建商品"""
    # 验证管理员权限
    staff = get_current_staff_required_from_cookie(request)
    return await handle_product_creation(
        staff,
        name=name,
        category=category,
        price=price,
        stock=stock,
        description=description,
        cost=cost,
        owner_id=owner_id,
        image=image
    )


@app.post("/agent/products")
async def agent_create_product(
    request: Request,
    name: str = Form(...),
    category: str = Form(...),
    price: float = Form(...),
    stock: int = Form(0),
    description: str = Form(""),
    cost: float = Form(0.0),
    image: Optional[UploadFile] = File(None)
):
    agent, _ = require_agent_with_scope(request)
    # Agent创建的商品应该明确设置为该Agent的ID作为owner_id
    agent_owner_id = get_owner_id_for_staff(agent)
    return await handle_product_creation(
        agent,
        name=name,
        category=category,
        price=price,
        stock=stock,
        description=description,
        cost=cost,
        owner_id=agent_owner_id,
        image=image
    )


@app.get("/admin/products")
async def admin_list_products(
    request: Request,
    q: Optional[str] = None,
    category: Optional[str] = None,
    include_inactive: Optional[bool] = True,
    owner_id: Optional[str] = None
):
    staff = get_current_staff_required_from_cookie(request)

    query = q.strip() if isinstance(q, str) and q.strip() else None
    category_filter = category.strip() if isinstance(category, str) and category.strip() else None

    if include_inactive is None:
        include_inactive_flag = True
    elif isinstance(include_inactive, str):
        include_inactive_flag = include_inactive.strip().lower() not in ('false', '0', 'no')
    else:
        include_inactive_flag = bool(include_inactive)

    scope = build_staff_scope(staff)
    owner_ids, include_unassigned, _ = resolve_owner_filter_for_staff(staff, scope, owner_id)
    scope_override = dict(scope)
    scope_override['owner_ids'] = owner_ids
    scope_override['is_super_admin'] = include_unassigned

    data = build_product_listing_for_staff(
        staff,
        scope_override,
        query=query,
        category=category_filter,
        include_inactive=include_inactive_flag
    )
    return success_response("获取商品列表成功", data)


@app.get("/agent/products")
async def agent_list_products(
    request: Request,
    q: Optional[str] = None,
    category: Optional[str] = None,
    include_inactive: bool = True
):
    agent, scope = require_agent_with_scope(request)
    query = q.strip() if isinstance(q, str) else None
    category_filter = category.strip() if isinstance(category, str) and category.strip() else None
    data = build_product_listing_for_staff(
        agent,
        scope,
        query=query,
        category=category_filter,
        include_inactive=include_inactive
    )
    return success_response("获取商品列表成功", data)

@app.get("/admin/stats")
async def get_admin_stats(request: Request, owner_id: Optional[str] = None):
    """获取管理统计信息"""
    # 验证管理员权限
    staff = get_current_staff_required_from_cookie(request)

    try:
        scope = build_staff_scope(staff)
        owner_ids, include_unassigned, normalized_filter = resolve_owner_filter_for_staff(staff, scope, owner_id)

        products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
        try:
            CategoryDB.cleanup_orphan_categories()
        except Exception:
            pass
        categories = CategoryDB.get_categories_with_products(
            owner_ids=owner_ids,
            include_unassigned=include_unassigned
        )
        # 注册人数
        try:
            users_count = UserDB.count_users()
        except Exception:
            users_count = 0

        total_stock = 0
        for p in products:
            try:
                total_stock += max(int(p.get('stock', 0) or 0), 0)
            except Exception:
                continue

        stats = {
            "total_products": len(products),
            "categories": len(categories),
            "total_stock": total_stock,
            "recent_products": products[:5],  # 最近5个商品
            "users_count": users_count,
            "scope": scope,
            "owner_filter": normalized_filter
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
    staff = get_current_staff_required_from_cookie(request)

    try:
        product = ProductDB.get_product_by_id(product_id)
        if not product:
            return error_response("商品不存在", 404)
        if not staff_can_access_product(staff, product):
            return error_response("无权访问该商品", 403)

        return success_response("获取商品详情成功", {"product": product})
    
    except Exception as e:
        logger.error(f"获取商品详情失败: {e}")
        return error_response("获取商品详情失败", 500)


@app.get("/agent/products/{product_id}")
async def agent_get_product_details(product_id: str, request: Request):
    require_agent_with_scope(request)
    return await get_product_details(product_id, request)

@app.put("/admin/products/{product_id}")
async def update_product(
    product_id: str,
    product_data: "ProductUpdateRequest",
    request: Request
):
    """更新商品信息"""
    staff = get_current_staff_required_from_cookie(request)
    return await handle_product_update(staff, product_id, product_data)


@app.put("/agent/products/{product_id}")
async def agent_update_product(
    product_id: str,
    product_data: "ProductUpdateRequest",
    request: Request
):
    agent, _ = require_agent_with_scope(request)
    return await handle_product_update(agent, product_id, product_data)

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
    stock_data: "StockUpdateRequest",
    request: Request
):
    """更新商品库存"""
    staff = get_current_staff_required_from_cookie(request)
    return await handle_product_stock_update(staff, product_id, stock_data)


@app.patch("/agent/products/{product_id}/stock")
async def agent_update_product_stock(
    product_id: str,
    stock_data: "StockUpdateRequest",
    request: Request
):
    agent, _ = require_agent_with_scope(request)
    return await handle_product_stock_update(agent, product_id, stock_data)

@app.delete("/admin/products/{product_id}")
async def delete_products(
    product_id: str, 
    request: Request,
    delete_request: Optional[ProductDeleteRequest] = None
):
    """删除商品（支持单个或批量）"""
    staff = get_current_staff_required_from_cookie(request)

    try:
        if delete_request and delete_request.product_ids:
            product_ids = delete_request.product_ids
            if len(product_ids) > 100:
                return error_response("批量删除数量不能超过100件商品", 400)

            allowed_ids: List[str] = []
            for pid in product_ids:
                product = ProductDB.get_product_by_id(pid)
                if product and staff_can_access_product(staff, product):
                    allowed_ids.append(pid)

            if not allowed_ids:
                return error_response("无权删除指定商品", 403)

            logger.info(f"工作人员 {staff['id']} 请求批量删除商品: {allowed_ids}")
            result = ProductDB.batch_delete_products(allowed_ids)

            if not result.get("success"):
                logger.error(f"批量删除失败: {result.get('message')}")
                return error_response(result.get("message", "批量删除失败"), 400)

            try:
                for pid in result.get("deleted_ids", []) or []:
                    try:
                        removed = CartDB.remove_product_from_all_carts(pid)
                        logger.info(f"商品 {pid} 批量删除后，已从 {removed} 个购物车中移除")
                    except Exception as er:
                        logger.warning(f"批量删除后移除购物车商品失败 {pid}: {er}")
            except Exception as e:
                logger.warning(f"批量移除购物车商品异常: {e}")

            deleted_img_paths = result.get("deleted_img_paths", [])
            for img_path in deleted_img_paths:
                try:
                    img_file_path = os.path.join(os.path.dirname(__file__), img_path)
                    if os.path.exists(img_file_path):
                        os.remove(img_file_path)
                        logger.info(f"成功删除商品图片: {img_file_path}")
                except Exception as e:
                    logger.warning(f"删除商品图片失败 {img_path}: {e}")

            return success_response(result.get("message", "批量删除商品成功"), {
                "deleted_count": result.get("deleted_count", 0),
                "deleted_ids": result.get("deleted_ids", []),
                "not_found_ids": result.get("not_found_ids", [])
            })

        # 单个删除
        existing_product = ProductDB.get_product_by_id(product_id)
        if not existing_product:
            return error_response("商品不存在", 404)
        if not staff_can_access_product(staff, existing_product):
            return error_response("无权删除该商品", 403)

        img_path = existing_product.get("img_path", "")
        success = ProductDB.delete_product(product_id)
        if not success:
            return error_response("删除商品失败", 500)

        try:
            removed = CartDB.remove_product_from_all_carts(product_id)
            logger.info(f"商品 {product_id} 删除后，已从 {removed} 个购物车中移除")
        except Exception as e:
            logger.warning(f"删除后移除购物车商品失败: {e}")

        if img_path and img_path.strip():
            try:
                img_file_path = os.path.join(os.path.dirname(__file__), img_path)
                if os.path.exists(img_file_path):
                    os.remove(img_file_path)
                    logger.info(f"成功删除商品图片: {img_file_path}")
            except Exception as e:
                logger.warning(f"删除商品图片失败 {img_path}: {e}")

        return success_response("商品删除成功")

    except Exception as e:
        logger.error(f"删除商品失败: {e}")
        return error_response("删除商品失败", 500)


@app.delete("/agent/products/{product_id}")
async def agent_delete_products(
    product_id: str,
    request: Request,
    delete_request: Optional[ProductDeleteRequest] = None
):
    require_agent_with_scope(request)
    return await delete_products(product_id, request, delete_request)

@app.post("/admin/products/{product_id}/image")
async def update_product_image(
    product_id: str,
    request: Request,
    image: Optional[UploadFile] = File(None)
):
    """更新商品图片（仅图片）"""
    staff = get_current_staff_required_from_cookie(request)
    return await handle_product_image_update(staff, product_id, image)


@app.post("/agent/products/{product_id}/image")
async def agent_update_product_image(
    product_id: str,
    request: Request,
    image: Optional[UploadFile] = File(None)
):
    agent, _ = require_agent_with_scope(request)
    return await handle_product_image_update(agent, product_id, image)

# ==================== 分类管理路由 ====================

@app.get("/admin/categories")
async def get_admin_categories(request: Request, owner_id: Optional[str] = None):
    """获取所有分类（管理员）"""
    # 验证管理员权限
    admin = get_current_admin_required_from_cookie(request)
    
    try:
        scope = build_staff_scope(admin)
        owner_ids, include_unassigned, _ = resolve_owner_filter_for_staff(admin, scope, owner_id)

        try:
            CategoryDB.cleanup_orphan_categories()
        except Exception:
            pass
        categories = CategoryDB.get_categories_with_products(
            owner_ids=owner_ids,
            include_unassigned=include_unassigned
        )
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

        shipping_info = dict(order_request.shipping_info or {})
        scope = resolve_shopping_scope(
            request,
            address_id=shipping_info.get('address_id'),
            building_id=shipping_info.get('building_id')
        )

        if not scope.get('building_id'):
            return error_response("请先选择收货地址", 400)

        owner_ids = scope["owner_ids"]
        include_unassigned = False if owner_ids else True

        # 同步回写标准化后的地址信息
        shipping_info['address_id'] = scope.get('address_id')
        shipping_info['building_id'] = scope.get('building_id')
        if scope.get('agent_id'):
            shipping_info['agent_id'] = scope['agent_id']

        # 获取购物车中的商品信息
        items_dict = cart_data["items"]
        all_products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
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

        # 新的满额赠品系统：支持多层次门槛配置
        owner_scope_id = get_owner_id_from_scope(scope)

        try:
            applicable_thresholds = GiftThresholdDB.get_applicable_thresholds(items_subtotal, owner_scope_id)
            logger.info(f"订单金额 {items_subtotal} 元，适用门槛: {[t.get('threshold_amount') for t in applicable_thresholds]}")
            
            for threshold in applicable_thresholds:
                threshold_id = threshold.get('id')
                threshold_amount = threshold.get('threshold_amount', 0)
                gift_products = threshold.get('gift_products', 0) == 1
                gift_coupon = threshold.get('gift_coupon', 0) == 1
                coupon_amount = threshold.get('coupon_amount', 0)
                applicable_times = threshold.get('applicable_times', 0)
                
                # 处理商品赠品
                if gift_products and applicable_times > 0:
                    try:
                        selected_gifts = GiftThresholdDB.pick_gifts_for_threshold(threshold_id, owner_scope_id, applicable_times)
                        for gift in selected_gifts:
                            gift_item = {
                                "product_id": gift.get('product_id'),
                                "name": gift.get('display_name') or gift.get('product_name') or '满额赠品',
                                "unit_price": 0.0,
                                "quantity": 1,
                                "subtotal": 0.0,
                                "category": gift.get('category') or '满额赠品',
                                "img_path": gift.get('img_path') or '',
                                "is_auto_gift": True,
                                "auto_gift_item_id": gift.get('threshold_item_id'),
                                "auto_gift_product_name": gift.get('product_name'),
                                "auto_gift_variant_name": gift.get('variant_name'),
                                "gift_threshold_id": threshold_id,
                                "gift_threshold_amount": threshold_amount
                            }
                            if gift.get('variant_id'):
                                gift_item['variant_id'] = gift.get('variant_id')
                                if gift.get('variant_name'):
                                    gift_item['variant_name'] = gift.get('variant_name')
                            order_items.append(gift_item)
                    except Exception as e:
                        logger.warning(f"生成满额赠品失败 (门槛{threshold_amount}): {e}")
                
                # 处理优惠券赠品（在订单创建时不发放，记录信息供支付成功后发放）
                if gift_coupon and coupon_amount > 0 and applicable_times > 0:
                    logger.info(f"记录满额优惠券待发放：{applicable_times} 张 {coupon_amount} 元（门槛{threshold_amount}）")
        except Exception as e:
            logger.warning(f"处理满额赠品配置失败: {e}")

        # 若已达满10门槛，则自动附加可用抽奖奖品（不计入总价）
        rewards_attached_ids: List[str] = []
        if items_subtotal >= 10.0:
            try:
                rewards = RewardDB.get_eligible_rewards(user["id"]) or []
                for r in rewards:
                    qty = int(r.get("prize_quantity") or 1)
                    prize_name = r.get("prize_name") or "抽奖奖品"
                    prize_pid = r.get("prize_product_id") or f"prize_{int(datetime.now().timestamp())}"
                    prize_variant_id = r.get("prize_variant_id")
                    prize_variant_name = r.get("prize_variant_name")
                    prize_product_name = r.get("prize_product_name") or prize_name
                    try:
                        recorded_value = float(r.get("prize_unit_price") or 0.0)
                    except Exception:
                        recorded_value = 0.0
                    lottery_item = {
                        "product_id": prize_pid,
                        "name": prize_name,
                        "unit_price": 0.0,
                        "quantity": qty,
                        "subtotal": 0.0,
                        "category": "抽奖",
                        "is_lottery": True,
                        "lottery_display_name": prize_name,
                        "lottery_product_id": prize_pid,
                        "lottery_product_name": prize_product_name,
                        "lottery_variant_id": prize_variant_id,
                        "lottery_variant_name": prize_variant_name,
                        "lottery_unit_price": recorded_value,
                        "lottery_group_id": r.get("prize_group_id"),
                        "lottery_reward_id": r.get("id")
                    }
                    if prize_variant_id:
                        lottery_item["variant_id"] = prize_variant_id
                        if prize_variant_name:
                            lottery_item["variant_name"] = prize_variant_name
                    order_items.append(lottery_item)
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
                coupon = CouponDB.check_valid_for_student(order_request.coupon_id, user["id"], owner_scope_id)  # 校验归属、状态、未过期
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
            shipping_info=shipping_info,
            items=order_items,
            payment_method=order_request.payment_method,
            note=order_request.note,
            discount_amount=discount_amount,
            coupon_id=used_coupon_id,
            address_id=scope.get('address_id'),
            building_id=scope.get('building_id'),
            agent_id=scope.get('agent_id')
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
            shipping_profile = dict(shipping_info)
            UserProfileDB.upsert_shipping(user["id"], shipping_profile)
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
async def get_all_orders(
    request: Request,
    limit: Optional[int] = 20,
    offset: Optional[int] = 0,
    order_id: Optional[str] = None,
    agent_id: Optional[str] = None
):
    """获取订单（管理员）——支持分页与按订单ID精确搜索。
    默认每次最多返回20条，通过翻页继续获取，避免一次拿全表。
    """
    staff = get_current_staff_required_from_cookie(request)

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

        scope = build_staff_scope(staff)
        (
            selected_agent_id,
            selected_address_ids,
            selected_building_ids,
            exclude_address_ids,
            exclude_building_ids,
            selected_filter
        ) = resolve_staff_order_scope(staff, scope, agent_id)

        page_data = OrderDB.get_orders_paginated(
            order_id=order_id,
            limit=limit_val,
            offset=offset_val,
            agent_id=selected_agent_id,
            address_ids=selected_address_ids,
            building_ids=selected_building_ids,
            exclude_address_ids=exclude_address_ids,
            exclude_building_ids=exclude_building_ids
        )
        orders = page_data.get("orders", [])
        total = int(page_data.get("total", 0))

        # 为管理员订单列表也添加时间戳转换
        for order in orders:
            if order.get("created_at"):
                order["created_at_timestamp"] = convert_sqlite_timestamp_to_unix(order["created_at"], order["id"])

        stats = OrderDB.get_order_stats(
            agent_id=selected_agent_id,
            address_ids=selected_address_ids,
            building_ids=selected_building_ids,
            exclude_address_ids=exclude_address_ids,
            exclude_building_ids=exclude_building_ids
        )
        has_more = (offset_val + len(orders)) < total
        return success_response("获取订单列表成功", {
            "orders": orders,
            "stats": stats,
            "total": total,
            "limit": limit_val,
            "offset": offset_val,
            "has_more": has_more,
            "scope": scope,
            "selected_agent_id": selected_agent_id,
            "selected_agent_filter": selected_filter or 'self'
        })
    
    except Exception as e:
        logger.error(f"获取订单列表失败: {e}")
        return error_response("获取订单列表失败", 500)


@app.get("/agent/orders")
async def get_agent_orders(request: Request, limit: Optional[int] = 20, offset: Optional[int] = 0, order_id: Optional[str] = None):
    """获取订单列表（代理）"""
    _agent, scope = require_agent_with_scope(request)

    try:
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

        page_data = OrderDB.get_orders_paginated(
            order_id=order_id,
            limit=limit_val,
            offset=offset_val,
            agent_id=scope.get('agent_id'),
            address_ids=scope.get('address_ids'),
            building_ids=scope.get('building_ids')
        )

        orders = page_data.get("orders", [])
        total = int(page_data.get("total", 0))

        for order in orders:
            if order.get("created_at"):
                order["created_at_timestamp"] = convert_sqlite_timestamp_to_unix(order["created_at"], order["id"])

        stats = OrderDB.get_order_stats(
            agent_id=scope.get('agent_id'),
            address_ids=scope.get('address_ids'),
            building_ids=scope.get('building_ids')
        )

        has_more = (offset_val + len(orders)) < total

        return success_response("获取订单列表成功", {
            "orders": orders,
            "stats": stats,
            "total": total,
            "limit": limit_val,
            "offset": offset_val,
            "has_more": has_more,
            "scope": scope
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"代理获取订单列表失败: {e}")
        return error_response("获取订单列表失败", 500)

@app.get("/admin/lottery-config")
async def admin_get_lottery_config(request: Request):
    """读取抽奖配置（管理员）。"""
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        prizes = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True)
        return success_response("获取抽奖配置成功", {"prizes": prizes})
    except Exception as e:
        logger.error(f"读取抽奖配置失败: {e}")
        return error_response("读取抽奖配置失败", 500)


@app.get("/agent/lottery-config")
async def agent_get_lottery_config(request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        prizes = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True)
        return success_response("获取抽奖配置成功", {"prizes": prizes})
    except Exception as e:
        logger.error(f"代理读取抽奖配置失败: {e}")
        return error_response("读取抽奖配置失败", 500)


class LotteryPrizeItemInput(BaseModel):
    id: Optional[str] = None
    product_id: str
    variant_id: Optional[str] = None


class LotteryPrizeInput(BaseModel):
    id: Optional[str] = None
    display_name: str
    weight: float
    is_active: Optional[bool] = True
    items: List[LotteryPrizeItemInput] = []


class LotteryConfigUpdateRequest(BaseModel):
    prizes: List[LotteryPrizeInput] = []


class AutoGiftItemInput(BaseModel):
    product_id: str
    variant_id: Optional[str] = None


class AutoGiftUpdateRequest(BaseModel):
    items: List[AutoGiftItemInput] = []


# 满额门槛配置模型
class GiftThresholdCreate(BaseModel):
    threshold_amount: float
    gift_products: bool = False
    gift_coupon: bool = False
    coupon_amount: float = 0.0
    items: List[AutoGiftItemInput] = []


class GiftThresholdUpdate(BaseModel):
    threshold_amount: Optional[float] = None
    gift_products: Optional[bool] = None
    gift_coupon: Optional[bool] = None
    coupon_amount: Optional[float] = None
    is_active: Optional[bool] = None
    items: Optional[List[AutoGiftItemInput]] = None


def _persist_lottery_prize_from_payload(
    prize: LotteryPrizeInput,
    owner_id: Optional[str],
    override_id: Optional[str] = None
) -> str:
    display_name = (prize.display_name or '').strip()
    if not display_name:
        raise ValueError("奖项名称不能为空")
    try:
        weight_value = float(prize.weight)
    except Exception:
        raise ValueError("奖项权重必须为数字")
    is_active = True if prize.is_active is None else bool(prize.is_active)
    items_payload: List[Dict[str, Any]] = []
    for item in prize.items or []:
        if not item.product_id:
            continue
        items_payload.append({
            'id': item.id,
            'product_id': item.product_id,
            'variant_id': item.variant_id
        })
    return LotteryDB.upsert_prize(
        override_id or prize.id,
        display_name,
        weight_value,
        is_active,
        items_payload,
        owner_id
    )


def _search_inventory_for_selector(term: Optional[str], staff: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    scope = build_staff_scope(staff) if staff else None
    owner_ids = scope.get('owner_ids') if scope else None
    include_unassigned = scope.get('is_super_admin') if scope else True
    try:
        if term:
            products = ProductDB.search_products(term, active_only=True, owner_ids=owner_ids, include_unassigned=include_unassigned)
        else:
            products = ProductDB.get_all_products(owner_ids=owner_ids, include_unassigned=include_unassigned)
    except Exception as e:
        logger.error(f"搜索商品失败: {e}")
        return []

    filtered: List[Dict[str, Any]] = []
    try:
        product_ids = [p['id'] for p in products]
    except Exception:
        product_ids = []

    variant_map: Dict[str, List[Dict[str, Any]]] = {}
    if product_ids:
        try:
            variant_map = VariantDB.get_for_products(product_ids)
        except Exception as e:
            logger.warning(f"获取规格失败: {e}")
            variant_map = {}

    for product in products:
        try:
            is_active = int(product.get('is_active', 1) or 1) == 1
        except Exception:
            is_active = True
        if not is_active:
            continue

        try:
            base_price = float(product.get('price') or 0)
        except Exception:
            base_price = 0.0
        try:
            discount = float(product.get('discount', 10.0) or 10.0)
        except Exception:
            discount = 10.0
        retail_price = round(base_price * (discount / 10.0), 2)

        variants = variant_map.get(product.get('id')) or []
        if variants:
            for variant in variants:
                try:
                    stock = int(variant.get('stock') or 0)
                except Exception:
                    stock = 0
                # 修改：允许缺货商品也被搜索到，但标记为不可用
                available = stock > 0
                filtered.append({
                    'product_id': product.get('id'),
                    'product_name': product.get('name'),
                    'variant_id': variant.get('id'),
                    'variant_name': variant.get('name'),
                    'stock': stock,
                    'retail_price': retail_price,
                    'img_path': product.get('img_path'),
                    'category': product.get('category'),
                    'available': available
                })
        else:
            try:
                stock = int(product.get('stock') or 0)
            except Exception:
                stock = 0
            # 修改：允许缺货商品也被搜索到，但标记为不可用
            available = stock > 0
            filtered.append({
                'product_id': product.get('id'),
                'product_name': product.get('name'),
                'variant_id': None,
                'variant_name': None,
                'stock': stock,
                'retail_price': retail_price,
                'img_path': product.get('img_path'),
                'category': product.get('category'),
                'available': available
            })

    filtered.sort(key=lambda x: (x.get('product_name') or '', x.get('variant_name') or ''))
    return filtered[:100]


@app.put("/admin/lottery-config")
async def admin_update_lottery_config(payload: LotteryConfigUpdateRequest, request: Request):
    """批量更新抽奖配置，完全覆盖现有奖项。"""
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        prizes_payload = payload.prizes or []
        saved_ids: List[str] = []
        for prize in prizes_payload:
            saved_id = _persist_lottery_prize_from_payload(prize, owner_id)
            saved_ids.append(saved_id)
        LotteryDB.delete_prizes_not_in(saved_ids, owner_id)
        refreshed = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True)
        return success_response("抽奖配置已更新", {"prizes": refreshed})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as e:
        logger.error(f"更新抽奖配置失败: {e}")
        return error_response("更新抽奖配置失败", 500)


@app.put("/agent/lottery-config")
async def agent_update_lottery_config(payload: LotteryConfigUpdateRequest, request: Request):
    """代理批量更新抽奖配置，完全覆盖自身奖项。"""
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        prizes_payload = payload.prizes or []
        saved_ids: List[str] = []
        for prize in prizes_payload:
            saved_id = _persist_lottery_prize_from_payload(prize, owner_id)
            saved_ids.append(saved_id)
        LotteryDB.delete_prizes_not_in(saved_ids, owner_id)
        refreshed = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True)
        return success_response("抽奖配置已更新", {"prizes": refreshed})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as e:
        logger.error(f"代理更新抽奖配置失败: {e}")
        return error_response("更新抽奖配置失败", 500)


@app.get("/admin/auto-gifts")
async def admin_get_auto_gifts(request: Request):
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        items = AutoGiftDB.list_items(owner_id)
        return success_response("获取满额赠品配置成功", {"items": items})
    except Exception as e:
        logger.error(f"读取满额赠品配置失败: {e}")
        return error_response("读取满额赠品配置失败", 500)


@app.put("/admin/auto-gifts")
async def admin_update_auto_gifts(payload: AutoGiftUpdateRequest, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        items = payload.items or []
        unique: set = set()
        normalized: List[Dict[str, Optional[str]]] = []
        for item in items:
            key = (item.product_id, item.variant_id or None)
            if key in unique:
                continue
            unique.add(key)
            normalized.append({'product_id': item.product_id, 'variant_id': item.variant_id})
        AutoGiftDB.replace_items(owner_id, normalized)
        refreshed = AutoGiftDB.list_items(owner_id)
        return success_response("满额赠品配置已更新", {"items": refreshed})
    except Exception as e:
        logger.error(f"更新满额赠品配置失败: {e}")
        return error_response("更新满额赠品配置失败", 500)


@app.get("/admin/auto-gifts/search")
async def admin_search_auto_gift_items(request: Request, query: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    try:
        results = _search_inventory_for_selector(query, staff=admin)
        return success_response("搜索成功", {"items": results})
    except Exception as e:
        logger.error(f"搜索满额赠品候选失败: {e}")
        return error_response("搜索满额赠品候选失败", 500)


@app.get("/agent/auto-gifts")
async def agent_get_auto_gifts(request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        items = AutoGiftDB.list_items(owner_id)
        return success_response("获取满额赠品配置成功", {"items": items})
    except Exception as e:
        logger.error(f"代理读取满额赠品配置失败: {e}")
        return error_response("读取满额赠品配置失败", 500)


@app.put("/agent/auto-gifts")
async def agent_update_auto_gifts(payload: AutoGiftUpdateRequest, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        items = payload.items or []
        unique: set = set()
        normalized: List[Dict[str, Optional[str]]] = []
        for item in items:
            key = (item.product_id, item.variant_id or None)
            if key in unique:
                continue
            unique.add(key)
            normalized.append({'product_id': item.product_id, 'variant_id': item.variant_id})
        AutoGiftDB.replace_items(owner_id, normalized)
        refreshed = AutoGiftDB.list_items(owner_id)
        return success_response("满额赠品配置已更新", {"items": refreshed})
    except Exception as e:
        logger.error(f"代理更新满额赠品配置失败: {e}")
        return error_response("更新满额赠品配置失败", 500)


@app.get("/agent/auto-gifts/search")
async def agent_search_auto_gift_items(request: Request, query: Optional[str] = None):
    agent, _ = require_agent_with_scope(request)
    try:
        results = _search_inventory_for_selector(query, staff=agent)
        return success_response("搜索成功", {"items": results})
    except Exception as e:
        logger.error(f"代理搜索满额赠品候选失败: {e}")
        return error_response("搜索满额赠品候选失败", 500)


@app.get("/auto-gifts")
async def public_get_auto_gifts():
    try:
        items = AutoGiftDB.get_available_items(owner_id=None)
        return success_response("获取满额赠品成功", {"items": items})
    except Exception as e:
        logger.error(f"获取满额赠品失败: {e}")
        return error_response("获取满额赠品失败", 500)


@app.get("/gift-thresholds")
async def public_get_gift_thresholds():
    """获取启用的满额门槛配置（公共接口）"""
    try:
        thresholds = GiftThresholdDB.list_all(owner_id=None, include_inactive=False)
        # 为公共接口简化数据，只返回必要信息
        simplified_thresholds = []
        for threshold in thresholds:
            available_items = [item for item in threshold.get('items', []) if item.get('available')]
            
            # 找到库存最高的商品（与实际赠送逻辑保持一致）
            selected_product_name = ''
            if available_items:
                # 按库存排序，选择库存最高的
                available_items.sort(key=lambda x: x.get('stock', 0), reverse=True)
                chosen_item = available_items[0]
                name = chosen_item.get('product_name', '')
                if chosen_item.get('variant_name'):
                    name += f"（{chosen_item.get('variant_name')}）"
                selected_product_name = name
            
            simplified = {
                'threshold_amount': threshold.get('threshold_amount'),
                'gift_products': threshold.get('gift_products', 0) == 1,
                'gift_coupon': threshold.get('gift_coupon', 0) == 1,
                'coupon_amount': threshold.get('coupon_amount', 0),
                'products_count': len(available_items),
                'selected_product_name': selected_product_name  # 只显示将被赠送的商品名称
            }
            simplified_thresholds.append(simplified)
        
        return success_response("获取满额门槛配置成功", {"thresholds": simplified_thresholds})
    except Exception as e:
        logger.error(f"获取满额门槛配置失败: {e}")
        return error_response("获取满额门槛配置失败", 500)


@app.post("/admin/lottery-prizes")
async def admin_create_lottery_prize(payload: LotteryPrizeInput, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        prize_id = _persist_lottery_prize_from_payload(payload, owner_id)
        prize = next((p for p in LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True) if p.get('id') == prize_id), None)
        return success_response("抽奖奖项已创建", {"prize": prize})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as e:
        logger.error(f"创建抽奖奖项失败: {e}")
        return error_response("创建抽奖奖项失败", 500)


@app.post("/agent/lottery-prizes")
async def agent_create_lottery_prize(payload: LotteryPrizeInput, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        prize_id = _persist_lottery_prize_from_payload(payload, owner_id)
        prize = next((p for p in LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True) if p.get('id') == prize_id), None)
        return success_response("抽奖奖项已创建", {"prize": prize})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as e:
        logger.error(f"代理创建抽奖奖项失败: {e}")
        return error_response("创建抽奖奖项失败", 500)


@app.put("/admin/lottery-prizes/{prize_id}")
async def admin_update_lottery_prize(prize_id: str, payload: LotteryPrizeInput, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        updated_id = _persist_lottery_prize_from_payload(payload, owner_id, override_id=prize_id)
        prize = next((p for p in LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True) if p.get('id') == updated_id), None)
        if not prize:
            return error_response("奖项不存在", 404)
        return success_response("抽奖奖项已更新", {"prize": prize})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as e:
        logger.error(f"更新抽奖奖项失败: {e}")
        return error_response("更新抽奖奖项失败", 500)


@app.put("/agent/lottery-prizes/{prize_id}")
async def agent_update_lottery_prize(prize_id: str, payload: LotteryPrizeInput, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        updated_id = _persist_lottery_prize_from_payload(payload, owner_id, override_id=prize_id)
        prize = next((p for p in LotteryDB.list_prizes(owner_id=owner_id, include_inactive=True) if p.get('id') == updated_id), None)
        if not prize:
            return error_response("奖项不存在", 404)
        return success_response("抽奖奖项已更新", {"prize": prize})
    except ValueError as ve:
        return error_response(str(ve), 400)
    except Exception as e:
        logger.error(f"代理更新抽奖奖项失败: {e}")
        return error_response("更新抽奖奖项失败", 500)


@app.delete("/admin/lottery-prizes/{prize_id}")
async def admin_delete_lottery_prize(prize_id: str, request: Request):
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        ok = LotteryDB.delete_prize(prize_id, owner_id)
        if not ok:
            return error_response("奖项不存在", 404)
        return success_response("抽奖奖项已删除")
    except Exception as e:
        logger.error(f"删除抽奖奖项失败: {e}")
        return error_response("删除抽奖奖项失败", 500)


@app.delete("/agent/lottery-prizes/{prize_id}")
async def agent_delete_lottery_prize(prize_id: str, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        ok = LotteryDB.delete_prize(prize_id, owner_id)
        if not ok:
            return error_response("奖项不存在", 404)
        return success_response("抽奖奖项已删除")
    except Exception as e:
        logger.error(f"代理删除抽奖奖项失败: {e}")
        return error_response("删除抽奖奖项失败", 500)


@app.get("/admin/lottery-prizes/search")
async def admin_search_lottery_prize_items(request: Request, query: Optional[str] = None):
    admin = get_current_admin_required_from_cookie(request)
    try:
        results = _search_inventory_for_selector(query, staff=admin)
        return success_response("搜索成功", {"items": results})
    except Exception as e:
        logger.error(f"搜索抽奖候选商品失败: {e}")
        return error_response("搜索抽奖候选商品失败", 500)


@app.get("/agent/lottery-prizes/search")
async def agent_search_lottery_prize_items(request: Request, query: Optional[str] = None):
    agent, _ = require_agent_with_scope(request)
    try:
        results = _search_inventory_for_selector(query, staff=agent)
        return success_response("搜索成功", {"items": results})
    except Exception as e:
        logger.error(f"代理搜索抽奖候选商品失败: {e}")
        return error_response("搜索抽奖候选商品失败", 500)


# ==================== 满额门槛配置管理（管理员） ====================

@app.get("/admin/gift-thresholds")
async def admin_get_gift_thresholds(request: Request, include_inactive: bool = False):
    """获取满额门槛配置列表（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=include_inactive)
        return success_response("获取满额门槛配置成功", {"thresholds": thresholds})
    except Exception as e:
        logger.error(f"获取满额门槛配置失败: {e}")
        return error_response("获取满额门槛配置失败", 500)


@app.get("/agent/gift-thresholds")
async def agent_get_gift_thresholds(request: Request, include_inactive: bool = False):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=include_inactive)
        return success_response("获取满额门槛配置成功", {"thresholds": thresholds})
    except Exception as e:
        logger.error(f"代理获取满额门槛配置失败: {e}")
        return error_response("获取满额门槛配置失败", 500)


@app.post("/admin/gift-thresholds")
async def admin_create_gift_threshold(payload: GiftThresholdCreate, request: Request):
    """创建满额门槛配置（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        if payload.threshold_amount <= 0:
            return error_response("门槛金额必须大于0", 400)

        if payload.gift_coupon and payload.coupon_amount <= 0:
            return error_response("优惠券金额必须大于0", 400)

        # 创建门槛配置
        threshold_id = GiftThresholdDB.create_threshold(
            owner_id=owner_id,
            threshold_amount=payload.threshold_amount,
            gift_products=payload.gift_products,
            gift_coupon=payload.gift_coupon,
            coupon_amount=payload.coupon_amount if payload.gift_coupon else 0.0
        )

        # 添加商品到门槛
        if payload.items and payload.gift_products:
            items_data = []
            for item in payload.items:
                if item.product_id:
                    items_data.append({
                        'product_id': item.product_id,
                        'variant_id': item.variant_id
                    })
            if items_data:
                GiftThresholdDB.add_items_to_threshold(threshold_id, owner_id, items_data)

        threshold = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        return success_response("满额门槛配置创建成功", {"threshold": threshold})
    except Exception as e:
        logger.error(f"创建满额门槛配置失败: {e}")
        return error_response("创建满额门槛配置失败", 500)


@app.post("/agent/gift-thresholds")
async def agent_create_gift_threshold(payload: GiftThresholdCreate, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        if payload.threshold_amount <= 0:
            return error_response("门槛金额必须大于0", 400)

        if payload.gift_coupon and payload.coupon_amount <= 0:
            return error_response("优惠券金额必须大于0", 400)

        threshold_id = GiftThresholdDB.create_threshold(
            owner_id=owner_id,
            threshold_amount=payload.threshold_amount,
            gift_products=payload.gift_products,
            gift_coupon=payload.gift_coupon,
            coupon_amount=payload.coupon_amount if payload.gift_coupon else 0.0
        )

        if payload.items and payload.gift_products:
            items_data = []
            for item in payload.items:
                if item.product_id:
                    items_data.append({
                        'product_id': item.product_id,
                        'variant_id': item.variant_id
                    })
            if items_data:
                GiftThresholdDB.add_items_to_threshold(threshold_id, owner_id, items_data)

        threshold = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        return success_response("满额门槛配置创建成功", {"threshold": threshold})
    except Exception as e:
        logger.error(f"代理创建满额门槛配置失败: {e}")
        return error_response("创建满额门槛配置失败", 500)


@app.put("/admin/gift-thresholds/{threshold_id}")
async def admin_update_gift_threshold(threshold_id: str, payload: GiftThresholdUpdate, request: Request):
    """更新满额门槛配置（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        existing = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        if not existing:
            return error_response("门槛配置不存在", 404)
        
        if payload.threshold_amount is not None and payload.threshold_amount <= 0:
            return error_response("门槛金额必须大于0", 400)
        
        if payload.gift_coupon and payload.coupon_amount is not None and payload.coupon_amount <= 0:
            return error_response("优惠券金额必须大于0", 400)
        
        # 更新基础配置
        GiftThresholdDB.update_threshold(
            threshold_id=threshold_id,
            owner_id=owner_id,
            threshold_amount=payload.threshold_amount,
            gift_products=payload.gift_products,
            gift_coupon=payload.gift_coupon,
            coupon_amount=payload.coupon_amount,
            is_active=payload.is_active
        )

        # 更新商品列表
        if payload.items is not None:
            items_data = []
            for item in payload.items:
                if item.product_id:
                    items_data.append({
                        'product_id': item.product_id,
                        'variant_id': item.variant_id
                    })
            GiftThresholdDB.add_items_to_threshold(threshold_id, owner_id, items_data)

        threshold = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        return success_response("满额门槛配置更新成功", {"threshold": threshold})
    except Exception as e:
        logger.error(f"更新满额门槛配置失败: {e}")
        return error_response("更新满额门槛配置失败", 500)


@app.put("/agent/gift-thresholds/{threshold_id}")
async def agent_update_gift_threshold(threshold_id: str, payload: GiftThresholdUpdate, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        existing = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        if not existing:
            return error_response("门槛配置不存在", 404)

        if payload.threshold_amount is not None and payload.threshold_amount <= 0:
            return error_response("门槛金额必须大于0", 400)

        if payload.gift_coupon and payload.coupon_amount is not None and payload.coupon_amount <= 0:
            return error_response("优惠券金额必须大于0", 400)

        GiftThresholdDB.update_threshold(
            threshold_id=threshold_id,
            owner_id=owner_id,
            threshold_amount=payload.threshold_amount,
            gift_products=payload.gift_products,
            gift_coupon=payload.gift_coupon,
            coupon_amount=payload.coupon_amount,
            is_active=payload.is_active
        )

        if payload.items is not None:
            items_data = []
            for item in payload.items:
                if item.product_id:
                    items_data.append({
                        'product_id': item.product_id,
                        'variant_id': item.variant_id
                    })
            GiftThresholdDB.add_items_to_threshold(threshold_id, owner_id, items_data)

        threshold = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        return success_response("满额门槛配置更新成功", {"threshold": threshold})
    except Exception as e:
        logger.error(f"代理更新满额门槛配置失败: {e}")
        return error_response("更新满额门槛配置失败", 500)


@app.delete("/admin/gift-thresholds/{threshold_id}")
async def admin_delete_gift_threshold(threshold_id: str, request: Request):
    """删除满额门槛配置（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    owner_id = get_owner_id_for_staff(admin)
    try:
        existing = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        if not existing:
            return error_response("门槛配置不存在", 404)

        success = GiftThresholdDB.delete_threshold(threshold_id, owner_id)
        if not success:
            return error_response("删除满额门槛配置失败", 500)

        return success_response("满额门槛配置删除成功")
    except Exception as e:
        logger.error(f"删除满额门槛配置失败: {e}")
        return error_response("删除满额门槛配置失败", 500)


@app.delete("/agent/gift-thresholds/{threshold_id}")
async def agent_delete_gift_threshold(threshold_id: str, request: Request):
    agent, _ = require_agent_with_scope(request)
    owner_id = get_owner_id_for_staff(agent)
    try:
        existing = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        if not existing:
            return error_response("门槛配置不存在", 404)

        success = GiftThresholdDB.delete_threshold(threshold_id, owner_id)
        if not success:
            return error_response("删除满额门槛配置失败", 500)

        return success_response("满额门槛配置删除成功")
    except Exception as e:
        logger.error(f"代理删除满额门槛配置失败: {e}")
        return error_response("删除满额门槛配置失败", 500)


@app.get("/admin/gift-thresholds/search")
async def admin_search_gift_threshold_items(request: Request, query: Optional[str] = None):
    """搜索满额门槛赠品候选商品（管理员）"""
    admin = get_current_admin_required_from_cookie(request)
    try:
        results = _search_inventory_for_selector(query, staff=admin)
        return success_response("搜索成功", {"items": results})
    except Exception as e:
        logger.error(f"搜索满额门槛赠品候选失败: {e}")
        return error_response("搜索满额门槛赠品候选失败", 500)


@app.get("/agent/gift-thresholds/search")
async def agent_search_gift_threshold_items(request: Request, query: Optional[str] = None):
    """搜索满额门槛赠品候选商品（代理）"""
    agent, _ = require_agent_with_scope(request)
    try:
        results = _search_inventory_for_selector(query, staff=agent)
        return success_response("搜索成功", {"items": results})
    except Exception as e:
        logger.error(f"代理搜索满额门槛赠品候选失败: {e}")
        return error_response("搜索满额门槛赠品候选失败", 500)


class OrderDeleteRequest(BaseModel):
    order_ids: Optional[List[str]] = None

@app.delete("/admin/orders/{order_id}")
async def admin_delete_orders(order_id: str, request: Request, delete_request: Optional[OrderDeleteRequest] = None):
    """删除订单（支持单个或批量）"""
    staff = get_current_staff_required_from_cookie(request)
    try:
        scope = build_staff_scope(staff)
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
            accessible_ids: List[str] = []
            for od in orders_before:
                if not od:
                    continue
                if not staff_can_access_order(staff, od, scope):
                    return error_response("无权删除部分订单", 403)
                accessible_ids.append(od['id'])
            if not accessible_ids:
                return success_response("未找到可删除的订单", {
                    "deleted_count": 0,
                    "deleted_ids": [],
                    "not_found_ids": ids
                })
            result = OrderDB.batch_delete_orders(accessible_ids)
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
                if not staff_can_access_order(staff, od, scope):
                    return error_response("无权删除此订单", 403)
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
    staff = get_current_staff_required_from_cookie(request)

    try:
        # 验证状态值
        valid_statuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']
        if status_request.status not in valid_statuses:
            return error_response("无效的订单状态", 400)
        
        # 检查订单是否存在
        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)
        scope = build_staff_scope(staff)
        if not staff_can_access_order(staff, order, scope):
            return error_response("无权操作该订单", 403)

        # 更新状态
        success = OrderDB.update_order_status(order_id, status_request.status)
        if not success:
            return error_response("更新订单状态失败", 500)
        
        return success_response("订单状态更新成功", {"order_id": order_id, "new_status": status_request.status})
    
    except Exception as e:
        logger.error(f"更新订单状态失败: {e}")
        return error_response("更新订单状态失败", 500)

@app.get("/admin/order-stats")
async def get_order_statistics(request: Request, agent_id: Optional[str] = None):
    """获取订单统计信息（管理员）"""
    staff = get_current_staff_required_from_cookie(request)

    try:
        scope = build_staff_scope(staff)
        (
            selected_agent_id,
            selected_address_ids,
            selected_building_ids,
            exclude_address_ids,
            exclude_building_ids,
            resolved_filter
        ) = resolve_staff_order_scope(staff, scope, agent_id)

        stats = OrderDB.get_order_stats(
            agent_id=selected_agent_id,
            address_ids=selected_address_ids,
            building_ids=selected_building_ids,
            exclude_address_ids=exclude_address_ids,
            exclude_building_ids=exclude_building_ids
        )
        stats["scope"] = scope
        stats["selected_agent_filter"] = resolved_filter
        return success_response("获取订单统计成功", stats)

    except Exception as e:
        logger.error(f"获取订单统计失败: {e}")
        return error_response("获取订单统计失败", 500)

@app.get("/admin/dashboard-stats")
async def get_dashboard_statistics(request: Request, period: str = 'week'):
    """获取仪表盘详细统计信息（管理员）"""
    staff = get_current_staff_required_from_cookie(request)

    try:
        if period not in ['day', 'week', 'month']:
            period = 'week'

        scope = build_staff_scope(staff)
        stats = OrderDB.get_dashboard_stats(
            period,
            agent_id=scope.get('agent_id'),
            address_ids=scope.get('address_ids'),
            building_ids=scope.get('building_ids')
        )
        stats["scope"] = scope
        return success_response("获取仪表盘统计成功", stats)
    
    except Exception as e:
        logger.error(f"获取仪表盘统计失败: {e}")
        return error_response("获取仪表盘统计失败", 500)


@app.get("/agent/dashboard-stats")
async def get_agent_dashboard_statistics(request: Request, period: str = 'week'):
    """获取仪表盘详细统计信息（代理）"""
    _agent, scope = require_agent_with_scope(request)

    try:
        if period not in ['day', 'week', 'month']:
            period = 'week'

        stats = OrderDB.get_dashboard_stats(
            period,
            agent_id=scope.get('agent_id'),
            address_ids=scope.get('address_ids'),
            building_ids=scope.get('building_ids')
        )
        stats["scope"] = scope
        return success_response("获取仪表盘统计成功", stats)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"代理获取仪表盘统计失败: {e}")
        return error_response("获取仪表盘统计失败", 500)

@app.get("/admin/customers")
async def get_customers_with_purchases(request: Request, limit: Optional[int] = 5, offset: Optional[int] = 0):
    """获取购买过商品的客户列表（管理员）"""
    staff = get_current_staff_required_from_cookie(request)

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

        scope = build_staff_scope(staff)
        customers_data = OrderDB.get_customers_with_purchases(
            limit=limit_val,
            offset=offset_val,
            agent_id=scope.get('agent_id'),
            address_ids=scope.get('address_ids'),
            building_ids=scope.get('building_ids')
        )
        customers_data['scope'] = scope
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
            if isinstance(it, dict) and (it.get("is_lottery") or it.get("is_auto_gift")):
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
            prize_name = existing.get("prize_name")
            prize_detail = None
            if prize_name and prize_name != "谢谢参与":
                prize_detail = {
                    "display_name": prize_name,
                    "product_id": existing.get("prize_product_id"),
                    "product_name": existing.get("prize_product_name"),
                    "variant_id": existing.get("prize_variant_id"),
                    "variant_name": existing.get("prize_variant_name"),
                    "group_id": existing.get("prize_group_id"),
                }
            return success_response("抽奖已完成", {
                "prize_name": prize_name,
                "already_drawn": True,
                "names": [prize_name] if prize_name else [],
                "prize": prize_detail
            })

        owner_id = order.get('agent_id') or None
        prize_groups = LotteryDB.get_active_prizes_for_draw(owner_id)
        names = [p.get("display_name") for p in prize_groups if p.get("display_name")]
        weights = [max(0.0, float(p.get("weight") or 0)) for p in prize_groups]
        sum_w = sum(weights)
        is_fraction = sum_w <= 1.000001
        scale = 1.0 if is_fraction else 100.0
        # 剩余“谢谢参与”概率
        leftover = max(0.0, scale - sum_w)
        total_w = sum_w + leftover
        if total_w <= 0:
            return error_response("抽奖配置权重无效", 500)

        rnd = random.random() * total_w
        acc = 0.0
        selected_group = None
        for group, weight in zip(prize_groups, weights):
            if weight <= 0:
                continue
            acc += weight
            if rnd <= acc:
                selected_group = group
                break

        selected_item = None
        if selected_group:
            available_items = [item for item in selected_group.get("items", []) if item.get("available")]
            total_stock = sum(max(0, int(item.get("stock") or 0)) for item in available_items)
            if total_stock > 0:
                rnd_item = random.random() * total_stock
                stock_acc = 0.0
                for item in available_items:
                    stock_val = max(0, int(item.get("stock") or 0))
                    stock_acc += stock_val
                    if rnd_item <= stock_acc:
                        selected_item = item
                        break
            if not selected_item:
                selected_group = None

        prize_payload = None
        prize_product_id = None
        prize_variant_id = None
        prize_product_name = None
        prize_variant_name = None
        prize_unit_price = 0.0
        prize_group_id = None

        if selected_group is None:
            selected_name = "谢谢参与"
        else:
            selected_name = selected_group.get("display_name") or ""
            prize_product_id = selected_item.get("product_id")
            prize_variant_id = selected_item.get("variant_id")
            prize_product_name = selected_item.get("product_name")
            prize_variant_name = selected_item.get("variant_name")
            try:
                prize_unit_price = float(selected_item.get("retail_price") or 0.0)
            except Exception:
                prize_unit_price = 0.0
            prize_group_id = selected_group.get("id")
            prize_payload = {
                "display_name": selected_name,
                "product_id": prize_product_id,
                "product_name": prize_product_name,
                "variant_id": prize_variant_id,
                "variant_name": prize_variant_name,
                "group_id": prize_group_id
            }

        LotteryDB.create_draw(
            order_id,
            user["id"],
            selected_name,
            prize_product_id,
            1,
            prize_group_id=prize_group_id,
            prize_product_name=prize_product_name,
            prize_variant_id=prize_variant_id,
            prize_variant_name=prize_variant_name,
            prize_unit_price=prize_unit_price
        )

        thanks_prob_percent = (leftover / scale) * 100.0 if total_w > 0 else 0.0
        return success_response("抽奖完成", {
            "prize_name": selected_name,
            "already_drawn": False,
            "names": names,
            "thanks_probability": round(thanks_prob_percent, 2),
            "prize": prize_payload
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
    staff = get_current_staff_required_from_cookie(request)
    try:
        new_status = payload.payment_status
        # 允许管理员将支付状态设置为 pending/processing/succeeded/failed
        if new_status not in ["pending", "processing", "succeeded", "failed"]:
            return error_response("无效的支付状态", 400)

        order = OrderDB.get_order_by_id(order_id)
        if not order:
            return error_response("订单不存在", 404)
        scope = build_staff_scope(staff)
        if not staff_can_access_order(staff, order, scope):
            return error_response("无权操作该订单", 403)

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
                # 若该订单曾进行抽奖，确认成功后生成可用奖品（排除谢谢参与）
                try:
                    draw = LotteryDB.get_draw_by_order(order_id)
                    if draw and draw.get("prize_name") != "谢谢参与":
                        RewardDB.add_reward_from_order(
                            student_id=order["student_id"],
                            prize_name=draw.get("prize_name"),
                            prize_product_id=draw.get("prize_product_id"),
                            quantity=int(draw.get("prize_quantity") or 1),
                            source_order_id=order_id,
                            prize_group_id=draw.get("prize_group_id"),
                            prize_product_name=draw.get("prize_product_name"),
                            prize_variant_id=draw.get("prize_variant_id"),
                            prize_variant_name=draw.get("prize_variant_name"),
                            prize_unit_price=draw.get("prize_unit_price")
                        )
                except Exception as e:
                    logger.warning(f"生成抽奖奖品失败: {e}")
                # 发放满额优惠券（根据订单金额重新计算）
                try:
                    # 计算订单商品小计（不含运费、不含抽奖奖品和满额赠品）
                    items = order.get("items") or []
                    items_subtotal = 0.0
                    for item in items:
                        if isinstance(item, dict) and not (item.get("is_lottery") or item.get("is_auto_gift")):
                            try:
                                items_subtotal += float(item.get("subtotal", 0) or 0)
                            except Exception:
                                pass
                    
                    # 获取适用的门槛配置并发放优惠券
                    order_owner_id = order.get('agent_id') or None
                    applicable_thresholds = GiftThresholdDB.get_applicable_thresholds(items_subtotal, order_owner_id)
                    for threshold in applicable_thresholds:
                        gift_coupon = threshold.get('gift_coupon', 0) == 1
                        coupon_amount = threshold.get('coupon_amount', 0)
                        applicable_times = threshold.get('applicable_times', 0)
                        threshold_amount = threshold.get('threshold_amount', 0)
                        
                        if gift_coupon and coupon_amount > 0 and applicable_times > 0:
                            for _ in range(applicable_times):
                                coupon_ids = CouponDB.issue_coupons(
                                    student_id=order["student_id"],
                                    amount=coupon_amount,
                                    quantity=1,
                                    expires_at=None,
                                    owner_id=order_owner_id
                                )
                                if coupon_ids:
                                    logger.info(f"支付成功后为用户 {order['student_id']} 发放满额优惠券 {coupon_amount} 元（门槛{threshold_amount}）")
                except Exception as e:
                    logger.warning(f"发放满额优惠券失败: {e}")
                
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


@app.post("/profile/location")
async def update_profile_location(payload: LocationUpdateRequest, request: Request):
    user = get_current_user_required_from_cookie(request)
    try:
        address = AddressDB.get_by_id(payload.address_id)
        if not address or int(address.get('enabled', 1) or 1) != 1:
            return error_response("地址不存在或未启用", 400)

        building = BuildingDB.get_by_id(payload.building_id)
        if (not building or building.get('address_id') != address.get('id')
                or int(building.get('enabled', 1) or 1) != 1):
            return error_response("楼栋不存在或未启用", 400)

        assignment = AgentAssignmentDB.get_agent_for_building(building.get('id'))
        agent_id = assignment.get('agent_id') if assignment else None

        existing = UserProfileDB.get_shipping(user['id']) or {}
        dormitory_name = address.get('name') or ''
        building_name = building.get('name') or ''
        room = existing.get('room') or ''
        full_address = f"{dormitory_name} {building_name} {room}".strip()

        updated_profile = {
            'name': existing.get('name') or '',
            'phone': existing.get('phone') or '',
            'room': room,
            'dormitory': dormitory_name,
            'building': building_name,
            'full_address': full_address,
            'address_id': address.get('id'),
            'building_id': building.get('id'),
            'agent_id': agent_id,
        }

        UserProfileDB.upsert_shipping(user['id'], updated_profile)
        try:
            CartDB.update_cart(user['id'], {})
        except Exception as e:
            logger.warning(f"切换地址时清空购物车失败: {e}")

        return success_response("配送地址已更新", {"shipping": updated_profile})
    except Exception as e:
        logger.error(f"更新配送地址失败: {e}")
        return error_response("更新配送地址失败", 500)

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=9099,
        reload=True,
        log_level="info"
    )
