import sqlite3
from typing import Any, Dict, List, Optional, Union

from .config import logger, settings
from .connection import get_db_connection
from .migrations import ensure_table_columns
from .security import hash_password, is_password_hashed, verify_password


class UserDB:
    @staticmethod
    def create_user(
        student_id: str,
        password: str,
        name: str,
        *,
        id_number: Optional[str] = None,
        id_status: int = 0
    ) -> bool:
        """创建新用户。"""
        if settings.enable_password_hash and not is_password_hashed(password):
            password = hash_password(password)

        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("PRAGMA table_info(users)")
                columns = [row[1] for row in cursor.fetchall()]

                insert_columns = ['id', 'password', 'name']
                params: List[Any] = [student_id, password, name]

                if 'id_number' in columns:
                    insert_columns.append('id_number')
                    params.append(id_number)
                if 'id_status' in columns:
                    insert_columns.append('id_status')
                    params.append(id_status)

                placeholders = ', '.join(['?'] * len(insert_columns))
                cursor.execute(
                    f"INSERT INTO users ({', '.join(insert_columns)}) VALUES ({placeholders})",
                    params
                )
                conn.commit()

                if 'user_id' in columns:
                    cursor.execute('SELECT user_id FROM users WHERE id = ?', (student_id,))
                    row = cursor.fetchone()
                    if row and (row[0] is None or row[0] == 0):
                        cursor.execute('UPDATE users SET user_id = rowid WHERE id = ?', (student_id,))
                        conn.commit()

                logger.info("成功创建用户: %s", student_id)
                return True
            except sqlite3.IntegrityError as exc:
                logger.warning("创建用户失败 - 用户已存在: %s - %s", student_id, exc)
                return False
            except Exception as exc:
                logger.error("创建用户失败 - 未知错误: %s - %s", student_id, exc)
                conn.rollback()
                return False

    @staticmethod
    def get_user(student_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE id = ?', (student_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def get_user_by_user_id(user_id: int) -> Optional[Dict]:
        if user_id is None:
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def resolve_user_reference(user_identifier: Union[str, int, None]) -> Optional[Dict[str, Any]]:
        """根据学号或 user_id 解析用户，返回 {'user_id': int, 'student_id': str}。"""
        if user_identifier is None:
            return None

        with get_db_connection() as conn:
            cursor = conn.cursor()
            if isinstance(user_identifier, int):
                cursor.execute('SELECT user_id, id FROM users WHERE user_id = ?', (user_identifier,))
            else:
                cursor.execute('SELECT user_id, id FROM users WHERE id = ?', (str(user_identifier),))

            row = cursor.fetchone()
            if not row:
                return None

            has_keys = hasattr(row, "keys")
            user_id = row["user_id"] if has_keys and "user_id" in row.keys() else row[0]
            student_id = row["id"] if has_keys and "id" in row.keys() else row[1]

            if user_id in (None, 0):
                try:
                    logger.info("用户 %s 缺少 user_id，正在修复...", student_id)
                    cursor.execute(
                        'UPDATE users SET user_id = rowid WHERE (user_id IS NULL OR user_id = 0) AND id = ?',
                        (student_id,),
                    )
                    conn.commit()
                    logger.info("已为用户 %s 修复 user_id", student_id)
                except Exception as exc:
                    logger.error("修复用户 %s 的 user_id 失败: %s", student_id, exc)
                    conn.rollback()
                    return None
                return UserDB.resolve_user_reference(student_id)

            return {"user_id": int(user_id), "student_id": student_id}

    @staticmethod
    def verify_user(student_id: str, password: str) -> Optional[Dict]:
        user = UserDB.get_user(student_id)
        if not user:
            return None

        stored_password = user['password']
        if settings.enable_password_hash:
            if is_password_hashed(stored_password):
                if verify_password(password, stored_password):
                    return user
            else:
                if stored_password == password:
                    try:
                        hashed = hash_password(password)
                        UserDB.update_user_password(student_id, hashed)
                        logger.info("用户 %s 的密码已自动升级为哈希格式", student_id)
                    except Exception as exc:
                        logger.error("自动升级用户 %s 密码失败: %s", student_id, exc)
                    return user
        else:
            if stored_password == password:
                return user
        return None

    @staticmethod
    def update_user_password(student_id: str, new_password: str) -> bool:
        if settings.enable_password_hash and not is_password_hashed(new_password):
            new_password = hash_password(new_password)

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
            except Exception as exc:
                logger.error("更新用户密码失败: %s", exc)
                return False

    @staticmethod
    def update_user_name(student_id: str, new_name: str) -> bool:
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
            except Exception as exc:
                logger.error("更新用户姓名失败: %s", exc)
                return False

    @staticmethod
    def normalize_id_status(value: Any) -> int:
        try:
            status = int(value)
            if status in (0, 1, 2):
                return status
        except Exception:
            pass
        return 0

    @staticmethod
    def update_user_identity(student_id: str, id_number: Optional[str], status: int) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                ensure_table_columns(conn, 'users', {
                    'id_number': 'CHAR(18)',
                    'id_status': 'INTEGER NOT NULL DEFAULT 0'
                })

                cursor.execute(
                    'UPDATE users SET id_number = ?, id_status = ? WHERE id = ?',
                    (id_number, status, student_id)
                )
                conn.commit()
                return cursor.rowcount > 0
            except Exception as exc:
                logger.error("更新用户身份证信息失败: %s", exc)
                return False

    @staticmethod
    def count_users() -> int:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('SELECT COUNT(id) AS count FROM users')
                row = cursor.fetchone()
                if not row:
                    return 0
                try:
                    return int(row["count"]) if hasattr(row, 'keys') and ("count" in row.keys()) else int(row[0])
                except Exception:
                    return int(row[0])
            except Exception as exc:
                logger.error("统计用户数量失败: %s", exc)
                return 0


class UserProfileDB:
    @staticmethod
    def _resolve_user_identifier(user_identifier: Union[str, int]) -> Optional[Dict[str, Any]]:
        if isinstance(user_identifier, int):
            return UserDB.resolve_user_reference(user_identifier)
        return UserDB.resolve_user_reference(user_identifier)

    @staticmethod
    def count_users_by_scope(
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        agent_id: Optional[str] = None,
        exclude_address_ids: Optional[List[str]] = None,
        exclude_building_ids: Optional[List[str]] = None
    ) -> int:
        """统计指定范围内的注册用户数量，支持排除特定地址/楼栋"""
        normalized_addresses = [aid for aid in (address_ids or []) if aid]
        normalized_buildings = [bid for bid in (building_ids or []) if bid]
        normalized_exclude_addresses = [aid for aid in (exclude_address_ids or []) if aid]
        normalized_exclude_buildings = [bid for bid in (exclude_building_ids or []) if bid]

        filters: List[str] = [
            "student_id IS NOT NULL",
            "TRIM(student_id) != ''",
            "((address_id IS NOT NULL AND TRIM(address_id) != '') OR (building_id IS NOT NULL AND TRIM(building_id) != ''))"
        ]
        params: List[Any] = []

        if agent_id:
            filters.append("agent_id = ?")
            params.append(agent_id)

        coverage_clauses: List[str] = []
        if normalized_addresses:
            placeholders = ','.join('?' * len(normalized_addresses))
            coverage_clauses.append(f"address_id IN ({placeholders})")
            params.extend(normalized_addresses)
        if normalized_buildings:
            placeholders = ','.join('?' * len(normalized_buildings))
            coverage_clauses.append(f"building_id IN ({placeholders})")
            params.extend(normalized_buildings)

        if coverage_clauses:
            filters.append('(' + ' OR '.join(coverage_clauses) + ')')
        elif agent_id:
            filters.append("agent_id IS NOT NULL AND TRIM(agent_id) != ''")

        if normalized_exclude_addresses:
            placeholders = ','.join('?' * len(normalized_exclude_addresses))
            filters.append(f"(address_id IS NULL OR address_id NOT IN ({placeholders}))")
            params.extend(normalized_exclude_addresses)
        if normalized_exclude_buildings:
            placeholders = ','.join('?' * len(normalized_exclude_buildings))
            filters.append(f"(building_id IS NULL OR building_id NOT IN ({placeholders}))")
            params.extend(normalized_exclude_buildings)

        where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""

        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(f'''
                    SELECT COUNT(DISTINCT student_id) AS count
                    FROM user_profiles
                    {where_sql}
                ''', tuple(params))
                row = cursor.fetchone()
                if not row:
                    count = 0
                elif hasattr(row, 'keys') and 'count' in row.keys():
                    count = int(row['count'] or 0)
                else:
                    count = int(row[0] or 0)
            except Exception as exc:
                logger.error("统计用户配置数量失败: %s", exc)
                return 0

        # 回退到 users 表计数，确保兼容旧数据
        if count == 0 and not agent_id and not normalized_addresses and not normalized_buildings and not normalized_exclude_addresses and not normalized_exclude_buildings:
            return UserDB.count_users()

        return count

    @staticmethod
    def get_user_profile(student_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM user_profiles WHERE student_id = ?', (student_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def update_user_profile(student_id: str, profile_data: Dict) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                fields = []
                values = []
                for key in ['name', 'phone', 'dormitory', 'building', 'room', 'full_address', 'address_id', 'building_id', 'agent_id']:
                    if key in profile_data:
                        fields.append(f"{key} = ?")
                        values.append(profile_data[key])

                if not fields:
                    return False

                fields.append("updated_at = CURRENT_TIMESTAMP")
                values.append(student_id)

                sql = f"UPDATE user_profiles SET {', '.join(fields)} WHERE student_id = ?"
                cursor.execute(sql, values)
                success = cursor.rowcount > 0
                conn.commit()
                return success
            except Exception as exc:
                logger.error("更新用户资料失败: %s", exc)
                conn.rollback()
                return False

    @staticmethod
    def update_agent(student_id: str, agent_id: Optional[str]) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    UPDATE user_profiles
                    SET agent_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE student_id = ?
                ''', (agent_id, student_id))
                conn.commit()
                return cursor.rowcount > 0
            except Exception as exc:
                logger.error("更新用户代理失败: %s", exc)
                conn.rollback()
                return False

    @staticmethod
    def upsert_profile(student_id: str, profile: Dict[str, Any]) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                fields = ['student_id']
                values: List[Any] = [student_id]
                placeholders = ['?']
                updates = []
                allowed_fields = [
                    'name', 'phone', 'dormitory', 'building', 'room', 'full_address',
                    'address_id', 'building_id', 'agent_id'
                ]
                for key in allowed_fields:
                    if key in profile:
                        fields.append(key)
                        values.append(profile[key])
                        placeholders.append('?')
                        updates.append(f"{key} = excluded.{key}")
                updates.append('updated_at = CURRENT_TIMESTAMP')

                sql = f'''
                    INSERT INTO user_profiles ({', '.join(fields)})
                    VALUES ({', '.join(placeholders)})
                    ON CONFLICT(student_id) DO UPDATE SET
                        {', '.join(updates)}
                '''
                cursor.execute(sql, values)
                conn.commit()
                return True
            except Exception as exc:
                logger.error("保存用户资料失败: %s", exc)
                conn.rollback()
                return False

    @staticmethod
    def list_profiles_by_agent(agent_id: str) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    '''
                    SELECT * FROM user_profiles
                    WHERE agent_id = ?
                    ORDER BY updated_at DESC
                    ''',
                    (agent_id,)
                )
                return [dict(row) for row in cursor.fetchall()]
            except Exception as exc:
                logger.error("获取代理 %s 的用户配置失败: %s", agent_id, exc)
                return []

    @staticmethod
    def get_shipping(user_identifier: Union[str, int]) -> Optional[Dict[str, Any]]:
        """获取用户配送信息。"""
        user_ref = UserProfileDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            return None

        with get_db_connection() as conn:
            cursor = conn.cursor()

            # 优先使用user_id查询
            cursor.execute('SELECT * FROM user_profiles WHERE user_id = ?', (user_ref['user_id'],))
            row = cursor.fetchone()

            # 如果user_id查询没有结果，尝试用student_id查询（向后兼容）
            if not row:
                cursor.execute('SELECT * FROM user_profiles WHERE student_id = ?', (user_ref['student_id'],))
                row = cursor.fetchone()

                # 如果找到了基于student_id的记录，立即迁移到user_id
                if row:
                    try:
                        cursor.execute(
                            'UPDATE user_profiles SET user_id = ? WHERE student_id = ?',
                            (user_ref['user_id'], user_ref['student_id'])
                        )
                        conn.commit()
                        logger.info("自动迁移用户配置记录: student_id=%s, user_id=%s", user_ref['student_id'], user_ref['user_id'])
                    except Exception as exc:
                        logger.warning("迁移用户配置记录失败: %s", exc)
                        conn.rollback()

            return dict(row) if row else None

    @staticmethod
    def upsert_shipping(user_identifier: Union[str, int], shipping: Dict[str, Any]) -> bool:
        """保存/更新配送信息。"""
        name = shipping.get('name')
        phone = shipping.get('phone')
        dormitory = shipping.get('dormitory')
        building = shipping.get('building')
        room = shipping.get('room')
        full_address = shipping.get('full_address')
        address_id = shipping.get('address_id')
        building_id = shipping.get('building_id')
        agent_id = shipping.get('agent_id')
        user_ref = UserProfileDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            logger.error("无法解析用户标识符: %s", user_identifier)
            return False

        user_id = user_ref['user_id']
        student_id = user_ref['student_id']

        # 验证必要的数据
        if not user_id or not student_id:
            logger.error("用户数据不完整: user_id=%s, student_id=%s", user_id, student_id)
            return False

        with get_db_connection() as conn:
            cursor = conn.cursor()

            # 优先检查user_id是否存在
            cursor.execute('SELECT student_id FROM user_profiles WHERE user_id = ?', (user_id,))
            exists = cursor.fetchone() is not None

            # 如果user_id不存在，检查student_id是否存在（向后兼容）
            if not exists:
                cursor.execute('SELECT student_id FROM user_profiles WHERE student_id = ?', (student_id,))
                exists = cursor.fetchone() is not None

                if exists:
                    # 如果找到基于student_id的记录，先更新为user_id
                    cursor.execute('''
                        UPDATE user_profiles
                        SET user_id = ?, name = ?, phone = ?, dormitory = ?, building = ?, room = ?, full_address = ?, address_id = ?, building_id = ?, agent_id = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE student_id = ?
                    ''', (user_id, name, phone, dormitory, building, room, full_address, address_id, building_id, agent_id, student_id))
                else:
                    # 创建新记录
                    cursor.execute('''
                        INSERT INTO user_profiles (student_id, user_id, name, phone, dormitory, building, room, full_address, address_id, building_id, agent_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (student_id, user_id, name, phone, dormitory, building, room, full_address, address_id, building_id, agent_id))
            else:
                # 使用user_id更新现有记录，同时确保student_id也被正确设置
                cursor.execute('''
                    UPDATE user_profiles
                    SET student_id = ?, name = ?, phone = ?, dormitory = ?, building = ?, room = ?, full_address = ?, address_id = ?, building_id = ?, agent_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                ''', (student_id, name, phone, dormitory, building, room, full_address, address_id, building_id, agent_id, user_id))

            conn.commit()
            return True
