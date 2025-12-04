import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from .config import logger, settings
from .connection import get_db_connection, safe_execute_with_migration
from .security import hash_password, is_password_hashed, verify_password


class AdminDB:
    SAFE_SUPER_ADMINS = {acc.id for acc in settings.admin_accounts if acc.role == 'super_admin'}

    @staticmethod
    def verify_admin(admin_id: str, password: str) -> Optional[Dict]:
        admin = AdminDB.get_admin(admin_id)
        if not admin:
            return None

        stored_password = admin.get('password')
        if not stored_password:
            return None

        if settings.enable_password_hash:
            if is_password_hashed(stored_password):
                if verify_password(password, stored_password):
                    return admin
            else:
                if stored_password == password:
                    try:
                        hashed = hash_password(password)
                        AdminDB.update_admin_password(admin_id, hashed)
                        logger.info("管理员 %s 的密码已自动升级为哈希格式", admin_id)
                    except Exception as exc:
                        logger.error("自动升级管理员 %s 密码失败: %s", admin_id, exc)
                    return admin
        else:
            if stored_password == password:
                return admin

        return None

    @staticmethod
    def get_admin(
        admin_id: str,
        include_disabled: bool = False,
        include_deleted: bool = False
    ) -> Optional[Dict[str, Any]]:
        with get_db_connection() as conn:
            try:
                cursor = safe_execute_with_migration(conn, 'SELECT * FROM admins WHERE id = ?', (admin_id,), 'admins')
                row = cursor.fetchone()
                if not row:
                    return None
                data = dict(row)
                if not include_deleted and data.get('deleted_at'):
                    return None
                if not include_disabled:
                    try:
                        if int(data.get('is_active', 1) or 1) != 1:
                            return None
                    except Exception:
                        pass
                return data
            except Exception as exc:
                logger.error("获取管理员信息失败: %s", exc)
                return None

    @staticmethod
    def list_admins(
        role: Optional[str] = None,
        include_disabled: bool = False,
        include_deleted: bool = False
    ) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            try:
                clauses = []
                params: List[Any] = []
                if role:
                    clauses.append('role = ?')
                    params.append(role)
                if not include_disabled:
                    clauses.append('(is_active IS NULL OR is_active = 1)')
                if not include_deleted:
                    clauses.append('(deleted_at IS NULL OR deleted_at = "")')
                where_sql = ('WHERE ' + ' AND '.join(clauses)) if clauses else ''
                cursor = safe_execute_with_migration(conn, f'SELECT * FROM admins {where_sql} ORDER BY created_at DESC', tuple(params), 'admins')
                rows = cursor.fetchall() or []
                results = []
                for row in rows:
                    data = dict(row)
                    if not include_deleted and data.get('deleted_at'):
                        continue
                    if not include_disabled and int(data.get('is_active', 1) or 1) != 1:
                        continue
                    results.append(data)
                return results
            except Exception as exc:
                logger.error("获取管理员列表失败: %s", exc)
                return []

    @staticmethod
    def create_admin(admin_id: str, password: str, name: str, role: str = 'agent', payment_qr_path: Optional[str] = None) -> bool:
        if settings.enable_password_hash and not is_password_hashed(password):
            password = hash_password(password)

        with get_db_connection() as conn:
            try:
                safe_execute_with_migration(conn, '''
                    INSERT INTO admins (id, password, name, role, payment_qr_path, is_active)
                    VALUES (?, ?, ?, ?, ?, 1)
                ''', (admin_id, password, name, role, payment_qr_path), 'admins')
                conn.commit()
                return True
            except Exception:
                return False

    @staticmethod
    def update_admin(admin_id: str, **fields) -> bool:
        allowed_fields = {'password', 'name', 'role', 'payment_qr_path', 'is_active', 'deleted_at'}
        updates = []
        params: List[Any] = []
        for key, value in fields.items():
            if key not in allowed_fields:
                continue
            if key == 'deleted_at':
                updates.append(f"{key} = ?")
                params.append(value)
            elif value is not None:
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
            except Exception as exc:
                logger.error("更新管理员信息失败: %s", exc)
                return False

    @staticmethod
    def update_admin_password(admin_id: str, new_password: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    'UPDATE admins SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    (new_password, admin_id)
                )
                success = cursor.rowcount > 0
                conn.commit()
                return success
            except Exception as exc:
                logger.error("更新管理员密码失败: %s", exc)
                return False

    @staticmethod
    def bump_token_version(admin_id: str) -> bool:
        if not admin_id:
            return False
        with get_db_connection() as conn:
            try:
                cursor = conn.cursor()
                cursor.execute(
                    '''
                    UPDATE admins
                    SET token_version = COALESCE(token_version, 0) + 1
                    WHERE id = ?
                    ''',
                    (admin_id,)
                )
                conn.commit()
                return cursor.rowcount > 0
            except Exception as exc:
                logger.error("提升管理员 token_version 失败: %s", exc)
                return False

    @staticmethod
    def soft_delete_admin(admin_id: str) -> bool:
        if admin_id in AdminDB.SAFE_SUPER_ADMINS:
            return False
        timestamp = datetime.utcnow().isoformat()
        success = AdminDB.update_admin(admin_id, is_active=0, deleted_at=timestamp)
        if success:
            AdminDB.bump_token_version(admin_id)
            return True

        admin = AdminDB.get_admin(admin_id, include_disabled=True, include_deleted=True)
        if not admin:
            return False
        try:
            inactive = int(admin.get('is_active', 1) or 1) != 1
        except Exception:
            inactive = str(admin.get('is_active')).strip().lower() in ('0', 'false')
        already_deleted = bool(admin.get('deleted_at'))
        if inactive or already_deleted:
            AdminDB.bump_token_version(admin_id)
            if not already_deleted:
                AdminDB.update_admin(admin_id, deleted_at=timestamp)
            return True
        return False

    @staticmethod
    def restore_admin(admin_id: str) -> bool:
        return AdminDB.update_admin(admin_id, is_active=1, deleted_at=None)


