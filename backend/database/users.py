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
                ''', params)
                row = cursor.fetchone()
                if not row:
                    return 0
                return int(row['count'])
            except Exception as exc:
                logger.error("统计用户数量失败: %s", exc)
                return 0

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
    def get_shipping(student_id: str) -> Optional[Dict[str, Any]]:
        """获取用户配送信息（向后兼容旧接口）。"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                SELECT name, phone, dormitory, building, room, full_address,
                       address_id, building_id, agent_id, updated_at
                FROM user_profiles
                WHERE student_id = ?
                ''',
                (student_id,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def upsert_shipping(student_id: str, profile: Dict[str, Any]) -> bool:
        """
        保存/更新配送信息（向后兼容旧接口，包装 upsert_profile）。
        """
        return UserProfileDB.upsert_profile(student_id, profile)
