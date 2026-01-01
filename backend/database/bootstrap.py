import os
import sqlite3
import time

from . import config
from .migrations import (
    ensure_table_columns,
    auto_migrate_database,
    migrate_chat_threads,
    ensure_admin_accounts,
    migrate_user_profile_addresses,
    migrate_passwords_to_hash,
)

def init_database():
    """初始化数据库表结构。"""
    if config.settings.db_reset and not config._DB_WAS_RESET:
        if os.path.exists(config.DB_PATH):
            try:
                os.remove(config.DB_PATH)
                config.logger.info("数据库重置：已删除现有文件 %s", config.DB_PATH)
            except OSError as exc:
                config.logger.error("删除数据库文件失败: %s", exc)
                raise
        config._DB_WAS_RESET = True

    conn = sqlite3.connect(config.DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                name TEXT NOT NULL,
                id_number CHAR(18),
                id_status INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL,
                stock INTEGER DEFAULT 0,
                discount REAL DEFAULT 10.0,
                img_path TEXT,
                description TEXT,
                is_active INTEGER DEFAULT 1,
                reservation_required INTEGER DEFAULT 0,
                reservation_cutoff TEXT,
                reservation_note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS carts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT NOT NULL,
                items TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users (id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_threads (
                id TEXT PRIMARY KEY,
                student_id TEXT,
                user_id INTEGER,
                title TEXT,
                first_message_preview TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_archived INTEGER DEFAULT 0,
                metadata TEXT,
                FOREIGN KEY (student_id) REFERENCES users (id),
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_threads_user_id ON chat_threads(user_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_threads_student_id ON chat_threads(student_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_threads_last_active ON chat_threads(last_message_at DESC)')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT,
                user_id INTEGER,
                thread_id TEXT,
                tool_call_id TEXT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users (id),
                FOREIGN KEY (user_id) REFERENCES users (user_id),
                FOREIGN KEY (thread_id) REFERENCES chat_threads (id)
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat_logs(user_id)')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS admins (
                id TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'admin',
                payment_qr_path TEXT,
                is_active INTEGER DEFAULT 1,
                token_version INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP
            )
        ''')

        cursor.execute('''
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
                is_reservation INTEGER DEFAULT 0,
                reservation_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users (id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS order_exports (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                role TEXT NOT NULL,
                agent_filter TEXT,
                keyword TEXT,
                status_filter TEXT,
                start_time_ms INTEGER,
                end_time_ms INTEGER,
                status TEXT DEFAULT 'pending',
                total_count INTEGER DEFAULT 0,
                exported_count INTEGER DEFAULT 0,
                file_path TEXT,
                download_token TEXT,
                expires_at TIMESTAMP,
                message TEXT,
                filename TEXT,
                scope_label TEXT,
                client_tz_offset INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_order_exports_owner ON order_exports(owner_id, created_at DESC)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_order_exports_expires_at ON order_exports(expires_at)')
        ensure_table_columns(conn, 'order_exports', {
            'client_tz_offset': 'INTEGER',
            'keyword': 'TEXT',
            'status_filter': 'TEXT'
        })

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

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS addresses (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                enabled INTEGER DEFAULT 1,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS buildings (
                id TEXT PRIMARY KEY,
                address_id TEXT NOT NULL,
                name TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(address_id, name),
                FOREIGN KEY (address_id) REFERENCES addresses(id)
            )
        ''')

        cursor.execute('''
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
        ''')

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

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS agent_deletions (
                agent_id TEXT PRIMARY KEY,
                agent_name TEXT,
                address_ids TEXT,
                building_ids TEXT,
                deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                replacement_agent_id TEXT,
                replacement_agent_name TEXT,
                replaced_at TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS agent_status (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                is_open INTEGER DEFAULT 1,
                closed_note TEXT DEFAULT '',
                allow_reservation INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (agent_id) REFERENCES admins(id),
                UNIQUE(agent_id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sales_cycles (
                id TEXT PRIMARY KEY,
                owner_type TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                start_time TIMESTAMP NOT NULL,
                end_time TIMESTAMP,
                pre_end_is_open INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS image_lookup (
                hash TEXT PRIMARY KEY,
                physical_path TEXT NOT NULL,
                product_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_image_lookup_product ON image_lookup(product_id)')

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
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_agent_deletions_replaced ON agent_deletions(replaced_at)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_agent_status_agent ON agent_status(agent_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_agent_status_is_open ON agent_status(is_open)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_sales_cycles_owner ON sales_cycles(owner_type, owner_id, start_time)')

        try:
            cursor.execute('ALTER TABLE admins ADD COLUMN payment_qr_path TEXT')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE admins ADD COLUMN is_active INTEGER DEFAULT 1')
        except sqlite3.OperationalError:
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
            pass

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

        try:
            cursor.execute('ALTER TABLE products ADD COLUMN discount REAL DEFAULT 10.0')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE products ADD COLUMN is_active INTEGER DEFAULT 1')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE products ADD COLUMN cost REAL DEFAULT 0.0')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE products ADD COLUMN owner_id TEXT')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0.0')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('ALTER TABLE orders ADD COLUMN coupon_id TEXT')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('ALTER TABLE coupons ADD COLUMN locked_order_id TEXT')
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_coupons_locked ON coupons(locked_order_id)')
        except Exception:
            pass

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

        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            ''')
        except Exception:
            pass

        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS coupons (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    amount REAL NOT NULL,
                    expires_at TIMESTAMP NULL,
                    status TEXT DEFAULT 'active',
                    owner_id TEXT,
                    revoked_at TIMESTAMP NULL,
                    used_at TIMESTAMP NULL,
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

        try:
            cursor.execute('ALTER TABLE coupons ADD COLUMN revoked_at TIMESTAMP NULL')
        except Exception:
            pass
        try:
            cursor.execute('ALTER TABLE coupons ADD COLUMN used_at TIMESTAMP NULL')
        except Exception:
            pass

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

        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS gift_thresholds (
                    id TEXT PRIMARY KEY,
                    threshold_amount REAL NOT NULL,
                    gift_products INTEGER DEFAULT 0,
                    gift_coupon INTEGER DEFAULT 0,
                    coupon_amount REAL DEFAULT 0.0,
                    per_order_limit INTEGER,
                    is_active INTEGER DEFAULT 1,
                    sort_order INTEGER DEFAULT 0,
                    owner_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_gift_threshold_amount ON gift_thresholds(threshold_amount)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_gift_threshold_active ON gift_thresholds(is_active)')
            try:
                cursor.execute('ALTER TABLE gift_thresholds ADD COLUMN per_order_limit INTEGER')
            except Exception:
                pass
        except Exception:
            pass

        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS delivery_settings (
                    id TEXT PRIMARY KEY,
                    delivery_fee REAL DEFAULT 1.0,
                    free_delivery_threshold REAL DEFAULT 10.0,
                    is_active INTEGER DEFAULT 1,
                    owner_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_delivery_settings_owner ON delivery_settings(owner_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_delivery_settings_active ON delivery_settings(is_active)')
        except Exception:
            pass

        try:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS gift_threshold_items (
                    id TEXT PRIMARY KEY,
                    threshold_id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    variant_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (threshold_id) REFERENCES gift_thresholds(id),
                    FOREIGN KEY (product_id) REFERENCES products(id)
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_gift_threshold_items_threshold ON gift_threshold_items(threshold_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_gift_threshold_items_product ON gift_threshold_items(product_id)')
        except Exception:
            pass

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
                    status TEXT DEFAULT 'eligible',
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

        try:
            auto_migrate_database(conn)
            migrate_chat_threads(conn)
            config.logger.info("自动数据库迁移完成")
        except Exception as exc:
            config.logger.warning("自动数据库迁移失败: %s", exc)

        try:
            cursor = conn.cursor()
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_logs_thread_id ON chat_logs(thread_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_logs_tool_call_id ON chat_logs(tool_call_id)')
            config.logger.info("chat_logs 索引创建成功")
        except sqlite3.OperationalError as exc:
            config.logger.warning("创建 chat_logs 索引时出错: %s", exc)

        ensure_admin_accounts(conn)
        conn.commit()
        config.logger.info("数据库表结构初始化成功")

        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM admins WHERE payment_qr_path IS NOT NULL AND payment_qr_path != ''")
            old_payment_count = cursor.fetchone()[0]

            if old_payment_count > 0:
                config.logger.info("检测到 %s 个旧的收款码数据，开始清理...", old_payment_count)

                cursor.execute('''
                    SELECT id, name, role, payment_qr_path
                    FROM admins
                    WHERE payment_qr_path IS NOT NULL AND payment_qr_path != ''
                ''')

                migrated_count = 0
                for row in cursor.fetchall():
                    admin_id, admin_name, role, payment_qr_path = row

                    actual_owner_id = 'admin' if role in ('admin', 'super_admin') else admin_id

                    cursor.execute('SELECT COUNT(*) FROM payment_qr_codes WHERE owner_id = ? AND owner_type = ?',
                                 (actual_owner_id, role))
                    existing_count = cursor.fetchone()[0]

                    if existing_count == 0:
                        qr_id = f"qr_{int(time.time() * 1000)}"
                        qr_name = f"{admin_name or admin_id}的收款码"

                        cursor.execute('''
                            INSERT INTO payment_qr_codes
                            (id, owner_id, owner_type, name, image_path, is_enabled)
                            VALUES (?, ?, ?, ?, ?, 1)
                        ''', (qr_id, actual_owner_id, role, qr_name, payment_qr_path))

                        migrated_count += 1
                        config.logger.info("迁移 %s %s 的收款码到 owner_id=%s: %s", role, admin_id, actual_owner_id, payment_qr_path)

                cursor.execute("UPDATE admins SET payment_qr_path = NULL WHERE payment_qr_path IS NOT NULL")

                cursor.execute('''
                    UPDATE payment_qr_codes
                    SET owner_id = 'admin'
                    WHERE owner_type = 'admin' AND owner_id != 'admin'
                ''')
                admin_unified_count = cursor.rowcount

                if admin_unified_count > 0:
                    config.logger.info("统一了 %s 个管理员收款码的 owner_id 为 'admin'", admin_unified_count)

                conn.commit()
                config.logger.info("收款码数据清理完成，已迁移 %s 个收款码，并清理了旧字段数据", migrated_count)
            else:
                config.logger.info("未发现旧的收款码数据，无需清理")

                cursor.execute('''
                    UPDATE payment_qr_codes
                    SET owner_id = 'admin'
                    WHERE owner_type = 'admin' AND owner_id != 'admin'
                ''')
                admin_unified_count = cursor.rowcount

                if admin_unified_count > 0:
                    config.logger.info("统一了 %s 个现有管理员收款码的 owner_id 为 'admin'", admin_unified_count)
                    conn.commit()

        except Exception as exc:
            config.logger.warning("清理旧收款码数据失败: %s", exc)
            conn.rollback()

        try:
            migrate_user_profile_addresses(conn)
        except Exception as exc:
            config.logger.warning("用户配置文件地址数据迁移失败: %s", exc)

    except Exception as exc:
        config.logger.error("数据库初始化失败: %s", exc)
        conn.rollback()
    finally:
        conn.close()

    try:
        migrate_passwords_to_hash()
    except Exception as exc:
        config.logger.warning("密码迁移失败: %s", exc)