class AgentAssignmentDB:
    @staticmethod
    def set_agent_buildings(agent_id: str, building_ids: List[str]) -> bool:
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
            except Exception as exc:
                logger.error("更新代理楼栋失败: %s", exc)
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


class AgentDeletionDB:
    @staticmethod
    def _unique(values: Optional[List[Optional[str]]]) -> List[str]:
        ordered: List[str] = []
        seen: Set[str] = set()
        for value in values or []:
            if not value:
                continue
            if value in seen:
                continue
            seen.add(value)
            ordered.append(value)
        return ordered

    @staticmethod
    def record_deletion(
        agent_id: str,
        agent_name: Optional[str],
        address_ids: Optional[List[Optional[str]]],
        building_ids: Optional[List[Optional[str]]]
    ) -> bool:
        if not agent_id:
            return False
        normalized_addresses = AgentDeletionDB._unique(address_ids)
        normalized_buildings = AgentDeletionDB._unique(building_ids)
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    '''
                    INSERT INTO agent_deletions (
                        agent_id,
                        agent_name,
                        address_ids,
                        building_ids,
                        deleted_at,
                        replacement_agent_id,
                        replacement_agent_name,
                        replaced_at
                    )
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL, NULL, NULL)
                    ON CONFLICT(agent_id) DO UPDATE SET
                        agent_name = excluded.agent_name,
                        address_ids = excluded.address_ids,
                        building_ids = excluded.buildings,
                        deleted_at = CURRENT_TIMESTAMP,
                        replacement_agent_id = NULL,
                        replacement_agent_name = NULL,
                        replaced_at = NULL
                    ''',
                    (
                        agent_id,
                        agent_name or agent_id,
                        json.dumps(normalized_addresses, ensure_ascii=False),
                        json.dumps(normalized_buildings, ensure_ascii=False)
                    )
                )
                conn.commit()
                return True
            except Exception as exc:
                logger.error("记录代理删除信息失败: %s", exc)
                conn.rollback()
                return False

    @staticmethod
    def list_active_records() -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    '''
                    SELECT agent_id, agent_name, address_ids, building_ids, deleted_at
                    FROM agent_deletions
                    WHERE replaced_at IS NULL
                    ORDER BY deleted_at DESC
                    '''
                )
                rows = cursor.fetchall() or []
                results: List[Dict[str, Any]] = []
                for row in rows:
                    data = dict(row)
                    try:
                        data['address_ids'] = json.loads(data.get('address_ids') or '[]')
                    except Exception:
                        data['address_ids'] = []
                    try:
                        data['building_ids'] = json.loads(data.get('building_ids') or '[]')
                    except Exception:
                        data['building_ids'] = []
                    results.append(data)
                return results
            except Exception as exc:
                logger.error("获取删除代理记录失败: %s", exc)
                return []

    @staticmethod
    def mark_replaced_by_assignments(
        assignments: Optional[List[Dict[str, Any]]],
        replacement_agent_id: Optional[str],
        replacement_agent_name: Optional[str]
    ) -> int:
        if not assignments:
            return 0
        address_ids = AgentDeletionDB._unique([item.get('address_id') for item in assignments])
        building_ids = AgentDeletionDB._unique([item.get('building_id') for item in assignments])
        return AgentDeletionDB.mark_replaced(
            address_ids,
            building_ids,
            replacement_agent_id,
            replacement_agent_name
        )

    @staticmethod
    def mark_replaced(
        address_ids: Optional[List[str]],
        building_ids: Optional[List[str]],
        replacement_agent_id: Optional[str],
        replacement_agent_name: Optional[str]
    ) -> int:
        normalized_addresses = set(address_ids or [])
        normalized_buildings = set(building_ids or [])
        if not normalized_addresses and not normalized_buildings:
            return 0

        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    '''
                    SELECT agent_id, address_ids, building_ids
                    FROM agent_deletions
                    WHERE replaced_at IS NULL
                    '''
                )
                rows = cursor.fetchall() or []
                updated = 0
                for row in rows:
                    try:
                        record_addresses = set(json.loads(row['address_ids'] or '[]'))
                    except Exception:
                        record_addresses = set()
                    try:
                        record_buildings = set(json.loads(row['building_ids'] or '[]'))
                    except Exception:
                        record_buildings = set()
                    if not record_addresses and not record_buildings:
                        continue
                    if (normalized_addresses and record_addresses.intersection(normalized_addresses)) or \
                       (normalized_buildings and record_buildings.intersection(normalized_buildings)):
                        cursor.execute(
                            '''
                            UPDATE agent_deletions
                            SET replacement_agent_id = ?,
                                replacement_agent_name = ?,
                                replaced_at = CURRENT_TIMESTAMP
                            WHERE agent_id = ?
                            ''',
                            (replacement_agent_id, replacement_agent_name, row['agent_id'])
                        )
                        updated += cursor.rowcount
                conn.commit()
                return updated
            except Exception as exc:
                logger.error("标记删除代理已被接替失败: %s", exc)
                conn.rollback()
                return 0

    @staticmethod
    def inherit_deleted_agent_orders(
        address_ids: Optional[List[str]],
        building_ids: Optional[List[str]],
        new_agent_id: str,
        new_agent_name: Optional[str]
    ) -> int:
        normalized_addresses = set(address_ids or [])
        normalized_buildings = set(building_ids or [])
        if not normalized_addresses and not normalized_buildings:
            return 0

        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    '''
                    SELECT agent_id, address_ids, building_ids
                    FROM agent_deletions
                    WHERE replaced_at IS NULL
                    '''
                )
                rows = cursor.fetchall() or []
                total_orders_updated = 0
                deleted_agents_to_replace = []

                for row in rows:
                    try:
                        record_addresses = set(json.loads(row['address_ids'] or '[]'))
                    except Exception:
                        record_addresses = set()
                    try:
                        record_buildings = set(json.loads(row['building_ids'] or '[]'))
                    except Exception:
                        record_buildings = set()
                    if not record_addresses and not record_buildings:
                        continue

                    if (normalized_addresses and record_addresses.intersection(normalized_addresses)) or \
                       (normalized_buildings and record_buildings.intersection(normalized_buildings)):
                        deleted_agents_to_replace.append(row['agent_id'])

                if deleted_agents_to_replace:
                    for old_agent_id in deleted_agents_to_replace:
                        logger.info("开始继承代理 %s 的所有数据到 %s", old_agent_id, new_agent_id)

                        cursor.execute(
                            'UPDATE orders SET agent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?',
                            (new_agent_id, old_agent_id)
                        )
                        orders_count = cursor.rowcount
                        total_orders_updated += orders_count
                        if orders_count > 0:
                            logger.info("  - 继承订单: %s 个", orders_count)

                        cursor.execute(
                            'UPDATE products SET owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ?',
                            (new_agent_id, old_agent_id)
                        )
                        products_count = cursor.rowcount
                        if products_count > 0:
                            logger.info("  - 继承商品: %s 个", products_count)

                        cursor.execute(
                            'UPDATE payment_qr_codes SET owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND owner_type = ?',
                            (new_agent_id, old_agent_id, 'agent')
                        )
                        qr_count = cursor.rowcount
                        if qr_count > 0:
                            logger.info("  - 继承收款码: %s 个", qr_count)

                        cursor.execute(
                            'UPDATE settings SET owner_id = ? WHERE owner_id = ?',
                            (new_agent_id, old_agent_id)
                        )
                        settings_count = cursor.rowcount
                        if settings_count > 0:
                            logger.info("  - 继承配置: %s 条", settings_count)

                        cursor.execute(
                            'UPDATE lottery_prizes SET owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ?',
                            (new_agent_id, old_agent_id)
                        )
                        prizes_count = cursor.rowcount
                        if prizes_count > 0:
                            logger.info("  - 继承抽奖奖品: %s 个", prizes_count)

                        cursor.execute(
                            'SELECT * FROM lottery_configs WHERE owner_id = ?',
                            (old_agent_id,)
                        )
                        old_lottery_config = cursor.fetchone()
                        if old_lottery_config:
                            cursor.execute('SELECT * FROM lottery_configs WHERE owner_id = ?', (new_agent_id,))
                            if not cursor.fetchone():
                                cursor.execute(
                                    'INSERT INTO lottery_configs (owner_id, threshold_amount, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                                    (new_agent_id, old_lottery_config['threshold_amount'])
                                )
                                logger.info("  - 继承抽奖配置")
                            cursor.execute('DELETE FROM lottery_configs WHERE owner_id = ?', (old_agent_id,))

                        cursor.execute(
                            'UPDATE auto_gift_items SET owner_id = ? WHERE owner_id = ?',
                            (new_agent_id, old_agent_id)
                        )
                        gifts_count = cursor.rowcount
                        if gifts_count > 0:
                            logger.info("  - 继承自动赠品: %s 个", gifts_count)

                        cursor.execute(
                            'UPDATE gift_thresholds SET owner_id = ? WHERE owner_id = ?',
                            (new_agent_id, old_agent_id)
                        )
                        thresholds_count = cursor.rowcount
                        if thresholds_count > 0:
                            logger.info("  - 继承满赠阈值: %s 个", thresholds_count)

                        cursor.execute(
                            'UPDATE delivery_settings SET owner_id = ? WHERE owner_id = ?',
                            (new_agent_id, old_agent_id)
                        )
                        delivery_count = cursor.rowcount
                        if delivery_count > 0:
                            logger.info("  - 继承配送设置: %s 条", delivery_count)

                        cursor.execute(
                            'UPDATE coupons SET owner_id = ? WHERE owner_id = ?',
                            (new_agent_id, old_agent_id)
                        )
                        coupons_count = cursor.rowcount
                        if coupons_count > 0:
                            logger.info("  - 继承优惠券: %s 张", coupons_count)

                        cursor.execute(
                            'UPDATE lottery_draws SET owner_id = ? WHERE owner_id = ?',
                            (new_agent_id, old_agent_id)
                        )
                        draws_count = cursor.rowcount
                        if draws_count > 0:
                            logger.info("  - 继承抽奖记录: %s 条", draws_count)

                        cursor.execute(
                            'UPDATE user_rewards SET owner_id = ? WHERE owner_id = ?',
                            (new_agent_id, old_agent_id)
                        )
                        rewards_count = cursor.rowcount
                        if rewards_count > 0:
                            logger.info("  - 继承用户奖励: %s 条", rewards_count)

                        cursor.execute(
                            'SELECT * FROM agent_status WHERE agent_id = ?',
                            (old_agent_id,)
                        )
                        old_status = cursor.fetchone()
                        if old_status:
                            cursor.execute('SELECT * FROM agent_status WHERE agent_id = ?', (new_agent_id,))
                            if not cursor.fetchone():
                                cursor.execute(
                                    '''INSERT INTO agent_status
                                       (id, agent_id, is_open, closed_note, allow_reservation, updated_at, created_at)
                                       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)''',
                                    (new_agent_id + '_status', new_agent_id, old_status['is_open'],
                                     old_status.get('closed_note', ''), old_status.get('allow_reservation', 0))
                                )
                                logger.info("  - 继承代理状态")
                            cursor.execute('DELETE FROM agent_status WHERE agent_id = ?', (old_agent_id,))

                        cursor.execute(
                            'UPDATE user_profiles SET agent_id = ? WHERE agent_id = ?',
                            (new_agent_id, old_agent_id)
                        )
                        profiles_count = cursor.rowcount
                        if profiles_count > 0:
                            logger.info("  - 继承用户配置: %s 个", profiles_count)

                        cursor.execute(
                            '''
                            UPDATE agent_deletions
                            SET replacement_agent_id = ?,
                                replacement_agent_name = ?,
                                replaced_at = CURRENT_TIMESTAMP
                            WHERE agent_id = ?
                            ''',
                            (new_agent_id, new_agent_name or new_agent_id, old_agent_id)
                        )

                        logger.info("完成继承代理 %s 的所有数据到 %s", old_agent_id, new_agent_id)

                conn.commit()
                return total_orders_updated
            except Exception as exc:
                logger.error("继承已删除代理数据失败: %s", exc)
                conn.rollback()
                return 0


