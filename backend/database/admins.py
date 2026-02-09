import json
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from .config import logger, settings
from .connection import get_db_connection, safe_execute_with_migration
from .security import hash_password, is_password_hashed, verify_password


class AdminDB:
    SAFE_SUPER_ADMINS = {acc.id for acc in settings.admin_accounts if acc.role == 'super_admin'}

    @staticmethod
    def _generate_agent_id(conn) -> str:
        cursor = conn.cursor()
        base_ts = int(time.time())
        candidate = f"agent_{base_ts}"
        cursor.execute("SELECT 1 FROM admins WHERE agent_id = ? LIMIT 1", (candidate,))
        while cursor.fetchone():
            base_ts += 1
            candidate = f"agent_{base_ts}"
            cursor.execute("SELECT 1 FROM admins WHERE agent_id = ? LIMIT 1", (candidate,))
        return candidate

    @staticmethod
    def _generate_archived_account(conn, seed: Optional[str] = None) -> str:
        cursor = conn.cursor()
        base_ts = int(time.time())
        base = f"deleted{base_ts}"
        if seed:
            seed_clean = ''.join(ch for ch in seed if ch.isalnum())
            if seed_clean:
                base = f"{base}{seed_clean}"
        candidate = base
        counter = 0
        cursor.execute("SELECT 1 FROM admins WHERE id = ? LIMIT 1", (candidate,))
        while cursor.fetchone():
            counter += 1
            candidate = f"{base}{counter}"
            cursor.execute("SELECT 1 FROM admins WHERE id = ? LIMIT 1", (candidate,))
        return candidate

    @staticmethod
    def archive_agent_account(agent_id: str, account_id: Optional[str] = None) -> Optional[str]:
        if not agent_id:
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            candidate = AdminDB._generate_archived_account(conn, account_id)
            params = [candidate, agent_id]
            where_sql = "agent_id = ?"
            if account_id:
                params.append(account_id)
                where_sql = f"{where_sql} AND id = ?"
            try:
                cursor.execute(
                    f"UPDATE admins SET id = ?, updated_at = CURRENT_TIMESTAMP WHERE {where_sql}",
                    tuple(params),
                )
                if cursor.rowcount <= 0 and account_id:
                    cursor.execute(
                        "UPDATE admins SET id = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?",
                        (candidate, agent_id),
                    )
                conn.commit()
                return candidate if cursor.rowcount > 0 else None
            except Exception as exc:
                logger.error("Failed to archive agent account: %s", exc)
                return None

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
                        logger.info("Admin password auto-upgraded to hash format: %s", admin_id)
                    except Exception as exc:
                        logger.error("Failed to auto-upgrade admin password for %s: %s", admin_id, exc)
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
                logger.error("Failed to fetch admin info: %s", exc)
                return None

    @staticmethod
    def get_admin_by_agent_id(
        agent_id: str,
        include_disabled: bool = False,
        include_deleted: bool = False
    ) -> Optional[Dict[str, Any]]:
        if not agent_id:
            return None
        with get_db_connection() as conn:
            try:
                cursor = safe_execute_with_migration(
                    conn,
                    'SELECT * FROM admins WHERE agent_id = ?',
                    (agent_id,),
                    'admins'
                )
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
                logger.error("Failed to fetch agent info: %s", exc)
                return None

    @staticmethod
    def is_agent_deleted(agent_id: Optional[str]) -> bool:
        if not agent_id:
            return False
        agent = AdminDB.get_admin_by_agent_id(agent_id, include_disabled=True, include_deleted=True)
        return bool(agent and agent.get("deleted_at"))

    @staticmethod
    def get_agent_id_by_account(admin_id: str) -> Optional[str]:
        if not admin_id:
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('SELECT agent_id FROM admins WHERE id = ?', (admin_id,))
                row = cursor.fetchone()
                return row['agent_id'] if row else None
            except Exception as exc:
                logger.error("Failed to fetch agent_id: %s", exc)
                return None

    @staticmethod
    def get_account_by_agent_id(agent_id: str) -> Optional[str]:
        if not agent_id:
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('SELECT id FROM admins WHERE agent_id = ?', (agent_id,))
                row = cursor.fetchone()
                return row['id'] if row else None
            except Exception as exc:
                logger.error("Failed to fetch agent account: %s", exc)
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
                logger.error("Failed to fetch admin list: %s", exc)
                return []

    @staticmethod
    def create_admin(admin_id: str, password: str, name: str, role: str = 'agent', payment_qr_path: Optional[str] = None) -> bool:
        if settings.enable_password_hash and not is_password_hashed(password):
            password = hash_password(password)

        with get_db_connection() as conn:
            try:
                existing = AdminDB.get_admin(admin_id, include_disabled=True, include_deleted=True)
                if existing:
                    if existing.get("deleted_at") and (existing.get("role") or "").lower() == "agent":
                        AdminDB.archive_agent_account(existing.get("agent_id"), existing.get("id"))
                    else:
                        return False
                agent_id = None
                if role == 'agent':
                    agent_id = AdminDB._generate_agent_id(conn)
                safe_execute_with_migration(conn, '''
                    INSERT INTO admins (id, agent_id, password, name, role, payment_qr_path, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                ''', (admin_id, agent_id, password, name, role, payment_qr_path), 'admins')
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
                logger.error("Failed to update admin info: %s", exc)
                return False

    @staticmethod
    def update_agent_account(agent_id: str, new_account: str) -> bool:
        if not agent_id or not new_account:
            return False
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('SELECT id FROM admins WHERE id = ?', (new_account,))
                if cursor.fetchone():
                    return False
                cursor.execute(
                    'UPDATE admins SET id = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?',
                    (new_account, agent_id)
                )
                conn.commit()
                return cursor.rowcount > 0
            except Exception as exc:
                logger.error("Failed to update agent account: %s", exc)
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
                logger.error("Failed to update admin password: %s", exc)
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
                logger.error("Failed to bump admin token_version: %s", exc)
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
    def soft_delete_agent_by_agent_id(agent_id: str) -> bool:
        if not agent_id:
            return False
        admin = AdminDB.get_admin_by_agent_id(agent_id, include_disabled=True, include_deleted=True)
        if not admin:
            return False
        return AdminDB.soft_delete_admin(admin.get("id"))

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
                logger.error("Failed to update agent buildings: %s", exc)
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
                    a.id AS agent_account,
                    a.name AS agent_name,
                    a.role AS agent_role,
                    a.payment_qr_path,
                    a.is_active,
                    a.deleted_at,
                    b.name AS building_name,
                    addr.name AS address_name
                FROM agent_buildings ab
                JOIN admins a ON a.agent_id = ab.agent_id
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
            if data.get("deleted_at"):
                return None
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
            buildings = AgentAssignmentDB.get_buildings_for_agent(agent.get('agent_id'))
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
        agent_account: Optional[str],
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
                        agent_account,
                        address_ids,
                        building_ids,
                        deleted_at,
                        replacement_agent_id,
                        replacement_agent_name,
                        replaced_at
                    )
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL, NULL, NULL)
                    ON CONFLICT(agent_id) DO UPDATE SET
                        agent_name = excluded.agent_name,
                        agent_account = excluded.agent_account,
                        address_ids = excluded.address_ids,
                        building_ids = excluded.building_ids,
                        deleted_at = CURRENT_TIMESTAMP,
                        replacement_agent_id = NULL,
                        replacement_agent_name = NULL,
                        replaced_at = NULL
                    ''',
                    (
                        agent_id,
                        agent_name or agent_id,
                        agent_account or None,
                        json.dumps(normalized_addresses, ensure_ascii=False),
                        json.dumps(normalized_buildings, ensure_ascii=False)
                    )
                )
                conn.commit()
                return True
            except Exception as exc:
                logger.error("Failed to record agent deletion: %s", exc)
                conn.rollback()
                return False

    @staticmethod
    def list_active_records() -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    '''
                    SELECT agent_id, agent_name, agent_account, address_ids, building_ids, deleted_at
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
                logger.error("Failed to fetch deleted-agent records: %s", exc)
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
                logger.error("Failed to mark deleted agent as replaced: %s", exc)
                conn.rollback()
                return 0

    @staticmethod
    def inherit_deleted_agent_orders(
        address_ids: Optional[List[str]],
        building_ids: Optional[List[str]],
        new_agent_id: str,
        new_agent_name: Optional[str]
    ) -> int:
        logger.info("Deleted agent data is no longer auto-inherited by new agents: %s", new_agent_id)
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
                logger.error("Failed to fetch agent status: %s", exc)
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
                logger.error("Failed to update agent status: %s", exc)
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
                    SELECT a.agent_id as agent_id, a.id as agent_account, a.name as agent_name,
                           COALESCE(s.is_open, 1) as is_open,
                           COALESCE(s.closed_note, '') as closed_note,
                           COALESCE(s.allow_reservation, 0) as allow_reservation,
                           s.updated_at
                    FROM admins a
                    LEFT JOIN agent_status s ON a.agent_id = s.agent_id
                    WHERE a.role = 'agent'
                      AND COALESCE(a.is_active, 1) = 1
                      AND (a.deleted_at IS NULL OR a.deleted_at = '')
                    ORDER BY a.name
                ''')
                return [dict(row) for row in cursor.fetchall()]
            except Exception as exc:
                logger.error("Failed to fetch all agent statuses: %s", exc)
                return []


class PaymentQrDB:
    @staticmethod
    def is_payment_qr_filename_taken(filename: str) -> bool:
        if not filename:
            return False
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                SELECT 1
                FROM payment_qr_codes
                WHERE image_path LIKE ?
                LIMIT 1
                ''',
                (f"%/{filename}",),
            )
            return cursor.fetchone() is not None

    @staticmethod
    def get_image_path_by_filename(filename: str) -> Optional[str]:
        if not filename:
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                SELECT image_path
                FROM payment_qr_codes
                WHERE image_path LIKE ?
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
                ''',
                (f"%/{filename}",),
            )
            row = cursor.fetchone()
            if not row:
                return None
            try:
                return row["image_path"]
            except Exception:
                return row[0]

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
                agent_id = None
                if role == 'agent':
                    cursor.execute('SELECT agent_id FROM admins WHERE id = ?', (admin_id,))
                    agent_row = cursor.fetchone()
                    agent_id = agent_row['agent_id'] if agent_row else None

                owner_id = agent_id or admin_id
                cursor.execute('SELECT COUNT(*) FROM payment_qr_codes WHERE owner_id = ? AND owner_type = ?',
                             (owner_id, role))
                existing_count = cursor.fetchone()[0]

                if existing_count == 0:
                    qr_name = f"{admin_name or admin_id}的收款码"
                    PaymentQrDB.create_payment_qr(owner_id, role, qr_name, payment_qr_path)
                    migrated_count += 1

                    logger.info("Migrated payment QR for %s %s: %s", role, admin_id, payment_qr_path)

            logger.info("Payment QR migration completed, %s records migrated", migrated_count)
            return migrated_count
