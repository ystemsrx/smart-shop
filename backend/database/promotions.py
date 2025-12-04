import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union

from .config import logger
from .connection import get_db_connection
from .users import UserDB


class LotteryConfigDB:
    """管理抽奖全局配置（如抽奖门槛）。"""

    DEFAULT_THRESHOLD: float = 10.0
    MIN_THRESHOLD: float = 0.01

    @staticmethod
    def normalize_owner(owner_id: Optional[str]) -> str:
        value = (owner_id or '').strip()
        return value or 'admin'

    @staticmethod
    def get_threshold(owner_id: Optional[str]) -> float:
        normalized = LotteryConfigDB.normalize_owner(owner_id)
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT threshold_amount FROM lottery_configs WHERE owner_id = ?',
                (normalized,)
            )
            row = cursor.fetchone()
            if not row or row[0] is None:
                return LotteryConfigDB.DEFAULT_THRESHOLD
            try:
                value = float(row[0])
            except (TypeError, ValueError):
                return LotteryConfigDB.DEFAULT_THRESHOLD
            if value < LotteryConfigDB.MIN_THRESHOLD:
                return LotteryConfigDB.DEFAULT_THRESHOLD
            return round(value, 2)

    @staticmethod
    def set_threshold(owner_id: Optional[str], threshold_amount: float) -> float:
        normalized = LotteryConfigDB.normalize_owner(owner_id)
        try:
            value = float(threshold_amount)
        except (TypeError, ValueError):
            raise ValueError('抽奖门槛必须为数字')

        if value < LotteryConfigDB.MIN_THRESHOLD:
            raise ValueError(f'抽奖门槛需不低于 {LotteryConfigDB.MIN_THRESHOLD}')

        value = round(value, 2)

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                    INSERT INTO lottery_configs (owner_id, threshold_amount, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(owner_id) DO UPDATE SET
                        threshold_amount = excluded.threshold_amount,
                        updated_at = CURRENT_TIMESTAMP
                ''',
                (normalized, value)
            )
            conn.commit()

        return value

    @staticmethod
    def get_config(owner_id: Optional[str]) -> Dict[str, Any]:
        normalized = LotteryConfigDB.normalize_owner(owner_id)
        threshold = LotteryConfigDB.get_threshold(normalized)
        is_enabled = LotteryConfigDB.get_enabled(normalized)
        return {
            'owner_id': normalized,
            'threshold_amount': threshold,
            'is_enabled': is_enabled
        }

    @staticmethod
    def get_enabled(owner_id: Optional[str]) -> bool:
        normalized = LotteryConfigDB.normalize_owner(owner_id)
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT is_enabled FROM lottery_configs WHERE owner_id = ?',
                (normalized,)
            )
            row = cursor.fetchone()
            if not row or row[0] is None:
                return True
            return bool(row[0])

    @staticmethod
    def set_enabled(owner_id: Optional[str], is_enabled: bool) -> bool:
        normalized = LotteryConfigDB.normalize_owner(owner_id)
        enabled_value = 1 if is_enabled else 0

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                    INSERT INTO lottery_configs (owner_id, threshold_amount, is_enabled, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(owner_id) DO UPDATE SET
                        is_enabled = excluded.is_enabled,
                        updated_at = CURRENT_TIMESTAMP
                ''',
                (normalized, LotteryConfigDB.get_threshold(normalized), enabled_value)
            )
            conn.commit()

        return is_enabled


