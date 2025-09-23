# /backend/database.py
import sqlite3
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Tuple
from contextlib import contextmanager
import os
import uuid

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 数据库配置
DB_PATH = os.path.join(os.path.dirname(__file__), "dorm_shop.db")

def ensure_table_columns(conn, table_name: str, required_columns: Dict[str, str]) -> None:
    """
    确保表中存在所需的列，如果不存在则自动添加
    
    Args:
        conn: 数据库连接
        table_name: 表名
        required_columns: 字典，键为列名，值为列定义（如 'TEXT DEFAULT NULL'）
    """
    cursor = conn.cursor()
    
    try:
        # 获取表的当前列信息
        cursor.execute(f"PRAGMA table_info({table_name})")
        existing_columns = {row[1] for row in cursor.fetchall()}
        
        # 检查每个必需的列是否存在
        for column_name, column_definition in required_columns.items():
            if column_name not in existing_columns:
                try:
                    alter_sql = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
                    cursor.execute(alter_sql)
                    logger.info(f"自动添加列: {table_name}.{column_name}")
                except sqlite3.OperationalError as e:
                    logger.warning(f"无法添加列 {table_name}.{column_name}: {e}")
                    
        conn.commit()
    except sqlite3.OperationalError as e:
        logger.warning(f"检查表 {table_name} 列时出错: {e}")

