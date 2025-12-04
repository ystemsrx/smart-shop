import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Dict, List

from .config import logger, settings
from .connection import get_db_connection
from .security import hash_password, is_password_hashed


def ensure_table_columns(conn, table_name: str, required_columns: Dict[str, str]) -> None:
    """
    确保表中存在所需的列，如果不存在则自动添加。
    """
    cursor = conn.cursor()
    try:
        cursor.execute(f"PRAGMA table_info({table_name})")
        existing_columns = {row[1] for row in cursor.fetchall()}
        for column_name, column_definition in required_columns.items():
            if column_name not in existing_columns:
                try:
                    safe_definition = column_definition.replace('DEFAULT CURRENT_TIMESTAMP', 'DEFAULT NULL')
                    alter_sql = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {safe_definition}"
                    cursor.execute(alter_sql)
                    logger.info("自动添加列: %s.%s", table_name, column_name)
                    if 'CURRENT_TIMESTAMP' in column_definition:
                        try:
                            cursor.execute(
                                f"UPDATE {table_name} SET {column_name} = datetime('now') WHERE {column_name} IS NULL"
                            )
                            logger.info("初始化时间戳列: %s.%s", table_name, column_name)
                        except sqlite3.OperationalError:
                            pass
                except sqlite3.OperationalError as exc:
                    logger.warning("无法添加列 %s.%s: %s", table_name, column_name, exc)
        conn.commit()
    except sqlite3.OperationalError as exc:
        logger.warning("检查表 %s 列时出错: %s", table_name, exc)