class LotteryDB:
    @staticmethod
    def list_prizes(owner_id: Optional[str] = None, include_inactive: bool = False) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            where_clauses: List[str] = []
            params: List[Any] = []
            if not include_inactive:
                where_clauses.append('is_active = 1')

            if owner_id is None:
                where_clauses.append('owner_id IS NULL')
            else:
                where_clauses.append('owner_id = ?')
                params.append(owner_id)

            base_sql = 'SELECT * FROM lottery_prizes'
            if where_clauses:
                base_sql += ' WHERE ' + ' AND '.join(where_clauses)
            base_sql += ' ORDER BY created_at ASC'
            cursor.execute(base_sql, params)
            prize_rows = [dict(r) for r in (cursor.fetchall() or [])]

            if not prize_rows:
                return []

            prize_ids = [row['id'] for row in prize_rows if row.get('id')]
            item_rows: List[Dict[str, Any]] = []
            if prize_ids:
                placeholders = ','.join('?' * len(prize_ids))
                cursor.execute(
                    f'SELECT * FROM lottery_prize_items WHERE prize_id IN ({placeholders}) ORDER BY created_at ASC',
                    prize_ids
                )
                item_rows = [dict(r) for r in (cursor.fetchall() or [])]

            product_ids = {row['product_id'] for row in item_rows if row.get('product_id')}
            variant_ids = {row['variant_id'] for row in item_rows if row.get('variant_id')}

            product_map: Dict[str, Dict[str, Any]] = {}
            if product_ids:
                placeholders = ','.join('?' * len(product_ids))
                cursor.execute(f'SELECT * FROM products WHERE id IN ({placeholders})', list(product_ids))
                product_map = {row['id']: dict(row) for row in cursor.fetchall() or []}

            variant_map: Dict[str, Dict[str, Any]] = {}
            if variant_ids:
                placeholders = ','.join('?' * len(variant_ids))
                cursor.execute(f'SELECT * FROM product_variants WHERE id IN ({placeholders})', list(variant_ids))
                variant_map = {row['id']: dict(row) for row in cursor.fetchall() or []}

            prizes: List[Dict[str, Any]] = []
            prize_lookup: Dict[str, Dict[str, Any]] = {}

            for row in prize_rows:
                display_name = row.get('display_name') or row.get('prize_name') or ''
                try:
                    weight = float(row.get('weight') or 0)
                except Exception:
                    weight = 0.0
                try:
                    is_active_value = row.get('is_active')
                    if is_active_value is None:
                        active_flag = 1
                    else:
                        active_flag = 1 if int(is_active_value) == 1 else 0
                except Exception:
                    active_flag = 1
                entry: Dict[str, Any] = {
                    'id': row.get('id'),
                    'display_name': display_name,
                    'weight': weight,
                    'is_active': active_flag,
                    'created_at': row.get('created_at'),
                    'updated_at': row.get('updated_at'),
                    'items': [],
                    'total_item_count': 0,
                    'available_item_count': 0,
                    'total_available_stock': 0,
                    'issues': [],
                    '_issue_set': set(),
                }
                prizes.append(entry)
                prize_lookup[entry['id']] = entry

            for row in item_rows:
                prize_id = row.get('prize_id')
                entry = prize_lookup.get(prize_id)
                if not entry:
                    continue

                product_id = row.get('product_id')
                variant_id = row.get('variant_id')
                product = product_map.get(product_id)
                variant = variant_map.get(variant_id) if variant_id else None

                product_name = product.get('name') if product else None
                variant_name = variant.get('name') if variant else None

                raw_is_active = (product or {}).get('is_active', 1)
                if isinstance(raw_is_active, bool):
                    is_active = 1 if raw_is_active else 0
                elif isinstance(raw_is_active, (int, float)):
                    is_active = 1 if int(raw_is_active) != 0 else 0
                elif isinstance(raw_is_active, str):
                    normalized_flag = raw_is_active.strip().lower()
                    if normalized_flag in {'1', 'true', 'yes', 'on', 'active'}:
                        is_active = 1
                    elif normalized_flag in {'0', 'false', 'no', 'off', 'inactive'}:
                        is_active = 0
                    else:
                        try:
                            is_active = 1 if float(normalized_flag) != 0 else 0
                        except Exception:
                            is_active = 1
                else:
                    is_active = 1

                if variant:
                    try:
                        stock = int(variant.get('stock') or 0)
                    except Exception:
                        stock = 0
                else:
                    try:
                        stock = int((product or {}).get('stock') or 0)
                    except Exception:
                        stock = 0

                try:
                    base_price = float((product or {}).get('price') or 0)
                except Exception:
                    base_price = 0.0
                try:
                    discount = float((product or {}).get('discount', 10.0) or 10.0)
                except Exception:
                    discount = 10.0
                retail_price = round(base_price * (discount / 10.0), 2)

                available = bool(product) and bool(is_active) and stock > 0

                info = {
                    'id': row.get('id'),
                    'prize_id': prize_id,
                    'product_id': product_id,
                    'variant_id': variant_id,
                    'product_name': product_name,
                    'variant_name': variant_name,
                    'is_active': bool(is_active),
                    'stock': max(0, stock),
                    'retail_price': retail_price,
                    'available': available,
                    'img_path': (product or {}).get('img_path'),
                    'category': (product or {}).get('category'),
                }

                entry['items'].append(info)
                entry['total_item_count'] += 1
                if available:
                    entry['available_item_count'] += 1
                    entry['total_available_stock'] += max(0, stock)
                else:
                    if not product:
                        entry['_issue_set'].add('关联商品不存在')
                    elif not is_active:
                        entry['_issue_set'].add(f"{product_name} 已下架")
                    else:
                        suffix = f"（{variant_name}）" if variant_name else ''
                        entry['_issue_set'].add(f"{product_name}{suffix} 库存不足")

            for entry in prizes:
                issues = entry.pop('_issue_set', set())
                entry['issues'] = list(issues)
                entry['available'] = entry['available_item_count'] > 0
                entry['items'].sort(key=lambda x: ((x.get('product_name') or ''), (x.get('variant_name') or '')))

            return prizes

    @staticmethod
    def get_active_prizes_for_draw(owner_id: Optional[str]) -> List[Dict[str, Any]]:
        prizes = LotteryDB.list_prizes(owner_id=owner_id, include_inactive=False)
        active: List[Dict[str, Any]] = []
        for prize in prizes:
            if prize.get('weight', 0) <= 0:
                continue
            items = [dict(item) for item in prize.get('items', [])]
            if not items:
                continue
            active.append({
                'id': prize.get('id'),
                'display_name': prize.get('display_name') or '',
                'weight': float(prize.get('weight') or 0),
                'items': items,
            })
        return active

    @staticmethod
    def upsert_prize(
        prize_id: Optional[str],
        display_name: str,
        weight: float,
        is_active: bool,
        items: List[Dict[str, Any]],
        owner_id: Optional[str]
    ) -> str:
        if not display_name:
            raise ValueError('抽奖奖项名称不能为空')
        prize_id = prize_id or f"lprize_{int(datetime.now().timestamp()*1000)}"
        try:
            weight_value = float(weight)
        except Exception:
            weight_value = 0.0
        active_flag = 1 if is_active else 0
        normalized_items: List[Dict[str, Any]] = []
        for item in items or []:
            product_id = item.get('product_id')
            if not product_id:
                continue
            variant_id = item.get('variant_id') or None
            item_id = item.get('id') or f"lpitem_{uuid.uuid4().hex}"
            normalized_items.append({
                'id': item_id,
                'product_id': product_id,
                'variant_id': variant_id,
            })

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT owner_id FROM lottery_prizes WHERE id = ?', (prize_id,))
            existing = cursor.fetchone()
            if existing:
                existing_owner = existing['owner_id'] if isinstance(existing, sqlite3.Row) else existing[0]
                if (owner_id is None and existing_owner is not None) or (owner_id is not None and existing_owner != owner_id):
                    raise ValueError('无权编辑该抽奖奖项')

                owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
                params = [display_name, weight_value, active_flag, prize_id]
                if owner_id is not None:
                    params.append(owner_id)

                cursor.execute(
                    f'''
                        UPDATE lottery_prizes
                        SET display_name = ?, weight = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ? AND {owner_condition}
                    ''',
                    params
                )
                if cursor.rowcount == 0:
                    raise ValueError('无权编辑该抽奖奖项')
            else:
                cursor.execute('''
                    INSERT INTO lottery_prizes (id, display_name, weight, is_active, owner_id)
                    VALUES (?, ?, ?, ?, ?)
                ''', (prize_id, display_name, weight_value, active_flag, owner_id))

            cursor.execute('DELETE FROM lottery_prize_items WHERE prize_id = ?', (prize_id,))
            for item in normalized_items:
                cursor.execute('''
                    INSERT INTO lottery_prize_items (id, prize_id, product_id, variant_id)
                    VALUES (?, ?, ?, ?)
                ''', (item['id'], prize_id, item['product_id'], item['variant_id']))
            conn.commit()
            return prize_id

    @staticmethod
    def delete_prize(prize_id: str, owner_id: Optional[str]) -> bool:
        if not prize_id:
            return False
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            owner_param: Tuple[Any, ...] = tuple() if owner_id is None else (owner_id,)
            cursor.execute(
                f'''DELETE FROM lottery_prize_items
                    WHERE prize_id IN (
                        SELECT id FROM lottery_prizes WHERE id = ? AND {owner_condition}
                    )''',
                (prize_id, *owner_param)
            )
            cursor.execute(
                f'DELETE FROM lottery_prizes WHERE id = ? AND {owner_condition}',
                (prize_id, *owner_param)
            )
            deleted = cursor.rowcount or 0
            conn.commit()
            return deleted > 0

    @staticmethod
    def delete_prizes_not_in(valid_ids: List[str], owner_id: Optional[str]) -> int:
        ids = list({pid for pid in valid_ids if pid})
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            owner_param: Tuple[Any, ...] = tuple() if owner_id is None else (owner_id,)
            if ids:
                placeholders = ','.join('?' * len(ids))
                cursor.execute(
                    f'''DELETE FROM lottery_prize_items
                        WHERE prize_id IN (
                            SELECT id FROM lottery_prizes WHERE id NOT IN ({placeholders}) AND {owner_condition}
                        )''',
                    (*ids, *owner_param)
                )
                cursor.execute(
                    f'DELETE FROM lottery_prizes WHERE id NOT IN ({placeholders}) AND {owner_condition}',
                    (*ids, *owner_param)
                )
            else:
                cursor.execute(
                    f'''DELETE FROM lottery_prize_items
                        WHERE prize_id IN (
                            SELECT id FROM lottery_prizes WHERE {owner_condition}
                        )''',
                    owner_param
                )
                cursor.execute(
                    f'DELETE FROM lottery_prizes WHERE {owner_condition}',
                    owner_param
                )
            affected = cursor.rowcount or 0
            conn.commit()
            return affected

    @staticmethod
    def get_draw_by_order(order_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM lottery_draws WHERE order_id = ?', (order_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def create_draw(
        order_id: str,
        student_id: str,
        prize_name: str,
        prize_product_id: Optional[str] = None,
        prize_quantity: int = 1,
        *,
        owner_id: Optional[str] = None,
        prize_group_id: Optional[str] = None,
        prize_product_name: Optional[str] = None,
        prize_variant_id: Optional[str] = None,
        prize_variant_name: Optional[str] = None,
        prize_unit_price: Optional[float] = None
    ) -> str:
        draw_id = f"lot_{int(datetime.now().timestamp()*1000)}"
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO lottery_draws (
                    id,
                    order_id,
                    student_id,
                    prize_name,
                    prize_product_id,
                    prize_quantity,
                    owner_id,
                    prize_group_id,
                    prize_product_name,
                    prize_variant_id,
                    prize_variant_name,
                    prize_unit_price
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                draw_id,
                order_id,
                student_id,
                prize_name,
                prize_product_id,
                prize_quantity,
                owner_id,
                prize_group_id,
                prize_product_name,
                prize_variant_id,
                prize_variant_name,
                float(prize_unit_price or 0.0)
            ))
            conn.commit()
            return draw_id

    @staticmethod
    def list_draws(student_id: Optional[str] = None, limit: int = 20) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            params: List[Any] = []
            where = ''
            if student_id:
                where = 'WHERE student_id = ?'
                params.append(student_id)
            cursor.execute(
                f'''SELECT * FROM lottery_draws {where}
                    ORDER BY drawn_at DESC, id DESC
                    LIMIT ?''',
                (*params, limit)
            )
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def delete_draw(draw_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM lottery_draws WHERE id = ?', (draw_id,))
            conn.commit()
            return cursor.rowcount > 0


class AutoGiftDB:
    @staticmethod
    def list_items(owner_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            params: List[Any] = []
            clause = ''
            if owner_id is None:
                clause = 'WHERE owner_id IS NULL'
            else:
                clause = 'WHERE owner_id = ?'
                params.append(owner_id)
            cursor.execute(
                f'''
                    SELECT agi.*, p.name as product_name, p.img_path, p.category, p.stock, p.is_active, p.price as product_price, p.discount,
                           pv.name as variant_name, pv.stock as variant_stock
                    FROM auto_gift_items agi
                    LEFT JOIN products p ON agi.product_id = p.id
                    LEFT JOIN product_variants pv ON agi.variant_id = pv.id
                    {clause}
                    ORDER BY agi.created_at ASC
                ''',
                params
            )

            rows = cursor.fetchall() or []
            items: List[Dict[str, Any]] = []
            for row in rows:
                item_dict = dict(row)
                if item_dict.get('variant_id'):
                    stock = int(item_dict.get('variant_stock') or 0)
                else:
                    stock = int(item_dict.get('stock') or 0)

                try:
                    base_price = float(item_dict.get('product_price') or 0)
                    discount = float(item_dict.get('discount') or 10.0)
                    retail_price = round(base_price * (discount / 10.0), 2)
                except (TypeError, ValueError):
                    retail_price = 0.0

                raw_is_active = item_dict.get('is_active')
                if raw_is_active is None:
                    is_active = True
                else:
                    is_active = int(raw_is_active) == 1

                item_dict['is_active'] = is_active
                item_dict['available'] = is_active and stock > 0
                item_dict['stock'] = stock
                item_dict['price'] = retail_price
                items.append(item_dict)

            return items

    @staticmethod
    def add_item(owner_id: Optional[str], product_id: str, variant_id: Optional[str] = None) -> str:
        item_id = f"ag_{uuid.uuid4().hex}"
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO auto_gift_items (id, product_id, variant_id, owner_id)
                VALUES (?, ?, ?, ?)
            ''', (item_id, product_id, variant_id, owner_id))
            conn.commit()
            return item_id

    @staticmethod
    def delete_item(item_id: str, owner_id: Optional[str]) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            params: List[Any] = [item_id]
            if owner_id is not None:
                params.append(owner_id)
            cursor.execute(
                f'DELETE FROM auto_gift_items WHERE id = ? AND {owner_condition}',
                params
            )
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def clear_all(owner_id: Optional[str]) -> int:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            params: List[Any] = []
            if owner_id is not None:
                params.append(owner_id)
            cursor.execute(f'DELETE FROM auto_gift_items WHERE {owner_condition}', params)
            deleted = cursor.rowcount or 0
            conn.commit()
            return deleted


class RewardDB:
    @staticmethod
    def _resolve_user_identifier(user_identifier: Union[str, int]) -> Optional[Dict[str, Any]]:
        if isinstance(user_identifier, int):
            return UserDB.resolve_user_reference(user_identifier)
        return UserDB.resolve_user_reference(user_identifier)

    @staticmethod
    def list_rewards(
        student_id: Optional[str] = None,
        owner_id: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            clauses: List[str] = []
            params: List[Any] = []

            if student_id:
                clauses.append('student_id = ?')
                params.append(student_id)

            if owner_id is None:
                clauses.append('(owner_id IS NULL OR TRIM(owner_id) = "")')
            else:
                clauses.append('owner_id = ?')
                params.append(owner_id)

            if status:
                clauses.append('status = ?')
                params.append(status)

            where_sql = ' WHERE ' + ' AND '.join(clauses) if clauses else ''
            cursor.execute(
                f'''
                SELECT * FROM user_rewards
                {where_sql}
                ORDER BY created_at DESC
                ''',
                params
            )
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def create_reward(
        user_identifier: Union[str, int],
        source_order_id: str,
        prize_name: str,
        quantity: int = 1,
        *,
        owner_id: Optional[str] = None,
        prize_product_id: Optional[str] = None,
        prize_product_name: Optional[str] = None,
        prize_variant_id: Optional[str] = None,
        prize_variant_name: Optional[str] = None,
        prize_unit_price: Optional[float] = None,
        prize_group_id: Optional[str] = None
    ) -> Optional[str]:
        user_ref = RewardDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            return None

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT id FROM user_rewards WHERE source_order_id = ?', (source_order_id,))
            exists = cursor.fetchone()
            if exists:
                return None
            try:
                normalized_owner = LotteryConfigDB.normalize_owner(owner_id)
            except Exception:
                normalized_owner = owner_id.strip() if isinstance(owner_id, str) and owner_id.strip() else 'admin'

            rid = f"rwd_{int(datetime.now().timestamp()*1000)}"
            user_id = user_ref['user_id']
            student_id = user_ref['student_id']

            cursor.execute('''
                INSERT INTO user_rewards (
                    id,
                    student_id,
                    user_id,
                    prize_name,
                    prize_product_id,
                    prize_product_name,
                    prize_variant_id,
                    prize_variant_name,
                    prize_unit_price,
                    owner_id,
                    prize_group_id,
                    prize_quantity,
                    source_order_id,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'eligible')
            ''', (
                rid,
                student_id,
                user_id,
                prize_name,
                prize_product_id,
                prize_product_name,
                prize_variant_id,
                prize_variant_name,
                float(prize_unit_price or 0.0),
                normalized_owner,
                prize_group_id,
                int(quantity or 1),
                source_order_id
            ))
            conn.commit()
            return rid

    @staticmethod
    def get_eligible_rewards(
        user_identifier: Union[str, int],
        owner_id: Optional[str] = None,
        restrict_owner: bool = False
    ) -> List[Dict]:
        user_ref = RewardDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            return []

        with get_db_connection() as conn:
            cursor = conn.cursor()

            clauses = [
                '(ur.user_id = ? OR ur.student_id = ?)',
                "ur.status = 'eligible'"
            ]
            params: List[Any] = [user_ref['user_id'], user_ref['student_id']]

            if restrict_owner:
                normalized_owner = None
                if owner_id is None or (isinstance(owner_id, str) and owner_id.strip() == ''):
                    normalized_owner = None
                else:
                    try:
                        normalized_owner = LotteryConfigDB.normalize_owner(owner_id)
                    except Exception:
                        normalized_owner = owner_id.strip() if isinstance(owner_id, str) else None

                if normalized_owner is None:
                    clauses.append('(ur.owner_id IS NULL OR TRIM(ur.owner_id) = "")')
                elif normalized_owner == 'admin':
                    clauses.append('(ur.owner_id = ? OR ur.owner_id IS NULL OR TRIM(ur.owner_id) = "")')
                    params.append(normalized_owner)
                else:
                    clauses.append('ur.owner_id = ?')
                    params.append(normalized_owner)

            query = '''
                SELECT ur.*, p.img_path as prize_img_path
                FROM user_rewards ur
                LEFT JOIN products p ON ur.prize_product_id = p.id
                WHERE ''' + ' AND '.join(clauses) + ' ORDER BY ur.created_at ASC'
            cursor.execute(query, params)
            return [dict(r) for r in cursor.fetchall()]

    @staticmethod
    def consume_rewards(
        user_identifier: Union[str, int],
        reward_ids: List[str],
        consumed_order_id: str,
        owner_id: Optional[str] = None
    ) -> int:
        if not reward_ids:
            return 0

        user_ref = UserDB.resolve_user_reference(user_identifier)
        if not user_ref:
            logger.warning("无法解析用户标识符: %s", user_identifier)
            return 0
        student_id = user_ref['student_id']

        with get_db_connection() as conn:
            cursor = conn.cursor()
            placeholders = ','.join('?' * len(reward_ids))
            try:
                normalized_owner = None
                if owner_id is None or (isinstance(owner_id, str) and owner_id.strip() == ''):
                    normalized_owner = None
                else:
                    try:
                        normalized_owner = LotteryConfigDB.normalize_owner(owner_id)
                    except Exception:
                        normalized_owner = owner_id.strip() if isinstance(owner_id, str) else None

                if normalized_owner is None:
                    owner_condition = '(owner_id IS NULL OR TRIM(owner_id) = "")'
                    params: List[Any] = [consumed_order_id, *reward_ids, student_id]
                elif normalized_owner == 'admin':
                    owner_condition = '(owner_id = ? OR owner_id IS NULL OR TRIM(owner_id) = "")'
                    params = [consumed_order_id, *reward_ids, student_id, normalized_owner]
                else:
                    owner_condition = 'owner_id = ?'
                    params = [consumed_order_id, *reward_ids, student_id, normalized_owner]
                query = f'''UPDATE user_rewards
                             SET status = 'consumed', consumed_order_id = ?, updated_at = CURRENT_TIMESTAMP
                             WHERE id IN ({placeholders}) AND student_id = ? AND status = 'eligible' AND {owner_condition} '''
                cursor.execute(query, params)
                affected = cursor.rowcount or 0
                conn.commit()
                return affected
            except Exception as exc:
                logger.error("消费奖品失败: %s", exc)
                conn.rollback()
                return 0

    @staticmethod
    def cancel_rewards_by_orders(order_ids: List[str]) -> int:
        if not order_ids:
            return 0
        with get_db_connection() as conn:
            cursor = conn.cursor()
            placeholders = ','.join('?' * len(order_ids))
            try:
                cursor.execute(f"""
                    UPDATE user_rewards
                    SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                    WHERE source_order_id IN ({placeholders}) AND status = 'eligible'
                """, order_ids)
                cnt = cursor.rowcount or 0
                conn.commit()
                return cnt
            except Exception as exc:
                logger.error("取消关联奖励失败: %s", exc)
                conn.rollback()
                return 0


class CouponDB:
    @staticmethod
    def _resolve_user_identifier(user_identifier: Union[str, int]) -> Optional[Dict[str, Any]]:
        if isinstance(user_identifier, int):
            return UserDB.resolve_user_reference(user_identifier)
        return UserDB.resolve_user_reference(user_identifier)

    @staticmethod
    def issue_coupons(
        user_identifier: Union[str, int],
        amount: float,
        quantity: int = 1,
        expires_at: Optional[str] = None,
        owner_id: Optional[str] = None
    ) -> List[str]:
        if quantity <= 0:
            return []

        user_ref = CouponDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            return []

        ids: List[str] = []
        user_id = user_ref['user_id']
        student_id = user_ref['student_id']

        with get_db_connection() as conn:
            cursor = conn.cursor()
            for i in range(quantity):
                cid = f"cpn_{int(datetime.now().timestamp()*1000)}_{i}"
                try:
                    cursor.execute('''
                        INSERT INTO coupons (id, student_id, user_id, amount, expires_at, status, owner_id)
                        VALUES (?, ?, ?, ?, ?, 'active', ?)
                    ''', (cid, student_id, user_id, float(amount), expires_at, owner_id))
                    ids.append(cid)
                except Exception:
                    pass
            conn.commit()
        return ids

    @staticmethod
    def list_all(user_identifier: Optional[Union[str, int]] = None, owner_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            clauses = []
            params: List[Any] = []

            if user_identifier is not None:
                user_ref = CouponDB._resolve_user_identifier(user_identifier)
                if user_ref:
                    clauses.append('(c.user_id = ? OR c.student_id = ?)')
                    params.extend([user_ref['user_id'], user_ref['student_id']])
                else:
                    return []

            if owner_id is None:
                clauses.append('c.owner_id IS NULL')
            else:
                clauses.append('c.owner_id = ?')
                params.append(owner_id)

            query = '''
                SELECT c.*, u.name as user_name
                FROM coupons c
                LEFT JOIN users u ON c.student_id = u.id
            '''
            if clauses:
                query += ' WHERE ' + ' AND '.join(clauses)
            query += ' ORDER BY c.created_at DESC'
            cursor.execute(query, params)
            rows = cursor.fetchall() or []
            items = [dict(r) for r in rows]
            now = datetime.now()
            for it in items:
                exp = it.get('expires_at')
                it['expired'] = False
                try:
                    if exp:
                        dt = datetime.fromisoformat(exp) if isinstance(exp, str) else exp
                        if isinstance(dt, str):
                            try:
                                dt = datetime.strptime(dt, "%Y-%m-%d %H:%M:%S")
                            except Exception:
                                dt = None
                        if dt and dt < now:
                            it['expired'] = True
                except Exception:
                    it['expired'] = False
            return items

    @staticmethod
    def get_active_for_student(
        student_id: str,
        owner_id: Optional[str] = None,
        restrict_owner: bool = False
    ) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            clauses = [
                'student_id = ?',
                "status = 'active'",
                '(locked_order_id IS NULL OR TRIM(locked_order_id) = "")'
            ]
            params: List[Any] = [student_id]
            if restrict_owner:
                if owner_id is None:
                    clauses.append('owner_id IS NULL')
                else:
                    clauses.append('owner_id = ?')
                    params.append(owner_id)
            query = 'SELECT * FROM coupons WHERE ' + ' AND '.join(clauses) + ' ORDER BY created_at DESC'
            cursor.execute(query, params)
            items = [dict(r) for r in cursor.fetchall()]
            now = datetime.now()
            filtered: List[Dict[str, Any]] = []
            for it in items:
                exp = it.get('expires_at')
                if not exp:
                    filtered.append(it)
                    continue
                dt = None
                try:
                    dt = datetime.fromisoformat(exp) if isinstance(exp, str) else exp
                except Exception:
                    try:
                        dt = datetime.strptime(exp, "%Y-%m-%d %H:%M:%S") if isinstance(exp, str) else None
                    except Exception:
                        dt = None
                if (dt is None) or (dt >= now):
                    filtered.append(it)
            return filtered

    @staticmethod
    def get_by_id(coupon_id: str) -> Optional[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM coupons WHERE id = ?', (coupon_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def revoke(coupon_id: str, owner_id: Optional[str]) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            params: List[Any] = [coupon_id]
            if owner_id is not None:
                params.append(owner_id)
            cursor.execute(
                f'UPDATE coupons SET status = "revoked", revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = "active" AND {owner_condition}',
                params
            )
            ok = cursor.rowcount > 0
            conn.commit()
            return ok

    @staticmethod
    def delete_coupon(coupon_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'UPDATE coupons SET status = "used", used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                (coupon_id,)
            )
            ok = cursor.rowcount > 0
            conn.commit()
            return ok

    @staticmethod
    def permanently_delete_coupon(coupon_id: str, owner_id: Optional[str]) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            params: List[Any] = [coupon_id]
            if owner_id is not None:
                params.append(owner_id)
            cursor.execute(
                f'DELETE FROM coupons WHERE id = ? AND status = "revoked" AND {owner_condition}',
                params
            )
            ok = cursor.rowcount > 0
            conn.commit()
            return ok

    @staticmethod
    def check_valid_for_student(coupon_id: str, user_identifier: Union[str, int], owner_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        user_ref = CouponDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            return None

        c = CouponDB.get_by_id(coupon_id)
        if not c:
            return None

        coupon_user_id = c.get('user_id')
        coupon_student_id = c.get('student_id')

        if coupon_user_id and coupon_user_id == user_ref['user_id']:
            pass
        elif coupon_student_id and coupon_student_id == user_ref['student_id']:
            pass
        else:
            return None
        existing_owner = c.get('owner_id')
        if owner_id is None:
            if existing_owner not in (None, '', 'null'):
                return None
        else:
            if existing_owner != owner_id:
                return None
        if (c.get('status') or 'active') != 'active':
            return None
        try:
            locked = c.get('locked_order_id')
            if locked and str(locked).strip() != '':
                return None
        except Exception:
            pass
        exp = c.get('expires_at')
        if exp:
            try:
                dt = datetime.fromisoformat(exp) if isinstance(exp, str) else exp
            except Exception:
                try:
                    dt = datetime.strptime(exp, "%Y-%m-%d %H:%M:%S") if isinstance(exp, str) else None
                except Exception:
                    dt = None
            if dt and dt < datetime.now():
                return None
        return c

    @staticmethod
    def lock_for_order(coupon_id: str, order_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    UPDATE coupons
                    SET locked_order_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND status = 'active' AND (locked_order_id IS NULL OR TRIM(locked_order_id) = '')
                ''', (order_id, coupon_id))
                ok = cursor.rowcount > 0
                conn.commit()
                return ok
            except Exception as exc:
                logger.error("锁定优惠券失败: %s", exc)
                conn.rollback()
                return False

    @staticmethod
    def unlock_for_order(coupon_id: str, order_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    UPDATE coupons
                    SET locked_order_id = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND locked_order_id = ? AND status = 'active'
                ''', (coupon_id, order_id))
                ok = cursor.rowcount > 0
                conn.commit()
                return ok
            except Exception as exc:
                logger.error("解锁优惠券失败: %s", exc)
                conn.rollback()
                return False


class DeliverySettingsDB:
    @staticmethod
    def get_settings(owner_id: Optional[str]) -> Dict[str, Any]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            where_clauses = ['is_active = 1']
            params = []

            if owner_id is None:
                where_clauses.append('owner_id IS NULL')
            else:
                where_clauses.append('owner_id = ?')
                params.append(owner_id)

            query = 'SELECT * FROM delivery_settings WHERE ' + ' AND '.join(where_clauses) + ' ORDER BY created_at DESC LIMIT 1'
            cursor.execute(query, params)
            row = cursor.fetchone()

            if row:
                return dict(row)
            return {
                'id': None,
                'delivery_fee': 1.0,
                'free_delivery_threshold': 10.0,
                'is_active': True,
                'owner_id': owner_id
            }

    @staticmethod
    def create_or_update_settings(
        owner_id: Optional[str],
        delivery_fee: float,
        free_delivery_threshold: float
    ) -> str:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            where_clauses = []
            params = []
            if owner_id is None:
                where_clauses.append('owner_id IS NULL')
            else:
                where_clauses.append('owner_id = ?')
                params.append(owner_id)

            query = 'SELECT id FROM delivery_settings WHERE ' + ' AND '.join(where_clauses) + ' LIMIT 1'
            cursor.execute(query, params)
            existing = cursor.fetchone()

            if existing:
                setting_id = existing['id']
                cursor.execute('''
                    UPDATE delivery_settings
                    SET delivery_fee = ?, free_delivery_threshold = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (delivery_fee, free_delivery_threshold, setting_id))
            else:
                setting_id = f"delivery_{uuid.uuid4().hex}"
                cursor.execute('''
                    INSERT INTO delivery_settings
                    (id, delivery_fee, free_delivery_threshold, is_active, owner_id)
                    VALUES (?, ?, ?, 1, ?)
                ''', (setting_id, delivery_fee, free_delivery_threshold, owner_id))

            conn.commit()
            return setting_id

    @staticmethod
    def get_delivery_config(owner_id: Optional[str]) -> Dict[str, Any]:
        settings = DeliverySettingsDB.get_settings(owner_id)
        return {
            'delivery_fee': float(settings.get('delivery_fee', 1.0)),
            'free_delivery_threshold': float(settings.get('free_delivery_threshold', 10.0))
        }


class GiftThresholdDB:
    @staticmethod
    def list_all(owner_id: Optional[str], include_inactive: bool = False) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            where_clauses: List[str] = []
            params: List[Any] = []
            if not include_inactive:
                where_clauses.append('is_active = 1')
            if owner_id is None:
                where_clauses.append('owner_id IS NULL')
            else:
                where_clauses.append('owner_id = ?')
                params.append(owner_id)

            query = 'SELECT * FROM gift_thresholds'
            if where_clauses:
                query += ' WHERE ' + ' AND '.join(where_clauses)
            query += ' ORDER BY threshold_amount ASC, sort_order ASC'

            cursor.execute(query, params)
            rows = cursor.fetchall() or []

            thresholds = []
            for row in rows:
                threshold_dict = dict(row)
                threshold_id = threshold_dict['id']
                cursor.execute('''
                    SELECT gti.*, p.name as product_name, p.img_path, p.category, p.stock, p.is_active, p.price as product_price, p.discount,
                           pv.name as variant_name, pv.stock as variant_stock
                    FROM gift_threshold_items gti
                    LEFT JOIN products p ON gti.product_id = p.id
                    LEFT JOIN product_variants pv ON gti.variant_id = pv.id
                    WHERE gti.threshold_id = ?
                    ORDER BY gti.created_at ASC
                ''', (threshold_id,))

                items_rows = cursor.fetchall() or []
                items = []
                for item_row in items_rows:
                    item_dict = dict(item_row)

                    if item_dict.get('variant_id'):
                        stock = int(item_dict.get('variant_stock') or 0)
                    else:
                        stock = int(item_dict.get('stock') or 0)

                    try:
                        base_price = float(item_dict.get('product_price') or 0)
                        discount = float(item_dict.get('discount') or 10.0)
                        retail_price = round(base_price * (discount / 10.0), 2)
                    except (TypeError, ValueError):
                        retail_price = 0.0

                    raw_is_active = item_dict.get('is_active')
                    if raw_is_active is None:
                        is_active = True
                    else:
                        is_active = int(raw_is_active) == 1

                    item_dict['is_active'] = is_active
                    item_dict['available'] = is_active and stock > 0
                    item_dict['stock'] = stock
                    item_dict['price'] = retail_price
                    items.append(item_dict)

                threshold_dict['items'] = items
                thresholds.append(threshold_dict)

            return thresholds

    @staticmethod
    def get_by_id(threshold_id: str, owner_id: Optional[str]) -> Optional[Dict[str, Any]]:
        thresholds = GiftThresholdDB.list_all(owner_id=owner_id, include_inactive=True)
        return next((t for t in thresholds if t.get('id') == threshold_id), None)

    @staticmethod
    def create_threshold(
        owner_id: Optional[str],
        threshold_amount: float,
        gift_products: bool = False,
        gift_coupon: bool = False,
        coupon_amount: float = 0.0,
        per_order_limit: Optional[int] = None
    ) -> str:
        threshold_id = f"threshold_{uuid.uuid4().hex}"

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO gift_thresholds
                (id, threshold_amount, gift_products, gift_coupon, coupon_amount, per_order_limit, is_active, sort_order, owner_id)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            ''', (
                threshold_id,
                threshold_amount,
                1 if gift_products else 0,
                1 if gift_coupon else 0,
                coupon_amount,
                per_order_limit if per_order_limit is not None else None,
                int(threshold_amount),
                owner_id
            ))
            conn.commit()

        return threshold_id

    @staticmethod
    def update_threshold(
        threshold_id: str,
        owner_id: Optional[str],
        threshold_amount: Optional[float] = None,
        gift_products: Optional[bool] = None,
        gift_coupon: Optional[bool] = None,
        coupon_amount: Optional[float] = None,
        per_order_limit: Optional[int] = None,
        is_active: Optional[bool] = None
    ) -> bool:
        updates = []
        params = []

        if threshold_amount is not None:
            updates.append("threshold_amount = ?")
            params.append(threshold_amount)
        if gift_products is not None:
            updates.append("gift_products = ?")
            params.append(1 if gift_products else 0)
        if gift_coupon is not None:
            updates.append("gift_coupon = ?")
            params.append(1 if gift_coupon else 0)
        if coupon_amount is not None:
            updates.append("coupon_amount = ?")
            params.append(coupon_amount)
        if per_order_limit is not None:
            updates.append("per_order_limit = ?")
            params.append(per_order_limit if per_order_limit > 0 else None)
        if is_active is not None:
            updates.append("is_active = ?")
            params.append(1 if is_active else 0)

        if not updates:
            return False

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(threshold_id)

        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            sql = f'''
                UPDATE gift_thresholds
                SET {", ".join(updates)}
                WHERE id = ? AND {owner_condition}
            '''
            if owner_id is None:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql, [*params, owner_id])
            conn.commit()

        return cursor.rowcount > 0

    @staticmethod
    def delete_threshold(threshold_id: str, owner_id: Optional[str]) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            owner_condition = 'owner_id IS NULL' if owner_id is None else 'owner_id = ?'
            owner_param: Tuple[Any, ...] = tuple() if owner_id is None else (owner_id,)
            cursor.execute(
                f'''DELETE FROM gift_threshold_items
                    WHERE threshold_id IN (
                        SELECT id FROM gift_thresholds WHERE id = ? AND {owner_condition}
                    )''',
                (threshold_id, *owner_param)
            )
            cursor.execute(
                f'DELETE FROM gift_thresholds WHERE id = ? AND {owner_condition}',
                (threshold_id, *owner_param)
            )
            conn.commit()

        return cursor.rowcount > 0

    @staticmethod
    def add_items_to_threshold(
        threshold_id: str,
        owner_id: Optional[str],
        items: List[Dict[str, Optional[str]]]
    ) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT owner_id FROM gift_thresholds WHERE id = ?', (threshold_id,))
            row = cursor.fetchone()
            if not row:
                return False
            existing_owner = row['owner_id'] if isinstance(row, sqlite3.Row) else row[0]
            if (owner_id is None and existing_owner is not None) or (owner_id is not None and existing_owner != owner_id):
                return False
            cursor.execute('DELETE FROM gift_threshold_items WHERE threshold_id = ?', (threshold_id,))

            for item in items:
                product_id = item.get('product_id')
                if not product_id:
                    continue
                variant_id = item.get('variant_id') or None
                item_id = f"gti_{uuid.uuid4().hex}"
                cursor.execute('''
                    INSERT INTO gift_threshold_items (id, threshold_id, product_id, variant_id)
                    VALUES (?, ?, ?, ?)
                ''', (item_id, threshold_id, product_id, variant_id))

            conn.commit()

        return True

    @staticmethod
    def get_applicable_thresholds(amount: float, owner_id: Optional[str]) -> List[Dict[str, Any]]:
        thresholds = GiftThresholdDB.list_all(owner_id=owner_id)
        applicable = []

        for threshold in thresholds:
            threshold_amount = float(threshold.get('threshold_amount', 0))
            if threshold_amount > 0 and amount >= threshold_amount:
                times = int(amount // threshold_amount)
                per_order_limit = threshold.get('per_order_limit')
                try:
                    per_order_limit_int = int(per_order_limit) if per_order_limit is not None else None
                except (TypeError, ValueError):
                    per_order_limit_int = None
                if per_order_limit_int is not None and per_order_limit_int > 0:
                    times = min(times, per_order_limit_int)
                threshold['applicable_times'] = times
                applicable.append(threshold)

        return applicable

    @staticmethod
    def pick_gifts_for_threshold(
        threshold_id: str,
        owner_id: Optional[str],
        count: int
    ) -> List[Dict[str, Any]]:
        if count <= 0:
            return []

        threshold = GiftThresholdDB.get_by_id(threshold_id, owner_id)
        if not threshold:
            return []

        available_items = [item for item in threshold.get('items', []) if item.get('available')]
        if not available_items:
            return []

        available_items.sort(key=lambda x: x.get('stock', 0), reverse=True)
        chosen = available_items[0]

        available_stock = chosen.get('stock', 0)
        actual_count = min(count, available_stock)

        if actual_count <= 0:
            return []

        product_name = chosen.get('product_name') or '满额赠品'
        variant_name = chosen.get('variant_name')
        display_name = f"{product_name}（{variant_name}）" if variant_name else product_name

        return [{
            'threshold_item_id': chosen.get('id'),
            'product_id': chosen.get('product_id'),
            'variant_id': chosen.get('variant_id'),
            'product_name': product_name,
            'variant_name': variant_name,
            'display_name': display_name,
            'img_path': chosen.get('img_path'),
            'category': chosen.get('category') or '满额赠品',
            'quantity': actual_count
        }]
