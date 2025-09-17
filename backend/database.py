# /backend/database.py
import sqlite3
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from contextlib import contextmanager
import os
import uuid

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 数据库配置
DB_PATH = os.path.join(os.path.dirname(__file__), "dorm_shop.db")

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
        
        # 创建索引优化查询
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
        
        # 为现有表添加新字段（如果不存在的话）
        try:
            cursor.execute('ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT "pending"')
        except sqlite3.OperationalError:
            pass  # 字段已存在
            

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
                CREATE TABLE IF NOT EXISTS auto_gift_items (
                    id TEXT PRIMARY KEY,
                    product_id TEXT NOT NULL,
                    variant_id TEXT,
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
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_gift_threshold_amount ON gift_thresholds(threshold_amount)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_gift_threshold_active ON gift_thresholds(is_active)')
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
        
        conn.commit()
        logger.info("数据库表结构初始化成功")
        
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
        cursor.execute('''
            INSERT OR IGNORE INTO products 
            (id, name, category, price, stock, img_path, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            product['id'], product['name'], product['category'],
            product['price'], product['stock'], product['img_path'],
            product['description']
        ))
    
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
                (id, name, category, price, stock, discount, img_path, description, cost)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                product_id,
                product_data['name'],
                category_name,
                product_data['price'],
                product_data.get('stock', 0),
                float(product_data.get('discount', 10.0)),
                product_data.get('img_path', ''),
                product_data.get('description', ''),
                float(product_data.get('cost', 0.0))
            ))
            conn.commit()
            return product_id
    
    @staticmethod
    def get_all_products() -> List[Dict]:
        """获取所有商品"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM products ORDER BY created_at DESC')
            return [dict(row) for row in cursor.fetchall()]
    
    @staticmethod
    def get_products_by_category(category: str) -> List[Dict]:
        """按类别获取商品"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM products WHERE category = ? ORDER BY created_at DESC',
                (category,)
            )
            return [dict(row) for row in cursor.fetchall()]
    
    @staticmethod
    def search_products(query: str, active_only: bool = False) -> List[Dict]:
        """搜索商品；当 active_only=True 时，仅返回上架商品"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if active_only:
                cursor.execute('''
                    SELECT * FROM products 
                    WHERE (name LIKE ? OR category LIKE ? OR description LIKE ?) AND (is_active = 1)
                    ORDER BY created_at DESC
                ''', (f'%{query}%', f'%{query}%', f'%{query}%'))
            else:
                cursor.execute('''
                    SELECT * FROM products 
                    WHERE name LIKE ? OR category LIKE ? OR description LIKE ?
                    ORDER BY created_at DESC
                ''', (f'%{query}%', f'%{query}%', f'%{query}%'))
            return [dict(row) for row in cursor.fetchall()]
    
    @staticmethod
    def get_product_by_id(product_id: str) -> Optional[Dict]:
        """根据ID获取商品"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

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
            
            for field in ['name', 'category', 'price', 'stock', 'discount', 'img_path', 'description', 'is_active', 'cost']:
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
            
            try:
                # 获取所有要删除的商品的信息（包括图片路径）
                placeholders = ','.join('?' * len(product_ids))
                cursor.execute(f'SELECT id, category, img_path FROM products WHERE id IN ({placeholders})', product_ids)
                existing_products = cursor.fetchall()
                
                if not existing_products:
                    return {"success": False, "deleted_count": 0, "message": "没有找到要删除的商品"}
                
                existing_ids = [row[0] for row in existing_products]
                categories_to_check = list(set([row[1] for row in existing_products]))
                img_paths = [row[2] for row in existing_products if row[2] and row[2].strip()]
                
                # 执行批量删除
                cursor.execute(f'DELETE FROM products WHERE id IN ({placeholders})', existing_ids)
                deleted_count = cursor.rowcount
                
                # 统一清理空分类（删除后再全量清理）
                conn.commit()
                try:
                    CategoryDB.cleanup_orphan_categories()
                except Exception:
                    pass
                
                conn.commit()
                
                return {
                    "success": True, 
                    "deleted_count": deleted_count,
                    "message": f"成功删除 {deleted_count} 件商品",
                    "deleted_ids": existing_ids,
                    "not_found_ids": list(set(product_ids) - set(existing_ids)),
                    "deleted_img_paths": img_paths
                }
                
            except Exception as e:
                conn.rollback()
                return {"success": False, "deleted_count": 0, "message": f"批量删除失败: {str(e)}"}
    
    
    # 旧的分类清理方法已废弃，统一使用 CategoryDB.cleanup_orphan_categories()

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
    def get_categories_with_products() -> List[Dict]:
        """获取有商品关联的分类"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT DISTINCT c.* 
                FROM categories c 
                INNER JOIN products p ON c.name = p.category 
                ORDER BY c.name
            ''')
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
    @staticmethod
    def verify_admin(admin_id: str, password: str) -> Optional[Dict]:
        """验证管理员凭据"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM admins WHERE id = ? AND password = ?',
                (admin_id, password)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

# 订单相关操作
class OrderDB:
    @staticmethod
    def create_order(student_id: str, total_amount: float, shipping_info: dict, items: list, payment_method: str = 'wechat', note: str = '', discount_amount: float = 0.0, coupon_id: Optional[str] = None) -> str:
        """创建新订单（但不扣减库存，等待支付成功）"""
        order_id = f"order_{int(datetime.now().timestamp())}"

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO orders 
                (id, student_id, total_amount, shipping_info, items, payment_method, note, payment_status, discount_amount, coupon_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                coupon_id
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
                            logger.warning(f"抽奖奖品规格不存在，跳过库存扣减: {actual_variant_id}")
                            continue
                        var_product_id = var_row[0]
                        current_stock = int(var_row[1])
                        if current_stock < quantity:
                            conn.rollback()
                            return False
                        new_stock = current_stock - quantity
                        cursor.execute('UPDATE product_variants SET stock = ? WHERE id = ?', (new_stock, actual_variant_id))
                    else:
                        cursor.execute('SELECT stock FROM products WHERE id = ?', (actual_product_id,))
                        product_row = cursor.fetchone()
                        if not product_row:
                            logger.warning(f"抽奖奖品商品不存在，跳过库存扣减: {actual_product_id}")
                            continue
                        current_stock = int(product_row[0])
                        if current_stock < quantity:
                            conn.rollback()
                            return False
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
                        # 若为赠品且无对应商品，跳过扣减
                        if isinstance(item, dict) and item.get('is_lottery'):
                            continue
                        conn.rollback()
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
    def get_orders_paginated(order_id: Optional[str] = None, limit: int = 20, offset: int = 0) -> Dict[str, Any]:
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

            params: list = []
            where_sql = []
            if order_id:
                where_sql.append('o.id LIKE ?')
                params.append(f'%{order_id}%')
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
    def get_order_stats() -> Dict:
        """获取订单统计信息（管理员用）"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 总订单数
            cursor.execute('SELECT COUNT(*) FROM orders')
            total_orders = cursor.fetchone()[0]
            
            # 各状态订单数
            cursor.execute('''
                SELECT status, COUNT(*) as count 
                FROM orders 
                GROUP BY status
            ''')
            status_counts = {row[0]: row[1] for row in cursor.fetchall()}
            
            # 今日订单数
            cursor.execute('''
                SELECT COUNT(*) FROM orders 
                WHERE date(created_at) = date('now')
            ''')
            today_orders = cursor.fetchone()[0]
            
            # 总销售额
            cursor.execute('SELECT COALESCE(SUM(total_amount), 0) FROM orders')
            total_revenue = cursor.fetchone()[0]
            
            return {
                'total_orders': total_orders,
                'status_counts': status_counts,
                'today_orders': today_orders,
                'total_revenue': round(total_revenue, 2)
            }

    @staticmethod
    def get_dashboard_stats(period: str = 'week') -> Dict:
        """获取仪表盘详细统计信息"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 基础统计
            basic_stats = OrderDB.get_order_stats()
            
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
            cursor.execute(f'''
                SELECT {group_by} as period, 
                       COALESCE(SUM(total_amount), 0) as revenue,
                       COUNT(*) as orders
                FROM orders 
                WHERE {time_filter}
                GROUP BY {group_by}
                ORDER BY period
            ''')
            current_period_data = [
                {'period': row[0], 'revenue': round(row[1], 2), 'orders': row[2]}
                for row in cursor.fetchall()
            ]

            # 计算净利润数据 - 使用新算法：订单总额减去成本总和
            def calculate_profit_for_period(time_filter_clause):
                cursor.execute(f'''
                    SELECT o.items, o.created_at, o.total_amount
                    FROM orders o 
                    WHERE {time_filter_clause}
                    AND o.payment_status = 'succeeded'
                ''')
                
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
            cursor.execute(f'''
                SELECT COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as orders
                FROM orders 
                WHERE {prev_time_filter}
            ''')
            prev_data = cursor.fetchone()
            prev_revenue = round(prev_data[0], 2) if prev_data else 0
            prev_orders = prev_data[1] if prev_data else 0
            
            # 计算对比时间段净利润
            prev_profit, _ = calculate_profit_for_period(prev_time_filter)
            
            # 当前时间段总计
            cursor.execute(f'''
                SELECT COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as orders
                FROM orders 
                WHERE {time_filter}
            ''')
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
            cursor.execute(f'''
                SELECT o.items, o.created_at
                FROM orders o 
                WHERE {time_filter}
                AND o.payment_status = 'succeeded'
            ''')
            
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
            cursor.execute('SELECT COUNT(*) FROM users')
            total_users = cursor.fetchone()[0] or 0
            
            cursor.execute('''
                SELECT COUNT(*) FROM users 
                WHERE date(created_at) >= date('now', '-7 days')
            ''')
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
    def get_customers_with_purchases(limit: int = 5, offset: int = 0) -> Dict[str, Any]:
        """获取所有至少购买过一次的用户信息，按总购买金额降序排列"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 查询购买过商品的用户统计
            cursor.execute('''
                SELECT 
                    u.id,
                    u.name,
                    COUNT(DISTINCT o.id) as order_count,
                    COALESCE(SUM(o.total_amount), 0) as total_spent,
                    MAX(o.created_at) as last_order_date,
                    MIN(o.created_at) as first_order_date
                FROM users u
                INNER JOIN orders o ON u.id = o.student_id
                WHERE o.payment_status = 'succeeded'
                GROUP BY u.id, u.name
                ORDER BY total_spent DESC
                LIMIT ? OFFSET ?
            ''', (limit, offset))
            
            customers = []
            for row in cursor.fetchall():
                customer = dict(row)
                # 计算平均订单金额
                customer['avg_order_amount'] = round(customer['total_spent'] / customer['order_count'], 2) if customer['order_count'] > 0 else 0
                customers.append(customer)
            
            # 统计总数
            cursor.execute('''
                SELECT COUNT(DISTINCT u.id)
                FROM users u
                INNER JOIN orders o ON u.id = o.student_id
                WHERE o.payment_status = 'succeeded'
            ''')
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
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT student_id FROM user_profiles WHERE student_id = ?', (student_id,))
            exists = cursor.fetchone() is not None
            if exists:
                cursor.execute('''
                    UPDATE user_profiles
                    SET name = ?, phone = ?, dormitory = ?, building = ?, room = ?, full_address = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE student_id = ?
                ''', (name, phone, dormitory, building, room, full_address, student_id))
            else:
                cursor.execute('''
                    INSERT INTO user_profiles (student_id, name, phone, dormitory, building, room, full_address)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (student_id, name, phone, dormitory, building, room, full_address))
            conn.commit()
            return True

# 抽奖与奖品相关操作
class LotteryDB:
    @staticmethod
    def list_prizes(include_inactive: bool = False) -> List[Dict[str, Any]]:
        """列出抽奖奖项及其关联商品。"""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            base_sql = 'SELECT * FROM lottery_prizes'
            params: List[Any] = []
            if not include_inactive:
                base_sql += ' WHERE is_active = 1'
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
    def get_active_prizes_for_draw() -> List[Dict[str, Any]]:
        prizes = LotteryDB.list_prizes(include_inactive=False)
        active: List[Dict[str, Any]] = []
        for prize in prizes:
            if prize.get('weight', 0) <= 0:
                continue
            items = [dict(item) for item in prize.get('items', []) if item.get('available')]
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
        items: List[Dict[str, Any]]
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
            cursor.execute('SELECT 1 FROM lottery_prizes WHERE id = ?', (prize_id,))
            exists = cursor.fetchone() is not None
            if exists:
                cursor.execute('''
                    UPDATE lottery_prizes
                    SET display_name = ?, weight = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (display_name, weight_value, active_flag, prize_id))
            else:
                cursor.execute('''
                    INSERT INTO lottery_prizes (id, display_name, weight, is_active)
                    VALUES (?, ?, ?, ?)
                ''', (prize_id, display_name, weight_value, active_flag))

            cursor.execute('DELETE FROM lottery_prize_items WHERE prize_id = ?', (prize_id,))
            for item in normalized_items:
                cursor.execute('''
                    INSERT INTO lottery_prize_items (id, prize_id, product_id, variant_id)
                    VALUES (?, ?, ?, ?)
                ''', (item['id'], prize_id, item['product_id'], item['variant_id']))
            conn.commit()
            return prize_id

    @staticmethod
    def delete_prize(prize_id: str) -> bool:
        if not prize_id:
            return False
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM lottery_prize_items WHERE prize_id = ?', (prize_id,))
            cursor.execute('DELETE FROM lottery_prizes WHERE id = ?', (prize_id,))
            deleted = cursor.rowcount or 0
            conn.commit()
            return deleted > 0

    @staticmethod
    def delete_prizes_not_in(valid_ids: List[str]) -> int:
        ids = list({pid for pid in valid_ids if pid})
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if ids:
                placeholders = ','.join('?' * len(ids))
                cursor.execute(f'DELETE FROM lottery_prize_items WHERE prize_id NOT IN ({placeholders})', ids)
                cursor.execute(f'DELETE FROM lottery_prizes WHERE id NOT IN ({placeholders})', ids)
            else:
                cursor.execute('DELETE FROM lottery_prize_items')
                cursor.execute('DELETE FROM lottery_prizes')
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
                    prize_group_id,
                    prize_product_name,
                    prize_variant_id,
                    prize_variant_name,
                    prize_unit_price
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                draw_id,
                order_id,
                student_id,
                prize_name,
                prize_product_id,
                int(prize_quantity or 1),
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
    def list_items() -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM auto_gift_items ORDER BY created_at ASC')
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
    def replace_items(items: List[Dict[str, Optional[str]]]) -> None:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM auto_gift_items')
            for item in items:
                product_id = item.get('product_id')
                if not product_id:
                    continue
                variant_id = item.get('variant_id') or None
                entry_id = f"agift_{uuid.uuid4().hex}"
                cursor.execute('''
                    INSERT INTO auto_gift_items (id, product_id, variant_id)
                    VALUES (?, ?, ?)
                ''', (entry_id, product_id, variant_id))
            conn.commit()

    @staticmethod
    def get_available_items() -> List[Dict[str, Any]]:
        return [item for item in AutoGiftDB.list_items() if item.get('available')]

    @staticmethod
    def pick_gifts(slot_count: int) -> List[Dict[str, Any]]:
        if slot_count <= 0:
            return []
        candidates = AutoGiftDB.get_available_items()
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
                    prize_group_id,
                    prize_quantity,
                    source_order_id,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'eligible')
            ''', (
                rid,
                student_id,
                prize_name,
                prize_product_id,
                prize_product_name,
                prize_variant_id,
                prize_variant_name,
                float(prize_unit_price or 0.0),
                prize_group_id,
                int(quantity or 1),
                source_order_id
            ))
            conn.commit()
            return rid

    @staticmethod
    def get_eligible_rewards(student_id: str) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM user_rewards WHERE student_id = ? AND status = \"eligible\" ORDER BY created_at ASC', (student_id,))
            return [dict(r) for r in cursor.fetchall()]

    @staticmethod
    def consume_rewards(student_id: str, reward_ids: List[str], consumed_order_id: str) -> int:
        if not reward_ids:
            return 0
        with get_db_connection() as conn:
            cursor = conn.cursor()
            placeholders = ','.join('?' * len(reward_ids))
            try:
                cursor.execute(f'''UPDATE user_rewards
                                   SET status = 'consumed', consumed_order_id = ?, updated_at = CURRENT_TIMESTAMP
                                   WHERE id IN ({placeholders}) AND student_id = ? AND status = 'eligible' ''',
                               [consumed_order_id, *reward_ids, student_id])
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
    def issue_coupons(student_id: str, amount: float, quantity: int = 1, expires_at: Optional[str] = None) -> List[str]:
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
                        INSERT INTO coupons (id, student_id, amount, expires_at, status)
                        VALUES (?, ?, ?, ?, 'active')
                    ''', (cid, student_id, float(amount), expires_at))
                    ids.append(cid)
                except Exception:
                    # 跳过单条失败，继续
                    pass
            conn.commit()
        return ids

    @staticmethod
    def list_all(student_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """列出所有优惠券（管理员查看），包含 active/revoked；不包含已使用（因为已删除）。"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if student_id:
                cursor.execute('SELECT * FROM coupons WHERE student_id = ? ORDER BY created_at DESC', (student_id,))
            else:
                cursor.execute('SELECT * FROM coupons ORDER BY created_at DESC')
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
    def get_active_for_student(student_id: str) -> List[Dict[str, Any]]:
        """获取用户当前可用的优惠券（active 且未过期）。"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM coupons WHERE student_id = ? AND status = \"active\" AND (locked_order_id IS NULL OR TRIM(locked_order_id) = \"\") ORDER BY created_at DESC', (student_id,))
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
    def revoke(coupon_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE coupons SET status = \"revoked\", updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = \"active\"', (coupon_id,))
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
    def check_valid_for_student(coupon_id: str, student_id: str) -> Optional[Dict[str, Any]]:
        """校验优惠券是否可用（归属、状态、未过期）。返回券信息或None。"""
        c = CouponDB.get_by_id(coupon_id)
        if not c:
            return None
        if c.get('student_id') != student_id:
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

class GiftThresholdDB:
    """满额赠品门槛配置数据库操作类"""
    
    @staticmethod
    def list_all(include_inactive: bool = False) -> List[Dict[str, Any]]:
        """获取所有满额门槛配置，按门槛金额排序"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            query = '''
                SELECT * FROM gift_thresholds 
                WHERE is_active = 1
                ORDER BY threshold_amount ASC, sort_order ASC
            '''
            if include_inactive:
                query = '''
                    SELECT * FROM gift_thresholds 
                    ORDER BY threshold_amount ASC, sort_order ASC
                '''
            
            cursor.execute(query)
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
    def get_by_id(threshold_id: str) -> Optional[Dict[str, Any]]:
        """根据ID获取门槛配置"""
        thresholds = GiftThresholdDB.list_all(include_inactive=True)
        return next((t for t in thresholds if t.get('id') == threshold_id), None)
    
    @staticmethod
    def create_threshold(threshold_amount: float, gift_products: bool = False, 
                        gift_coupon: bool = False, coupon_amount: float = 0.0) -> str:
        """创建新的满额门槛配置"""
        import uuid
        threshold_id = f"threshold_{uuid.uuid4().hex}"
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO gift_thresholds 
                (id, threshold_amount, gift_products, gift_coupon, coupon_amount, is_active, sort_order)
                VALUES (?, ?, ?, ?, ?, 1, ?)
            ''', (threshold_id, threshold_amount, 1 if gift_products else 0, 1 if gift_coupon else 0, 
                  coupon_amount, int(threshold_amount)))
            conn.commit()
            
        return threshold_id
    
    @staticmethod
    def update_threshold(threshold_id: str, threshold_amount: Optional[float] = None,
                        gift_products: Optional[bool] = None, gift_coupon: Optional[bool] = None,
                        coupon_amount: Optional[float] = None, is_active: Optional[bool] = None) -> bool:
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
            cursor.execute(f'''
                UPDATE gift_thresholds 
                SET {", ".join(updates)}
                WHERE id = ?
            ''', params)
            conn.commit()
            
        return cursor.rowcount > 0
    
    @staticmethod
    def delete_threshold(threshold_id: str) -> bool:
        """删除门槛配置及其关联的商品"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # 先删除关联的商品
            cursor.execute('DELETE FROM gift_threshold_items WHERE threshold_id = ?', (threshold_id,))
            # 再删除门槛配置
            cursor.execute('DELETE FROM gift_thresholds WHERE id = ?', (threshold_id,))
            conn.commit()
            
        return cursor.rowcount > 0
    
    @staticmethod
    def add_items_to_threshold(threshold_id: str, items: List[Dict[str, Optional[str]]]) -> bool:
        """为门槛添加商品"""
        import uuid
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
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
    def get_applicable_thresholds(amount: float) -> List[Dict[str, Any]]:
        """根据金额获取所有适用的门槛配置（按金额升序）"""
        thresholds = GiftThresholdDB.list_all()
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
    def pick_gifts_for_threshold(threshold_id: str, count: int) -> List[Dict[str, Any]]:
        """为指定门槛选择赠品（只选择库存最高的一种商品）"""
        if count <= 0:
            return []
            
        threshold = GiftThresholdDB.get_by_id(threshold_id)
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


if __name__ == "__main__":
    # 初始化数据库
    init_database()
    print("数据库初始化完成")