def ensure_user_id_schema(conn) -> None:
    """确保所有用户相关表拥有 user_id 外键结构，并迁移旧数据。"""
    cursor = conn.cursor()

    def _table_columns(table: str) -> List[sqlite3.Row]:
        cursor.execute(f"PRAGMA table_info({table})")
        return cursor.fetchall()

    def _ensure_user_table():
        ensure_table_columns(conn, 'users', {
            'id_number': 'CHAR(18)',
            'id_status': 'INTEGER NOT NULL DEFAULT 0'
        })

        columns = _table_columns('users')
        column_names = {row[1] for row in columns}
        has_user_id_primary = False
        for row in columns:
            if row[1] == 'user_id':
                if row[5] == 1:
                    has_user_id_primary = True
                break

        try:
            if not has_user_id_primary:
                logger.info("检测到 users 表缺少 user_id 主键，开始重建...")
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS __users_new (
                        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        id TEXT UNIQUE NOT NULL,
                        password TEXT NOT NULL,
                        name TEXT NOT NULL,
                        id_number CHAR(18),
                        id_status INTEGER NOT NULL DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                ''')

                has_created_at = any(row[1] == 'created_at' for row in columns)
                has_id_number = 'id_number' in column_names
                has_id_status = 'id_status' in column_names

                select_fields = ['rowid as __rowid', 'id', 'password', 'name']
                if has_created_at:
                    select_fields.append('created_at')
                if has_id_number:
                    select_fields.append('id_number')
                if has_id_status:
                    select_fields.append('id_status')

                cursor.execute(f"SELECT {', '.join(select_fields)} FROM users")
                rows = cursor.fetchall()
                for row in rows:
                    row_dict = dict(row)
                    insert_cols = ['user_id', 'id', 'password', 'name', 'id_number', 'id_status']
                    params = [
                        row_dict.get('__rowid'),
                        row_dict.get('id'),
                        row_dict.get('password'),
                        row_dict.get('name'),
                        row_dict.get('id_number') if has_id_number else None,
                        0
                    ]

                    if has_id_status:
                        try:
                            params[-1] = int(row_dict.get('id_status') or 0)
                        except Exception:
                            params[-1] = 0

                    if has_created_at:
                        insert_cols.append('created_at')
                        params.append(row_dict.get('created_at'))

                    placeholders = ','.join('?' * len(params))
                    cursor.execute(
                        f"INSERT INTO __users_new ({', '.join(insert_cols)}) VALUES ({placeholders})",
                        params
                    )

                cursor.execute('ALTER TABLE users RENAME TO __users_old')
                cursor.execute('ALTER TABLE __users_new RENAME TO users')
                cursor.execute('DROP TABLE __users_old')
                logger.info("users 表重建完成")
            else:
                cursor.execute('UPDATE users SET user_id = rowid WHERE user_id IS NULL OR user_id = 0')

            try:
                cursor.execute("UPDATE users SET id_status = 0 WHERE id_status IS NULL")
            except sqlite3.OperationalError:
                pass

            cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_id ON users(id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id)')
            conn.commit()
        except sqlite3.OperationalError as exc:
            logger.warning("重建 users 表失败: %s", exc)
        except Exception as exc:
            logger.error("重建 users 表时发生异常: %s", exc)
            conn.rollback()
            raise

    def _ensure_reference(table: str, student_column: str, allow_null: bool = True, unique_index: bool = False):
        try:
            columns = _table_columns(table)
            column_names = {row[1] for row in columns}
            if 'user_id' not in column_names:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER")
                logger.info("为 %s 表添加 user_id 列", table)
            cursor.execute(f'''
                UPDATE {table}
                SET user_id = (
                    SELECT user_id FROM users WHERE users.id = {table}.{student_column}
                )
                WHERE (user_id IS NULL OR user_id = 0)
                  AND {table}.{student_column} IS NOT NULL
                  AND TRIM({table}.{student_column}) != ''
            ''')

            if not allow_null:
                cursor.execute(f'''
                    UPDATE {table}
                    SET user_id = (
                        SELECT user_id FROM users WHERE users.id = {table}.{student_column}
                    )
                    WHERE user_id IS NULL
                ''')

            cursor.execute(f'CREATE INDEX IF NOT EXISTS idx_{table}_user_id ON {table}(user_id)')
            if unique_index:
                cursor.execute(f'CREATE UNIQUE INDEX IF NOT EXISTS idx_{table}_user_id_unique ON {table}(user_id)')
            conn.commit()
        except sqlite3.OperationalError as exc:
            logger.warning("为表 %s 添加 user_id 列失败: %s", table, exc)
        except Exception as exc:
            logger.error("回填 %s.user_id 时出错: %s", table, exc)
            conn.rollback()

    _ensure_user_table()
    _ensure_reference('carts', 'student_id', allow_null=False)
    _ensure_reference('chat_logs', 'student_id', allow_null=True)
    _ensure_reference('chat_threads', 'student_id', allow_null=True)
    _ensure_reference('orders', 'student_id', allow_null=False)
    _ensure_reference('user_profiles', 'student_id', allow_null=False, unique_index=True)
    _ensure_reference('coupons', 'student_id', allow_null=False)
    _ensure_reference('lottery_draws', 'student_id', allow_null=False)
    _ensure_reference('user_rewards', 'student_id', allow_null=False)


def ensure_admin_accounts(conn) -> None:
    """Ensure administrator accounts defined in configuration exist and stay active."""
    cursor = conn.cursor()
    for account in settings.admin_accounts:
        password = account.password
        if settings.enable_password_hash and not is_password_hashed(password):
            password = hash_password(password)

        cursor.execute(
            '''
            INSERT INTO admins (id, password, name, role, is_active)
            VALUES (?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET
                password = excluded.password,
                name = excluded.name,
                role = excluded.role,
                is_active = excluded.is_active,
                updated_at = CURRENT_TIMESTAMP
            ''',
            (account.id, password, account.name, account.role)
        )


def migrate_user_profile_addresses(conn):
    """
    迁移用户配置文件的地址数据。
    """
    cursor = conn.cursor()
    try:
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

        logger.info("发现 %s 个用户配置需要地址数据迁移", need_migration_count)
        cursor.execute("SELECT id, name FROM addresses WHERE enabled = 1")
        address_map = {name: id for id, name in cursor.fetchall()}

        if not address_map:
            logger.warning("地址表为空，无法进行迁移")
            return

        cursor.execute("SELECT id, address_id, name FROM buildings WHERE enabled = 1")
        building_rows = cursor.fetchall()
        building_map = {}
        for building_id, address_id, building_name in building_rows:
            building_map[(address_id, building_name)] = building_id

        if not building_map:
            logger.warning("楼栋表为空，无法进行迁移")
            return

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
                address_id = address_map.get(dormitory.strip())
                if not address_id:
                    logger.warning("用户 %s 的宿舍区 '%s' 在地址表中未找到", student_id, dormitory)
                    failed_count += 1
                    continue

                building_id = building_map.get((address_id, building.strip()))
                if not building_id:
                    logger.warning("用户 %s 的楼栋 '%s' 在地址 '%s' 下未找到", student_id, building, dormitory)
                    failed_count += 1
                    continue

                cursor.execute("""
                    UPDATE user_profiles
                    SET address_id = ?, building_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE student_id = ?
                """, (address_id, building_id, student_id))
                migrated_count += 1
            except Exception as exc:
                logger.error("迁移用户 %s 地址数据失败: %s", student_id, exc)
                failed_count += 1

        conn.commit()
        logger.info("用户配置文件地址数据迁移完成: 成功 %s 个, 失败 %s 个", migrated_count, failed_count)
    except Exception as exc:
        logger.error("用户配置文件地址数据迁移失败: %s", exc)
        conn.rollback()
        raise


def migrate_chat_threads(conn):
    """
    迁移旧版聊天记录，根据时间戳智能划分会话。
    """
    try:
        from .chat import ChatLogDB

        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_logs'")
        if not cursor.fetchone():
            logger.info("聊天记录迁移：chat_logs 表不存在，跳过迁移")
            return
        try:
            ensure_table_columns(conn, 'chat_logs', {
                'thread_id': 'TEXT',
                'tool_call_id': 'TEXT'
            })
            conn.commit()
        except Exception as exc:
            logger.error("聊天记录迁移：无法添加必要的列: %s", exc)
            return

        cursor.execute("PRAGMA table_info(chat_logs)")
        columns = {row[1] for row in cursor.fetchall()}
        if 'thread_id' not in columns:
            logger.error("聊天记录迁移：thread_id 列不存在且无法添加")
            return

        ChatLogDB._ensure_chat_schema(conn)

        cursor.execute('SELECT COUNT(1) FROM chat_threads')
        has_threads = cursor.fetchone()[0] > 0
        cursor.execute('SELECT COUNT(1) FROM chat_logs WHERE thread_id IS NULL OR TRIM(COALESCE(thread_id, "")) = ""')
        pending = cursor.fetchone()[0]
        if pending == 0 and has_threads:
            logger.info("聊天记录迁移：没有需要补充 thread_id 的旧数据")
            return

        cursor.execute('''
            SELECT DISTINCT user_id, student_id
            FROM chat_logs
            WHERE thread_id IS NULL OR TRIM(COALESCE(thread_id, "")) = ""
        ''')
        owners = cursor.fetchall()
        migrated_threads = 0
        migrated_logs_count = 0

        def _build_conditions(row):
            clauses = []
            params = []
            uid = row["user_id"] if isinstance(row, sqlite3.Row) else row[0]
            sid = row["student_id"] if isinstance(row, sqlite3.Row) else row[1]
            if uid:
                clauses.append("user_id = ?")
                params.append(uid)
            if sid:
                clauses.append("student_id = ?")
                params.append(sid)
            return clauses, params, uid, sid

        SESSION_GAP_MINUTES = 30

        for owner in owners:
            clauses, params, user_id_val, student_id_val = _build_conditions(owner)
            if not clauses:
                continue
            where_sql = " OR ".join(clauses)

            cursor.execute(f'''
                SELECT id, role, content, timestamp
                FROM chat_logs
                WHERE ({where_sql}) AND (thread_id IS NULL OR TRIM(COALESCE(thread_id, "")) = "")
                ORDER BY timestamp ASC
            ''', params)
            all_logs = cursor.fetchall()

            if not all_logs:
                continue

            current_session_logs = []
            sessions = []
            last_timestamp = None

            for log in all_logs:
                log_id = log[0] if not isinstance(log, sqlite3.Row) else log["id"]
                role = log[1] if not isinstance(log, sqlite3.Row) else log["role"]
                content = log[2] if not isinstance(log, sqlite3.Row) else log["content"]
                timestamp_str = log[3] if not isinstance(log, sqlite3.Row) else log["timestamp"]

                try:
                    try:
                        current_timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                    except Exception:
                        current_timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                except Exception as exc:
                    logger.warning("无法解析时间戳 %s: %s，跳过该记录", timestamp_str, exc)
                    continue

                should_start_new_session = False
                if last_timestamp is not None:
                    time_diff = current_timestamp - last_timestamp
                    if time_diff > timedelta(minutes=SESSION_GAP_MINUTES):
                        should_start_new_session = True

                if should_start_new_session and current_session_logs:
                    sessions.append(current_session_logs[:])
                    current_session_logs = []

                current_session_logs.append({
                    'id': log_id,
                    'role': role,
                    'content': content,
                    'timestamp': current_timestamp,
                    'timestamp_str': timestamp_str
                })
                last_timestamp = current_timestamp

            if current_session_logs:
                sessions.append(current_session_logs)

            for session_logs in sessions:
                if not session_logs:
                    continue

                preview = None
                first_ts = None
                for log in session_logs:
                    if log['role'] == 'user' and log['content'] and str(log['content']).strip():
                        content = str(log['content']).strip()
                        preview = content.replace('\n', ' ').replace('\r', ' ')[:8]
                        first_ts = log['timestamp_str']
                        break
                if not first_ts and session_logs:
                    first_ts = session_logs[0]['timestamp_str']

                last_ts = session_logs[-1]['timestamp_str'] if session_logs else first_ts

                thread_id = str(uuid.uuid4())
                cursor.execute('''
                    INSERT INTO chat_threads (id, student_id, user_id, title, first_message_preview, created_at, updated_at, last_message_at)
                    VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
                ''', (
                    thread_id,
                    student_id_val,
                    user_id_val,
                    None,
                    preview,
                    first_ts,
                    last_ts,
                    last_ts
                ))

                log_ids = [log['id'] for log in session_logs]
                placeholders = ','.join('?' * len(log_ids))
                cursor.execute(f'''
                    UPDATE chat_logs
                    SET thread_id = ?
                    WHERE id IN ({placeholders})
                ''', (thread_id, *log_ids))

                migrated_threads += 1
                migrated_logs_count += len(log_ids)

        conn.commit()
        logger.info("聊天记录迁移完成：创建 %s 个会话，迁移 %s 条记录", migrated_threads, migrated_logs_count)
    except Exception as exc:
        conn.rollback()
        logger.error("聊天记录迁移失败: %s", exc)


def auto_migrate_database(conn) -> None:
    """
    自动迁移数据库结构，确保所有必需的列都存在。
    """
    ensure_user_id_schema(conn)
    table_migrations = {
        'admins': {
            'payment_qr_path': 'TEXT',
            'is_active': 'INTEGER DEFAULT 1',
            'token_version': 'INTEGER DEFAULT 0',
            'updated_at': 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'deleted_at': 'TIMESTAMP'
        },
        'products': {
            'is_active': 'INTEGER DEFAULT 1',
            'discount': 'REAL DEFAULT 10.0',
            'cost': 'REAL DEFAULT 0',
            'owner_id': 'TEXT',
            'is_hot': 'INTEGER DEFAULT 0',
            'is_not_for_sale': 'INTEGER DEFAULT 0',
            'reservation_required': 'INTEGER DEFAULT 0',
            'reservation_cutoff': 'TEXT',
            'reservation_note': 'TEXT'
        },
        'orders': {
            'payment_status': 'TEXT DEFAULT "pending"',
            'address_id': 'TEXT',
            'building_id': 'TEXT',
            'agent_id': 'TEXT',
            'is_reservation': 'INTEGER DEFAULT 0',
            'reservation_reason': 'TEXT'
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
        },
        'lottery_configs': {
            'is_enabled': 'INTEGER DEFAULT 1'
        },
        'agent_status': {
            'allow_reservation': 'INTEGER DEFAULT 0'
        },
        'chat_logs': {
            'thread_id': 'TEXT',
            'tool_call_id': 'TEXT'
        },
        'chat_threads': {
            'title': 'TEXT',
            'first_message_preview': 'TEXT',
            'last_message_at': 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
            'is_archived': 'INTEGER DEFAULT 0',
            'metadata': 'TEXT'
        }
    }
    for table_name, columns in table_migrations.items():
        ensure_table_columns(conn, table_name, columns)

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
    except sqlite3.OperationalError as exc:
        logger.warning("创建新索引时出错: %s", exc)

    cursor = conn.cursor()
    try:
        logger.info("开始修复旧配置数据的 owner_id...")
        cursor.execute("UPDATE lottery_prizes SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
        lottery_fixed = cursor.rowcount
        cursor.execute("UPDATE auto_gift_items SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
        gift_fixed = cursor.rowcount
        cursor.execute("UPDATE gift_thresholds SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
        threshold_fixed = cursor.rowcount
        cursor.execute("UPDATE coupons SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
        coupon_fixed = cursor.rowcount
        cursor.execute("UPDATE settings SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
        settings_fixed = cursor.rowcount
        conn.commit()

        if lottery_fixed + gift_fixed + threshold_fixed + coupon_fixed + settings_fixed > 0:
            logger.info(
                "修复配置数据完成: 抽奖%s项, 赠品%s项, 门槛%s项, 优惠券%s项, 设置%s项",
                lottery_fixed, gift_fixed, threshold_fixed, coupon_fixed, settings_fixed
            )
        else:
            logger.info("未发现需要修复的配置数据")
    except sqlite3.OperationalError as exc:
        logger.warning("修复配置数据时出错: %s", exc)
    except Exception as exc:
        logger.error("修复配置数据失败: %s", exc)

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
    except Exception as exc:
        logger.warning("回填抽奖归属失败: %s", exc)


def migrate_passwords_to_hash():
    """
    自动迁移明文密码到哈希格式。
    """
    if not settings.enable_password_hash:
        logger.info("密码加密功能未启用，跳过密码迁移")
        return

    logger.info("开始检查并迁移密码...")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute('SELECT id, password FROM users')
            users = cursor.fetchall()
            user_migrated_count = 0
            for row in users:
                user_id, password = row
                if password and not is_password_hashed(password):
                    try:
                        hashed = hash_password(password)
                        cursor.execute('UPDATE users SET password = ? WHERE id = ?', (hashed, user_id))
                        user_migrated_count += 1
                        logger.info("用户 %s 的密码已迁移为哈希格式", user_id)
                    except Exception as exc:
                        logger.error("迁移用户 %s 密码失败: %s", user_id, exc)

            if user_migrated_count > 0:
                conn.commit()
                logger.info("成功迁移 %s 个用户密码", user_migrated_count)
            else:
                logger.info("所有用户密码已经是哈希格式，无需迁移")
        except Exception as exc:
            logger.error("迁移用户密码时出错: %s", exc)
            conn.rollback()

        try:
            cursor.execute('SELECT id, password FROM admins')
            admins = cursor.fetchall()
            admin_migrated_count = 0
            for row in admins:
                admin_id, password = row
                if password and not is_password_hashed(password):
                    try:
                        hashed = hash_password(password)
                        cursor.execute('UPDATE admins SET password = ? WHERE id = ?', (hashed, admin_id))
                        admin_migrated_count += 1
                        logger.info("管理员/代理 %s 的密码已迁移为哈希格式", admin_id)
                    except Exception as exc:
                        logger.error("迁移管理员 %s 密码失败: %s", admin_id, exc)

            if admin_migrated_count > 0:
                conn.commit()
                logger.info("成功迁移 %s 个管理员/代理密码", admin_migrated_count)
            else:
                logger.info("所有管理员/代理密码已经是哈希格式，无需迁移")
        except Exception as exc:
            logger.error("迁移管理员密码时出错: %s", exc)
            conn.rollback()

    logger.info("密码迁移检查完成")
