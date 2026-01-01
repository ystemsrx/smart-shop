import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from .connection import get_db_connection
from .config import logger


def _format_dt(value: datetime) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S")


class SalesCycleDB:
    @staticmethod
    def _normalize_owner(owner_type: str, owner_id: Optional[str]) -> Optional[Dict[str, str]]:
        normalized_type = (owner_type or "").strip().lower()
        if normalized_type == "admin":
            return {"owner_type": "admin", "owner_id": "admin"}
        if normalized_type == "agent":
            if not owner_id:
                return None
            return {"owner_type": "agent", "owner_id": owner_id}
        return None

    @staticmethod
    def _get_earliest_order_time() -> Optional[str]:
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT MIN(created_at) FROM orders")
                row = cursor.fetchone()
                return row[0] if row and row[0] else None
        except Exception as exc:
            logger.warning("获取最早订单时间失败: %s", exc)
            return None

    @staticmethod
    def _get_agent_created_time(agent_id: str) -> Optional[str]:
        """获取代理账号的创建时间"""
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT created_at FROM admins WHERE agent_id = ?", (agent_id,))
                row = cursor.fetchone()
                return row[0] if row and row[0] else None
        except Exception as exc:
            logger.warning("获取代理创建时间失败: %s", exc)
            return None

    @staticmethod
    def ensure_default_cycle(owner_type: str, owner_id: Optional[str]) -> Optional[Dict[str, Any]]:
        normalized = SalesCycleDB._normalize_owner(owner_type, owner_id)
        if not normalized:
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id FROM sales_cycles WHERE owner_type = ? AND owner_id = ? LIMIT 1",
                (normalized["owner_type"], normalized["owner_id"]),
            )
            if cursor.fetchone():
                return None

        # 根据 owner_type 决定默认周期起始时间
        if normalized["owner_type"] == "agent":
            # 代理：使用代理账号的创建时间
            start_time = SalesCycleDB._get_agent_created_time(normalized["owner_id"]) or _format_dt(datetime.utcnow())
        else:
            # 管理员：使用最早订单时间
            start_time = SalesCycleDB._get_earliest_order_time() or _format_dt(datetime.utcnow())
        return SalesCycleDB.create_cycle(normalized["owner_type"], normalized["owner_id"], start_time=start_time)

    @staticmethod
    def create_cycle(owner_type: str, owner_id: Optional[str], start_time: Optional[str] = None) -> Optional[Dict[str, Any]]:
        normalized = SalesCycleDB._normalize_owner(owner_type, owner_id)
        if not normalized:
            return None
        cycle_id = f"cycle_{uuid.uuid4().hex}"
        start_value = start_time or _format_dt(datetime.utcnow())
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                INSERT INTO sales_cycles (id, owner_type, owner_id, start_time)
                VALUES (?, ?, ?, ?)
                ''',
                (cycle_id, normalized["owner_type"], normalized["owner_id"], start_value),
            )
            conn.commit()
        return SalesCycleDB.get_cycle_by_id(cycle_id, normalized["owner_type"], normalized["owner_id"])

    @staticmethod
    def get_cycle_by_id(cycle_id: str, owner_type: str, owner_id: Optional[str]) -> Optional[Dict[str, Any]]:
        normalized = SalesCycleDB._normalize_owner(owner_type, owner_id)
        if not normalized:
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                SELECT * FROM sales_cycles
                WHERE id = ? AND owner_type = ? AND owner_id = ?
                ''',
                (cycle_id, normalized["owner_type"], normalized["owner_id"]),
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def get_cycle_by_id_any(cycle_id: str) -> Optional[Dict[str, Any]]:
        if not cycle_id:
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                SELECT * FROM sales_cycles
                WHERE id = ?
                ''',
                (cycle_id,),
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def end_latest_cycle(owner_type: str, owner_id: Optional[str], force: bool = False) -> Optional[Dict[str, Any]]:
        normalized = SalesCycleDB._normalize_owner(owner_type, owner_id)
        if not normalized:
            return None
        latest = SalesCycleDB.get_latest_cycle(normalized["owner_type"], normalized["owner_id"])
        if not latest:
            return None
        if latest.get("end_time") and not force:
            return latest
        end_time = _format_dt(datetime.utcnow())
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                UPDATE sales_cycles
                SET end_time = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                ''',
                (end_time, latest["id"]),
            )
            conn.commit()
        return SalesCycleDB.get_cycle_by_id(latest["id"], normalized["owner_type"], normalized["owner_id"])

    @staticmethod
    def resolve_cycle_range(owner_type: str, owner_id: Optional[str], cycle_id: Optional[str]) -> Optional[Dict[str, Optional[str]]]:
        if not cycle_id:
            return None
        cycle = SalesCycleDB.get_cycle_by_id(cycle_id, owner_type, owner_id)
        if not cycle:
            return None
        return {"start_time": cycle.get("start_time"), "end_time": cycle.get("end_time")}

    @staticmethod
    def list_cycles(owner_type: str, owner_id: Optional[str], ensure_default: bool = True) -> List[Dict[str, Any]]:
        normalized = SalesCycleDB._normalize_owner(owner_type, owner_id)
        if not normalized:
            return []
        if ensure_default:
            SalesCycleDB.ensure_default_cycle(normalized["owner_type"], normalized["owner_id"])
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                SELECT * FROM sales_cycles
                WHERE owner_type = ? AND owner_id = ?
                ORDER BY datetime(start_time) ASC
                ''',
                (normalized["owner_type"], normalized["owner_id"]),
            )
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_current_cycle(owner_type: str, owner_id: Optional[str]) -> Optional[Dict[str, Any]]:
        normalized = SalesCycleDB._normalize_owner(owner_type, owner_id)
        if not normalized:
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                SELECT * FROM sales_cycles
                WHERE owner_type = ? AND owner_id = ? AND end_time IS NULL
                ORDER BY datetime(start_time) DESC
                LIMIT 1
                ''',
                (normalized["owner_type"], normalized["owner_id"]),
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def get_latest_cycle(owner_type: str, owner_id: Optional[str]) -> Optional[Dict[str, Any]]:
        normalized = SalesCycleDB._normalize_owner(owner_type, owner_id)
        if not normalized:
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                SELECT * FROM sales_cycles
                WHERE owner_type = ? AND owner_id = ?
                ORDER BY datetime(start_time) DESC
                LIMIT 1
                ''',
                (normalized["owner_type"], normalized["owner_id"]),
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def end_current_cycle(owner_type: str, owner_id: Optional[str], pre_end_is_open: Optional[bool] = None) -> Optional[Dict[str, Any]]:
        normalized = SalesCycleDB._normalize_owner(owner_type, owner_id)
        if not normalized:
            return None
        current = SalesCycleDB.get_current_cycle(normalized["owner_type"], normalized["owner_id"])
        if not current:
            return None
        end_time = _format_dt(datetime.utcnow())
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                UPDATE sales_cycles
                SET end_time = ?, pre_end_is_open = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                ''',
                (
                    end_time,
                    1 if pre_end_is_open else 0 if pre_end_is_open is not None else None,
                    current["id"],
                ),
            )
            conn.commit()
        return SalesCycleDB.get_cycle_by_id(current["id"], normalized["owner_type"], normalized["owner_id"])

    @staticmethod
    def cancel_end(owner_type: str, owner_id: Optional[str]) -> Optional[Dict[str, Any]]:
        normalized = SalesCycleDB._normalize_owner(owner_type, owner_id)
        if not normalized:
            return None
        active = SalesCycleDB.get_current_cycle(normalized["owner_type"], normalized["owner_id"])
        if active:
            return None
        latest = SalesCycleDB.get_latest_cycle(normalized["owner_type"], normalized["owner_id"])
        if not latest or not latest.get("end_time"):
            return None
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                UPDATE sales_cycles
                SET end_time = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                ''',
                (latest["id"],),
            )
            conn.commit()
        return SalesCycleDB.get_cycle_by_id(latest["id"], normalized["owner_type"], normalized["owner_id"])

    @staticmethod
    def start_new_cycle(owner_type: str, owner_id: Optional[str]) -> Optional[Dict[str, Any]]:
        normalized = SalesCycleDB._normalize_owner(owner_type, owner_id)
        if not normalized:
            return None
        active = SalesCycleDB.get_current_cycle(normalized["owner_type"], normalized["owner_id"])
        if active:
            return None
        return SalesCycleDB.create_cycle(normalized["owner_type"], normalized["owner_id"])

    @staticmethod
    def is_locked(owner_type: str, owner_id: Optional[str], ensure_default: bool = True) -> bool:
        normalized = SalesCycleDB._normalize_owner(owner_type, owner_id)
        if not normalized:
            return False
        cycles = SalesCycleDB.list_cycles(normalized["owner_type"], normalized["owner_id"], ensure_default=ensure_default)
        if not cycles:
            return False
        active = SalesCycleDB.get_current_cycle(normalized["owner_type"], normalized["owner_id"])
        if active:
            return False
        latest = SalesCycleDB.get_latest_cycle(normalized["owner_type"], normalized["owner_id"])
        return bool(latest and latest.get("end_time"))
