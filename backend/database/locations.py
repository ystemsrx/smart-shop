from typing import Dict, List, Optional

from .config import logger
from .connection import get_db_connection


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
        address_id = f"addr_{int(__import__('time').time())}"
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    INSERT INTO addresses (id, name, enabled, sort_order)
                    VALUES (?, ?, ?, ?)
                ''', (address_id, name, 1 if enabled else 0, sort_order))
                conn.commit()
                return address_id
            except Exception:
                return ""

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
            except Exception:
                return False

    @staticmethod
    def delete_address(address_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('DELETE FROM buildings WHERE address_id = ?', (address_id,))
                cursor.execute('DELETE FROM agent_buildings WHERE address_id = ?', (address_id,))
                cursor.execute('DELETE FROM addresses WHERE id = ?', (address_id,))
                ok = cursor.rowcount > 0
                conn.commit()
                return ok
            except Exception as exc:
                logger.error("Failed to delete address: %s", exc)
                conn.rollback()
                return False

    @staticmethod
    def reorder(address_ids: List[str]) -> bool:
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
            except Exception as exc:
                logger.error("Failed to reorder addresses: %s", exc)
                conn.rollback()
                return False


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
        building_id = f"bld_{int(__import__('time').time())}"
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    INSERT INTO buildings (id, address_id, name, enabled, sort_order)
                    VALUES (?, ?, ?, ?, ?)
                ''', (building_id, address_id, name, 1 if enabled else 0, sort_order))
                conn.commit()
                return building_id
            except Exception:
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
            except Exception:
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
            except Exception as exc:
                logger.error("Failed to reorder buildings: %s", exc)
                conn.rollback()
                return False
