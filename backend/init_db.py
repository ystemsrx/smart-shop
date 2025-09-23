"""
backend/init_db.py

初始化 SQLite 数据库：
- 删除现有数据库文件（彻底清空）
- 创建必要的表与索引（与 backend/database.py 保持一致）
- 仅插入指定的管理员账号（无任何示例商品/分类/订单等测试数据）

用法：
  python backend/init_db.py
"""

import os
import sqlite3
import logging

# 复用 backend/database.py 中的数据库路径（若不可用则退回到同目录下的 dorm_shop.db）
try:
    from database import DB_PATH as DEFAULT_DB_PATH  # type: ignore
except Exception:
    DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "dorm_shop.db")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 需要创建的管理员账号（仅这两个）
ADMIN_ACCOUNTS = [
    {"id": "ADMIN_USERNAME1", "password": "admin123", "name": "ADMIN_USERNAME1", "role": "admin"},
    {"id": "ADMIN_USERNAME2", "password": "admin123", "name": "ADMIN_USERNAME2", "role": "admin"},
]


def create_schema(conn: sqlite3.Connection) -> None:
    """创建所有必要的表与索引（与 backend/database.py 对齐）"""
    cur = conn.cursor()

    # 用户表
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # 商品表
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER DEFAULT 0,
            img_path TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # 购物车表
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS carts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            items TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users (id)
        )
        """
    )

    # 聊天记录表
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users (id)
        )
        """
    )

    # 分类表
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # 管理员表
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS admins (
            id TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # 订单表
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            payment_status TEXT DEFAULT 'pending',
            total_amount REAL NOT NULL,
            shipping_info TEXT NOT NULL,
            items TEXT NOT NULL,
            payment_method TEXT DEFAULT 'wechat',
            note TEXT,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users (id)
        )
        """
    )

    # 收款码表（支持管理员和代理多个收款码）
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS payment_qr_codes (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            owner_type TEXT NOT NULL,
            name TEXT NOT NULL,
            image_path TEXT NOT NULL,
            is_enabled INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # 索引
    cur.execute("CREATE INDEX IF NOT EXISTS idx_carts_student_id ON carts(student_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_chat_logs_student_id ON chat_logs(student_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_chat_logs_timestamp ON chat_logs(timestamp)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_student_id ON orders(student_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_payment_qr_codes_owner ON payment_qr_codes(owner_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_payment_qr_codes_owner_type ON payment_qr_codes(owner_type)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_payment_qr_codes_enabled ON payment_qr_codes(is_enabled)")

    conn.commit()


def seed_admins(conn: sqlite3.Connection) -> None:
    """仅插入所需管理员账号"""
    cur = conn.cursor()
    for admin in ADMIN_ACCOUNTS:
        cur.execute(
            """
            INSERT OR REPLACE INTO admins (id, password, name, role)
            VALUES (?, ?, ?, ?)
            """,
            (admin["id"], admin["password"], admin["name"], admin.get("role", "admin")),
        )
    conn.commit()


def reset_database(db_path: str = DEFAULT_DB_PATH) -> None:
    """删除旧库文件，重建表结构，并初始化管理员"""
    # 1) 删除旧数据库文件（如果存在）
    if os.path.exists(db_path):
        logger.info("删除旧数据库文件: %s", db_path)
        os.remove(db_path)
    else:
        logger.info("未发现旧数据库文件，将创建新数据库: %s", db_path)

    # 2) 连接并创建表
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        create_schema(conn)
        seed_admins(conn)
        logger.info("数据库初始化完成（无测试数据，仅保留管理员账号）")
    finally:
        conn.close()


if __name__ == "__main__":
    reset_database()
    print("数据库已重置并初始化完成。")

