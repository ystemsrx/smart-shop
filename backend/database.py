# /backend/database.py
import sqlite3
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from contextlib import contextmanager
import os

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
                (id, name, category, price, stock, discount, img_path, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                product_id,
                product_data['name'],
                category_name,
                product_data['price'],
                product_data.get('stock', 0),
                float(product_data.get('discount', 10.0)),
                product_data.get('img_path', ''),
                product_data.get('description', '')
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
            
            for field in ['name', 'category', 'price', 'stock', 'discount', 'img_path', 'description', 'is_active']:
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
            
            # 如果更新成功且更改了分类，检查是否需要清理旧分类
            if success and 'category' in product_data and product_data['category'] != old_category:
                ProductDB._cleanup_empty_category(cursor, old_category)
            
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
            
            # 如果删除成功，检查是否需要清理分类
            if success:
                ProductDB._cleanup_empty_category(cursor, category_name)
            
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
                
                # 清理可能为空的分类
                for category_name in categories_to_check:
                    ProductDB._cleanup_empty_category(cursor, category_name)
                
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
    
    
    @staticmethod
    def _cleanup_empty_category(cursor, category_name: str):
        """清理没有商品的分类"""
        # 检查该分类下是否还有商品
        cursor.execute('SELECT COUNT(*) FROM products WHERE category = ?', (category_name,))
        product_count = cursor.fetchone()[0]
        
        # 如果没有商品，删除该分类
        if product_count == 0:
            cursor.execute('DELETE FROM categories WHERE name = ?', (category_name,))
            logger.info(f"自动删除空分类: {category_name}")

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
    def create_order(student_id: str, total_amount: float, shipping_info: dict, items: list, payment_method: str = 'wechat', note: str = '') -> str:
        """创建新订单（但不扣减库存，等待支付成功）"""
        order_id = f"order_{int(datetime.now().timestamp())}"
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO orders 
                (id, student_id, total_amount, shipping_info, items, payment_method, note, payment_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                order_id,
                student_id,
                total_amount,
                json.dumps(shipping_info),
                json.dumps(items),
                payment_method,
                note,
                'pending'
            ))
            conn.commit()
            return order_id
    
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
        """获取所有订单（管理员用）"""
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
                cursor.execute('''
                    DELETE FROM orders
                    WHERE payment_status IN ('pending','failed')
                      AND datetime(created_at) <= datetime('now', ?)
                ''', (f'-{int(expire_minutes)} minutes',))
                deleted = cursor.rowcount or 0
                conn.commit()
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

if __name__ == "__main__":
    # 初始化数据库
    init_database()
    print("数据库初始化完成")