def auto_migrate_database(conn) -> None:
    """
    自动迁移数据库结构，确保所有必需的列都存在
    """
    # 定义所有表需要的列
    table_migrations = {
        'admins': {
            'payment_qr_path': 'TEXT',
            'is_active': 'INTEGER DEFAULT 1'
        },
        'products': {
            'is_active': 'INTEGER DEFAULT 1',
            'discount': 'REAL DEFAULT 10.0',
            'cost': 'REAL DEFAULT 0',
            'owner_id': 'TEXT'
        },
        'orders': {
            'payment_status': 'TEXT DEFAULT "pending"',
            
            'address_id': 'TEXT',
            'building_id': 'TEXT',
            'agent_id': 'TEXT'
        },
        'user_profiles': {
            'address_id': 'TEXT',
            'building_id': 'TEXT',
            'agent_id': 'TEXT'
        },
        'settings': {
            'owner_id': 'TEXT'
        },
        'lottery_prizes': {
            'owner_id': 'TEXT'
        },
        'auto_gift_items': {
            'owner_id': 'TEXT'
        },
        'gift_thresholds': {
            'owner_id': 'TEXT'
        },
        'delivery_settings': {
            'owner_id': 'TEXT'
        },
        'coupons': {
            'owner_id': 'TEXT'
        },
        'lottery_draws': {
            'owner_id': 'TEXT'
        },
        'user_rewards': {
            'owner_id': 'TEXT'
        }
    }
    
    # 先确保所有列都存在
    for table_name, columns in table_migrations.items():
        ensure_table_columns(conn, table_name, columns)
    
    # 创建依赖于新列的索引
    cursor = conn.cursor()
    try:
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_products_owner ON products(owner_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_orders_agent ON orders(agent_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_orders_address ON orders(address_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_orders_building ON orders(building_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_profiles_address ON user_profiles(address_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_profiles_building ON user_profiles(building_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_profiles_agent ON user_profiles(agent_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_lottery_prizes_owner ON lottery_prizes(owner_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_auto_gift_items_owner ON auto_gift_items(owner_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_gift_thresholds_owner ON gift_thresholds(owner_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_coupons_owner ON coupons(owner_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_settings_owner ON settings(owner_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_payment_qr_codes_owner ON payment_qr_codes(owner_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_payment_qr_codes_owner_type ON payment_qr_codes(owner_type)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_payment_qr_codes_enabled ON payment_qr_codes(is_enabled)')
        logger.info("创建依赖新列的索引完成")
    except sqlite3.OperationalError as e:
        logger.warning(f"创建新索引时出错: {e}")

    # 修复旧数据中 owner_id 为 NULL 的配置记录，分配给默认的 'admin'
    cursor = conn.cursor()
    try:
        # 为缺失 owner_id 的配置数据分配默认值 'admin'
        logger.info("开始修复旧配置数据的 owner_id...")
        
        # 修复抽奖奖项配置
        cursor.execute("UPDATE lottery_prizes SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
        lottery_fixed = cursor.rowcount
        
        # 修复自动赠品配置
        cursor.execute("UPDATE auto_gift_items SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
        gift_fixed = cursor.rowcount
        
        # 修复满额门槛配置
        cursor.execute("UPDATE gift_thresholds SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
        threshold_fixed = cursor.rowcount
        
        # 修复优惠券配置
        cursor.execute("UPDATE coupons SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
        coupon_fixed = cursor.rowcount
        
        # 修复设置配置
        cursor.execute("UPDATE settings SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
        settings_fixed = cursor.rowcount
        
        conn.commit()
        
        if lottery_fixed + gift_fixed + threshold_fixed + coupon_fixed + settings_fixed > 0:
            logger.info(f"修复配置数据完成: 抽奖{lottery_fixed}项, 赠品{gift_fixed}项, 门槛{threshold_fixed}项, 优惠券{coupon_fixed}项, 设置{settings_fixed}项")
        else:
            logger.info("未发现需要修复的配置数据")
            
    except sqlite3.OperationalError as e:
        logger.warning(f"修复配置数据时出错: {e}")
    except Exception as e:
        logger.error(f"修复配置数据失败: {e}")

    try:
        cursor.execute('''
            UPDATE lottery_draws
            SET owner_id = (
                SELECT agent_id FROM orders WHERE orders.id = lottery_draws.order_id
            )
            WHERE owner_id IS NULL
              AND order_id IN (
                  SELECT id FROM orders WHERE agent_id IS NOT NULL AND TRIM(agent_id) != ''
              )
        ''')
        cursor.execute('''
            UPDATE user_rewards
            SET owner_id = (
                SELECT agent_id FROM orders WHERE orders.id = user_rewards.source_order_id
            )
            WHERE owner_id IS NULL
              AND source_order_id IN (
                  SELECT id FROM orders WHERE agent_id IS NOT NULL AND TRIM(agent_id) != ''
              )
        ''')
        conn.commit()
    except sqlite3.OperationalError:
        pass
    except Exception as e:
        logger.warning(f"回填抽奖归属失败: {e}")
    
    # 收款码数据迁移将在 init_database 完成后进行

def migrate_user_profile_addresses(conn):
    """
    迁移用户配置文件的地址数据
    将老的 dormitory + building 字段数据迁移到新的 address_id + building_id 字段
    """
    cursor = conn.cursor()
    
    try:
        # 检查是否需要迁移（查找有老地址数据但缺少新ID字段的记录）
        cursor.execute("""
            SELECT COUNT(*) 
            FROM user_profiles 
            WHERE (address_id IS NULL OR building_id IS NULL) 
            AND dormitory IS NOT NULL 
            AND building IS NOT NULL
            AND TRIM(dormitory) != ''
            AND TRIM(building) != ''
        """)
        
        need_migration_count = cursor.fetchone()[0]
        
        if need_migration_count == 0:
            logger.info("用户配置文件地址数据无需迁移")
            return
        
        logger.info(f"发现 {need_migration_count} 个用户配置需要地址数据迁移")
        
        # 获取所有地址映射
        cursor.execute("SELECT id, name FROM addresses WHERE enabled = 1")
        address_map = {name: id for id, name in cursor.fetchall()}
        
        if not address_map:
            logger.warning("地址表为空，无法进行迁移")
            return
        
        # 获取所有楼栋映射
        cursor.execute("SELECT id, address_id, name FROM buildings WHERE enabled = 1")
        building_rows = cursor.fetchall()
        building_map = {}  # {(address_id, building_name): building_id}
        for building_id, address_id, building_name in building_rows:
            building_map[(address_id, building_name)] = building_id
        
        if not building_map:
            logger.warning("楼栋表为空，无法进行迁移")
            return
        
        # 获取需要迁移的用户配置
        cursor.execute("""
            SELECT student_id, dormitory, building 
            FROM user_profiles 
            WHERE (address_id IS NULL OR building_id IS NULL) 
            AND dormitory IS NOT NULL 
            AND building IS NOT NULL
            AND TRIM(dormitory) != ''
            AND TRIM(building) != ''
        """)
        
        profiles_to_migrate = cursor.fetchall()
        migrated_count = 0
        failed_count = 0
        
        for student_id, dormitory, building in profiles_to_migrate:
            try:
                # 查找对应的address_id
                address_id = address_map.get(dormitory.strip())
                if not address_id:
                    logger.warning(f"用户 {student_id} 的宿舍区 '{dormitory}' 在地址表中未找到")
                    failed_count += 1
                    continue
                
                # 查找对应的building_id
                building_id = building_map.get((address_id, building.strip()))
                if not building_id:
                    logger.warning(f"用户 {student_id} 的楼栋 '{building}' 在地址 '{dormitory}' 下未找到")
                    failed_count += 1
                    continue
                
                # 更新用户配置
                cursor.execute("""
                    UPDATE user_profiles 
                    SET address_id = ?, building_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE student_id = ?
                """, (address_id, building_id, student_id))
                
                migrated_count += 1
                
            except Exception as e:
                logger.error(f"迁移用户 {student_id} 地址数据失败: {e}")
                failed_count += 1
        
        conn.commit()
        logger.info(f"用户配置文件地址数据迁移完成: 成功 {migrated_count} 个, 失败 {failed_count} 个")
        
    except Exception as e:
        logger.error(f"用户配置文件地址数据迁移失败: {e}")
        conn.rollback()
        raise

def init_database():
    """初始化数据库表结构"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # 用户表 (学号作为主键)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,  -- 学号
                password TEXT NOT NULL,  -- 明文密码
                name TEXT NOT NULL,  -- 姓名
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 商品表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,  -- 秒级时间戳生成的商品ID
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL,
                stock INTEGER DEFAULT 0,
                discount REAL DEFAULT 10.0, -- 折扣（以折为单位，10为不打折，0.5为五折）
                img_path TEXT,  -- 图片路径 items/类别/商品名.扩展名
                description TEXT,
                is_active INTEGER DEFAULT 1, -- 是否上架（1 上架，0 下架）
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 购物车表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS carts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT NOT NULL,  -- 学号外键
                items TEXT NOT NULL,  -- JSON格式存储购物车项目
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users (id)
            )
        ''')
        
        # 聊天记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT,  -- 可为空，支持匿名聊天
                role TEXT NOT NULL,  -- user, assistant, tool
                content TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users (id)
            )
        ''')
        
        # 分类表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,  -- 分类ID
                name TEXT NOT NULL UNIQUE,  -- 分类名称
                description TEXT,  -- 分类描述
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 管理员表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS admins (
                id TEXT PRIMARY KEY,  -- 管理员账号
                password TEXT NOT NULL,  -- 明文密码
                name TEXT NOT NULL,
                role TEXT DEFAULT 'admin',  -- admin, super_admin
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 订单表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,  -- 订单ID
                student_id TEXT NOT NULL,  -- 学号外键
                status TEXT DEFAULT 'pending',  -- pending, confirmed, shipped, delivered, cancelled
                payment_status TEXT DEFAULT 'pending',  -- pending, processing, succeeded, failed
                total_amount REAL NOT NULL,  -- 订单总金额
                shipping_info TEXT NOT NULL,  -- JSON格式存储收货信息
                items TEXT NOT NULL,  -- JSON格式存储订单商品详情
                payment_method TEXT DEFAULT 'wechat',  -- 支付方式
                note TEXT,  -- 订单备注
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users (id)
            )
        ''')

        # 用户资料表（缓存最近一次成功付款的收货信息）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_profiles (
                student_id TEXT PRIMARY KEY,
                name TEXT,
                phone TEXT,
                dormitory TEXT,
                building TEXT,
                room TEXT,
                full_address TEXT,
                address_id TEXT,
                building_id TEXT,
                agent_id TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users (id)
            )
        ''')

        # 地址（配送/宿舍区等选项）表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS addresses (
                id TEXT PRIMARY KEY,           -- 地址ID
                name TEXT NOT NULL UNIQUE,     -- 地址名称（如：桃园）
                enabled INTEGER DEFAULT 1,     -- 是否启用（1 启用，0 停用）
                sort_order INTEGER DEFAULT 0,  -- 排序权重（小的在前）
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 楼栋表（隶属某地址/园区）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS buildings (
                id TEXT PRIMARY KEY,            -- 楼栋ID
                address_id TEXT NOT NULL,       -- 所属地址ID（外键到addresses.id）
                name TEXT NOT NULL,             -- 楼栋名称（如：六舍）
                enabled INTEGER DEFAULT 1,      -- 是否启用
                sort_order INTEGER DEFAULT 0,   -- 排序
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(address_id, name),
                FOREIGN KEY (address_id) REFERENCES addresses(id)
            )
        ''')

        # 收款码表（支持管理员和代理多个收款码）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS payment_qr_codes (
                id TEXT PRIMARY KEY,                -- 收款码ID
                owner_id TEXT NOT NULL,             -- 所有者ID（管理员ID或代理ID）
                owner_type TEXT NOT NULL,           -- 所有者类型（admin或agent）
                name TEXT NOT NULL,                 -- 收款码备注名称
                image_path TEXT NOT NULL,           -- 收款码图片路径
                is_enabled INTEGER DEFAULT 1,      -- 是否启用（1 启用，0 禁用）
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 代理与楼栋关联表（一个楼栋仅能绑定到一个代理）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS agent_buildings (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                address_id TEXT NOT NULL,
                building_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (agent_id) REFERENCES admins(id),
                FOREIGN KEY (address_id) REFERENCES addresses(id),
                FOREIGN KEY (building_id) REFERENCES buildings(id),
                UNIQUE(agent_id, building_id),
                UNIQUE(building_id)
            )
        ''')
        
        # 代理独立打烊状态表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS agent_status (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                is_open INTEGER DEFAULT 1,  -- 1: 营业, 0: 打烊
                closed_note TEXT DEFAULT '',  -- 打烊提示语
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (agent_id) REFERENCES admins(id),
                UNIQUE(agent_id)
            )
        ''')
        
        # 创建基础索引（不依赖于可能缺失的列）
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_carts_student_id ON carts(student_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_logs_student_id ON chat_logs(student_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_logs_timestamp ON chat_logs(timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_orders_student_id ON orders(student_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_addresses_enabled ON addresses(enabled)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_addresses_sort ON addresses(sort_order)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_buildings_address ON buildings(address_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_buildings_enabled ON buildings(enabled)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_buildings_sort ON buildings(sort_order)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_agent_buildings_agent ON agent_buildings(agent_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_agent_buildings_building ON agent_buildings(building_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_agent_buildings_address ON agent_buildings(address_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_agent_status_agent ON agent_status(agent_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_agent_status_is_open ON agent_status(is_open)')
        
        # 为现有表添加新字段（如果不存在的话）
        try:
            cursor.execute('ALTER TABLE admins ADD COLUMN payment_qr_path TEXT')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE admins ADD COLUMN is_active INTEGER DEFAULT 1')
        except sqlite3.OperationalError:
            pass

        # 保障超级管理员角色正确
        try:
            cursor.execute("UPDATE admins SET role = 'super_admin' WHERE id IN ('ADMIN_USERNAME1', 'ADMIN_USERNAME2')")
        except Exception:
            pass

        try:
            cursor.execute('ALTER TABLE user_profiles ADD COLUMN address_id TEXT')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE user_profiles ADD COLUMN building_id TEXT')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE user_profiles ADD COLUMN agent_id TEXT')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT "pending"')
        except sqlite3.OperationalError:
            pass  # 字段已存在


        try:
            cursor.execute('ALTER TABLE orders ADD COLUMN address_id TEXT')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE orders ADD COLUMN building_id TEXT')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE orders ADD COLUMN agent_id TEXT')
        except sqlite3.OperationalError:
            pass

        # 为老库添加商品折扣字段（以折为单位，10表示不打折）
        try:
            cursor.execute('ALTER TABLE products ADD COLUMN discount REAL DEFAULT 10.0')
        except sqlite3.OperationalError:
            pass  # 字段已存在

        # 商品上下架字段（1 上架，0 下架）
        try:
            cursor.execute('ALTER TABLE products ADD COLUMN is_active INTEGER DEFAULT 1')
        except sqlite3.OperationalError:
            pass  # 字段已存在

        # 商品成本字段（用于计算净利润）
        try:
            cursor.execute('ALTER TABLE products ADD COLUMN cost REAL DEFAULT 0.0')
        except sqlite3.OperationalError:
            pass  # 字段已存在

        try:
            cursor.execute('ALTER TABLE products ADD COLUMN owner_id TEXT')
        except sqlite3.OperationalError:
            pass

        # 订单表增加优惠相关字段（若不存在）
        try:
            cursor.execute('ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0.0')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('ALTER TABLE orders ADD COLUMN coupon_id TEXT')
        except sqlite3.OperationalError:
            pass
        # 优惠券锁字段（用于订单未确认/未付款时占用该券）
        try:
            cursor.execute('ALTER TABLE coupons ADD COLUMN locked_order_id TEXT')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_coupons_locked ON coupons(locked_order_id)')
        except Exception:
            pass

        # 商品规格（变体）表：独立库存
        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS product_variants (
                    id TEXT PRIMARY KEY,
                    product_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    stock INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_id) REFERENCES products(id)
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id)')
        except Exception:
            pass

        # 商店设置表（比如打烊状态）
        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            ''')
        except Exception:
            pass

        # 优惠券表（未使用的券保留为 active；撤回标记为 revoked；使用后直接删除）
        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS coupons (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    amount REAL NOT NULL,
                    expires_at TIMESTAMP NULL,
                    status TEXT DEFAULT 'active', -- active, revoked
                    owner_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (student_id) REFERENCES users(id)
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_coupons_student ON coupons(student_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_coupons_expires ON coupons(expires_at)')
        except Exception:
            pass

        # 抽奖记录表（每个订单仅允许一次抽奖）及抽奖配置表
        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS lottery_draws (
                    id TEXT PRIMARY KEY,
                    order_id TEXT NOT NULL,
                    student_id TEXT NOT NULL,
                    prize_name TEXT NOT NULL,
                    prize_product_id TEXT,
                    prize_quantity INTEGER DEFAULT 1,
                    owner_id TEXT,
                    prize_group_id TEXT,
                    prize_product_name TEXT,
                    prize_variant_id TEXT,
                    prize_variant_name TEXT,
                    prize_unit_price REAL DEFAULT 0,
                    drawn_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_lottery_order ON lottery_draws(order_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_lottery_student ON lottery_draws(student_id)')
        except Exception:
            pass

        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS lottery_prizes (
                    id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    weight REAL NOT NULL DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    owner_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_lottery_prizes_active ON lottery_prizes(is_active)')
        except Exception:
            pass

        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS lottery_prize_items (
                    id TEXT PRIMARY KEY,
                    prize_id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    variant_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (prize_id) REFERENCES lottery_prizes(id)
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_lottery_prize_items_prize ON lottery_prize_items(prize_id)')
        except Exception:
            pass

        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS lottery_configs (
                    owner_id TEXT PRIMARY KEY,
                    threshold_amount REAL NOT NULL DEFAULT 10.0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute("INSERT OR IGNORE INTO lottery_configs (owner_id, threshold_amount) VALUES ('admin', 10.0)")
        except Exception:
            pass

        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS auto_gift_items (
                    id TEXT PRIMARY KEY,
                    product_id TEXT NOT NULL,
                    variant_id TEXT,
                    owner_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_auto_gift_product ON auto_gift_items(product_id)')
        except Exception:
            pass

        # 满额赠品规则配置表（替代固定的20元门槛）
        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS gift_thresholds (
                    id TEXT PRIMARY KEY,
                    threshold_amount REAL NOT NULL,       -- 满额门槛（如 20.0, 40.0）
                    gift_products INTEGER DEFAULT 0,      -- 是否赠送商品（1：是，0：否）
                    gift_coupon INTEGER DEFAULT 0,        -- 是否赠送优惠券（1：是，0：否）
                    coupon_amount REAL DEFAULT 0.0,       -- 优惠券金额
                    is_active INTEGER DEFAULT 1,          -- 是否启用
                    sort_order INTEGER DEFAULT 0,         -- 排序权重
                    owner_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_gift_threshold_amount ON gift_thresholds(threshold_amount)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_gift_threshold_active ON gift_thresholds(is_active)')
        except Exception:
            pass

        # 配送费设置表（独立配置）
        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS delivery_settings (
                    id TEXT PRIMARY KEY,
                    delivery_fee REAL DEFAULT 1.0,                -- 基础配送费
                    free_delivery_threshold REAL DEFAULT 10.0,    -- 免配送费门槛
                    is_active INTEGER DEFAULT 1,                  -- 是否启用
                    owner_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_delivery_settings_owner ON delivery_settings(owner_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_delivery_settings_active ON delivery_settings(is_active)')
        except Exception:
            pass

        # 满额赠品池配置表（关联到具体门槛）
        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS gift_threshold_items (
                    id TEXT PRIMARY KEY,
                    threshold_id TEXT NOT NULL,           -- 关联到 gift_thresholds.id
                    product_id TEXT NOT NULL,             -- 商品ID
                    variant_id TEXT,                      -- 规格ID（可选）
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (threshold_id) REFERENCES gift_thresholds(id),
                    FOREIGN KEY (product_id) REFERENCES products(id)
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_gift_threshold_items_threshold ON gift_threshold_items(threshold_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_gift_threshold_items_product ON gift_threshold_items(product_id)')
        except Exception:
            pass

        # 兼容旧库：为抽奖记录和奖励表补充新字段
        try:
            cursor.execute('ALTER TABLE lottery_draws ADD COLUMN prize_group_id TEXT')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('ALTER TABLE lottery_draws ADD COLUMN prize_product_name TEXT')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('ALTER TABLE lottery_draws ADD COLUMN prize_variant_id TEXT')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('ALTER TABLE lottery_draws ADD COLUMN prize_variant_name TEXT')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('ALTER TABLE lottery_draws ADD COLUMN prize_unit_price REAL DEFAULT 0')
        except sqlite3.OperationalError:
            pass

        # 待配送奖品（从成功订单产生；可累积；下次满10自动配送）
        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_rewards (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    prize_name TEXT NOT NULL,
                    prize_product_id TEXT,
                    prize_product_name TEXT,
                    prize_variant_id TEXT,
                    prize_variant_name TEXT,
                    prize_unit_price REAL DEFAULT 0,
                    owner_id TEXT,
                    prize_group_id TEXT,
                    prize_quantity INTEGER DEFAULT 1,
                    source_order_id TEXT NOT NULL,
                    status TEXT DEFAULT 'eligible', -- eligible, consumed, cancelled
                    consumed_order_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_rewards_student ON user_rewards(student_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_rewards_status ON user_rewards(status)')
            cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_rewards_source_order ON user_rewards(source_order_id)')
        except Exception:
            pass

        try:
            cursor.execute('ALTER TABLE user_rewards ADD COLUMN prize_product_name TEXT')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('ALTER TABLE user_rewards ADD COLUMN prize_variant_id TEXT')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('ALTER TABLE user_rewards ADD COLUMN prize_variant_name TEXT')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('ALTER TABLE user_rewards ADD COLUMN prize_unit_price REAL DEFAULT 0')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('ALTER TABLE user_rewards ADD COLUMN prize_group_id TEXT')
        except sqlite3.OperationalError:
            pass
        
        # 执行自动数据库迁移
        try:
            auto_migrate_database(conn)
            logger.info("自动数据库迁移完成")
        except Exception as e:
            logger.warning(f"自动数据库迁移失败: {e}")
        
        conn.commit()
        logger.info("数据库表结构初始化成功")
        
        # 清理旧的收款码数据（确保新旧逻辑兼容）
        try:
            cursor = conn.cursor()
            
            # 检查是否存在旧的收款码数据
            cursor.execute("SELECT COUNT(*) FROM admins WHERE payment_qr_path IS NOT NULL AND payment_qr_path != ''")
            old_payment_count = cursor.fetchone()[0]
            
            if old_payment_count > 0:
                logger.info(f"检测到 {old_payment_count} 个旧的收款码数据，开始清理...")
                
                # 先迁移旧数据到新表（如果尚未迁移）
                cursor.execute('''
                    SELECT id, name, role, payment_qr_path
                    FROM admins
                    WHERE payment_qr_path IS NOT NULL AND payment_qr_path != ''
                ''')
                
                migrated_count = 0
                for row in cursor.fetchall():
                    admin_id, admin_name, role, payment_qr_path = row
                    
                    # 确定实际的 owner_id：管理员统一使用 'admin'，代理使用具体ID
                    actual_owner_id = 'admin' if role in ('admin', 'super_admin') else admin_id
                    
                    # 检查是否已经迁移过
                    cursor.execute('SELECT COUNT(*) FROM payment_qr_codes WHERE owner_id = ? AND owner_type = ?', 
                                 (actual_owner_id, role))
                    existing_count = cursor.fetchone()[0]
                    
                    if existing_count == 0:
                        # 创建收款码记录
                        import time
                        qr_id = f"qr_{int(time.time() * 1000)}"
                        qr_name = f"{admin_name or admin_id}的收款码"
                        
                        cursor.execute('''
                            INSERT INTO payment_qr_codes 
                            (id, owner_id, owner_type, name, image_path, is_enabled)
                            VALUES (?, ?, ?, ?, ?, 1)
                        ''', (qr_id, actual_owner_id, role, qr_name, payment_qr_path))
                        
                        migrated_count += 1
                        logger.info(f"迁移 {role} {admin_id} 的收款码到 owner_id={actual_owner_id}: {payment_qr_path}")
                
                # 清理旧的收款码字段数据
                cursor.execute("UPDATE admins SET payment_qr_path = NULL WHERE payment_qr_path IS NOT NULL")
                
                # 统一管理员收款码的 owner_id 为 'admin'
                cursor.execute('''
                    UPDATE payment_qr_codes 
                    SET owner_id = 'admin' 
                    WHERE owner_type = 'admin' AND owner_id != 'admin'
                ''')
                admin_unified_count = cursor.rowcount
                
                if admin_unified_count > 0:
                    logger.info(f"统一了 {admin_unified_count} 个管理员收款码的 owner_id 为 'admin'")
                
                conn.commit()
                logger.info(f"收款码数据清理完成，已迁移 {migrated_count} 个收款码，并清理了旧字段数据")
            else:
                logger.info("未发现旧的收款码数据，无需清理")
                
                # 即使没有旧数据，也要检查并统一现有管理员收款码的 owner_id
                cursor.execute('''
                    UPDATE payment_qr_codes 
                    SET owner_id = 'admin' 
                    WHERE owner_type = 'admin' AND owner_id != 'admin'
                ''')
                admin_unified_count = cursor.rowcount
                
                if admin_unified_count > 0:
                    logger.info(f"统一了 {admin_unified_count} 个现有管理员收款码的 owner_id 为 'admin'")
                    conn.commit()
                
        except Exception as e:
            logger.warning(f"清理旧收款码数据失败: {e}")
            conn.rollback()
        
        # 收款码数据迁移将在模块加载完成后单独处理
        
        # 用户配置文件地址数据自动迁移
        try:
            migrate_user_profile_addresses(conn)
        except Exception as e:
            logger.warning(f"用户配置文件地址数据迁移失败: {e}")
        
        # 初始化示例数据（仅在显式允许时）
        if os.getenv("DB_SEED_DEMO") == "1":
            init_sample_data(conn)
        
    except Exception as e:
        logger.error(f"数据库初始化失败: {e}")
        conn.rollback()
    finally:
        conn.close()

def init_sample_data(conn):
    """初始化示例数据"""
    cursor = conn.cursor()
    
    # 检查是否已有数据
    cursor.execute('SELECT COUNT(*) FROM products')
    if cursor.fetchone()[0] > 0:
        return
    
    # 插入示例商品数据
    sample_products = [
        {
            'id': 'sku_iphone15p',
            'name': 'Apple iPhone 15 Pro 256GB',
            'category': '手机',
            'price': 8999.0,
            'stock': 5,
            'img_path': 'items/手机/iPhone15Pro.jpg',
            'description': '最新款iPhone，性能强劲'
        },
        {
            'id': 'sku_wh1000xm5',
            'name': 'Sony WH-1000XM5 头戴耳机',
            'category': '耳机',
            'price': 2499.0,
            'stock': 12,
            'img_path': 'items/耳机/SonyWH1000XM5.jpg',
            'description': '顶级降噪耳机'
        },
        {
            'id': 'sku_switch_oled',
            'name': 'Nintendo Switch OLED',
            'category': '游戏机',
            'price': 2599.0,
            'stock': 8,
            'img_path': 'items/游戏机/SwitchOLED.jpg',
            'description': 'OLED版游戏机'
        },
        {
            'id': 'sku_legotech_car',
            'name': 'LEGO Technic 跑车 42161',
            'category': '玩具',
            'price': 1699.0,
            'stock': 20,
            'img_path': 'items/玩具/LegoTechnic42161.jpg',
            'description': '机械组跑车模型'
        },
        {
            'id': 'sku_nike_peg41',
            'name': 'Nike Air Zoom Pegasus 41',
            'category': '跑鞋',
            'price': 899.0,
            'stock': 15,
            'img_path': 'items/跑鞋/NikePegasus41.jpg',
            'description': '专业跑步鞋'
        },
        {
            'id': 'sku_nespresso_pixie',
            'name': 'Nespresso Pixie 胶囊咖啡机',
            'category': '家电',
            'price': 1299.0,
            'stock': 6,
            'img_path': 'items/家电/NespressoPixie.jpg',
            'description': '小巧的胶囊咖啡机'
        }
    ]
    
    for product in sample_products:
        try:
            # 使用安全执行方式，支持自动迁移
            safe_execute_with_migration(conn, '''
                INSERT OR IGNORE INTO products 
                (id, name, category, price, stock, img_path, description, discount, is_active, cost, owner_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                product['id'], product['name'], product['category'],
                product['price'], product['stock'], product['img_path'],
                product['description'], 10.0, 1, 0.0, None
            ), 'products')
        except Exception as e:
            # 如果新格式失败，尝试旧格式
            logger.warning(f"使用新格式插入示例产品失败，尝试旧格式: {e}")
            try:
                cursor.execute('''
                    INSERT OR IGNORE INTO products 
                    (id, name, category, price, stock, img_path, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    product['id'], product['name'], product['category'],
                    product['price'], product['stock'], product['img_path'],
                    product['description']
                ))
            except Exception as e2:
                logger.error(f"插入示例产品失败: {e2}")
    
    # 插入默认分类
    default_categories = [
        {'id': 'cat_phone', 'name': '手机', 'description': '智能手机及配件'},
        {'id': 'cat_headphone', 'name': '耳机', 'description': '耳机音响设备'},
        {'id': 'cat_gaming', 'name': '游戏机', 'description': '游戏主机及配件'},
        {'id': 'cat_toys', 'name': '玩具', 'description': '益智玩具模型'},
        {'id': 'cat_shoes', 'name': '跑鞋', 'description': '运动鞋类'},
        {'id': 'cat_appliance', 'name': '家电', 'description': '小家电设备'},
        {'id': 'cat_books', 'name': '书籍', 'description': '各类图书'},
        {'id': 'cat_stationery', 'name': '文具', 'description': '学习办公用品'},
        {'id': 'cat_food', 'name': '食品', 'description': '零食饮料'},
        {'id': 'cat_other', 'name': '其他', 'description': '其他商品'}
    ]
    
    for category in default_categories:
        cursor.execute('''
            INSERT OR IGNORE INTO categories 
            (id, name, description)
            VALUES (?, ?, ?)
        ''', (category['id'], category['name'], category['description']))
    
    # 插入示例管理员
    cursor.execute('''
        INSERT OR IGNORE INTO admins (id, password, name, role)
        VALUES ('admin', 'admin123', '系统管理员', 'super_admin')
    ''')
    
    conn.commit()
    logger.info("示例数据初始化成功")

@contextmanager
def get_db_connection():
    """获取数据库连接的上下文管理器"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # 允许通过列名访问
    try:
        yield conn
    except Exception as e:
        conn.rollback()
        logger.error(f"数据库操作错误: {e}")
        raise
    finally:
        conn.close()

def safe_execute_with_migration(conn, sql: str, params: tuple = (), table_name: str = None):
    """
    安全执行SQL，如果遇到列不存在的错误，会尝试自动迁移后重新执行
    
    Args:
        conn: 数据库连接
        sql: SQL语句
        params: SQL参数
        table_name: 涉及的表名，用于有针对性的迁移
    """
    cursor = conn.cursor()
    try:
        cursor.execute(sql, params)
        return cursor
    except sqlite3.OperationalError as e:
        error_msg = str(e).lower()
        
        # 检查是否是列不存在的错误
        if 'no such column' in error_msg or 'has no column named' in error_msg:
            logger.warning(f"检测到列不存在错误: {e}")
            try:
                # 执行自动迁移
                auto_migrate_database(conn)
                # 重新尝试执行SQL
                cursor.execute(sql, params)
                logger.info("自动迁移后重新执行SQL成功")
                return cursor
            except Exception as migration_error:
                logger.error(f"自动迁移失败: {migration_error}")
                raise e
        else:
            raise e

def cleanup_old_chat_logs():
    """清理7天前的聊天记录"""
    cutoff_date = datetime.now() - timedelta(days=7)
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'DELETE FROM chat_logs WHERE timestamp < ?',
            (cutoff_date.isoformat(),)
        )
        deleted_count = cursor.rowcount
        conn.commit()
        logger.info(f"清理了 {deleted_count} 条过期聊天记录")
        return deleted_count

# 用户相关操作
class UserDB:
    @staticmethod
    def create_user(student_id: str, password: str, name: str) -> bool:
        """创建新用户"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    'INSERT INTO users (id, password, name) VALUES (?, ?, ?)',
                    (student_id, password, name)
                )
                conn.commit()
                return True
            except sqlite3.IntegrityError:
                return False
    
    @staticmethod
    def get_user(student_id: str) -> Optional[Dict]:
        """获取用户信息"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM users WHERE id = ?',
                (student_id,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None
    
    @staticmethod
    def verify_user(student_id: str, password: str) -> Optional[Dict]:
        """验证用户凭据"""
        user = UserDB.get_user(student_id)
        if user and user['password'] == password:
            return user
        return None
    
    @staticmethod
    def update_user_password(student_id: str, new_password: str) -> bool:
        """更新用户密码"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    'UPDATE users SET password = ? WHERE id = ?',
                    (new_password, student_id)
                )
                success = cursor.rowcount > 0
                conn.commit()
                return success
            except Exception as e:
                logger.error(f"更新用户密码失败: {e}")
                return False
    
    @staticmethod
    def update_user_name(student_id: str, new_name: str) -> bool:
        """更新用户姓名"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    'UPDATE users SET name = ? WHERE id = ?',
                    (new_name, student_id)
                )
                success = cursor.rowcount > 0
                conn.commit()
                return success
            except Exception as e:
                logger.error(f"更新用户姓名失败: {e}")
                return False

    @staticmethod
    def count_users() -> int:
        """统计注册用户数量（严格按照 users 表中的学号数量）"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('SELECT COUNT(id) AS count FROM users')
                row = cursor.fetchone()
                if not row:
                    return 0
                try:
                    # sqlite3.Row 支持键访问
                    return int(row["count"]) if hasattr(row, 'keys') and ("count" in row.keys()) else int(row[0])
                except Exception:
                    return int(row[0])
            except Exception as e:
                logger.error(f"统计用户数量失败: {e}")
                return 0

# 商品相关操作
class ProductDB:
    @staticmethod
    def create_product(product_data: Dict) -> str:
        """创建新商品"""
        product_id = f"prod_{int(datetime.now().timestamp())}"
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 自动创建分类（如果不存在）
            category_name = product_data['category']
            cursor.execute('SELECT id FROM categories WHERE name = ?', (category_name,))
            if not cursor.fetchone():
                category_id = f"cat_{int(datetime.now().timestamp())}"
                cursor.execute('''
                    INSERT INTO categories (id, name, description)
                    VALUES (?, ?, ?)
                ''', (category_id, category_name, f"自动创建的分类：{category_name}"))
            
            cursor.execute('''
                INSERT INTO products 
                (id, name, category, price, stock, discount, img_path, description, cost, owner_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                product_id,
                product_data['name'],
                category_name,
                product_data['price'],
                product_data.get('stock', 0),
                float(product_data.get('discount', 10.0)),
                product_data.get('img_path', ''),
                product_data.get('description', ''),
                float(product_data.get('cost', 0.0)),
                product_data.get('owner_id')
            ))
            conn.commit()
            return product_id

    @staticmethod
    def _build_owner_filter(owner_ids: Optional[List[str]], include_unassigned: bool) -> Tuple[str, List[Any]]:
        conditions: List[str] = []
        params: List[Any] = []

        if owner_ids is None:
            return '', params

        normalized = [oid for oid in (owner_ids or []) if oid]
        if normalized:
            placeholders = ','.join('?' * len(normalized))
            conditions.append(f"owner_id IN ({placeholders})")
            params.extend(normalized)

        if include_unassigned:
            conditions.append('(owner_id IS NULL OR owner_id = "")')

        if not conditions:
            # 未提供owner且不允许未绑定，直接返回空过滤条件但外层需处理
            return '1=0', []

        where_clause = ' OR '.join(conditions)
        return where_clause, params

    @staticmethod
    def get_all_products(owner_ids: Optional[List[str]] = None, include_unassigned: bool = True) -> List[Dict]:
        """获取商品列表，可按归属过滤"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            where_sql, params = ProductDB._build_owner_filter(owner_ids, include_unassigned)
            if owner_ids is None:
                cursor.execute('SELECT * FROM products ORDER BY created_at DESC')
            else:
                if where_sql == '1=0':
                    return []
                cursor.execute(f'SELECT * FROM products WHERE {where_sql} ORDER BY created_at DESC', params)
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_products_by_category(category: str, owner_ids: Optional[List[str]] = None, include_unassigned: bool = True) -> List[Dict]:
        """按类别获取商品，可按归属过滤"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            where_sql, params = ProductDB._build_owner_filter(owner_ids, include_unassigned)
            if owner_ids is None:
                cursor.execute(
                    'SELECT * FROM products WHERE category = ? ORDER BY created_at DESC',
                    (category,)
                )
            else:
                if where_sql == '1=0':
                    return []
                sql = f'SELECT * FROM products WHERE category = ? AND ({where_sql}) ORDER BY created_at DESC'
                cursor.execute(sql, [category, *params])
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def search_products(query: str, active_only: bool = False, owner_ids: Optional[List[str]] = None, include_unassigned: bool = True) -> List[Dict]:
        """搜索商品；当 active_only=True 时，仅返回上架商品；支持按归属过滤"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            where_sql, params = ProductDB._build_owner_filter(owner_ids, include_unassigned)

            def build_base_sql(active_filter: bool) -> Tuple[str, List[Any]]:
                base_params = [f'%{query}%', f'%{query}%', f'%{query}%']
                base_conditions = '(name LIKE ? OR category LIKE ? OR description LIKE ?)'
                if where_sql and owner_ids is not None:
                    base_conditions = f'{base_conditions} AND ({where_sql})'
                    base_params.extend(params)
                sql = f'SELECT * FROM products WHERE {base_conditions}'
                if active_filter:
                    sql += ' AND (is_active = 1)'
                sql += ' ORDER BY created_at DESC'
                return sql, base_params

            if active_only:
                if owner_ids is not None and where_sql == '1=0':
                    return []
                sql, sql_params = build_base_sql(True)
                cursor.execute(sql, sql_params)
            else:
                if owner_ids is not None and where_sql == '1=0':
                    return []
                sql, sql_params = build_base_sql(False)
                cursor.execute(sql, sql_params)
            return [dict(row) for row in cursor.fetchall()]
    
    @staticmethod
    def get_product_by_id(product_id: str) -> Optional[Dict]:
        """根据ID获取商品"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def update_product(product_id: str, product_data: Dict) -> bool:
        """更新商品信息"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 获取原商品信息以便后续清理
            cursor.execute('SELECT category FROM products WHERE id = ?', (product_id,))
            old_product = cursor.fetchone()
            if not old_product:
                return False
            old_category = old_product[0]
            
            # 如果要更新分类，自动创建新分类（如果不存在）
            if 'category' in product_data:
                new_category = product_data['category']
                cursor.execute('SELECT id FROM categories WHERE name = ?', (new_category,))
                if not cursor.fetchone():
                    category_id = f"cat_{int(datetime.now().timestamp())}"
                    cursor.execute('''
                        INSERT INTO categories (id, name, description)
                        VALUES (?, ?, ?)
                    ''', (category_id, new_category, f"自动创建的分类：{new_category}"))
            
            # 构建动态更新SQL
            update_fields = []
            values = []
            
            for field in ['name', 'category', 'price', 'stock', 'discount', 'img_path', 'description', 'is_active', 'cost', 'owner_id']:
                if field in product_data:
                    update_fields.append(f"{field} = ?")
                    values.append(product_data[field])
            
            if not update_fields:
                return False
            
            # 添加更新时间
            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            values.append(product_id)
            
            sql = f"UPDATE products SET {', '.join(update_fields)} WHERE id = ?"
            cursor.execute(sql, values)
            
            success = cursor.rowcount > 0
            
            # 如果更新成功且更改了分类，统一清理空分类
            if success and 'category' in product_data and product_data['category'] != old_category:
                conn.commit()
                try:
                    CategoryDB.cleanup_orphan_categories()
                except Exception:
                    pass
            
            conn.commit()
            return success

    @staticmethod
    def update_stock(product_id: str, new_stock: int) -> bool:
        """更新商品库存"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE products 
                SET stock = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            ''', (new_stock, product_id))
            
            success = cursor.rowcount > 0
            conn.commit()
            return success

    @staticmethod
    def update_image_path(product_id: str, new_img_path: str) -> bool:
        """仅更新商品图片路径"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE products 
                SET img_path = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            ''', (new_img_path, product_id))
            ok = cursor.rowcount > 0
            conn.commit()
            return ok
    
    @staticmethod
    def delete_product(product_id: str) -> bool:
        """删除商品"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 获取商品分类以便后续清理
            cursor.execute('SELECT category FROM products WHERE id = ?', (product_id,))
            product = cursor.fetchone()
            if not product:
                return False
            
            category_name = product[0]
            
            cursor.execute('DELETE FROM products WHERE id = ?', (product_id,))
            success = cursor.rowcount > 0
            
            # 如果删除成功，统一清理空分类
            if success:
                conn.commit()
                try:
                    CategoryDB.cleanup_orphan_categories()
                except Exception:
                    pass
            
            conn.commit()
            return success
    
    @staticmethod
    def batch_delete_products(product_ids: List[str]) -> Dict[str, Any]:
        """批量删除商品"""
        if not product_ids:
            return {"success": False, "deleted_count": 0, "message": "没有提供要删除的商品ID"}
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 获取要删除的商品分类
            placeholders = ','.join('?' for _ in product_ids)
            cursor.execute(f'SELECT DISTINCT category FROM products WHERE id IN ({placeholders})', product_ids)
            categories = [row[0] for row in cursor.fetchall()]
            
            # 批量删除商品
            cursor.execute(f'DELETE FROM products WHERE id IN ({placeholders})', product_ids)
            deleted_count = cursor.rowcount
            
            success = deleted_count > 0
            
            # 如果删除成功，统一清理空分类
            if success:
                conn.commit()
                try:
                    CategoryDB.cleanup_orphan_categories()
                except Exception:
                    pass
                
            conn.commit()
            return {
                "success": success,
                "deleted_count": deleted_count,
                "message": f"成功删除 {deleted_count} 个商品" if success else "删除失败"
            }

class VariantDB:
    @staticmethod
    def get_by_product(product_id: str) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM product_variants WHERE product_id = ? ORDER BY created_at ASC', (product_id,))
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_for_products(product_ids: List[str]) -> Dict[str, List[Dict]]:
        if not product_ids:
            return {}
        with get_db_connection() as conn:
            cursor = conn.cursor()
            placeholders = ','.join('?' * len(product_ids))
            cursor.execute(f'SELECT * FROM product_variants WHERE product_id IN ({placeholders})', product_ids)
            rows = [dict(r) for r in cursor.fetchall()]
            mp: Dict[str, List[Dict]] = {}
            for r in rows:
                mp.setdefault(r['product_id'], []).append(r)
            return mp

    @staticmethod
    def get_by_id(variant_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM product_variants WHERE id = ?', (variant_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def create_variant(product_id: str, name: str, stock: int) -> str:
        vid = f"var_{int(datetime.now().timestamp()*1000)}"
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO product_variants (id, product_id, name, stock)
                VALUES (?, ?, ?, ?)
            ''', (vid, product_id, name, int(stock or 0)))
            conn.commit()
            return vid

    @staticmethod
    def update_variant(variant_id: str, name: Optional[str] = None, stock: Optional[int] = None) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            fields = []
            vals: List[Any] = []
            if name is not None:
                fields.append('name = ?')
                vals.append(name)
            if stock is not None:
                fields.append('stock = ?')
                vals.append(int(stock))
            if not fields:
                return False
            fields.append('updated_at = CURRENT_TIMESTAMP')
            vals.append(variant_id)
            sql = f"UPDATE product_variants SET {', '.join(fields)} WHERE id = ?"
            cursor.execute(sql, vals)
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def delete_variant(variant_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM product_variants WHERE id = ?', (variant_id,))
            conn.commit()
            return cursor.rowcount > 0

class SettingsDB:
    @staticmethod
    def get(key: str, default: Optional[str] = None) -> Optional[str]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT value FROM settings WHERE key = ?', (key,))
            row = cursor.fetchone()
            return row[0] if row else default

    @staticmethod
    def set(key: str, value: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, value))
            conn.commit()
            return True

# 购物车相关操作
class CartDB:
    @staticmethod
    def get_cart(student_id: str) -> Optional[Dict]:
        """获取用户购物车"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM carts WHERE student_id = ? ORDER BY updated_at DESC LIMIT 1',
                (student_id,)
            )
            row = cursor.fetchone()
            if row:
                cart_data = dict(row)
                cart_data['items'] = json.loads(cart_data['items'])
                return cart_data
            return None
    
    @staticmethod
    def update_cart(student_id: str, items: Dict) -> bool:
        """更新用户购物车"""
        items_json = json.dumps(items)
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            try:
                # 检查是否已有购物车
                existing = CartDB.get_cart(student_id)
                
                if existing:
                    cursor.execute('''
                        UPDATE carts 
                        SET items = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE student_id = ?
                    ''', (items_json, student_id))
                    logger.info(f"更新购物车 - 用户ID: {student_id}, 影响行数: {cursor.rowcount}")
                else:
                    cursor.execute('''
                        INSERT INTO carts (student_id, items) 
                        VALUES (?, ?)
                    ''', (student_id, items_json))
                    logger.info(f"创建新购物车 - 用户ID: {student_id}, 影响行数: {cursor.rowcount}")
                
                conn.commit()
                
                # 验证更新是否成功
                updated_cart = CartDB.get_cart(student_id)
                if updated_cart:
                    logger.info(f"购物车更新验证成功 - 当前内容: {updated_cart['items']}")
                    return True
                else:
                    logger.error(f"购物车更新验证失败 - 用户ID: {student_id}")
                    return False
                    
            except Exception as e:
                logger.error(f"数据库操作失败 - 用户ID: {student_id}, 错误: {e}")
                conn.rollback()
                return False

    @staticmethod
    def remove_product_from_all_carts(product_id: str) -> int:
        """从所有用户购物车中移除指定商品（包含其所有规格）。返回受影响的购物车数量。"""
        removed_count = 0
        SEP = '@@'
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('SELECT student_id, items FROM carts')
                rows = cursor.fetchall()
                for row in rows:
                    student_id = row[0]
                    try:
                        items = json.loads(row[1]) if isinstance(row[1], (str, bytes)) else (row[1] or {})
                    except Exception:
                        items = {}
                    if not isinstance(items, dict):
                        items = {}

                    # 过滤：剔除该商品及其规格项
                    changed = False
                    new_items = {}
                    for key, qty in items.items():
                        base_pid = key.split(SEP, 1)[0] if isinstance(key, str) else key
                        if base_pid == product_id:
                            changed = True
                            continue
                        new_items[key] = qty

                    if changed:
                        cursor.execute(
                            'UPDATE carts SET items = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?',
                            (json.dumps(new_items), student_id)
                        )
                        removed_count += 1

                conn.commit()
            except Exception as e:
                logger.error(f"从所有购物车移除商品失败: {e}")
                conn.rollback()
        return removed_count

# 聊天记录相关操作
class ChatLogDB:
    @staticmethod
    def add_log(student_id: Optional[str], role: str, content: str):
        """添加聊天记录"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO chat_logs (student_id, role, content) VALUES (?, ?, ?)',
                (student_id, role, content)
            )
            conn.commit()
    
    @staticmethod
    def get_recent_logs(student_id: Optional[str], limit: int = 50) -> List[Dict]:
        """获取最近的聊天记录"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if student_id:
                cursor.execute('''
                    SELECT * FROM chat_logs 
                    WHERE student_id = ? OR student_id IS NULL
                    ORDER BY timestamp DESC LIMIT ?
                ''', (student_id, limit))
            else:
                cursor.execute('''
                    SELECT * FROM chat_logs 
                    WHERE student_id IS NULL
                    ORDER BY timestamp DESC LIMIT ?
                ''', (limit,))
            return [dict(row) for row in cursor.fetchall()]

# 分类相关操作
class CategoryDB:
    @staticmethod
    def get_all_categories() -> List[Dict]:
        """获取所有分类"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM categories ORDER BY name')
            return [dict(row) for row in cursor.fetchall()]
    
    @staticmethod
    def get_categories_with_products(owner_ids: Optional[List[str]] = None, include_unassigned: bool = True) -> List[Dict]:
        """获取有商品关联的分类，可按商品归属过滤"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if owner_ids is None:
                cursor.execute('''
                    SELECT DISTINCT c.* 
                    FROM categories c 
                    INNER JOIN products p ON c.name = p.category 
                    ORDER BY c.name
                ''')
            else:
                where_sql, params = ProductDB._build_owner_filter(owner_ids, include_unassigned)
                if where_sql == '1=0':
                    return []
                cursor.execute(f'''
                    SELECT DISTINCT c.* 
                    FROM categories c 
                    INNER JOIN products p ON c.name = p.category 
                    WHERE {where_sql}
                    ORDER BY c.name
                ''', params)
            return [dict(row) for row in cursor.fetchall()]
    
    @staticmethod
    def get_category_by_id(category_id: str) -> Optional[Dict]:
        """根据ID获取分类"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM categories WHERE id = ?', (category_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    @staticmethod
    def get_category_by_name(name: str) -> Optional[Dict]:
        """根据名称获取分类"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM categories WHERE name = ?', (name,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    @staticmethod
    def create_category(name: str, description: str = "") -> str:
        """创建新分类"""
        category_id = f"cat_{int(datetime.now().timestamp())}"
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    INSERT INTO categories (id, name, description)
                    VALUES (?, ?, ?)
                ''', (category_id, name, description))
                conn.commit()
                return category_id
            except sqlite3.IntegrityError:
                # 分类名称已存在
                return ""
    
    @staticmethod
    def update_category(category_id: str, name: str = None, description: str = None) -> bool:
        """更新分类信息"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            update_fields = []
            values = []
            
            if name is not None:
                update_fields.append("name = ?")
                values.append(name)
            
            if description is not None:
                update_fields.append("description = ?")
                values.append(description)
            
            if not update_fields:
                return False
            
            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            values.append(category_id)
            
            try:
                sql = f"UPDATE categories SET {', '.join(update_fields)} WHERE id = ?"
                cursor.execute(sql, values)
                success = cursor.rowcount > 0
                conn.commit()
                return success
            except sqlite3.IntegrityError:
                # 分类名称冲突
                return False
    
    @staticmethod
    def delete_category(category_id: str) -> bool:
        """删除分类（需要检查是否有商品使用该分类）"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 检查是否有商品使用该分类
            cursor.execute('SELECT COUNT(*) FROM products WHERE category = (SELECT name FROM categories WHERE id = ?)', (category_id,))
            product_count = cursor.fetchone()[0]
            
            if product_count > 0:
                return False  # 有商品使用该分类，不能删除
            
            cursor.execute('DELETE FROM categories WHERE id = ?', (category_id,))
            success = cursor.rowcount > 0
            conn.commit()
            return success

    @staticmethod
    def cleanup_orphan_categories() -> int:
        """自动删除没有任何商品引用的分类，返回删除数量"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    DELETE FROM categories
                    WHERE name NOT IN (SELECT DISTINCT category FROM products)
                ''')
                deleted = cursor.rowcount if cursor.rowcount is not None else 0
                conn.commit()
                if deleted > 0:
                    logger.info(f"自动清理空分类完成，删除 {deleted} 个分类")
                return deleted
            except Exception as e:
                logger.error(f"清理空分类失败: {e}")
                conn.rollback()
            return 0

# 地址（配送/宿舍区）相关操作
class AddressDB:
    @staticmethod
    def get_all_addresses(include_disabled: bool = True) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if include_disabled:
                cursor.execute('''
                    SELECT * FROM addresses
                    ORDER BY sort_order ASC, name ASC
                ''')
            else:
                cursor.execute('''
                    SELECT * FROM addresses
                    WHERE enabled = 1
                    ORDER BY sort_order ASC, name ASC
                ''')
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_enabled_addresses() -> List[Dict]:
        return AddressDB.get_all_addresses(include_disabled=False)

    @staticmethod
    def get_enabled_addresses_with_buildings() -> List[Dict]:
        """获取启用且有启用楼栋的地址列表"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT DISTINCT a.* FROM addresses a
                INNER JOIN buildings b ON a.id = b.address_id
                WHERE a.enabled = 1 AND b.enabled = 1
                ORDER BY a.sort_order ASC, a.name ASC
            ''')
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_by_id(address_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM addresses WHERE id = ?', (address_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def get_by_name(name: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM addresses WHERE name = ?', (name,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def create_address(name: str, enabled: bool = True, sort_order: int = 0) -> str:
        address_id = f"addr_{int(datetime.now().timestamp())}"
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    INSERT INTO addresses (id, name, enabled, sort_order)
                    VALUES (?, ?, ?, ?)
                ''', (address_id, name, 1 if enabled else 0, sort_order))
                conn.commit()
                return address_id
            except sqlite3.IntegrityError:
                return ""  # 名称重复

    @staticmethod
    def update_address(address_id: str, name: Optional[str] = None, enabled: Optional[bool] = None, sort_order: Optional[int] = None) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            fields = []
            values = []
            if name is not None:
                fields.append('name = ?')
                values.append(name)
            if enabled is not None:
                fields.append('enabled = ?')
                values.append(1 if enabled else 0)
            if sort_order is not None:
                fields.append('sort_order = ?')
                values.append(int(sort_order))
            if not fields:
                return False
            fields.append('updated_at = CURRENT_TIMESTAMP')
            values.append(address_id)
            try:
                sql = f"UPDATE addresses SET {', '.join(fields)} WHERE id = ?"
                cursor.execute(sql, values)
                ok = cursor.rowcount > 0
                conn.commit()
                return ok
            except sqlite3.IntegrityError:
                return False

    @staticmethod
    def delete_address(address_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                # 先删除该地址下所有楼栋
                cursor.execute('DELETE FROM buildings WHERE address_id = ?', (address_id,))
                # 再删除地址本身
                cursor.execute('DELETE FROM addresses WHERE id = ?', (address_id,))
                ok = cursor.rowcount > 0
                conn.commit()
                return ok
            except Exception as e:
                logger.error(f"删除地址失败: {e}")
                conn.rollback()
                return False

    @staticmethod
    def reorder(address_ids: List[str]) -> bool:
        """按给定顺序重排 sort_order，索引小的在前"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                for idx, aid in enumerate(address_ids):
                    cursor.execute(
                        'UPDATE addresses SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        (idx, aid)
                    )
                conn.commit()
                return True
            except Exception as e:
                logger.error(f"重排地址失败: {e}")
                conn.rollback()
                return False

# 楼栋（按地址）相关操作
class BuildingDB:
    @staticmethod
    def get_all_buildings(address_id: str = None, include_disabled: bool = True) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if address_id:
                if include_disabled:
                    cursor.execute('''
                        SELECT * FROM buildings WHERE address_id = ?
                        ORDER BY sort_order ASC, name ASC
                    ''', (address_id,))
                else:
                    cursor.execute('''
                        SELECT * FROM buildings WHERE address_id = ? AND enabled = 1
                        ORDER BY sort_order ASC, name ASC
                    ''', (address_id,))
            else:
                if include_disabled:
                    cursor.execute('SELECT * FROM buildings ORDER BY sort_order ASC, name ASC')
                else:
                    cursor.execute('SELECT * FROM buildings WHERE enabled = 1 ORDER BY sort_order ASC, name ASC')
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_enabled_buildings(address_id: str) -> List[Dict]:
        return BuildingDB.get_all_buildings(address_id=address_id, include_disabled=False)

    @staticmethod
    def get_by_id(building_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM buildings WHERE id = ?', (building_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def get_by_name_in_address(address_id: str, name: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM buildings WHERE address_id = ? AND name = ?', (address_id, name))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def create_building(address_id: str, name: str, enabled: bool = True, sort_order: int = 0) -> str:
        building_id = f"bld_{int(datetime.now().timestamp())}"
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    INSERT INTO buildings (id, address_id, name, enabled, sort_order)
                    VALUES (?, ?, ?, ?, ?)
                ''', (building_id, address_id, name, 1 if enabled else 0, sort_order))
                conn.commit()
                return building_id
            except sqlite3.IntegrityError:
                return ""

    @staticmethod
    def update_building(building_id: str, name: Optional[str] = None, enabled: Optional[bool] = None, sort_order: Optional[int] = None) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            fields = []
            values = []
            if name is not None:
                fields.append('name = ?')
                values.append(name)
            if enabled is not None:
                fields.append('enabled = ?')
                values.append(1 if enabled else 0)
            if sort_order is not None:
                fields.append('sort_order = ?')
                values.append(int(sort_order))
            if not fields:
                return False
            fields.append('updated_at = CURRENT_TIMESTAMP')
            values.append(building_id)
            try:
                sql = f"UPDATE buildings SET {', '.join(fields)} WHERE id = ?"
                cursor.execute(sql, values)
                ok = cursor.rowcount > 0
                conn.commit()
                return ok
            except sqlite3.IntegrityError:
                return False

    @staticmethod
    def delete_building(building_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM buildings WHERE id = ?', (building_id,))
            ok = cursor.rowcount > 0
            conn.commit()
            return ok

    @staticmethod
    def reorder(address_id: str, building_ids: List[str]) -> bool:
        """对某地址下的楼栋按给定顺序重排 sort_order"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                for idx, bid in enumerate(building_ids):
                    cursor.execute(
                        'UPDATE buildings SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND address_id = ?',
                        (idx, bid, address_id)
                    )
                conn.commit()
                return True
            except Exception as e:
                logger.error(f"重排楼栋失败: {e}")
                conn.rollback()
                return False

# 管理员相关操作
class AdminDB:
    SAFE_SUPER_ADMINS = {"ADMIN_USERNAME1", "ADMIN_USERNAME2"}

    @staticmethod
    def verify_admin(admin_id: str, password: str) -> Optional[Dict]:
        """验证管理员/代理凭据"""
        admin = AdminDB.get_admin(admin_id)
        if not admin:
            return None
        if admin.get('password') != password:
            return None
        return admin

    @staticmethod
    def get_admin(admin_id: str, include_disabled: bool = False) -> Optional[Dict[str, Any]]:
        with get_db_connection() as conn:
            try:
                cursor = safe_execute_with_migration(conn, 'SELECT * FROM admins WHERE id = ?', (admin_id,), 'admins')
                row = cursor.fetchone()
                if not row:
                    return None
                data = dict(row)
                if not include_disabled:
                    try:
                        if int(data.get('is_active', 1) or 1) != 1:
                            return None
                    except Exception:
                        pass
                return data
            except Exception as e:
                logger.error(f"获取管理员信息失败: {e}")
                return None

    @staticmethod
    def list_admins(role: Optional[str] = None, include_disabled: bool = False) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            try:
                clauses = []
                params: List[Any] = []
                if role:
                    clauses.append('role = ?')
                    params.append(role)
                if not include_disabled:
                    clauses.append('(is_active IS NULL OR is_active = 1)')
                where_sql = ('WHERE ' + ' AND '.join(clauses)) if clauses else ''
                cursor = safe_execute_with_migration(conn, f'SELECT * FROM admins {where_sql} ORDER BY created_at DESC', tuple(params), 'admins')
                rows = cursor.fetchall() or []
                results = []
                for row in rows:
                    data = dict(row)
                    # 再次过滤以防止旧库缺少字段
                    if not include_disabled and int(data.get('is_active', 1) or 1) != 1:
                        continue
                    results.append(data)
                return results
            except Exception as e:
                logger.error(f"获取管理员列表失败: {e}")
                return []

    @staticmethod
    def create_admin(admin_id: str, password: str, name: str, role: str = 'agent', payment_qr_path: Optional[str] = None) -> bool:
        with get_db_connection() as conn:
            try:
                safe_execute_with_migration(conn, '''
                    INSERT INTO admins (id, password, name, role, payment_qr_path, is_active)
                    VALUES (?, ?, ?, ?, ?, 1)
                ''', (admin_id, password, name, role, payment_qr_path), 'admins')
                conn.commit()
                return True
            except sqlite3.IntegrityError:
                return False

    @staticmethod
    def update_admin(admin_id: str, **fields) -> bool:
        allowed_fields = {'password', 'name', 'role', 'payment_qr_path', 'is_active'}
        updates = []
        params: List[Any] = []
        for key, value in fields.items():
            if key in allowed_fields and value is not None:
                updates.append(f"{key} = ?")
                params.append(value)
        if not updates:
            return False
        updates.append('updated_at = CURRENT_TIMESTAMP')
        params.append(admin_id)
        with get_db_connection() as conn:
            try:
                cursor = safe_execute_with_migration(conn, f"UPDATE admins SET {', '.join(updates)} WHERE id = ?", tuple(params), 'admins')
                conn.commit()
                return cursor.rowcount > 0
            except Exception as e:
                logger.error(f"更新管理员信息失败: {e}")
                return False

    @staticmethod
    def soft_delete_admin(admin_id: str) -> bool:
        if admin_id in AdminDB.SAFE_SUPER_ADMINS:
            return False
        return AdminDB.update_admin(admin_id, is_active=0)

    @staticmethod
    def restore_admin(admin_id: str) -> bool:
        return AdminDB.update_admin(admin_id, is_active=1)


class AgentAssignmentDB:
    @staticmethod
    def set_agent_buildings(agent_id: str, building_ids: List[str]) -> bool:
        """重置代理所管理的楼栋列表"""
        if not agent_id:
            return False
        unique_ids = []
        for bid in building_ids or []:
            if bid and bid not in unique_ids:
                unique_ids.append(bid)

        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('DELETE FROM agent_buildings WHERE agent_id = ?', (agent_id,))
                for bid in unique_ids:
                    cursor.execute('SELECT id, address_id FROM buildings WHERE id = ?', (bid,))
                    row = cursor.fetchone()
                    if not row:
                        continue
                    address_id = row['address_id']
                    assignment_id = f"agtb_{uuid.uuid4().hex}"
                    cursor.execute('''
                        INSERT OR REPLACE INTO agent_buildings (id, agent_id, address_id, building_id)
                        VALUES (?, ?, ?, ?)
                    ''', (assignment_id, agent_id, address_id, bid))
                conn.commit()
                return True
            except Exception as e:
                logger.error(f"更新代理楼栋失败: {e}")
                conn.rollback()
                return False

    @staticmethod
    def get_buildings_for_agent(agent_id: str) -> List[Dict[str, Any]]:
        if not agent_id:
            return []
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT 
                    ab.id,
                    ab.agent_id,
                    ab.address_id,
                    ab.building_id,
                    b.name AS building_name,
                    b.enabled AS building_enabled,
                    addr.name AS address_name,
                    addr.enabled AS address_enabled,
                    addr.sort_order AS address_sort,
                    b.sort_order AS building_sort
                FROM agent_buildings ab
                JOIN buildings b ON b.id = ab.building_id
                LEFT JOIN addresses addr ON addr.id = ab.address_id
                WHERE ab.agent_id = ?
                ORDER BY addr.sort_order ASC, b.sort_order ASC
            ''', (agent_id,))
            rows = cursor.fetchall() or []
            return [dict(row) for row in rows]

    @staticmethod
    def get_agent_for_building(building_id: str) -> Optional[Dict[str, Any]]:
        if not building_id:
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT 
                    ab.id,
                    ab.agent_id,
                    ab.address_id,
                    ab.building_id,
                    a.name AS agent_name,
                    a.role AS agent_role,
                    a.payment_qr_path,
                    a.is_active,
                    b.name AS building_name,
                    addr.name AS address_name
                FROM agent_buildings ab
                JOIN admins a ON a.id = ab.agent_id
                JOIN buildings b ON b.id = ab.building_id
                LEFT JOIN addresses addr ON addr.id = ab.address_id
                WHERE ab.building_id = ?
                LIMIT 1
            ''', (building_id,))
            row = cursor.fetchone()
            if not row:
                return None
            data = dict(row)
            try:
                if int(data.get('is_active', 1) or 1) != 1:
                    return None
            except Exception:
                pass
            return data

    @staticmethod
    def get_agent_id_for_building(building_id: str) -> Optional[str]:
        agent = AgentAssignmentDB.get_agent_for_building(building_id)
        if not agent:
            return None
        return agent.get('agent_id')

    @staticmethod
    def get_agent_ids_for_address(address_id: str) -> List[str]:
        if not address_id:
            return []
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT DISTINCT agent_id FROM agent_buildings
                WHERE address_id = ?
            ''', (address_id,))
            rows = cursor.fetchall() or []
            return [row['agent_id'] for row in rows if row['agent_id']]

    @staticmethod
    def get_assignment_map_for_buildings(building_ids: List[str]) -> Dict[str, Optional[str]]:
        if not building_ids:
            return {}
        unique_ids = [bid for bid in set(building_ids) if bid]
        if not unique_ids:
            return {}
        placeholders = ','.join('?' * len(unique_ids))
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f'''
                SELECT building_id, agent_id
                FROM agent_buildings
                WHERE building_id IN ({placeholders})
            ''', unique_ids)
            rows = cursor.fetchall() or []
            result = {bid: None for bid in unique_ids}
            for row in rows:
                result[row['building_id']] = row['agent_id']
            return result

    @staticmethod
    def list_agents_with_buildings(include_disabled: bool = False) -> List[Dict[str, Any]]:
        agents = AdminDB.list_admins(role='agent', include_disabled=include_disabled)
        result: List[Dict[str, Any]] = []
        for agent in agents:
            buildings = AgentAssignmentDB.get_buildings_for_agent(agent['id'])
            entry = dict(agent)
            entry['buildings'] = buildings
            result.append(entry)
        return result

# 订单相关操作
class OrderDB:
    @staticmethod
    def _build_scope_filter(
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        table_alias: str = 'o'
    ) -> Tuple[str, List[Any]]:
        clauses: List[str] = []
        params: List[Any] = []

        normalized_addresses = [aid for aid in (address_ids or []) if aid]
        normalized_buildings = [bid for bid in (building_ids or []) if bid]

        if agent_id:
            clauses.append(f"{table_alias}.agent_id = ?")
            params.append(agent_id)

            fallback_clauses: List[str] = []
            if normalized_buildings:
                placeholders = ','.join('?' * len(normalized_buildings))
                fallback_clauses.append(
                    f"({table_alias}.agent_id IS NULL AND {table_alias}.building_id IN ({placeholders}))"
                )
                params.extend(normalized_buildings)
            if normalized_addresses:
                placeholders = ','.join('?' * len(normalized_addresses))
                fallback_clauses.append(
                    f"({table_alias}.agent_id IS NULL AND {table_alias}.address_id IN ({placeholders}))"
                )
                params.extend(normalized_addresses)
            if fallback_clauses:
                clauses.extend(fallback_clauses)
        else:
            if normalized_buildings:
                placeholders = ','.join('?' * len(normalized_buildings))
                clauses.append(f"{table_alias}.building_id IN ({placeholders})")
                params.extend(normalized_buildings)
            if normalized_addresses:
                placeholders = ','.join('?' * len(normalized_addresses))
                clauses.append(f"{table_alias}.address_id IN ({placeholders})")
                params.extend(normalized_addresses)

        if not clauses:
            return '', []

        connector = ' OR ' if agent_id else ' OR '
        return '(' + connector.join(clauses) + ')', params

    @staticmethod
    def create_order(
        student_id: str,
        total_amount: float,
        shipping_info: dict,
        items: list,
        payment_method: str = 'wechat',
        note: str = '',
        discount_amount: float = 0.0,
        coupon_id: Optional[str] = None,
        address_id: Optional[str] = None,
        building_id: Optional[str] = None,
        agent_id: Optional[str] = None
    ) -> str:
        """创建新订单（但不扣减库存，等待支付成功）"""
        order_id = f"order_{int(datetime.now().timestamp())}"

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO orders 
                (id, student_id, total_amount, shipping_info, items, payment_method, note, payment_status, discount_amount, coupon_id, address_id, building_id, agent_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                order_id,
                student_id,
                total_amount,
                json.dumps(shipping_info),
                json.dumps(items),
                payment_method,
                note,
                'pending',
                float(discount_amount or 0.0),
                coupon_id,
                address_id,
                building_id,
                agent_id
            ))
            conn.commit()
            return order_id

    @staticmethod
    def set_order_items(order_id: str, items: List[Dict[str, Any]]) -> bool:
        """覆盖更新订单商品（用于追加抽奖奖品等场景）。"""
        try:
            payload = json.dumps(items)
        except Exception:
            payload = json.dumps([])
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE orders 
                SET items = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            ''', (payload, order_id))
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def update_payment_status(order_id: str, payment_status: str, payment_intent_id: str = None) -> bool:
        """更新订单支付状态"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if payment_intent_id:
                cursor.execute('''
                    UPDATE orders 
                    SET payment_status = ?, payment_intent_id = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                ''', (payment_status, payment_intent_id, order_id))
            else:
                cursor.execute('''
                    UPDATE orders 
                    SET payment_status = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                ''', (payment_status, order_id))
            conn.commit()
            return cursor.rowcount > 0
    
    @staticmethod
    def complete_payment_and_update_stock(order_id: str) -> bool:
        """支付成功后，扣减库存并更新订单状态"""
        logger.info(f"开始处理支付成功订单: {order_id}")
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 获取订单信息
            cursor.execute('SELECT items, payment_status FROM orders WHERE id = ?', (order_id,))
            row = cursor.fetchone()
            if not row:
                logger.error(f"订单不存在: {order_id}")
                return False
                
            order_data = dict(row)
            current_status = order_data['payment_status']
            logger.info(f"订单 {order_id} 当前支付状态: {current_status}")
            
            if order_data['payment_status'] not in ['pending', 'processing']:
                logger.warning(f"订单 {order_id} 状态异常，无法处理支付: {current_status}")
                return False  # 已经处理过了或状态异常
                
            items = json.loads(order_data['items'])
            
            # 检查库存是否足够并扣减库存
            for item in items:
                is_lottery_item = False
                try:
                    is_lottery_item = bool(item.get('is_lottery')) if isinstance(item, dict) else False
                except Exception:
                    is_lottery_item = False

                if is_lottery_item and isinstance(item, dict):
                    quantity = int(item.get('quantity', 0))
                    if quantity <= 0:
                        continue
                    actual_product_id = item.get('lottery_product_id') or item.get('product_id')
                    actual_variant_id = item.get('lottery_variant_id') or item.get('variant_id')
                    if not actual_product_id:
                        logger.warning(f"抽奖奖品缺少产品ID，跳过库存扣减: {item}")
                        continue
                    if actual_variant_id:
                        cursor.execute('SELECT product_id, stock FROM product_variants WHERE id = ?', (actual_variant_id,))
                        var_row = cursor.fetchone()
                        if not var_row:
                            logger.info(f"抽奖奖品规格不存在，跳过库存扣减: {actual_variant_id} (item: {item.get('name', 'Unknown')})")
                            continue
                        var_product_id = var_row[0]
                        current_stock = int(var_row[1])
                        if current_stock < quantity:
                            # 抽奖奖品规格库存不足，跳过扣减但不阻止订单支付成功
                            logger.warning(f"抽奖奖品规格库存不足，跳过扣减: {actual_variant_id} (需要: {quantity}, 可用: {current_stock})")
                            continue
                        new_stock = current_stock - quantity
                        cursor.execute('UPDATE product_variants SET stock = ? WHERE id = ?', (new_stock, actual_variant_id))
                    else:
                        cursor.execute('SELECT stock FROM products WHERE id = ?', (actual_product_id,))
                        product_row = cursor.fetchone()
                        if not product_row:
                            # 兼容处理：旧版抽奖奖品可能对应不存在的商品或虚拟商品，跳过库存扣减
                            logger.info(f"抽奖奖品商品不存在，跳过库存扣减: {actual_product_id} (item: {item.get('name', 'Unknown')})")
                            continue
                        current_stock = int(product_row[0])
                        if current_stock < quantity:
                            # 抽奖奖品库存不足，跳过扣减但不阻止订单支付成功
                            logger.warning(f"抽奖奖品库存不足，跳过扣减: {actual_product_id} (需要: {quantity}, 可用: {current_stock})")
                            continue
                        new_stock = current_stock - quantity
                        cursor.execute('UPDATE products SET stock = ? WHERE id = ?', (new_stock, actual_product_id))
                    # 抽奖赠品已处理库存，无需进入常规分支
                    continue

                product_id = item['product_id']
                quantity = int(item['quantity'])
                variant_id = item.get('variant_id')
                if variant_id:
                    # 扣减规格库存
                    cursor.execute('SELECT stock FROM product_variants WHERE id = ?', (variant_id,))
                    var_row = cursor.fetchone()
                    if not var_row:
                        conn.rollback()
                        return False
                    current_stock = int(var_row[0])
                    if current_stock < quantity:
                        conn.rollback()
                        return False
                    new_stock = current_stock - quantity
                    cursor.execute('UPDATE product_variants SET stock = ? WHERE id = ?', (new_stock, variant_id))
                else:
                    # 扣减商品库存
                    cursor.execute('SELECT stock FROM products WHERE id = ?', (product_id,))
                    product_row = cursor.fetchone()
                    if not product_row:
                        # 兼容处理：若为各种类型赠品且无对应商品，跳过扣减
                        if isinstance(item, dict):
                            # 检查是否为各种类型的赠品
                            is_gift_item = (
                                item.get('is_lottery') or          # 抽奖赠品
                                item.get('is_auto_gift') or        # 满额赠品
                                item.get('category') == '满额赠品' or # 分类为赠品
                                '赠品' in str(item.get('name', '')) or  # 名称包含赠品
                                '赠品' in str(item.get('category', ''))  # 分类包含赠品
                            )
                            if is_gift_item:
                                logger.info(f"跳过赠品库存扣减: {item.get('name', 'Unknown')} (product_id: {product_id})")
                                continue
                        conn.rollback()
                        logger.error(f"商品不存在无法扣减库存: product_id={product_id}, item={item}")
                        return False
                    current_stock = int(product_row[0])
                    if current_stock < quantity:
                        conn.rollback()
                        return False  # 库存不足
                    new_stock = current_stock - quantity
                    cursor.execute('UPDATE products SET stock = ? WHERE id = ?', (new_stock, product_id))
            
            # 更新支付状态为成功
            cursor.execute('''
                UPDATE orders 
                SET payment_status = 'succeeded', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            ''', (order_id,))
            
            updated_rows = cursor.rowcount
            conn.commit()
            
            logger.info(f"订单 {order_id} 支付处理完成，库存已扣减，支付状态已更新为 succeeded，影响行数: {updated_rows}")
            return True
    
    @staticmethod
    def get_order_by_id(order_id: str) -> Optional[Dict]:
        """根据订单ID获取订单信息"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT o.*, u.name as customer_name 
                FROM orders o 
                LEFT JOIN users u ON o.student_id = u.id 
                WHERE o.id = ?
            ''', (order_id,))
            row = cursor.fetchone()
            if row:
                order = dict(row)
                order['shipping_info'] = json.loads(order['shipping_info'])
                order['items'] = json.loads(order['items'])
                return order
            return None
    
    @staticmethod
    def get_all_orders() -> List[Dict]:
        """获取所有订单（管理员用）——已废弃，请使用 get_orders_paginated。仍保留供兼容。"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT o.*, u.name as customer_name 
                FROM orders o 
                LEFT JOIN users u ON o.student_id = u.id 
                ORDER BY o.created_at DESC
            ''')
            orders = []
            for row in cursor.fetchall():
                order = dict(row)
                order['shipping_info'] = json.loads(order['shipping_info'])
                order['items'] = json.loads(order['items'])
                orders.append(order)
            return orders

    @staticmethod
    def get_orders_paginated(
        order_id: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        exclude_address_ids: Optional[List[str]] = None,
        exclude_building_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        获取订单（管理员用），支持按订单ID模糊查询与分页。
        返回 { 'orders': [...], 'total': int }
        """
        # 保护性限制，避免一次性取太多
        try:
            limit = int(limit)
        except Exception:
            limit = 20
        if limit <= 0:
            limit = 20
        if limit > 100:
            limit = 100
        try:
            offset = int(offset)
        except Exception:
            offset = 0
        if offset < 0:
            offset = 0

        with get_db_connection() as conn:
            cursor = conn.cursor()

            params: List[Any] = []
            where_sql: List[str] = []
            if order_id:
                where_sql.append('o.id LIKE ?')
                params.append(f'%{order_id}%')

            scope_clause, scope_params = OrderDB._build_scope_filter(agent_id, address_ids, building_ids)
            if scope_clause:
                where_sql.append(scope_clause)
                params.extend(scope_params)

            excluded_addresses = [aid for aid in (exclude_address_ids or []) if aid]
            excluded_buildings = [bid for bid in (exclude_building_ids or []) if bid]

            if excluded_buildings:
                placeholders = ','.join('?' * len(excluded_buildings))
                where_sql.append(f'(o.building_id IS NULL OR o.building_id NOT IN ({placeholders}))')
                params.extend(excluded_buildings)
            if excluded_addresses:
                placeholders = ','.join('?' * len(excluded_addresses))
                where_sql.append(f'(o.address_id IS NULL OR o.address_id NOT IN ({placeholders}))')
                params.extend(excluded_addresses)
            if excluded_buildings or excluded_addresses:
                where_sql.append('(o.agent_id IS NULL OR o.agent_id = "")')
            where_clause = (' WHERE ' + ' AND '.join(where_sql)) if where_sql else ''

            # 统计总数
            cursor.execute(f'''SELECT COUNT(*) FROM orders o{where_clause}''', params)
            total = cursor.fetchone()[0] or 0

            # 查询分页结果
            query_sql = f'''
                SELECT o.*, u.name as customer_name
                FROM orders o
                LEFT JOIN users u ON o.student_id = u.id
                {where_clause}
                ORDER BY o.created_at DESC
                LIMIT ? OFFSET ?
            '''
            q_params = params + [limit, offset]
            cursor.execute(query_sql, q_params)
            orders: List[Dict[str, Any]] = []
            for row in cursor.fetchall():
                order = dict(row)
                try:
                    order['shipping_info'] = json.loads(order['shipping_info'])
                except Exception:
                    pass
                try:
                    order['items'] = json.loads(order['items'])
                except Exception:
                    pass
                orders.append(order)

            return { 'orders': orders, 'total': total }
    
    @staticmethod
    def get_orders_by_student(student_id: str) -> List[Dict]:
        """获取用户的订单"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM orders WHERE student_id = ? ORDER BY created_at DESC',
                (student_id,)
            )
            orders = []
            for row in cursor.fetchall():
                order = dict(row)
                order['shipping_info'] = json.loads(order['shipping_info'])
                order['items'] = json.loads(order['items'])
                orders.append(order)
            return orders
    
    @staticmethod
    def get_order_by_id(order_id: str) -> Optional[Dict]:
        """根据ID获取订单"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM orders WHERE id = ?',
                (order_id,)
            )
            row = cursor.fetchone()
            if row:
                order = dict(row)
                order['shipping_info'] = json.loads(order['shipping_info'])
                order['items'] = json.loads(order['items'])
                return order
            return None
    
    @staticmethod
    def update_order_status(order_id: str, status: str) -> bool:
        """更新订单状态"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE orders 
                SET status = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            ''', (status, order_id))
            success = cursor.rowcount > 0
            conn.commit()
            return success

    @staticmethod
    def delete_order(order_id: str) -> bool:
        """删除单个订单"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM orders WHERE id = ?', (order_id,))
            ok = cursor.rowcount > 0
            conn.commit()
            return ok

    @staticmethod
    def batch_delete_orders(order_ids: List[str]) -> Dict[str, Any]:
        """批量删除订单"""
        if not order_ids:
            return {"success": False, "deleted_count": 0, "message": "没有提供要删除的订单ID"}
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                placeholders = ','.join('?' * len(order_ids))
                cursor.execute(f'SELECT id FROM orders WHERE id IN ({placeholders})', order_ids)
                existing_ids = [row[0] for row in cursor.fetchall()]
                if not existing_ids:
                    return {"success": False, "deleted_count": 0, "message": "没有找到要删除的订单"}
                cursor.execute(f'DELETE FROM orders WHERE id IN ({placeholders})', existing_ids)
                deleted_count = cursor.rowcount or 0
                conn.commit()
                return {
                    "success": True,
                    "deleted_count": deleted_count,
                    "deleted_ids": existing_ids,
                    "not_found_ids": list(set(order_ids) - set(existing_ids)),
                    "message": f"成功删除 {deleted_count} 笔订单"
                }
            except Exception as e:
                conn.rollback()
                return {"success": False, "deleted_count": 0, "message": f"批量删除失败: {str(e)}"}

    @staticmethod
    def purge_expired_unpaid_orders(expire_minutes: int = 15) -> int:
        """删除超过指定分钟仍未支付(支付状态pending)的订单，返回删除数量"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                # 先查询将要删除的订单（用于返还被锁定的优惠券）
                cursor.execute('''
                    SELECT id, coupon_id, discount_amount FROM orders
                    WHERE payment_status IN ('pending','failed')
                      AND datetime(created_at) <= datetime('now', ?)
                ''', (f'-{int(expire_minutes)} minutes',))
                rows = cursor.fetchall() or []
                ids = [r[0] for r in rows]
                # 执行删除
                cursor.execute('''
                    DELETE FROM orders
                    WHERE payment_status IN ('pending','failed')
                      AND datetime(created_at) <= datetime('now', ?)
                ''', (f'-{int(expire_minutes)} minutes',))
                deleted = cursor.rowcount or 0
                conn.commit()
                # 返还优惠券
                try:
                    for r in rows:
                        try:
                            oid = r[0]
                            cid = r[1]
                            damt = float(r[2] or 0)
                            if cid and damt > 0:
                                CouponDB.unlock_for_order(cid, oid)
                        except Exception:
                            pass
                except Exception as e:
                    logger.warning(f"返还过期订单优惠券失败: {e}")
                return deleted
            except Exception as e:
                logger.error(f"清理过期未付款订单失败: {e}")
                conn.rollback()
                return 0
    
    @staticmethod
    def get_order_stats(
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        exclude_address_ids: Optional[List[str]] = None,
        exclude_building_ids: Optional[List[str]] = None
    ) -> Dict:
        """获取订单统计信息（管理员用）"""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            def build_where(extra_clause: Optional[str] = None, extra_params: Optional[List[Any]] = None, alias: str = 'orders') -> Tuple[str, List[Any]]:
                scope_clause, scope_args = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, table_alias=alias)
                clauses: List[str] = []
                params: List[Any] = []
                if scope_clause:
                    clauses.append(scope_clause)
                    params.extend(scope_args)
                excluded_buildings = [bid for bid in (exclude_building_ids or []) if bid]
                excluded_addresses = [aid for aid in (exclude_address_ids or []) if aid]
                if excluded_buildings:
                    placeholders = ','.join('?' * len(excluded_buildings))
                    clauses.append(f'({alias}.building_id IS NULL OR {alias}.building_id NOT IN ({placeholders}))')
                    params.extend(excluded_buildings)
                if excluded_addresses:
                    placeholders = ','.join('?' * len(excluded_addresses))
                    clauses.append(f'({alias}.address_id IS NULL OR {alias}.address_id NOT IN ({placeholders}))')
                    params.extend(excluded_addresses)
                if excluded_buildings or excluded_addresses:
                    clauses.append(f'({alias}.agent_id IS NULL OR {alias}.agent_id = "")')
                if extra_clause:
                    clauses.append(extra_clause)
                    if extra_params:
                        params.extend(extra_params)
                if not clauses:
                    return '', params
                return ' WHERE ' + ' AND '.join(clauses), params
            
            # 总订单数
            where_clause, params = build_where()
            cursor.execute(f'SELECT COUNT(*) FROM orders{where_clause}', params)
            total_orders = cursor.fetchone()[0]
            
            # 各状态订单数
            where_clause, params = build_where(alias='orders')
            cursor.execute(f'''
                SELECT status, COUNT(*) as count 
                FROM orders {where_clause}
                GROUP BY status
            ''', params)
            status_counts = {row[0]: row[1] for row in cursor.fetchall()}
            
            # 今日订单数
            today_clause = "date(created_at, 'localtime') = date('now', 'localtime')"
            where_clause, params = build_where(today_clause)
            cursor.execute(f'''SELECT COUNT(*) FROM orders{where_clause}''', params)
            today_orders = cursor.fetchone()[0]
            
            # 总销售额
            where_clause, params = build_where()
            cursor.execute(f'SELECT COALESCE(SUM(total_amount), 0) FROM orders{where_clause}', params)
            total_revenue = cursor.fetchone()[0]
            
            return {
                'total_orders': total_orders,
                'status_counts': status_counts,
                'today_orders': today_orders,
                'total_revenue': round(total_revenue, 2)
            }

    @staticmethod
    def get_dashboard_stats(
        period: str = 'week',
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None
    ) -> Dict:
        """获取仪表盘详细统计信息"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 基础统计
            basic_stats = OrderDB.get_order_stats(agent_id=agent_id, address_ids=address_ids, building_ids=building_ids)

            def build_where(extra_clause: Optional[str] = None, extra_params: Optional[List[Any]] = None, alias: str = 'orders') -> Tuple[str, List[Any]]:
                scope_clause, scope_args = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, table_alias=alias)
                clauses: List[str] = []
                params: List[Any] = []
                if scope_clause:
                    clauses.append(scope_clause)
                    params.extend(scope_args)
                if extra_clause:
                    clauses.append(extra_clause)
                    if extra_params:
                        params.extend(extra_params)
                if not clauses:
                    return '', params
                return ' WHERE ' + ' AND '.join(clauses), params
            
            # 按时间段统计销售额
            if period == 'day':
                time_filter = "date(created_at, 'localtime') = date('now', 'localtime')"
                prev_time_filter = "date(created_at, 'localtime') = date('now', '-1 day', 'localtime')"
                group_by = "strftime('%Y-%m-%d %H:00:00', created_at, 'localtime')"
                date_format = "今日各小时"
            elif period == 'week':
                time_filter = "date(created_at, 'localtime') >= date('now', '-7 days', 'localtime')"
                prev_time_filter = "date(created_at, 'localtime') >= date('now', '-14 days', 'localtime') AND date(created_at, 'localtime') < date('now', '-7 days', 'localtime')"
                group_by = "date(created_at, 'localtime')"
                date_format = "近7天"
            else:  # month
                time_filter = "date(created_at, 'localtime') >= date('now', '-30 days', 'localtime')"
                prev_time_filter = "date(created_at, 'localtime') >= date('now', '-60 days', 'localtime') AND date(created_at, 'localtime') < date('now', '-30 days', 'localtime')"
                group_by = "date(created_at, 'localtime')"
                date_format = "近30天"
            
            # 当前时间段销售额
            where_clause, params = build_where(time_filter)
            cursor.execute(f'''
                SELECT {group_by} as period, 
                       COALESCE(SUM(total_amount), 0) as revenue,
                       COUNT(*) as orders
                FROM orders 
                {where_clause}
                GROUP BY {group_by}
                ORDER BY period
            ''', params)
            current_period_data = [
                {'period': row[0], 'revenue': round(row[1], 2), 'orders': row[2]}
                for row in cursor.fetchall()
            ]

            # 计算净利润数据 - 使用新算法：订单总额减去成本总和
            def calculate_profit_for_period(time_filter_clause):
                where_clause, params = build_where(
                    f"({time_filter_clause})", alias='o'
                )
                extra_clause = "o.payment_status = 'succeeded'"
                if where_clause:
                    where_clause = where_clause + ' AND ' + extra_clause
                else:
                    where_clause = ' WHERE ' + extra_clause
                cursor.execute(f'''
                    SELECT o.items, o.created_at, o.total_amount
                    FROM orders o 
                    {where_clause}
                ''', params)
                
                total_profit = 0.0
                profit_by_period = {}
                
                for row in cursor.fetchall():
                    try:
                        items_json = json.loads(row[0])
                        created_at = row[1]
                        order_total_amount = float(row[2]) if row[2] else 0.0
                        
                        total_cost = 0.0  # 商品成本总和
                        fallback_gift_count = 0    # 赠品数量（兼容旧数据）

                        for item in items_json:
                            product_id = item.get('product_id')
                            quantity = int(item.get('quantity', 0))
                            is_lottery = item.get('is_lottery', False)
                            is_auto_gift = item.get('is_auto_gift', False)

                            if is_lottery:
                                # 新逻辑：优先使用记录的抽奖奖品实际价值；兼容旧订单按1元计
                                prize_unit_price = None
                                try:
                                    prize_unit_price = float(item.get('lottery_unit_price'))
                                except Exception:
                                    prize_unit_price = None
                                if prize_unit_price is not None and prize_unit_price > 0:
                                    total_cost += prize_unit_price * quantity
                                else:
                                    fallback_gift_count += quantity
                                continue
                                
                            # 获取商品成本，如果没有设置成本则默认为0
                            # 包括普通商品和满赠商品（is_auto_gift=True）都需要计算实际成本
                            cursor.execute('SELECT cost FROM products WHERE id = ?', (product_id,))
                            cost_row = cursor.fetchone()
                            cost = 0.0
                            if cost_row and cost_row[0] is not None and cost_row[0] != '':
                                try:
                                    cost = float(cost_row[0])
                                except (ValueError, TypeError):
                                    cost = 0.0
                            
                            # 累计商品成本：成本 × 数量
                            # 满赠商品（is_auto_gift）和普通商品都按实际成本计算
                            total_cost += cost * quantity
                        
                        # 新算法：净利润 = 订单总额 - 商品成本总和 - 赠品数量×1（兼容旧数据）
                        final_order_profit = order_total_amount - total_cost - fallback_gift_count
                        total_profit += final_order_profit
                        
                        # 按时间段分组，使用与销售额查询一致的SQLite本地时间转换
                        if period == 'day':
                            # 使用SQLite的localtime转换，确保与销售额查询的period格式一致
                            created_at = row[1]
                            if created_at:
                                # 查询SQLite转换后的本地时间格式，与销售额查询保持一致
                                cursor.execute('''
                                    SELECT strftime('%Y-%m-%d %H:00:00', ?, 'localtime')
                                ''', (created_at,))
                                sqlite_result = cursor.fetchone()
                                period_key = sqlite_result[0] if sqlite_result else ''
                            else:
                                period_key = ''
                        else:
                            # 对于周/月，使用SQLite的日期转换
                            created_at = row[1]
                            if created_at:
                                cursor.execute('''
                                    SELECT date(?, 'localtime')
                                ''', (created_at,))
                                sqlite_result = cursor.fetchone()
                                period_key = sqlite_result[0] if sqlite_result else ''
                            else:
                                period_key = ''
                        
                        if period_key:
                            profit_by_period[period_key] = profit_by_period.get(period_key, 0) + final_order_profit
                            
                    except (json.JSONDecodeError, KeyError, ValueError, TypeError):
                        continue
                
                return total_profit, profit_by_period

            # 计算当前时间段净利润
            current_profit, current_profit_by_period = calculate_profit_for_period(time_filter)
            
            # 为current_period_data添加净利润数据
            for data_point in current_period_data:
                period_value = data_point['period']
                
                # 处理时间格式转换，确保与calculate_profit_for_period中的格式一致
                if period == 'day':
                    # period_value格式是 "YYYY-MM-DD HH:00:00"，直接使用完整格式匹配
                    period_key = str(period_value)
                else:
                    # 对于日期数据，直接使用period值
                    period_key = str(period_value)
                
                data_point['profit'] = round(current_profit_by_period.get(period_key, 0), 2)
            
            # 对比时间段销售额和净利润
            prev_where, prev_params = build_where(prev_time_filter)
            cursor.execute(f'''
                SELECT COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as orders
                FROM orders 
                {prev_where}
            ''', prev_params)
            prev_data = cursor.fetchone()
            prev_revenue = round(prev_data[0], 2) if prev_data else 0
            prev_orders = prev_data[1] if prev_data else 0
            
            # 计算对比时间段净利润
            prev_profit, _ = calculate_profit_for_period(prev_time_filter)
            
            # 当前时间段总计
            current_where, current_params = build_where(time_filter)
            cursor.execute(f'''
                SELECT COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as orders
                FROM orders 
                {current_where}
            ''', current_params)
            current_data = cursor.fetchone()
            current_revenue = round(current_data[0], 2) if current_data else 0
            current_orders = current_data[1] if current_data else 0
            
            # 计算增长率
            revenue_growth = 0
            orders_growth = 0
            profit_growth = 0
            if prev_revenue > 0:
                revenue_growth = round(((current_revenue - prev_revenue) / prev_revenue) * 100, 1)
            if prev_orders > 0:
                orders_growth = round(((current_orders - prev_orders) / prev_orders) * 100, 1)
            if prev_profit > 0:
                profit_growth = round(((current_profit - prev_profit) / prev_profit) * 100, 1)
            
            # 最热门商品统计（从订单JSON中解析）- 根据period参数动态调整时间范围
            where_clause_orders, params_orders = build_where(f'({time_filter})', alias='o')
            if where_clause_orders:
                where_clause_orders = where_clause_orders + " AND o.payment_status = 'succeeded'"
            else:
                where_clause_orders = " WHERE o.payment_status = 'succeeded'"
            cursor.execute(f'''
                SELECT o.items, o.created_at
                FROM orders o 
                {where_clause_orders}
            ''', params_orders)
            
            # 统计商品销量
            product_stats = {}
            for row in cursor.fetchall():
                try:
                    items_json = json.loads(row[0])
                    for item in items_json:
                        product_id = item.get('product_id')
                        product_name = item.get('name', '未知商品')
                        quantity = int(item.get('quantity', 0))
                        price = float(item.get('price', 0))
                        
                        if product_id not in product_stats:
                            product_stats[product_id] = {
                                'name': product_name,
                                'sold': 0,
                                'revenue': 0
                            }
                        
                        product_stats[product_id]['sold'] += quantity
                        product_stats[product_id]['revenue'] += quantity * price
                except (json.JSONDecodeError, KeyError, ValueError):
                    continue
            
            # 按销量排序，取前10
            top_products = sorted(
                [{'name': stats['name'], 'sold': stats['sold'], 'revenue': round(stats['revenue'], 2)} 
                 for stats in product_stats.values()],
                key=lambda x: x['sold'],
                reverse=True
            )[:10]
            
            # 用户增长统计
            customers_where, customers_params = build_where(alias='o')
            if customers_where:
                cursor.execute(f'''
                    SELECT COUNT(DISTINCT o.student_id)
                    FROM orders o
                    {customers_where}
                ''', customers_params)
            else:
                cursor.execute('SELECT COUNT(DISTINCT student_id) FROM orders')
            total_users = cursor.fetchone()[0] or 0

            recent_clause = "date(o.created_at, 'localtime') >= date('now', '-7 days', 'localtime')"
            recent_where, recent_params = build_where(recent_clause, alias='o')
            cursor.execute(f'''
                SELECT COUNT(DISTINCT o.student_id)
                FROM orders o
                {recent_where}
            ''', recent_params)
            new_users_week = cursor.fetchone()[0] or 0
            
            # 计算总净利润和今日净利润
            total_profit, _ = calculate_profit_for_period("o.payment_status = 'succeeded'")
            today_profit, _ = calculate_profit_for_period("date(created_at, 'localtime') = date('now', 'localtime') AND o.payment_status = 'succeeded'")
            
            return {
                **basic_stats,
                'period': period,
                'period_name': date_format,
                'current_period': {
                    'revenue': current_revenue,
                    'orders': current_orders,
                    'profit': round(current_profit, 2),
                    'data': current_period_data
                },
                'comparison': {
                    'prev_revenue': prev_revenue,
                    'prev_orders': prev_orders,
                    'prev_profit': round(prev_profit, 2),
                    'revenue_growth': revenue_growth,
                    'orders_growth': orders_growth,
                    'profit_growth': profit_growth
                },
                'profit_stats': {
                    'total_profit': round(total_profit, 2),
                    'today_profit': round(today_profit, 2),
                    'current_period_profit': round(current_profit, 2)
                },
                'top_products': top_products,
                'users': {
                    'total': total_users,
                    'new_this_week': new_users_week
                }
            }

    @staticmethod  
    def get_customers_with_purchases(
        limit: int = 5,
        offset: int = 0,
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """获取所有至少购买过一次的用户信息，按总购买金额降序排列"""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            scope_clause, scope_params = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, table_alias='o')
            where_parts = ["o.payment_status = 'succeeded'"]
            params: List[Any] = list(scope_params)
            if scope_clause:
                where_parts.append(scope_clause)
            where_sql = ' WHERE ' + ' AND '.join(where_parts)

            # 查询购买过商品的用户统计
            cursor.execute(f'''
                SELECT 
                    u.id,
                    u.name,
                    COUNT(DISTINCT o.id) as order_count,
                    COALESCE(SUM(o.total_amount), 0) as total_spent,
                    MAX(o.created_at) as last_order_date,
                    MIN(o.created_at) as first_order_date
                FROM users u
                INNER JOIN orders o ON u.id = o.student_id
                {where_sql}
                GROUP BY u.id, u.name
                ORDER BY total_spent DESC
                LIMIT ? OFFSET ?
            ''', [*params, limit, offset])

            customers = []
            for row in cursor.fetchall():
                customer = dict(row)
                # 计算平均订单金额
                customer['avg_order_amount'] = round(customer['total_spent'] / customer['order_count'], 2) if customer['order_count'] > 0 else 0
                customers.append(customer)

            # 统计总数
            cursor.execute(f'''
                SELECT COUNT(DISTINCT u.id)
                FROM users u
                INNER JOIN orders o ON u.id = o.student_id
                {where_sql}
            ''', params)
            total = cursor.fetchone()[0] or 0
            
            return {
                'customers': customers,
                'total': total,
                'limit': limit,
                'offset': offset,
                'has_more': (offset + len(customers)) < total
            }

# 用户资料缓存（收货信息）
class UserProfileDB:
    @staticmethod
    def get_shipping(student_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM user_profiles WHERE student_id = ?', (student_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def upsert_shipping(student_id: str, shipping: Dict[str, Any]) -> bool:
        name = shipping.get('name')
        phone = shipping.get('phone')
        dormitory = shipping.get('dormitory')
        building = shipping.get('building')
        room = shipping.get('room')
        full_address = shipping.get('full_address')
        address_id = shipping.get('address_id')
        building_id = shipping.get('building_id')
        agent_id = shipping.get('agent_id')
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT student_id FROM user_profiles WHERE student_id = ?', (student_id,))
            exists = cursor.fetchone() is not None
            if exists:
                cursor.execute('''
                    UPDATE user_profiles
                    SET name = ?, phone = ?, dormitory = ?, building = ?, room = ?, full_address = ?, address_id = ?, building_id = ?, agent_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE student_id = ?
                ''', (name, phone, dormitory, building, room, full_address, address_id, building_id, agent_id, student_id))
            else:
                cursor.execute('''
                    INSERT INTO user_profiles (student_id, name, phone, dormitory, building, room, full_address, address_id, building_id, agent_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (student_id, name, phone, dormitory, building, room, full_address, address_id, building_id, agent_id))
            conn.commit()
            return True

# 抽奖与奖品相关操作
class LotteryConfigDB:
    """管理抽奖全局配置（如抽奖门槛）"""

    DEFAULT_THRESHOLD: float = 10.0
    MIN_THRESHOLD: float = 0.01

    @staticmethod
    def normalize_owner(owner_id: Optional[str]) -> str:
        value = (owner_id or '').strip()
        return value or 'admin'

    @staticmethod
    def get_threshold(owner_id: Optional[str]) -> float:
        normalized = LotteryConfigDB.normalize_owner(owner_id)
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT threshold_amount FROM lottery_configs WHERE owner_id = ?',
                (normalized,)
            )
            row = cursor.fetchone()
            if not row or row[0] is None:
                return LotteryConfigDB.DEFAULT_THRESHOLD
            try:
                value = float(row[0])
            except (TypeError, ValueError):
                return LotteryConfigDB.DEFAULT_THRESHOLD
            if value < LotteryConfigDB.MIN_THRESHOLD:
                return LotteryConfigDB.DEFAULT_THRESHOLD
            return round(value, 2)

    @staticmethod
    def set_threshold(owner_id: Optional[str], threshold_amount: float) -> float:
        normalized = LotteryConfigDB.normalize_owner(owner_id)
        try:
            value = float(threshold_amount)
        except (TypeError, ValueError):
            raise ValueError('抽奖门槛必须为数字')

        if value < LotteryConfigDB.MIN_THRESHOLD:
            raise ValueError(f'抽奖门槛需不低于 {LotteryConfigDB.MIN_THRESHOLD}')

        value = round(value, 2)

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                    INSERT INTO lottery_configs (owner_id, threshold_amount, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(owner_id) DO UPDATE SET
                        threshold_amount = excluded.threshold_amount,
                        updated_at = CURRENT_TIMESTAMP
                ''',
                (normalized, value)
            )
            conn.commit()

        return value

    @staticmethod
    def get_config(owner_id: Optional[str]) -> Dict[str, Any]:
        normalized = LotteryConfigDB.normalize_owner(owner_id)
        threshold = LotteryConfigDB.get_threshold(normalized)
        return {
            'owner_id': normalized,
            'threshold_amount': threshold
        }


class LotteryDB:
    @staticmethod
    def list_prizes(owner_id: Optional[str] = None, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """列出抽奖奖项及其关联商品。"""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            where_clauses: List[str] = []
            params: List[Any] = []
            if not include_inactive:
                where_clauses.append('is_active = 1')

            if owner_id is None:
                where_clauses.append('owner_id IS NULL')
            else:
                where_clauses.append('owner_id = ?')
                params.append(owner_id)

            base_sql = 'SELECT * FROM lottery_prizes'
            if where_clauses:
                base_sql += ' WHERE ' + ' AND '.join(where_clauses)
            base_sql += ' ORDER BY created_at ASC'
            cursor.execute(base_sql, params)
            prize_rows = [dict(r) for r in (cursor.fetchall() or [])]

            if not prize_rows:
                return []

            prize_ids = [row['id'] for row in prize_rows if row.get('id')]
            item_rows: List[Dict[str, Any]] = []
            if prize_ids:
                placeholders = ','.join('?' * len(prize_ids))
                cursor.execute(
                    f'SELECT * FROM lottery_prize_items WHERE prize_id IN ({placeholders}) ORDER BY created_at ASC',
                    prize_ids
                )
                item_rows = [dict(r) for r in (cursor.fetchall() or [])]

            product_ids = {row['product_id'] for row in item_rows if row.get('product_id')}
            variant_ids = {row['variant_id'] for row in item_rows if row.get('variant_id')}

            product_map: Dict[str, Dict[str, Any]] = {}
            if product_ids:
                placeholders = ','.join('?' * len(product_ids))
                cursor.execute(f'SELECT * FROM products WHERE id IN ({placeholders})', list(product_ids))
                product_map = {row['id']: dict(row) for row in cursor.fetchall() or []}

            variant_map: Dict[str, Dict[str, Any]] = {}
            if variant_ids:
                placeholders = ','.join('?' * len(variant_ids))
                cursor.execute(f'SELECT * FROM product_variants WHERE id IN ({placeholders})', list(variant_ids))
                variant_map = {row['id']: dict(row) for row in cursor.fetchall() or []}

            prizes: List[Dict[str, Any]] = []
            prize_lookup: Dict[str, Dict[str, Any]] = {}

            for row in prize_rows:
                display_name = row.get('display_name') or row.get('prize_name') or ''
                try:
                    weight = float(row.get('weight') or 0)
                except Exception:
                    weight = 0.0
                try:
                    active_flag = 1 if int(row.get('is_active', 1) or 1) == 1 else 0
                except Exception:
                    active_flag = 1
                entry: Dict[str, Any] = {
                    'id': row.get('id'),
                    'display_name': display_name,
                    'weight': weight,
                    'is_active': active_flag,
                    'created_at': row.get('created_at'),
                    'updated_at': row.get('updated_at'),
                    'items': [],
                    'total_item_count': 0,
                    'available_item_count': 0,
                    'total_available_stock': 0,
                    'issues': [],
                    '_issue_set': set(),
                }
                prizes.append(entry)
                prize_lookup[entry['id']] = entry

            for row in item_rows:
                prize_id = row.get('prize_id')
                entry = prize_lookup.get(prize_id)
                if not entry:
                    continue

                product_id = row.get('product_id')
                variant_id = row.get('variant_id')
                product = product_map.get(product_id)
                variant = variant_map.get(variant_id) if variant_id else None

                product_name = product.get('name') if product else None
                variant_name = variant.get('name') if variant else None

                try:
                    is_active = 1 if int((product or {}).get('is_active', 1) or 1) == 1 else 0
                except Exception:
                    is_active = 1

                if variant:
                    try:
                        stock = int(variant.get('stock') or 0)
                    except Exception:
                        stock = 0
                else:
                    try:
                        stock = int((product or {}).get('stock') or 0)
                    except Exception:
                        stock = 0

                try:
                    base_price = float((product or {}).get('price') or 0)
                except Exception:
                    base_price = 0.0
                try:
                    discount = float((product or {}).get('discount', 10.0) or 10.0)
                except Exception:
                    discount = 10.0
                retail_price = round(base_price * (discount / 10.0), 2)

                available = bool(product) and bool(is_active) and stock > 0

                info = {
                    'id': row.get('id'),
                    'prize_id': prize_id,
                    'product_id': product_id,
                    'variant_id': variant_id,
                    'product_name': product_name,
                    'variant_name': variant_name,
                    'is_active': bool(is_active),
                    'stock': max(0, stock),
                    'retail_price': retail_price,
                    'available': available,
                    'img_path': (product or {}).get('img_path'),
                    'category': (product or {}).get('category'),
                }

                entry['items'].append(info)
                entry['total_item_count'] += 1
                if available:
                    entry['available_item_count'] += 1
                    entry['total_available_stock'] += max(0, stock)
                else:
                    if not product:
                        entry['_issue_set'].add('关联商品不存在')
                    elif not is_active:
                        entry['_issue_set'].add(f"{product_name} 已下架")
                    else:
                        suffix = f"（{variant_name}）" if variant_name else ''
                        entry['_issue_set'].add(f"{product_name}{suffix} 库存不足")

            for entry in prizes:
                issues = entry.pop('_issue_set', set())
                entry['issues'] = list(issues)
                entry['available'] = entry['available_item_count'] > 0
                entry['items'].sort(key=lambda x: ((x.get('product_name') or ''), (x.get('variant_name') or '')))

            return prizes

    @staticmethod
    def get_active_prizes_for_draw(owner_id: Optional[str]) -> List[Dict[str, Any]]:
        prizes = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=False)
        active: List[Dict[str, Any]] = []
        for prize in prizes:
            if prize.get('weight', 0) <= 0:
                continue
            # 修改：包含所有商品（有库存和缺货的），不再只筛选有库存的商品
            items = [dict(item) for item in prize.get('items', [])]
            # 修改：即使没有有库存的商品也保留奖项，抽奖时会根据实际库存计算概率
            if not items:
                continue
            active.append({
                'id': prize.get('id'),
                'display_name': prize.get('display_name') or '',
                'weight': float(prize.get('weight') or 0),
                'items': items,
            })
        return active

    @staticmethod
    def upsert_prize(
        prize_id: Optional[str],
        display_name: str,
        weight: float,
        is_active: bool,
        items: List[Dict[str, Any]],
        owner_id: Optional[str]
    ) -> str:
        if not display_name:
            raise ValueError('抽奖奖项名称不能为空')
        prize_id = prize_id or f"lprize_{int(datetime.now().timestamp()*1000)}"
        try:
            weight_value = float(weight)
        except Exception:
            weight_value = 0.0
        active_flag = 1 if is_active else 0
        normalized_items: List[Dict[str, Any]] = []
        for item in items or []:
            product_id = item.get('product_id')
            if not product_id:
                continue
            variant_id = item.get('variant_id') or None
            item_id = item.get('id') or f"lpitem_{uuid.uuid4().hex}"
            normalized_items.append({
                'id': item_id,
                'product_id': product_id,
                'variant_id': variant_id,
            })

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT owner_id FROM lottery_prizes WHERE id = ?', (prize_id,))
            existing = cursor.fetchone()
            if existing:
                existing_owner = existing['owner_id'] if isinstance(existing, sqlite3.Row) else existing[0]
                if (owner_id is None and existing_owner is not None) or (owner_id is not None and existing_owner != owner_id):
                    raise ValueError('无权编辑该抽奖奖项')

                owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
                params = [display_name, weight_value, active_flag, prize_id]
                if owner_id is not None:
                    params.append(owner_id)

                cursor.execute(
                    f'''
                        UPDATE lottery_prizes
                        SET display_name = ?, weight = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ? AND {owner_condition}
                    ''',
                    params
                )
                if cursor.rowcount == 0:
                    raise ValueError('无权编辑该抽奖奖项')
            else:
                cursor.execute('''
                    INSERT INTO lottery_prizes (id, display_name, weight, is_active, owner_id)
                    VALUES (?, ?, ?, ?, ?)
                ''', (prize_id, display_name, weight_value, active_flag, owner_id))

            cursor.execute('DELETE FROM lottery_prize_items WHERE prize_id = ?', (prize_id,))
            for item in normalized_items:
                cursor.execute('''
                    INSERT INTO lottery_prize_items (id, prize_id, product_id, variant_id)
                    VALUES (?, ?, ?, ?)
                ''', (item['id'], prize_id, item['product_id'], item['variant_id']))
            conn.commit()
            return prize_id

    @staticmethod
    def delete_prize(prize_id: str, owner_id: Optional[str]) -> bool:
        if not prize_id:
            return False
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            owner_param: Tuple[Any, ...] = tuple() if owner_id is None else (owner_id,)
            cursor.execute(
                f'''DELETE FROM lottery_prize_items 
                    WHERE prize_id IN (
                        SELECT id FROM lottery_prizes WHERE id = ? AND {owner_condition}
                    )''',
                (prize_id, *owner_param)
            )
            cursor.execute(
                f'DELETE FROM lottery_prizes WHERE id = ? AND {owner_condition}',
                (prize_id, *owner_param)
            )
            deleted = cursor.rowcount or 0
            conn.commit()
            return deleted > 0

    @staticmethod
    def delete_prizes_not_in(valid_ids: List[str], owner_id: Optional[str]) -> int:
        ids = list({pid for pid in valid_ids if pid})
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            owner_param: Tuple[Any, ...] = tuple() if owner_id is None else (owner_id,)
            if ids:
                placeholders = ','.join('?' * len(ids))
                cursor.execute(
                    f'''DELETE FROM lottery_prize_items 
                        WHERE prize_id IN (
                            SELECT id FROM lottery_prizes WHERE id NOT IN ({placeholders}) AND {owner_condition}
                        )''',
                    (*ids, *owner_param)
                )
                cursor.execute(
                    f'DELETE FROM lottery_prizes WHERE id NOT IN ({placeholders}) AND {owner_condition}',
                    (*ids, *owner_param)
                )
            else:
                cursor.execute(
                    f'''DELETE FROM lottery_prize_items 
                        WHERE prize_id IN (
                            SELECT id FROM lottery_prizes WHERE {owner_condition}
                        )''',
                    owner_param
                )
                cursor.execute(
                    f'DELETE FROM lottery_prizes WHERE {owner_condition}',
                    owner_param
                )
            affected = cursor.rowcount or 0
            conn.commit()
            return affected

    @staticmethod
    def get_draw_by_order(order_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM lottery_draws WHERE order_id = ?', (order_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def create_draw(
        order_id: str,
        student_id: str,
        prize_name: str,
        prize_product_id: Optional[str] = None,
        prize_quantity: int = 1,
        *,
        owner_id: Optional[str] = None,
        prize_group_id: Optional[str] = None,
        prize_product_name: Optional[str] = None,
        prize_variant_id: Optional[str] = None,
        prize_variant_name: Optional[str] = None,
        prize_unit_price: Optional[float] = None
    ) -> str:
        draw_id = f"lot_{int(datetime.now().timestamp()*1000)}"
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO lottery_draws (
                    id,
                    order_id,
                    student_id,
                    prize_name,
                    prize_product_id,
                    prize_quantity,
                    owner_id,
                    prize_group_id,
                    prize_product_name,
                    prize_variant_id,
                    prize_variant_name,
                    prize_unit_price
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                draw_id,
                order_id,
                student_id,
                prize_name,
                prize_product_id,
                int(prize_quantity or 1),
                owner_id,
                prize_group_id,
                prize_product_name,
                prize_variant_id,
                prize_variant_name,
                float(prize_unit_price or 0.0),
            ))
            conn.commit()
            return draw_id

class AutoGiftDB:
    @staticmethod
    def list_items(owner_id: Optional[str]) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if owner_id is None:
                cursor.execute('SELECT * FROM auto_gift_items WHERE owner_id IS NULL ORDER BY created_at ASC')
            else:
                cursor.execute(
                    'SELECT * FROM auto_gift_items WHERE owner_id = ? ORDER BY created_at ASC',
                    (owner_id,)
                )
            rows = [dict(r) for r in cursor.fetchall() or []]
            if not rows:
                return []

            product_ids = {row['product_id'] for row in rows if row.get('product_id')}
            variant_ids = {row['variant_id'] for row in rows if row.get('variant_id')}

            product_map: Dict[str, Dict[str, Any]] = {}
            if product_ids:
                placeholders = ','.join('?' * len(product_ids))
                cursor.execute(f'SELECT * FROM products WHERE id IN ({placeholders})', list(product_ids))
                product_map = {row['id']: dict(row) for row in cursor.fetchall() or []}

            variant_map: Dict[str, Dict[str, Any]] = {}
            if variant_ids:
                placeholders = ','.join('?' * len(variant_ids))
                cursor.execute(f'SELECT * FROM product_variants WHERE id IN ({placeholders})', list(variant_ids))
                variant_map = {row['id']: dict(row) for row in cursor.fetchall() or []}

        items: List[Dict[str, Any]] = []
        for row in rows:
            product_id = row.get('product_id')
            variant_id = row.get('variant_id')
            product = product_map.get(product_id) if product_id else None
            variant = variant_map.get(variant_id) if variant_id else None

            product_name = (product or {}).get('name') if product else None
            variant_name = (variant or {}).get('name') if variant else None
            try:
                is_active = 1 if int((product or {}).get('is_active', 1) or 1) == 1 else 0
            except Exception:
                is_active = 1

            if variant:
                try:
                    stock = int(variant.get('stock') or 0)
                except Exception:
                    stock = 0
                linked_product_id = variant.get('product_id')
                if linked_product_id and linked_product_id != product_id:
                    product = product_map.get(linked_product_id, product)
                    product_id = linked_product_id
            else:
                try:
                    stock = int((product or {}).get('stock') or 0)
                except Exception:
                    stock = 0

            try:
                price = float((product or {}).get('price') or 0)
            except Exception:
                price = 0.0
            try:
                discount = float((product or {}).get('discount', 10.0) or 10.0)
            except Exception:
                discount = 10.0
            retail_price = round(price * (discount / 10.0), 2)

            available_stock = stock if (product and is_active and stock > 0) else 0
            items.append({
                'id': row.get('id'),
                'product_id': product_id,
                'variant_id': variant_id,
                'product_name': product_name,
                'variant_name': variant_name,
                'stock': stock,
                'available_stock': available_stock,
                'retail_price': retail_price,
                'is_active': is_active,
                'available': available_stock > 0,
                'img_path': (product or {}).get('img_path'),
                'category': (product or {}).get('category')
            })

        return items

    @staticmethod
    def replace_items(owner_id: Optional[str], items: List[Dict[str, Optional[str]]]) -> None:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if owner_id is None:
                cursor.execute('DELETE FROM auto_gift_items WHERE owner_id IS NULL')
            else:
                cursor.execute('DELETE FROM auto_gift_items WHERE owner_id = ?', (owner_id,))
            for item in items:
                product_id = item.get('product_id')
                if not product_id:
                    continue
                variant_id = item.get('variant_id') or None
                entry_id = f"agift_{uuid.uuid4().hex}"
                cursor.execute('''
                    INSERT INTO auto_gift_items (id, product_id, variant_id, owner_id)
                    VALUES (?, ?, ?, ?)
                ''', (entry_id, product_id, variant_id, owner_id))
            conn.commit()

    @staticmethod
    def get_available_items(owner_id: Optional[str]) -> List[Dict[str, Any]]:
        return [item for item in AutoGiftDB.list_items(owner_id) if item.get('available')]

    @staticmethod
    def pick_gifts(owner_id: Optional[str], slot_count: int) -> List[Dict[str, Any]]:
        if slot_count <= 0:
            return []
        candidates = AutoGiftDB.get_available_items(owner_id)
        pool: List[Dict[str, Any]] = []
        for gift in candidates:
            product_id = gift.get('product_id')
            if not product_id:
                continue
            try:
                stock = int(gift.get('available_stock') or gift.get('stock') or 0)
            except Exception:
                stock = 0
            if stock <= 0:
                continue
            pool.append({
                'config_id': gift.get('id'),
                'product_id': product_id,
                'variant_id': gift.get('variant_id'),
                'product_name': gift.get('product_name') or '',
                'variant_name': gift.get('variant_name'),
                'stock': stock,
                'img_path': gift.get('img_path'),
                'category': gift.get('category') or '满额赠品',
                'order': len(pool)
            })

        results: List[Dict[str, Any]] = []
        for _ in range(slot_count):
            pool = [item for item in pool if item['stock'] > 0]
            if not pool:
                break
            chosen = max(pool, key=lambda x: (x['stock'], -x['order']))
            base_name = chosen['product_name'] or '满额赠品'
            variant_name = chosen.get('variant_name')
            display_name = f"{base_name}（{variant_name}）" if variant_name else base_name
            results.append({
                'config_id': chosen.get('config_id'),
                'product_id': chosen.get('product_id'),
                'variant_id': chosen.get('variant_id'),
                'product_name': base_name,
                'variant_name': variant_name,
                'display_name': display_name,
                'img_path': chosen.get('img_path'),
                'category': chosen.get('category')
            })
            chosen['stock'] = max(0, chosen['stock'] - 1)

        return results

class RewardDB:
    @staticmethod
    def add_reward_from_order(
        student_id: str,
        prize_name: str,
        prize_product_id: Optional[str],
        quantity: int,
        source_order_id: str,
        *,
        owner_id: Optional[str] = None,
        prize_group_id: Optional[str] = None,
        prize_product_name: Optional[str] = None,
        prize_variant_id: Optional[str] = None,
        prize_variant_name: Optional[str] = None,
        prize_unit_price: Optional[float] = None
    ) -> Optional[str]:
        """从成功订单生成可用奖品；同一订单只会生成一次。"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # 防止重复
            cursor.execute('SELECT id FROM user_rewards WHERE source_order_id = ?', (source_order_id,))
            exists = cursor.fetchone()
            if exists:
                return None
            try:
                normalized_owner = LotteryConfigDB.normalize_owner(owner_id)
            except Exception:
                normalized_owner = owner_id.strip() if isinstance(owner_id, str) and owner_id.strip() else 'admin'
            rid = f"rwd_{int(datetime.now().timestamp()*1000)}"
            cursor.execute('''
                INSERT INTO user_rewards (
                    id,
                    student_id,
                    prize_name,
                    prize_product_id,
                    prize_product_name,
                    prize_variant_id,
                    prize_variant_name,
                    prize_unit_price,
                    owner_id,
                    prize_group_id,
                    prize_quantity,
                    source_order_id,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'eligible')
            ''', (
                rid,
                student_id,
                prize_name,
                prize_product_id,
                prize_product_name,
                prize_variant_id,
                prize_variant_name,
                float(prize_unit_price or 0.0),
                normalized_owner,
                prize_group_id,
                int(quantity or 1),
                source_order_id
            ))
            conn.commit()
            return rid

    @staticmethod
    def get_eligible_rewards(
        student_id: str,
        owner_id: Optional[str] = None,
        restrict_owner: bool = False
    ) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            clauses = [
                'student_id = ?',
                "status = 'eligible'"
            ]
            params: List[Any] = [student_id]

            if restrict_owner:
                normalized_owner = None
                if owner_id is None or (isinstance(owner_id, str) and owner_id.strip() == ''):
                    normalized_owner = None
                else:
                    try:
                        normalized_owner = LotteryConfigDB.normalize_owner(owner_id)
                    except Exception:
                        normalized_owner = owner_id.strip() if isinstance(owner_id, str) else None

                if normalized_owner is None:
                    clauses.append('(owner_id IS NULL OR TRIM(owner_id) = "")')
                elif normalized_owner == 'admin':
                    clauses.append('(owner_id = ? OR owner_id IS NULL OR TRIM(owner_id) = "")')
                    params.append(normalized_owner)
                else:
                    clauses.append('owner_id = ?')
                    params.append(normalized_owner)

            query = 'SELECT * FROM user_rewards WHERE ' + ' AND '.join(clauses) + ' ORDER BY created_at ASC'
            cursor.execute(query, params)
            return [dict(r) for r in cursor.fetchall()]

    @staticmethod
    def consume_rewards(
        student_id: str,
        reward_ids: List[str],
        consumed_order_id: str,
        owner_id: Optional[str] = None
    ) -> int:
        if not reward_ids:
            return 0
        with get_db_connection() as conn:
            cursor = conn.cursor()
            placeholders = ','.join('?' * len(reward_ids))
            try:
                normalized_owner = None
                if owner_id is None or (isinstance(owner_id, str) and owner_id.strip() == ''):
                    normalized_owner = None
                else:
                    try:
                        normalized_owner = LotteryConfigDB.normalize_owner(owner_id)
                    except Exception:
                        normalized_owner = owner_id.strip() if isinstance(owner_id, str) else None

                if normalized_owner is None:
                    owner_condition = '(owner_id IS NULL OR TRIM(owner_id) = "")'
                    params: List[Any] = [consumed_order_id, *reward_ids, student_id]
                elif normalized_owner == 'admin':
                    owner_condition = '(owner_id = ? OR owner_id IS NULL OR TRIM(owner_id) = "")'
                    params = [consumed_order_id, *reward_ids, student_id, normalized_owner]
                else:
                    owner_condition = 'owner_id = ?'
                    params = [consumed_order_id, *reward_ids, student_id, normalized_owner]
                query = f'''UPDATE user_rewards
                             SET status = 'consumed', consumed_order_id = ?, updated_at = CURRENT_TIMESTAMP
                             WHERE id IN ({placeholders}) AND student_id = ? AND status = 'eligible' AND {owner_condition} '''
                cursor.execute(query, params)
                affected = cursor.rowcount or 0
                conn.commit()
                return affected
            except Exception as e:
                logger.error(f"消费奖品失败: {e}")
                conn.rollback()
                return 0

    @staticmethod
    def cancel_rewards_by_orders(order_ids: List[str]) -> int:
        """当订单被删除时，关联未消费的奖励可以取消（预防性清理）。"""
        if not order_ids:
            return 0
        with get_db_connection() as conn:
            cursor = conn.cursor()
            placeholders = ','.join('?' * len(order_ids))
            try:
                cursor.execute(f"""
                    UPDATE user_rewards
                    SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                    WHERE source_order_id IN ({placeholders}) AND status = 'eligible'
                """, order_ids)
                cnt = cursor.rowcount or 0
                conn.commit()
                return cnt
            except Exception as e:
                logger.error(f"取消关联奖励失败: {e}")
                conn.rollback()
                return 0

# 优惠券相关操作
class CouponDB:
    @staticmethod
    def issue_coupons(
        student_id: str,
        amount: float,
        quantity: int = 1,
        expires_at: Optional[str] = None,
        owner_id: Optional[str] = None
    ) -> List[str]:
        """发放优惠券（返回生成的优惠券ID列表）。学号必须存在于 users 表。"""
        if quantity <= 0:
            return []
        ids: List[str] = []
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # 确认用户存在
            cursor.execute('SELECT id FROM users WHERE id = ?', (student_id,))
            if not cursor.fetchone():
                return []
            for i in range(quantity):
                cid = f"cpn_{int(datetime.now().timestamp()*1000)}_{i}"
                try:
                    cursor.execute('''
                        INSERT INTO coupons (id, student_id, amount, expires_at, status, owner_id)
                        VALUES (?, ?, ?, ?, 'active', ?)
                    ''', (cid, student_id, float(amount), expires_at, owner_id))
                    ids.append(cid)
                except Exception:
                    # 跳过单条失败，继续
                    pass
            conn.commit()
        return ids

    @staticmethod
    def list_all(student_id: Optional[str] = None, owner_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """列出所有优惠券（管理员查看），包含 active/revoked；不包含已使用（因为已删除）。"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            clauses = []
            params: List[Any] = []
            if student_id:
                clauses.append('student_id = ?')
                params.append(student_id)
            if owner_id is None:
                clauses.append('owner_id IS NULL')
            else:
                clauses.append('owner_id = ?')
                params.append(owner_id)

            query = 'SELECT * FROM coupons'
            if clauses:
                query += ' WHERE ' + ' AND '.join(clauses)
            query += ' ORDER BY created_at DESC'
            cursor.execute(query, params)
            rows = cursor.fetchall() or []
            items = [dict(r) for r in rows]
            # 计算是否过期
            now = datetime.now()
            for it in items:
                exp = it.get('expires_at')
                it['expired'] = False
                try:
                    if exp:
                        # SQLite 存的文本时间按 fromisoformat 尝试
                        dt = datetime.fromisoformat(exp) if isinstance(exp, str) else exp
                        if isinstance(dt, str):
                            # 某些情况是 'YYYY-MM-DD HH:MM:SS'
                            try:
                                from datetime import datetime as _dt
                                dt = _dt.strptime(dt, "%Y-%m-%d %H:%M:%S")
                            except Exception:
                                dt = None
                        if dt and dt < now:
                            it['expired'] = True
                except Exception:
                    it['expired'] = False
            return items

    @staticmethod
    def get_active_for_student(
        student_id: str,
        owner_id: Optional[str] = None,
        restrict_owner: bool = False
    ) -> List[Dict[str, Any]]:
        """获取用户当前可用的优惠券（active 且未过期）。"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            clauses = [
                'student_id = ?',
                "status = 'active'",
                '(locked_order_id IS NULL OR TRIM(locked_order_id) = "")'
            ]
            params: List[Any] = [student_id]
            if restrict_owner:
                if owner_id is None:
                    clauses.append('owner_id IS NULL')
                else:
                    clauses.append('owner_id = ?')
                    params.append(owner_id)
            query = 'SELECT * FROM coupons WHERE ' + ' AND '.join(clauses) + ' ORDER BY created_at DESC'
            cursor.execute(query, params)
            items = [dict(r) for r in cursor.fetchall()]
            # 过滤过期
            now = datetime.now()
            filtered: List[Dict[str, Any]] = []
            for it in items:
                exp = it.get('expires_at')
                if not exp:
                    filtered.append(it)
                    continue
                dt = None
                try:
                    dt = datetime.fromisoformat(exp) if isinstance(exp, str) else exp
                except Exception:
                    try:
                        from datetime import datetime as _dt
                        dt = _dt.strptime(exp, "%Y-%m-%d %H:%M:%S") if isinstance(exp, str) else None
                    except Exception:
                        dt = None
                if (dt is None) or (dt >= now):
                    filtered.append(it)
            return filtered

    @staticmethod
    def get_by_id(coupon_id: str) -> Optional[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM coupons WHERE id = ?', (coupon_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def revoke(coupon_id: str, owner_id: Optional[str]) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            params: List[Any] = [coupon_id]
            if owner_id is not None:
                params.append(owner_id)
            cursor.execute(
                f'UPDATE coupons SET status = "revoked", updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = "active" AND {owner_condition}',
                params
            )
            ok = cursor.rowcount > 0
            conn.commit()
            return ok

    @staticmethod
    def delete_coupon(coupon_id: str) -> bool:
        """删除优惠券（用于消费）。"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM coupons WHERE id = ?', (coupon_id,))
            ok = cursor.rowcount > 0
            conn.commit()
            return ok

    @staticmethod
    def check_valid_for_student(coupon_id: str, student_id: str, owner_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """校验优惠券是否可用（归属、状态、未过期）。返回券信息或None。"""
        c = CouponDB.get_by_id(coupon_id)
        if not c:
            return None
        if c.get('student_id') != student_id:
            return None
        existing_owner = c.get('owner_id')
        if owner_id is None:
            if existing_owner not in (None, '', 'null'):
                return None
        else:
            if existing_owner != owner_id:
                return None
        if (c.get('status') or 'active') != 'active':
            return None
        # 被其他订单锁定则不可用
        try:
            locked = c.get('locked_order_id')
            if locked and str(locked).strip() != '':
                return None
        except Exception:
            pass
        exp = c.get('expires_at')
        if exp:
            try:
                dt = datetime.fromisoformat(exp) if isinstance(exp, str) else exp
            except Exception:
                try:
                    from datetime import datetime as _dt
                    dt = _dt.strptime(exp, "%Y-%m-%d %H:%M:%S") if isinstance(exp, str) else None
                except Exception:
                    dt = None
            if dt and dt < datetime.now():
                return None
        return c

    @staticmethod
    def lock_for_order(coupon_id: str, order_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    UPDATE coupons
                    SET locked_order_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND status = 'active' AND (locked_order_id IS NULL OR TRIM(locked_order_id) = '')
                ''', (order_id, coupon_id))
                ok = cursor.rowcount > 0
                conn.commit()
                return ok
            except Exception as e:
                logger.error(f"锁定优惠券失败: {e}")
                conn.rollback()
                return False

    @staticmethod
    def unlock_for_order(coupon_id: str, order_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    UPDATE coupons
                    SET locked_order_id = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND locked_order_id = ? AND status = 'active'
                ''', (coupon_id, order_id))
                ok = cursor.rowcount > 0
                conn.commit()
                return ok
            except Exception as e:
                logger.error(f"解锁优惠券失败: {e}")
                conn.rollback()
                return False

class DeliverySettingsDB:
    """配送费设置数据库操作类"""
    
    @staticmethod
    def get_settings(owner_id: Optional[str]) -> Dict[str, Any]:
        """获取配送费设置"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            where_clauses = ['is_active = 1']
            params = []
            
            if owner_id is None:
                where_clauses.append('owner_id IS NULL')
            else:
                where_clauses.append('owner_id = ?')
                params.append(owner_id)

            query = 'SELECT * FROM delivery_settings WHERE ' + ' AND '.join(where_clauses) + ' ORDER BY created_at DESC LIMIT 1'
            cursor.execute(query, params)
            row = cursor.fetchone()
            
            if row:
                return dict(row)
            else:
                # 如果没有配置，返回默认值
                return {
                    'id': None,
                    'delivery_fee': 1.0,
                    'free_delivery_threshold': 10.0,
                    'is_active': True,
                    'owner_id': owner_id
                }
    
    @staticmethod
    def create_or_update_settings(
        owner_id: Optional[str],
        delivery_fee: float,
        free_delivery_threshold: float
    ) -> str:
        """创建或更新配送费设置"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 检查是否已存在配置
            where_clauses = []
            params = []
            if owner_id is None:
                where_clauses.append('owner_id IS NULL')
            else:
                where_clauses.append('owner_id = ?')
                params.append(owner_id)
            
            query = 'SELECT id FROM delivery_settings WHERE ' + ' AND '.join(where_clauses) + ' LIMIT 1'
            cursor.execute(query, params)
            existing = cursor.fetchone()
            
            if existing:
                # 更新现有配置
                setting_id = existing['id']
                cursor.execute('''
                    UPDATE delivery_settings 
                    SET delivery_fee = ?, free_delivery_threshold = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (delivery_fee, free_delivery_threshold, setting_id))
            else:
                # 创建新配置
                import uuid
                setting_id = f"delivery_{uuid.uuid4().hex}"
                cursor.execute('''
                    INSERT INTO delivery_settings 
                    (id, delivery_fee, free_delivery_threshold, is_active, owner_id)
                    VALUES (?, ?, ?, 1, ?)
                ''', (setting_id, delivery_fee, free_delivery_threshold, owner_id))
            
            conn.commit()
            return setting_id
    
    @staticmethod
    def get_delivery_config(owner_id: Optional[str]) -> Dict[str, Any]:
        """获取配送费配置（简化版本，仅返回费用和门槛）"""
        settings = DeliverySettingsDB.get_settings(owner_id)
        return {
            'delivery_fee': float(settings.get('delivery_fee', 1.0)),
            'free_delivery_threshold': float(settings.get('free_delivery_threshold', 10.0))
        }


class GiftThresholdDB:
    """满额赠品门槛配置数据库操作类"""
    
    @staticmethod
    def list_all(owner_id: Optional[str], include_inactive: bool = False) -> List[Dict[str, Any]]:
        """获取所有满额门槛配置，按门槛金额排序"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            where_clauses: List[str] = []
            params: List[Any] = []
            if not include_inactive:
                where_clauses.append('is_active = 1')
            if owner_id is None:
                where_clauses.append('owner_id IS NULL')
            else:
                where_clauses.append('owner_id = ?')
                params.append(owner_id)

            query = 'SELECT * FROM gift_thresholds'
            if where_clauses:
                query += ' WHERE ' + ' AND '.join(where_clauses)
            query += ' ORDER BY threshold_amount ASC, sort_order ASC'

            cursor.execute(query, params)
            rows = cursor.fetchall() or []
            
            thresholds = []
            for row in rows:
                threshold_dict = dict(row)
                # 获取关联的商品列表
                threshold_id = threshold_dict['id']
                cursor.execute('''
                    SELECT gti.*, p.name as product_name, p.img_path, p.category, p.stock, p.is_active,
                           pv.name as variant_name, pv.stock as variant_stock
                    FROM gift_threshold_items gti
                    LEFT JOIN products p ON gti.product_id = p.id
                    LEFT JOIN product_variants pv ON gti.variant_id = pv.id
                    WHERE gti.threshold_id = ?
                    ORDER BY gti.created_at ASC
                ''', (threshold_id,))
                
                items_rows = cursor.fetchall() or []
                items = []
                for item_row in items_rows:
                    item_dict = dict(item_row)
                    # 判断库存情况
                    if item_dict.get('variant_id'):
                        stock = int(item_dict.get('variant_stock') or 0)
                    else:
                        stock = int(item_dict.get('stock') or 0)
                    
                    is_active = int(item_dict.get('is_active', 1) or 1) == 1
                    item_dict['available'] = is_active and stock > 0
                    item_dict['stock'] = stock
                    items.append(item_dict)
                
                threshold_dict['items'] = items
                thresholds.append(threshold_dict)
            
            return thresholds
    
    @staticmethod
    def get_by_id(threshold_id: str, owner_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """根据ID获取门槛配置"""
        thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=True)
        return next((t for t in thresholds if t.get('id') == threshold_id), None)
    
    @staticmethod
    def create_threshold(
        owner_id: Optional[str],
        threshold_amount: float,
        gift_products: bool = False,
        gift_coupon: bool = False,
        coupon_amount: float = 0.0
    ) -> str:
        """创建新的满额门槛配置"""
        import uuid
        threshold_id = f"threshold_{uuid.uuid4().hex}"
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO gift_thresholds 
                (id, threshold_amount, gift_products, gift_coupon, coupon_amount, is_active, sort_order, owner_id)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ''', (
                threshold_id,
                threshold_amount,
                1 if gift_products else 0,
                1 if gift_coupon else 0,
                coupon_amount,
                int(threshold_amount),
                owner_id
            ))
            conn.commit()
            
        return threshold_id
    
    @staticmethod
    def update_threshold(
        threshold_id: str,
        owner_id: Optional[str],
        threshold_amount: Optional[float] = None,
        gift_products: Optional[bool] = None,
        gift_coupon: Optional[bool] = None,
        coupon_amount: Optional[float] = None,
        is_active: Optional[bool] = None
    ) -> bool:
        """更新门槛配置"""
        updates = []
        params = []
        
        if threshold_amount is not None:
            updates.append("threshold_amount = ?")
            params.append(threshold_amount)
        if gift_products is not None:
            updates.append("gift_products = ?")
            params.append(1 if gift_products else 0)
        if gift_coupon is not None:
            updates.append("gift_coupon = ?")
            params.append(1 if gift_coupon else 0)
        if coupon_amount is not None:
            updates.append("coupon_amount = ?")
            params.append(coupon_amount)
        if is_active is not None:
            updates.append("is_active = ?")
            params.append(1 if is_active else 0)
        
        if not updates:
            return False
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(threshold_id)
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            sql = f'''
                UPDATE gift_thresholds 
                SET {", ".join(updates)}
                WHERE id = ? AND {owner_condition}
            '''
            if owner_id is None:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql, [*params, owner_id])
            conn.commit()

        return cursor.rowcount > 0
    
    @staticmethod
    def delete_threshold(threshold_id: str, owner_id: Optional[str]) -> bool:
        """删除门槛配置及其关联的商品"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            owner_param: Tuple[Any, ...] = tuple() if owner_id is None else (owner_id,)
            cursor.execute(
                f'''DELETE FROM gift_threshold_items 
                    WHERE threshold_id IN (
                        SELECT id FROM gift_thresholds WHERE id = ? AND {owner_condition}
                    )''',
                (threshold_id, *owner_param)
            )
            cursor.execute(
                f'DELETE FROM gift_thresholds WHERE id = ? AND {owner_condition}',
                (threshold_id, *owner_param)
            )
            conn.commit()

        return cursor.rowcount > 0
    
    @staticmethod
    def add_items_to_threshold(
        threshold_id: str,
        owner_id: Optional[str],
        items: List[Dict[str, Optional[str]]]
    ) -> bool:
        """为门槛添加商品"""
        import uuid

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT owner_id FROM gift_thresholds WHERE id = ?', (threshold_id,))
            row = cursor.fetchone()
            if not row:
                return False
            existing_owner = row['owner_id'] if isinstance(row, sqlite3.Row) else row[0]
            if (owner_id is None and existing_owner is not None) or (owner_id is not None and existing_owner != owner_id):
                return False
            # 先清空现有商品
            cursor.execute('DELETE FROM gift_threshold_items WHERE threshold_id = ?', (threshold_id,))

            # 添加新商品
            for item in items:
                product_id = item.get('product_id')
                if not product_id:
                    continue
                variant_id = item.get('variant_id') or None
                item_id = f"gti_{uuid.uuid4().hex}"
                cursor.execute('''
                    INSERT INTO gift_threshold_items (id, threshold_id, product_id, variant_id)
                    VALUES (?, ?, ?, ?)
                ''', (item_id, threshold_id, product_id, variant_id))
            
            conn.commit()
            
        return True
    
    @staticmethod
    def get_applicable_thresholds(amount: float, owner_id: Optional[str]) -> List[Dict[str, Any]]:
        """根据金额获取所有适用的门槛配置（按金额升序）"""
        thresholds = GiftThresholdDB.list_all(owner_id=owner_id)
        applicable = []
        
        for threshold in thresholds:
            threshold_amount = float(threshold.get('threshold_amount', 0))
            if threshold_amount > 0 and amount >= threshold_amount:
                # 计算可以获得多少次这个门槛的奖励
                times = int(amount // threshold_amount)
                threshold['applicable_times'] = times
                applicable.append(threshold)
        
        return applicable
    
    @staticmethod
    def pick_gifts_for_threshold(
        threshold_id: str,
        owner_id: Optional[str],
        count: int
    ) -> List[Dict[str, Any]]:
        """为指定门槛选择赠品（只选择库存最高的一种商品）"""
        if count <= 0:
            return []
            
        threshold = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        if not threshold:
            return []
            
        # 获取可用商品，按库存排序
        available_items = [item for item in threshold.get('items', []) if item.get('available')]
        if not available_items:
            return []
            
        # 按库存排序（降序），只选择库存最高的一种商品
        available_items.sort(key=lambda x: x.get('stock', 0), reverse=True)
        chosen = available_items[0]  # 只选择库存最高的一种
        
        # 检查库存是否足够
        available_stock = chosen.get('stock', 0)
        actual_count = min(count, available_stock)
        
        if actual_count <= 0:
            return []
        
        # 构造返回数据
        product_name = chosen.get('product_name') or '满额赠品'
        variant_name = chosen.get('variant_name')
        display_name = f"{product_name}（{variant_name}）" if variant_name else product_name
        
        results = []
        for _ in range(actual_count):
            results.append({
                'threshold_item_id': chosen.get('id'),
                'product_id': chosen.get('product_id'),
                'variant_id': chosen.get('variant_id'),
                'product_name': product_name,
                'variant_name': variant_name,
                'display_name': display_name,
                'img_path': chosen.get('img_path'),
                'category': chosen.get('category') or '满额赠品'
            })
        
        return results



# 代理状态相关操作
class AgentStatusDB:
    @staticmethod
    def get_agent_status(agent_id: str) -> Dict[str, Any]:
        """获取代理的营业状态"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    SELECT * FROM agent_status WHERE agent_id = ?
                ''', (agent_id,))
                row = cursor.fetchone()
                if row:
                    return dict(row)
                else:
                    # 如果没有记录，默认为营业状态
                    return {
                        'agent_id': agent_id,
                        'is_open': 1,
                        'closed_note': '',
                        'updated_at': None,
                        'created_at': None
                    }
            except Exception as e:
                logger.error(f"获取代理状态失败: {e}")
                return {
                    'agent_id': agent_id,
                    'is_open': 1,
                    'closed_note': '',
                    'updated_at': None,
                    'created_at': None
                }

    @staticmethod
    def update_agent_status(agent_id: str, is_open: bool, closed_note: str = '') -> bool:
        """更新代理的营业状态"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                # 使用 UPSERT 语法
                cursor.execute('''
                    INSERT INTO agent_status (id, agent_id, is_open, closed_note, updated_at, created_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT(agent_id) DO UPDATE SET
                        is_open = excluded.is_open,
                        closed_note = excluded.closed_note,
                        updated_at = CURRENT_TIMESTAMP
                ''', (f"agent_status_{agent_id}", agent_id, 1 if is_open else 0, closed_note))
                conn.commit()
                return True
            except Exception as e:
                logger.error(f"更新代理状态失败: {e}")
                conn.rollback()
                return False

    @staticmethod
    def is_agent_open(agent_id: str) -> bool:
        """检查代理是否营业中"""
        status = AgentStatusDB.get_agent_status(agent_id)
        return bool(status.get('is_open', 1))

    @staticmethod
    def get_agent_closed_note(agent_id: str) -> str:
        """获取代理的打烊提示语"""
        status = AgentStatusDB.get_agent_status(agent_id)
        return status.get('closed_note', '')

    @staticmethod
    def get_all_agent_status() -> List[Dict[str, Any]]:
        """获取所有代理的状态"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    SELECT a.id as agent_id, a.name as agent_name, 
                           COALESCE(s.is_open, 1) as is_open,
                           COALESCE(s.closed_note, '') as closed_note,
                           s.updated_at
                    FROM admins a
                    LEFT JOIN agent_status s ON a.id = s.agent_id
                    WHERE a.role = 'agent' AND COALESCE(a.is_active, 1) = 1
                    ORDER BY a.name
                ''')
                return [dict(row) for row in cursor.fetchall()]
            except Exception as e:
                logger.error(f"获取所有代理状态失败: {e}")
                return []


# 收款码管理
class PaymentQrDB:
    """管理收款码的增删改查"""
    
    @staticmethod
    def create_payment_qr(owner_id: str, owner_type: str, name: str, image_path: str) -> str:
        """创建收款码"""
        import time
        qr_id = f"qr_{int(time.time() * 1000)}"
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO payment_qr_codes (id, owner_id, owner_type, name, image_path, is_enabled)
                VALUES (?, ?, ?, ?, ?, 1)
            ''', (qr_id, owner_id, owner_type, name, image_path))
            conn.commit()
            return qr_id
    
    @staticmethod
    def get_payment_qrs(owner_id: str, owner_type: str, include_disabled: bool = False) -> List[Dict[str, Any]]:
        """获取指定用户的收款码列表"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            where_clause = "WHERE owner_id = ? AND owner_type = ?"
            params = [owner_id, owner_type]
            
            if not include_disabled:
                where_clause += " AND is_enabled = 1"
            
            cursor.execute(f'''
                SELECT id, owner_id, owner_type, name, image_path, is_enabled, created_at, updated_at
                FROM payment_qr_codes
                {where_clause}
                ORDER BY created_at DESC
            ''', params)
            
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    
    @staticmethod
    def get_enabled_payment_qrs(owner_id: str, owner_type: str) -> List[Dict[str, Any]]:
        """获取指定用户的启用收款码列表"""
        return PaymentQrDB.get_payment_qrs(owner_id, owner_type, include_disabled=False)
    
    @staticmethod
    def get_payment_qr(qr_id: str) -> Optional[Dict[str, Any]]:
        """获取单个收款码"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, owner_id, owner_type, name, image_path, is_enabled, created_at, updated_at
                FROM payment_qr_codes
                WHERE id = ?
            ''', (qr_id,))
            
            row = cursor.fetchone()
            return dict(row) if row else None
    
    @staticmethod
    def update_payment_qr(qr_id: str, name: Optional[str] = None, image_path: Optional[str] = None) -> bool:
        """更新收款码信息"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            updates = []
            params = []
            
            if name is not None:
                updates.append("name = ?")
                params.append(name)
            
            if image_path is not None:
                updates.append("image_path = ?")
                params.append(image_path)
            
            if not updates:
                return False
            
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(qr_id)
            
            cursor.execute(f'''
                UPDATE payment_qr_codes
                SET {", ".join(updates)}
                WHERE id = ?
            ''', params)
            
            conn.commit()
            return cursor.rowcount > 0
    
    @staticmethod
    def update_payment_qr_status(qr_id: str, is_enabled: bool) -> bool:
        """更新收款码启用状态"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE payment_qr_codes
                SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (1 if is_enabled else 0, qr_id))
            
            conn.commit()
            return cursor.rowcount > 0
    
    @staticmethod
    def delete_payment_qr(qr_id: str) -> bool:
        """删除收款码"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM payment_qr_codes WHERE id = ?', (qr_id,))
            
            conn.commit()
            return cursor.rowcount > 0
    
    @staticmethod
    def ensure_at_least_one_enabled(owner_id: str, owner_type: str) -> bool:
        """确保至少有一个收款码启用"""
        enabled_qrs = PaymentQrDB.get_enabled_payment_qrs(owner_id, owner_type)
        if len(enabled_qrs) == 0:
            # 如果没有启用的，随机启用一个
            all_qrs = PaymentQrDB.get_payment_qrs(owner_id, owner_type, include_disabled=True)
            if all_qrs:
                PaymentQrDB.update_payment_qr_status(all_qrs[0]['id'], True)
                return True
        return len(enabled_qrs) > 0
    
    @staticmethod
    def get_random_enabled_qr(owner_id: str, owner_type: str) -> Optional[Dict[str, Any]]:
        """随机获取一个启用的收款码"""
        import random
        enabled_qrs = PaymentQrDB.get_enabled_payment_qrs(owner_id, owner_type)
        return random.choice(enabled_qrs) if enabled_qrs else None

    @staticmethod
    def migrate_from_admin_payment_qr():
        """从旧的admins.payment_qr_path迁移数据到新表"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 查找所有有收款码的管理员/代理
            cursor.execute('''
                SELECT id, name, role, payment_qr_path
                FROM admins
                WHERE payment_qr_path IS NOT NULL AND payment_qr_path != ''
            ''')
            
            rows = cursor.fetchall()
            migrated_count = 0
            
            for row in rows:
                admin_id, admin_name, role, payment_qr_path = row
                
                # 检查是否已经迁移过
                cursor.execute('SELECT COUNT(*) FROM payment_qr_codes WHERE owner_id = ? AND owner_type = ?', 
                             (admin_id, role))
                existing_count = cursor.fetchone()[0]
                
                if existing_count == 0:
                    # 创建收款码记录
                    qr_name = f"{admin_name or admin_id}的收款码"
                    PaymentQrDB.create_payment_qr(admin_id, role, qr_name, payment_qr_path)
                    migrated_count += 1
                    
                    logger.info(f"迁移 {role} {admin_id} 的收款码: {payment_qr_path}")
            
            logger.info(f"收款码数据迁移完成，共迁移 {migrated_count} 条记录")
            return migrated_count


if __name__ == "__main__":
    # 初始化数据库
    init_database()
    
    # 迁移收款码数据
    try:
        PaymentQrDB.migrate_from_admin_payment_qr()
        print("收款码数据迁移完成")
    except Exception as e:
        print(f"迁移收款码数据失败: {e}")
    
    print("数据库初始化完成")