class AgentStatusDB:
    @staticmethod
    def get_agent_status(agent_id: str) -> Dict[str, Any]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    SELECT * FROM agent_status WHERE agent_id = ?
                ''', (agent_id,))
                row = cursor.fetchone()
                if row:
                    return dict(row)
                return {
                    'agent_id': agent_id,
                    'is_open': 1,
                    'closed_note': '',
                    'allow_reservation': 0,
                    'updated_at': None,
                    'created_at': None
                }
            except Exception as exc:
                logger.error("获取代理状态失败: %s", exc)
                return {
                    'agent_id': agent_id,
                    'is_open': 1,
                    'closed_note': '',
                    'allow_reservation': 0,
                    'updated_at': None,
                    'created_at': None
                }

    @staticmethod
    def update_agent_status(agent_id: str, is_open: bool, closed_note: str = '', allow_reservation: bool = False) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    INSERT INTO agent_status (id, agent_id, is_open, closed_note, allow_reservation, updated_at, created_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT(agent_id) DO UPDATE SET
                        is_open = excluded.is_open,
                        closed_note = excluded.closed_note,
                        allow_reservation = excluded.allow_reservation,
                        updated_at = CURRENT_TIMESTAMP
                ''', (
                    f"agent_status_{agent_id}",
                    agent_id,
                    1 if is_open else 0,
                    closed_note,
                    1 if allow_reservation else 0
                ))
                conn.commit()
                return True
            except Exception as exc:
                logger.error("更新代理状态失败: %s", exc)
                conn.rollback()
                return False

    @staticmethod
    def is_agent_open(agent_id: str) -> bool:
        status = AgentStatusDB.get_agent_status(agent_id)
        return bool(status.get('is_open', 1))

    @staticmethod
    def get_agent_closed_note(agent_id: str) -> str:
        status = AgentStatusDB.get_agent_status(agent_id)
        return status.get('closed_note', '')

    @staticmethod
    def get_all_agent_status() -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    SELECT a.id as agent_id, a.name as agent_name,
                           COALESCE(s.is_open, 1) as is_open,
                           COALESCE(s.closed_note, '') as closed_note,
                           COALESCE(s.allow_reservation, 0) as allow_reservation,
                           s.updated_at
                    FROM admins a
                    LEFT JOIN agent_status s ON a.id = s.agent_id
                    WHERE a.role = 'agent' AND COALESCE(a.is_active, 1) = 1
                    ORDER BY a.name
                ''')
                return [dict(row) for row in cursor.fetchall()]
            except Exception as exc:
                logger.error("获取所有代理状态失败: %s", exc)
                return []


class PaymentQrDB:
    @staticmethod
    def create_payment_qr(owner_id: str, owner_type: str, name: str, image_path: str) -> str:
        qr_id = f"qr_{int(datetime.now().timestamp() * 1000)}"

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
        return PaymentQrDB.get_payment_qrs(owner_id, owner_type, include_disabled=False)

    @staticmethod
    def get_payment_qr(qr_id: str) -> Optional[Dict[str, Any]]:
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
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM payment_qr_codes WHERE id = ?', (qr_id,))

            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def ensure_at_least_one_enabled(owner_id: str, owner_type: str) -> bool:
        enabled_qrs = PaymentQrDB.get_enabled_payment_qrs(owner_id, owner_type)
        if len(enabled_qrs) == 0:
            all_qrs = PaymentQrDB.get_payment_qrs(owner_id, owner_type, include_disabled=True)
            if all_qrs:
                PaymentQrDB.update_payment_qr_status(all_qrs[0]['id'], True)
                return True
        return len(enabled_qrs) > 0

    @staticmethod
    def get_random_enabled_qr(owner_id: str, owner_type: str) -> Optional[Dict[str, Any]]:
        import random
        enabled_qrs = PaymentQrDB.get_enabled_payment_qrs(owner_id, owner_type)
        return random.choice(enabled_qrs) if enabled_qrs else None

    @staticmethod
    def migrate_from_admin_payment_qr():
        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute('''
                SELECT id, name, role, payment_qr_path
                FROM admins
                WHERE payment_qr_path IS NOT NULL AND payment_qr_path != ''
            ''')

            rows = cursor.fetchall()
            migrated_count = 0

            for row in rows:
                admin_id, admin_name, role, payment_qr_path = row

                cursor.execute('SELECT COUNT(*) FROM payment_qr_codes WHERE owner_id = ? AND owner_type = ?',
                             (admin_id, role))
                existing_count = cursor.fetchone()[0]

                if existing_count == 0:
                    qr_name = f"{admin_name or admin_id}的收款码"
                    PaymentQrDB.create_payment_qr(admin_id, role, qr_name, payment_qr_path)
                    migrated_count += 1

                    logger.info("迁移 %s %s 的收款码: %s", role, admin_id, payment_qr_path)

            logger.info("收款码数据迁移完成，共迁移 %s 条记录", migrated_count)
            return migrated_count
