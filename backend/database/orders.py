import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union

from .config import logger
from .connection import get_db_connection
from .users import UserDB


class OrderDB:
    @staticmethod
    def _build_scope_filter(
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        table_alias: str = 'o',
        filter_admin_orders: bool = False
    ) -> Tuple[str, List[Any]]:
        clauses: List[str] = []
        params: List[Any] = []

        normalized_addresses = [aid for aid in (address_ids or []) if aid]
        normalized_buildings = [bid for bid in (building_ids or []) if bid]

        if filter_admin_orders:
            clauses.append(f"{table_alias}.agent_id IS NULL")
            if clauses:
                return ' AND '.join(clauses), params
            return '', []

        if agent_id:
            clauses.append(f"{table_alias}.agent_id = ?")
            params.append(agent_id)

            fallback_clauses: List[str] = []
            if normalized_buildings:
                placeholders = ','.join('?' * len(normalized_buildings))
                fallback_clauses.append(
                    f"({table_alias}.agent_id IS NULL AND {table_alias}.building_id IN ({placeholders}))"
                )
                params.extend(normalized_buildings)
            if normalized_addresses:
                placeholders = ','.join('?' * len(normalized_addresses))
                fallback_clauses.append(
                    f"({table_alias}.agent_id IS NULL AND {table_alias}.address_id IN ({placeholders}))"
                )
                params.extend(normalized_addresses)
            if fallback_clauses:
                clauses.extend(fallback_clauses)
        else:
            if normalized_buildings:
                placeholders = ','.join('?' * len(normalized_buildings))
                clauses.append(f"{table_alias}.building_id IN ({placeholders})")
                params.extend(normalized_buildings)
            if normalized_addresses:
                placeholders = ','.join('?' * len(normalized_addresses))
                clauses.append(f"{table_alias}.address_id IN ({placeholders})")
                params.extend(normalized_addresses)

        if not clauses:
            return '', []

        connector = ' OR '
        return '(' + connector.join(clauses) + ')', params

    @staticmethod
    def _resolve_user_identifier(user_identifier: Union[str, int]) -> Optional[Dict[str, Any]]:
        if isinstance(user_identifier, int):
            return UserDB.resolve_user_reference(user_identifier)
        return UserDB.resolve_user_reference(user_identifier)

    @staticmethod
    def create_order(
        user_identifier: Union[str, int],
        total_amount: float,
        shipping_info: dict,
        items: list,
        payment_method: str = 'wechat',
        note: str = '',
        discount_amount: float = 0.0,
        coupon_id: Optional[str] = None,
        address_id: Optional[str] = None,
        building_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        is_reservation: bool = False,
        reservation_reason: Optional[str] = None
    ) -> str:
        user_ref = OrderDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            raise ValueError(f"无法解析用户标识符: {user_identifier}")

        order_id = f"order_{int(datetime.now().timestamp())}"
        user_id = user_ref['user_id']
        student_id = user_ref['student_id']

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO orders
                (id, student_id, user_id, total_amount, shipping_info, items, payment_method, note, payment_status, discount_amount, coupon_id, address_id, building_id, agent_id, is_reservation, reservation_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                order_id,
                student_id,
                user_id,
                total_amount,
                json.dumps(shipping_info),
                json.dumps(items),
                payment_method,
                note,
                'pending',
                float(discount_amount or 0.0),
                coupon_id,
                address_id,
                building_id,
                agent_id,
                1 if is_reservation else 0,
                reservation_reason
            ))
            conn.commit()
            return order_id

    @staticmethod
    def set_order_items(order_id: str, items: List[Dict[str, Any]]) -> bool:
        try:
            payload = json.dumps(items)
        except Exception:
            payload = json.dumps([])
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE orders
                SET items = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (payload, order_id))
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def update_payment_status(order_id: str, payment_status: str, payment_intent_id: str = None) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if payment_intent_id:
                cursor.execute('''
                    UPDATE orders
                    SET payment_status = ?, payment_intent_id = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (payment_status, payment_intent_id, order_id))
            else:
                cursor.execute('''
                    UPDATE orders
                    SET payment_status = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (payment_status, order_id))
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def complete_payment_and_update_stock(order_id: str) -> Tuple[bool, List[str]]:
        logger.info("开始处理支付成功订单: %s", order_id)

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT items, payment_status FROM orders WHERE id = ?', (order_id,))
            row = cursor.fetchone()
            if not row:
                logger.error("订单不存在: %s", order_id)
                return False, ["订单不存在"]

            order_data = dict(row)
            current_status = order_data['payment_status']
            logger.info("订单 %s 当前支付状态: %s", order_id, current_status)

            if order_data['payment_status'] not in ['pending', 'processing']:
                logger.warning("订单 %s 状态异常，无法处理支付: %s", order_id, current_status)
                return False, ["订单状态异常"]

            items = json.loads(order_data['items'])
            missing_items: List[str] = []
            deductions: List[Tuple[str, str, int]] = []

            def format_item_label(base_name: str, variant_name: str = None) -> str:
                return f"{base_name or '未知商品'}（{variant_name}）" if variant_name else (base_name or "未知商品")

            for item in items:
                non_sellable_item = False
                if isinstance(item, dict):
                    flag = item.get('is_not_for_sale')
                    try:
                        if isinstance(flag, str):
                            non_sellable_item = flag.strip().lower() in ('1', 'true', 'yes', 'on')
                        else:
                            non_sellable_item = bool(flag)
                    except Exception:
                        non_sellable_item = False
                is_lottery_item = False
                try:
                    is_lottery_item = bool(item.get('is_lottery')) if isinstance(item, dict) else False
                except Exception:
                    is_lottery_item = False

                if is_lottery_item and isinstance(item, dict):
                    quantity = int(item.get('quantity', 0))
                    if quantity <= 0:
                        continue
                    actual_product_id = item.get('lottery_product_id') or item.get('product_id')
                    actual_variant_id = item.get('lottery_variant_id') or item.get('variant_id')
                    if not actual_product_id:
                        logger.warning("抽奖奖品缺少产品ID，跳过库存扣减: %s", item)
                        continue
                    if actual_variant_id:
                        cursor.execute('SELECT product_id, stock, name FROM product_variants WHERE id = ?', (actual_variant_id,))
                        var_row = cursor.fetchone()
                        if not var_row:
                            logger.info("抽奖奖品规格不存在，跳过库存扣减: %s (item: %s)", actual_variant_id, item.get('name', 'Unknown'))
                            continue
                        current_stock = int(var_row['stock'])
                        if current_stock < quantity:
                            logger.warning("抽奖奖品规格库存不足，跳过扣减: %s (需要: %s, 可用: %s)", actual_variant_id, quantity, current_stock)
                            continue
                        new_stock = current_stock - quantity
                        deductions.append(('variant', actual_variant_id, new_stock))
                    else:
                        cursor.execute('SELECT stock FROM products WHERE id = ?', (actual_product_id,))
                        product_row = cursor.fetchone()
                        if not product_row:
                            logger.info("抽奖奖品商品不存在，跳过库存扣减: %s (item: %s)", actual_product_id, item.get('name', 'Unknown'))
                            continue
                        current_stock = int(product_row['stock'])
                        if current_stock < quantity:
                            logger.warning("抽奖奖品库存不足，跳过扣减: %s (需要: %s, 可用: %s)", actual_product_id, quantity, current_stock)
                            continue
                        new_stock = current_stock - quantity
                        deductions.append(('product', actual_product_id, new_stock))
                    continue

                if non_sellable_item:
                    logger.info("订单 %s 包含非卖品 %s，跳过库存扣减", order_id, item.get('name', 'Unknown'))
                    continue

                product_id = item['product_id']
                quantity = int(item['quantity'])
                variant_id = item.get('variant_id')
                if variant_id:
                    cursor.execute('SELECT stock, name, product_id FROM product_variants WHERE id = ?', (variant_id,))
                    var_row = cursor.fetchone()
                    if not var_row:
                        label = format_item_label(item.get('name'), item.get('variant_name'))
                        missing_items.append(f"{label} 库存数据缺失")
                        continue
                    current_stock = int(var_row['stock'])
                    variant_name = item.get('variant_name') or var_row['name']
                    product_name = item.get('name')
                    if current_stock < quantity:
                        label = format_item_label(product_name, variant_name)
                        missing_items.append(f"{label} 库存不足(剩余 {current_stock}, 需要 {quantity})")
                        continue
                    new_stock = current_stock - quantity
                    deductions.append(('variant', variant_id, new_stock))
                else:
                    cursor.execute('SELECT stock, name FROM products WHERE id = ?', (product_id,))
                    product_row = cursor.fetchone()
                    if not product_row:
                        if isinstance(item, dict):
                            is_gift_item = (
                                item.get('is_lottery') or
                                item.get('is_auto_gift') or
                                item.get('category') == '满额赠品' or
                                '赠品' in str(item.get('name', '')) or
                                '赠品' in str(item.get('category', ''))
                            )
                            if is_gift_item:
                                logger.info("跳过赠品库存扣减: %s (product_id: %s)", item.get('name', 'Unknown'), product_id)
                                continue
                        logger.error("商品不存在无法扣减库存: product_id=%s, item=%s", product_id, item)
                        missing_items.append(f"{item.get('name') or product_id} 库存数据缺失")
                        continue
                    current_stock = int(product_row['stock'])
                    product_name = item.get('name') or product_row['name'] or product_id
                    if current_stock < quantity:
                        missing_items.append(f"{product_name} 库存不足(剩余 {current_stock}, 需要 {quantity})")
                        continue
                    new_stock = current_stock - quantity
                    deductions.append(('product', product_id, new_stock))

            if missing_items:
                missing_items = list(dict.fromkeys(missing_items))
                conn.rollback()
                return False, missing_items

            for target_type, target_id, new_stock in deductions:
                if target_type == 'variant':
                    cursor.execute('UPDATE product_variants SET stock = ? WHERE id = ?', (new_stock, target_id))
                else:
                    cursor.execute('UPDATE products SET stock = ? WHERE id = ?', (new_stock, target_id))

            cursor.execute('''
                UPDATE orders
                SET payment_status = 'succeeded', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (order_id,))

            updated_rows = cursor.rowcount
            conn.commit()

            logger.info("订单 %s 支付处理完成，库存已扣减，支付状态已更新为 succeeded，影响行数: %s", order_id, updated_rows)
            return True, []

    @staticmethod
    def restore_stock_from_order(order_id: str) -> bool:
        logger.info("开始恢复订单库存: %s", order_id)

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT items, payment_status FROM orders WHERE id = ?', (order_id,))
            row = cursor.fetchone()
            if not row:
                logger.error("订单不存在: %s", order_id)
                return False

            order_data = dict(row)
            current_status = order_data['payment_status']
            logger.info("订单 %s 当前支付状态: %s", order_id, current_status)

            if order_data['payment_status'] != 'succeeded':
                logger.info("订单 %s 未成功支付，无需恢复库存", order_id)
                return True

            items = json.loads(order_data['items'])

            for item in items:
                non_sellable_item = False
                if isinstance(item, dict):
                    flag = item.get('is_not_for_sale')
                    try:
                        if isinstance(flag, str):
                            non_sellable_item = flag.strip().lower() in ('1', 'true', 'yes', 'on')
                        else:
                            non_sellable_item = bool(flag)
                    except Exception:
                        non_sellable_item = False
                is_lottery_item = False
                try:
                    is_lottery_item = bool(item.get('is_lottery')) if isinstance(item, dict) else False
                except Exception:
                    is_lottery_item = False

                if is_lottery_item and isinstance(item, dict):
                    quantity = int(item.get('quantity', 0))
                    if quantity <= 0:
                        continue
                    actual_product_id = item.get('lottery_product_id') or item.get('product_id')
                    actual_variant_id = item.get('lottery_variant_id') or item.get('variant_id')

                    if actual_variant_id:
                        cursor.execute('SELECT stock FROM product_variants WHERE id = ?', (actual_variant_id,))
                        var_row = cursor.fetchone()
                        if var_row:
                            current_stock = int(var_row[0])
                            new_stock = current_stock + quantity
                            cursor.execute('UPDATE product_variants SET stock = ? WHERE id = ?', (new_stock, actual_variant_id))
                            logger.info("恢复抽奖奖品规格库存: variant_id=%s, +%s -> %s", actual_variant_id, quantity, new_stock)
                        else:
                            logger.warning("抽奖奖品规格不存在，无法恢复库存: %s", actual_variant_id)
                    else:
                        cursor.execute('SELECT stock FROM products WHERE id = ?', (actual_product_id,))
                        product_row = cursor.fetchone()
                        if product_row:
                            current_stock = int(product_row[0])
                            new_stock = current_stock + quantity
                            cursor.execute('UPDATE products SET stock = ? WHERE id = ?', (new_stock, actual_product_id))
                            logger.info("恢复抽奖奖品库存: product_id=%s, +%s -> %s", actual_product_id, quantity, new_stock)
                        else:
                            logger.info("抽奖奖品商品不存在，跳过库存恢复: %s (item: %s)", actual_product_id, item.get('name', 'Unknown'))
                    continue

                if non_sellable_item:
                    logger.info("订单 %s 包含非卖品 %s，无需恢复库存", order_id, item.get('name', 'Unknown'))
                    continue

                product_id = item['product_id']
                quantity = int(item['quantity'])
                variant_id = item.get('variant_id')
                if variant_id:
                    cursor.execute('SELECT stock FROM product_variants WHERE id = ?', (variant_id,))
                    var_row = cursor.fetchone()
                    if var_row:
                        current_stock = int(var_row[0])
                        new_stock = current_stock + quantity
                        cursor.execute('UPDATE product_variants SET stock = ? WHERE id = ?', (new_stock, variant_id))
                        logger.info("恢复规格库存: variant_id=%s, +%s -> %s", variant_id, quantity, new_stock)
                    else:
                        logger.warning("规格不存在，无法恢复库存: variant_id=%s", variant_id)
                else:
                    cursor.execute('SELECT stock FROM products WHERE id = ?', (product_id,))
                    product_row = cursor.fetchone()
                    if product_row:
                        current_stock = int(product_row[0])
                        new_stock = current_stock + quantity
                        cursor.execute('UPDATE products SET stock = ? WHERE id = ?', (new_stock, product_id))
                        logger.info("恢复商品库存: product_id=%s, +%s -> %s", product_id, quantity, new_stock)
                    else:
                        if isinstance(item, dict):
                            is_gift_item = (
                                item.get('is_lottery') or
                                item.get('is_auto_gift') or
                                item.get('category') == '满额赠品' or
                                '赠品' in str(item.get('name', '')) or
                                '赠品' in str(item.get('category', ''))
                            )
                            if is_gift_item:
                                logger.info("跳过赠品库存恢复: %s (product_id: %s)", item.get('name', 'Unknown'), product_id)
                                continue
                        logger.error("商品不存在无法恢复库存: product_id=%s, item=%s", product_id, item)
                        return False

            conn.commit()
            logger.info("订单 %s 库存恢复完成", order_id)
            return True

    @staticmethod
    def get_order_by_id(order_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT o.*, u.name as customer_name
                FROM orders o
                LEFT JOIN users u ON o.student_id = u.id
                WHERE o.id = ?
            ''', (order_id,))
            row = cursor.fetchone()
            if row:
                order = dict(row)
                order['shipping_info'] = json.loads(order['shipping_info'])
                order['items'] = json.loads(order['items'])
                return order
            return None

    @staticmethod
    def get_all_orders() -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT o.*, u.name as customer_name
                FROM orders o
                LEFT JOIN users u ON o.student_id = u.id
                ORDER BY o.created_at DESC
            ''')
            orders = []
            for row in cursor.fetchall():
                order = dict(row)
                order['shipping_info'] = json.loads(order['shipping_info'])
                order['items'] = json.loads(order['items'])
                orders.append(order)
            return orders

    @staticmethod
    def get_orders_paginated(
        order_id: Optional[str] = None,
        keyword: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        exclude_address_ids: Optional[List[str]] = None,
        exclude_building_ids: Optional[List[str]] = None,
        start_time_ms: Optional[float] = None,
        end_time_ms: Optional[float] = None,
        unified_status: Optional[str] = None,
        filter_admin_orders: bool = False,
        allow_large_limit: bool = False
    ) -> Dict[str, Any]:
        try:
            limit = int(limit)
        except Exception:
            limit = 20
        if limit <= 0:
            limit = 20
        if not allow_large_limit and limit > 100:
            limit = 100
        try:
            offset = int(offset)
        except Exception:
            offset = 0
        if offset < 0:
            offset = 0

        with get_db_connection() as conn:
            cursor = conn.cursor()

            params: List[Any] = []
            where_sql: List[str] = []
            order_id_text = (order_id or '').strip()
            keyword_text = (keyword or '').strip()

            if order_id_text and not keyword_text:
                where_sql.append('o.id LIKE ?')
                params.append(f'%{order_id_text}%')

            if keyword_text:
                like_value = f'%{keyword_text}%'
                where_sql.append(
                    '('
                    'o.id LIKE ? OR '
                    'COALESCE(o.student_id, "") LIKE ? OR '
                    'LOWER(COALESCE(u.name, "")) LIKE LOWER(?) OR '
                    'LOWER(COALESCE(o.shipping_info, "")) LIKE LOWER(?)'
                    ')'
                )
                params.extend([like_value, like_value, like_value, like_value])

            scope_clause, scope_params = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, filter_admin_orders=filter_admin_orders)
            if scope_clause:
                where_sql.append(scope_clause)
                params.extend(scope_params)

            excluded_addresses = [aid for aid in (exclude_address_ids or []) if aid]
            excluded_buildings = [bid for bid in (exclude_building_ids or []) if bid]

            if excluded_buildings:
                placeholders = ','.join('?' * len(excluded_buildings))
                where_sql.append(f'(o.building_id IS NULL OR o.building_id NOT IN ({placeholders}))')
                params.extend(excluded_buildings)
            if excluded_addresses:
                placeholders = ','.join('?' * len(excluded_addresses))
                where_sql.append(f'(o.address_id IS NULL OR o.address_id NOT IN ({placeholders}))')
                params.extend(excluded_addresses)
            if excluded_buildings or excluded_addresses:
                where_sql.append('(o.agent_id IS NULL OR o.agent_id = "")')

            normalized_start: Optional[float] = None
            normalized_end: Optional[float] = None
            try:
                if start_time_ms is not None:
                    normalized_start = float(start_time_ms) / 1000.0
            except Exception:
                normalized_start = None
            try:
                if end_time_ms is not None:
                    normalized_end = float(end_time_ms) / 1000.0
            except Exception:
                normalized_end = None

            if normalized_start is not None:
                start_dt = datetime.utcfromtimestamp(normalized_start)
                where_sql.append('datetime(o.created_at) >= datetime(?)')
                params.append(start_dt.strftime("%Y-%m-%d %H:%M:%S"))

            if normalized_end is not None:
                end_dt = datetime.utcfromtimestamp(normalized_end)
                where_sql.append('datetime(o.created_at) <= datetime(?)')
                params.append(end_dt.strftime("%Y-%m-%d %H:%M:%S"))

            if unified_status:
                where_sql.append(
                    "("
                    "CASE "
                    "WHEN (o.payment_status IS NULL OR TRIM(o.payment_status) = '') AND (o.status IS NULL OR TRIM(o.status) = '') THEN '未付款' "
                    "WHEN o.payment_status = 'processing' THEN '待确认' "
                    "WHEN o.payment_status IS NULL OR o.payment_status != 'succeeded' THEN '未付款' "
                    "WHEN o.status = 'shipped' THEN '配送中' "
                    "WHEN o.status = 'delivered' THEN '已完成' "
                    "ELSE '待配送' "
                    "END) = ?"
                )
                params.append(unified_status)
            where_clause = (' WHERE ' + ' AND '.join(where_sql)) if where_sql else ''

            cursor.execute(
                f'''SELECT COUNT(*) FROM orders o
                    LEFT JOIN users u ON o.student_id = u.id
                    {where_clause}''',
                params
            )
            total = cursor.fetchone()[0] or 0

            query_sql = f'''
                SELECT o.*, u.name as customer_name
                FROM orders o
                LEFT JOIN users u ON o.student_id = u.id
                {where_clause}
                ORDER BY o.created_at DESC
                LIMIT ? OFFSET ?
            '''
            q_params = params + [limit, offset]
            cursor.execute(query_sql, q_params)
            orders: List[Dict[str, Any]] = []
            for row in cursor.fetchall():
                order = dict(row)
                try:
                    order['shipping_info'] = json.loads(order['shipping_info'])
                except Exception:
                    pass
                try:
                    order['items'] = json.loads(order['items'])
                except Exception:
                    pass
                orders.append(order)

            return {'orders': orders, 'total': total}

    @staticmethod
    def get_orders_by_student(user_identifier: Union[str, int]) -> List[Dict]:
        user_ref = OrderDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            return []

        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute(
                'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
                (user_ref['user_id'],)
            )
            orders = [dict(row) for row in cursor.fetchall()]

            if not orders:
                cursor.execute(
                    'SELECT * FROM orders WHERE student_id = ? ORDER BY created_at DESC',
                    (user_ref['student_id'],)
                )
                old_orders = cursor.fetchall()

                if old_orders:
                    order_ids = [dict(row)['id'] for row in old_orders]
                    try:
                        placeholders = ','.join('?' * len(order_ids))
                        cursor.execute(
                            f'UPDATE orders SET user_id = ? WHERE id IN ({placeholders})',
                            [user_ref['user_id']] + order_ids
                        )
                        conn.commit()
                        logger.info("自动迁移%s个订单记录到user_id=%s", len(order_ids), user_ref['user_id'])
                    except Exception as exc:
                        logger.warning("迁移订单记录失败: %s", exc)
                        conn.rollback()

                orders = [dict(row) for row in old_orders]

            for order in orders:
                try:
                    order['shipping_info'] = json.loads(order['shipping_info'])
                except Exception:
                    order['shipping_info'] = {}
                try:
                    order['items'] = json.loads(order['items'])
                except Exception:
                    order['items'] = []
            return orders

    @staticmethod
    def update_order_status(order_id: str, status: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE orders
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (status, order_id))
            success = cursor.rowcount > 0
            conn.commit()
            return success

    @staticmethod
    def delete_order(order_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM orders WHERE id = ?', (order_id,))
            success = cursor.rowcount > 0
            conn.commit()
            return success

    @staticmethod
    def clear_all_orders() -> int:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM orders')
            deleted = cursor.rowcount
            conn.commit()
            return deleted or 0

    @staticmethod
    def get_sales_summary(
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        filter_admin_orders: bool = False
    ) -> Dict[str, Any]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            filters: List[str] = ["payment_status = 'succeeded'"]
            params: List[Any] = []

            scope_clause, scope_params = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, filter_admin_orders=filter_admin_orders)
            if scope_clause:
                filters.append(scope_clause)
                params.extend(scope_params)

            if start_time:
                filters.append('datetime(created_at) >= datetime(?)')
                params.append(start_time)
            if end_time:
                filters.append('datetime(created_at) <= datetime(?)')
                params.append(end_time)

            where_clause = 'WHERE ' + ' AND '.join(filters) if filters else ''

            cursor.execute(f'''
                SELECT 
                    COUNT(*) as order_count, 
                    SUM(total_amount) as total_amount
                FROM orders
                {where_clause}
            ''', params)
            row = cursor.fetchone()
            order_count = row[0] or 0
            total_amount = float(row[1]) if row[1] is not None else 0.0

            cursor.execute(f'''
                SELECT COUNT(DISTINCT student_id)
                FROM orders
                {where_clause}
            ''', params)
            customer_count = cursor.fetchone()[0] or 0

            cursor.execute(f'''
                SELECT SUM(discount_amount)
                FROM orders
                {where_clause}
            ''', params)
            discount_total = cursor.fetchone()[0] or 0.0

            return {
                'order_count': order_count,
                'total_amount': round(total_amount, 2),
                'customer_count': customer_count,
                'discount_total': round(float(discount_total or 0.0), 2)
            }

    @staticmethod
    def get_recent_orders(limit: int = 10) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT o.id, o.student_id, u.name as customer_name, o.total_amount, o.status, o.payment_status, o.created_at
                FROM orders o
                LEFT JOIN users u ON o.student_id = u.id
                ORDER BY o.created_at DESC
                LIMIT ?
            ''', (limit,))
            orders = []
            for row in cursor.fetchall():
                order = dict(row)
                orders.append(order)
            return orders

    @staticmethod
    def purge_expired_unpaid_orders(expire_minutes: int = 15) -> int:
        """
        删除超时未付款订单，并解锁占用的优惠券。
        """
        try:
            minutes = int(expire_minutes)
        except Exception:
            minutes = 15
        minutes = max(1, minutes)
        cutoff = datetime.utcnow() - timedelta(minutes=minutes)
        cutoff_str = cutoff.strftime("%Y-%m-%d %H:%M:%S")

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                SELECT id, coupon_id
                FROM orders
                WHERE (payment_status IS NULL OR payment_status NOT IN ('succeeded'))
                  AND datetime(created_at) <= datetime(?)
                ''',
                (cutoff_str,)
            )
            rows = cursor.fetchall() or []
            order_ids = [row['id'] if isinstance(row, sqlite3.Row) else row[0] for row in rows]
            coupon_ids = [row['coupon_id'] if isinstance(row, sqlite3.Row) else row[1] for row in rows]

            deleted = 0
            if order_ids:
                placeholders = ','.join('?' * len(order_ids))
                cursor.execute(f'DELETE FROM orders WHERE id IN ({placeholders})', order_ids)
                deleted = cursor.rowcount or 0

                try:
                    from .promotions import CouponDB

                    for oid, cid in zip(order_ids, coupon_ids):
                        if cid:
                            try:
                                CouponDB.unlock_for_order(cid, oid)
                            except Exception as exc:
                                logger.warning("解锁优惠券失败(%s -> %s): %s", cid, oid, exc)
                except Exception as exc:
                    logger.warning("删除过期未付订单时解锁优惠券出错: %s", exc)

            conn.commit()
            return deleted

    @staticmethod
    def get_order_stats(
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        exclude_address_ids: Optional[List[str]] = None,
        exclude_building_ids: Optional[List[str]] = None,
        filter_admin_orders: bool = False
    ) -> Dict[str, Any]:
        """
        聚合订单状态和支付统计，兼容管理端筛选逻辑。
        """
        with get_db_connection() as conn:
            cursor = conn.cursor()

            where_parts: List[str] = []
            params: List[Any] = []

            scope_clause, scope_params = OrderDB._build_scope_filter(
                agent_id=agent_id,
                address_ids=address_ids,
                building_ids=building_ids,
                filter_admin_orders=filter_admin_orders
            )
            if scope_clause:
                where_parts.append(scope_clause)
                params.extend(scope_params)

            normalized_exclude_addresses = [aid for aid in (exclude_address_ids or []) if aid]
            normalized_exclude_buildings = [bid for bid in (exclude_building_ids or []) if bid]

            if normalized_exclude_buildings:
                placeholders = ','.join('?' * len(normalized_exclude_buildings))
                where_parts.append(f'(o.building_id IS NULL OR o.building_id NOT IN ({placeholders}))')
                params.extend(normalized_exclude_buildings)
            if normalized_exclude_addresses:
                placeholders = ','.join('?' * len(normalized_exclude_addresses))
                where_parts.append(f'(o.address_id IS NULL OR o.address_id NOT IN ({placeholders}))')
                params.extend(normalized_exclude_addresses)
            if normalized_exclude_addresses or normalized_exclude_buildings:
                where_parts.append('(o.agent_id IS NULL OR o.agent_id = "")')

            where_clause = 'WHERE ' + ' AND '.join(where_parts) if where_parts else ''

            cursor.execute(f'''
                SELECT
                    COUNT(*) AS total_orders,
                    SUM(CASE WHEN payment_status = 'succeeded' THEN 1 ELSE 0 END) AS paid_orders,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_orders,
                    SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_orders,
                    SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS shipped_orders,
                    SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
                    COALESCE(SUM(total_amount), 0) AS total_amount,
                    COALESCE(SUM(CASE WHEN payment_status = 'succeeded' THEN total_amount ELSE 0 END), 0) AS paid_amount
                FROM orders o
                {where_clause}
            ''', params)
            row = cursor.fetchone() or {}
            total_amount_val = round(float(row["total_amount"] if "total_amount" in row else row[7] or 0), 2)
            paid_amount_val = round(float(row["paid_amount"] if "paid_amount" in row else row[8] or 0), 2)
            return {
                "total_orders": row["total_orders"] if "total_orders" in row else row[0],
                "paid_orders": row["paid_orders"] if "paid_orders" in row else row[1],
                "pending_orders": row["pending_orders"] if "pending_orders" in row else row[2],
                "confirmed_orders": row["confirmed_orders"] if "confirmed_orders" in row else row[3],
                "shipped_orders": row["shipped_orders"] if "shipped_orders" in row else row[4],
                "delivered_orders": row["delivered_orders"] if "delivered_orders" in row else row[5],
                "cancelled_orders": row["cancelled_orders"] if "cancelled_orders" in row else row[6],
                "total_amount": total_amount_val,
                "total_revenue": total_amount_val,  # 兼容前端 OverviewPanel 使用的字段名
                "paid_amount": paid_amount_val,
            }

    @staticmethod
    def get_today_stats(agent_id: Optional[str] = None, address_ids: Optional[List[str]] = None, building_ids: Optional[List[str]] = None, filter_admin_orders: bool = False) -> Dict[str, Any]:
        today = datetime.now().strftime("%Y-%m-%d")
        return OrderDB.get_sales_summary(
            start_time=f"{today} 00:00:00",
            end_time=f"{today} 23:59:59",
            agent_id=agent_id,
            address_ids=address_ids,
            building_ids=building_ids,
            filter_admin_orders=filter_admin_orders
        )

    @staticmethod
    def get_profit_summary(days: int = 7, agent_id: Optional[str] = None, address_ids: Optional[List[str]] = None, building_ids: Optional[List[str]] = None, filter_admin_orders: bool = False) -> Dict[str, Any]:
        try:
            days = int(days)
        except Exception:
            days = 7
        days = max(1, min(days, 90))

        end_date = datetime.now()
        start_date = end_date - timedelta(days=days - 1)
        start_str = start_date.strftime("%Y-%m-%d 00:00:00")
        end_str = end_date.strftime("%Y-%m-%d 23:59:59")

        with get_db_connection() as conn:
            cursor = conn.cursor()

            filters = ["o.payment_status = 'succeeded'"]
            params: List[Any] = []

            scope_clause, scope_params = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, filter_admin_orders=filter_admin_orders)
            if scope_clause:
                filters.append(scope_clause)
                params.extend(scope_params)

            filters.append('datetime(o.created_at) BETWEEN datetime(?) AND datetime(?)')
            params.extend([start_str, end_str])

            where_clause = 'WHERE ' + ' AND '.join(filters)

            cursor.execute(f'''
                SELECT date(o.created_at) as date, COUNT(*) as order_count, SUM(o.total_amount) as total_amount,
                       SUM(COALESCE(p.cost, 0)) as total_cost
                FROM orders o
                LEFT JOIN (
                    SELECT op.order_id, SUM(COALESCE(p.cost, 0) * (op.quantity)) as cost
                    FROM (
                        SELECT o.id as order_id, json_extract(value, '$.product_id') as product_id,
                               json_extract(value, '$.quantity') * 1.0 as quantity
                        FROM orders o, json_each(o.items)
                    ) op
                    LEFT JOIN products p ON op.product_id = p.id
                    GROUP BY op.order_id
                ) p ON o.id = p.order_id
                {where_clause}
                GROUP BY date(o.created_at)
                ORDER BY date(o.created_at) ASC
            ''', params)

            date_cursor = start_date
            date_labels = []
            revenue_data = []
            profit_data = []
            order_counts = []

            raw_data = {row['date']: row for row in cursor.fetchall()}

            while date_cursor <= end_date:
                date_str = date_cursor.strftime("%Y-%m-%d")
                date_labels.append(date_str)
                if date_str in raw_data:
                    row = raw_data[date_str]
                    revenue = float(row['total_amount'] or 0)
                    cost = float(row['total_cost'] or 0)
                    profit = revenue - cost
                    order_count = row['order_count'] or 0
                else:
                    revenue = 0.0
                    profit = 0.0
                    order_count = 0
                revenue_data.append(round(revenue, 2))
                profit_data.append(round(profit, 2))
                order_counts.append(order_count)
                date_cursor += timedelta(days=1)

            total_revenue = sum(revenue_data)
            total_profit = sum(profit_data)
            total_orders = sum(order_counts)

            today_str = datetime.now().strftime("%Y-%m-%d")
            if today_str in raw_data:
                today_revenue = float(raw_data[today_str]['total_amount'] or 0)
                today_cost = float(raw_data[today_str]['total_cost'] or 0)
                today_profit = today_revenue - today_cost
                today_orders = raw_data[today_str]['order_count'] or 0
            else:
                today_revenue = 0.0
                today_profit = 0.0
                today_orders = 0

            labels = date_labels
            current_period_data = []
            current_period_revenue = 0.0
            current_period_profit = 0.0
            current_period_orders = 0

            for i, (rev, prof, count) in enumerate(zip(revenue_data, profit_data, order_counts)):
                entry = {
                    'date': labels[i],
                    'period': labels[i],
                    'revenue': rev,
                    'profit': prof,
                    'orders': count
                }
                current_period_data.append(entry)
                current_period_revenue += rev
                current_period_profit += prof
                current_period_orders += count

            # 上一周期（与当前周期等长，直接向前平移 days 天）
            prev_start = start_date - timedelta(days=days)
            prev_end = end_date - timedelta(days=days)
            prev_start_str = prev_start.strftime("%Y-%m-%d 00:00:00")
            prev_end_str = prev_end.strftime("%Y-%m-%d 23:59:59")

            cursor.execute(f'''
                SELECT
                    SUM(o.total_amount) as total_amount,
                    SUM(COALESCE(p.cost, 0)) as total_cost,
                    COUNT(*) as total_orders
                FROM orders o
                LEFT JOIN (
                    SELECT op.order_id, SUM(COALESCE(prod.cost, 0) * (op.quantity)) as cost
                    FROM (
                        SELECT o.id as order_id, json_extract(value, '$.product_id') as product_id,
                               json_extract(value, '$.quantity') * 1.0 as quantity
                        FROM orders o, json_each(o.items)
                    ) op
                    LEFT JOIN products prod ON op.product_id = prod.id
                    GROUP BY op.order_id
                ) p ON o.id = p.order_id
                WHERE o.payment_status = 'succeeded'
                  AND datetime(o.created_at) BETWEEN datetime(?) AND datetime(?)
                  {'AND ' + scope_clause if scope_clause else ''}
            ''', [prev_start_str, prev_end_str, *scope_params])
            prev_row = cursor.fetchone() or {}
            prev_period_revenue = float(prev_row.get('total_amount') or 0.0) if hasattr(prev_row, 'get') else float(prev_row[0] or 0.0 if len(prev_row) > 0 else 0.0)
            prev_period_cost = float(prev_row.get('total_cost') or 0.0) if hasattr(prev_row, 'get') else float(prev_row[1] or 0.0 if len(prev_row) > 1 else 0.0)
            prev_period_orders = int(prev_row.get('total_orders') or 0) if hasattr(prev_row, 'get') else int(prev_row[2] or 0 if len(prev_row) > 2 else 0)
            prev_period_profit = prev_period_revenue - prev_period_cost

            def calc_growth(current: float, previous: float) -> float:
                if previous == 0:
                    return 100.0 if current > 0 else 0.0
                return round(((current - previous) / previous) * 100, 2)

            revenue_growth = calc_growth(current_period_revenue, prev_period_revenue)
            profit_growth = calc_growth(current_period_profit, prev_period_profit)
            orders_growth = calc_growth(current_period_orders, prev_period_orders)

            cursor.execute(f'''
                SELECT
                    p.id as product_id,
                    p.name as product_name,
                    SUM(COALESCE(json_extract(value, '$.quantity') * 1.0, 0)) as qty,
                    SUM(COALESCE(json_extract(value, '$.quantity') * 1.0, 0) * COALESCE(json_extract(value, '$.price') * 1.0, p.price, 0)) as amount
                FROM orders o, json_each(o.items)
                JOIN products p ON json_extract(value, '$.product_id') = p.id
                {where_clause}
                GROUP BY p.id, p.name
                ORDER BY qty DESC, amount DESC
                LIMIT 10
            ''', params)
            current_top_rows = cursor.fetchall() or []

            # 计算上一周期的销售情况，用于趋势对比
            def _product_stats(start_ts: str, end_ts: str) -> Dict[str, Dict[str, Any]]:
                filters_ps: List[str] = ["o.payment_status = 'succeeded'"]
                params_ps: List[Any] = []
                if scope_clause:
                    filters_ps.append(scope_clause)
                    params_ps.extend(scope_params)
                filters_ps.append('datetime(o.created_at) BETWEEN datetime(?) AND datetime(?)')
                params_ps.extend([start_ts, end_ts])
                where_ps = 'WHERE ' + ' AND '.join(filters_ps)
                cursor.execute(f'''
                    SELECT
                        p.id as product_id,
                        p.name as product_name,
                        SUM(COALESCE(json_extract(value, '$.quantity') * 1.0, 0)) as qty,
                        SUM(COALESCE(json_extract(value, '$.quantity') * 1.0, 0) * COALESCE(json_extract(value, '$.price') * 1.0, p.price, 0)) as amount
                    FROM orders o, json_each(o.items)
                    JOIN products p ON json_extract(value, '$.product_id') = p.id
                    {where_ps}
                    GROUP BY p.id, p.name
                ''', params_ps)
                res: Dict[str, Dict[str, Any]] = {}
                for r in cursor.fetchall() or []:
                    res[str(r['product_id'])] = {
                        'name': r['product_name'],
                        'qty': float(r['qty'] or 0),
                        'amount': float(r['amount'] or 0.0),
                    }
                return res

            prev_start = (start_date - timedelta(days=days)).strftime("%Y-%m-%d 00:00:00")
            prev_end = (end_date - timedelta(days=days)).strftime("%Y-%m-%d 23:59:59")
            prev_stats = _product_stats(prev_start, prev_end)

            top_products = []
            for row in current_top_rows:
                item = dict(row)
                pid = str(item.get('product_id'))
                qty = float(item.get('qty') or 0)
                amount = round(float(item.get('amount') or 0), 2)
                prev_qty = prev_stats.get(pid, {}).get('qty', 0.0)
                change = round(qty - prev_qty, 2)
                top_products.append({
                    'product_id': pid,
                    'name': item.get('product_name'),
                    'sold': qty,
                    'value': amount,
                    'change': change,
                })

            cursor.execute(f'''
                SELECT COUNT(*) AS total_users
                FROM users u
                WHERE EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.student_id = u.id
                    {'AND ' + scope_clause if scope_clause else ''}
                )
            ''', scope_params)
            total_users = cursor.fetchone()['total_users']

            cursor.execute(f'''
                SELECT COUNT(*) AS new_users_week
                FROM users u
                WHERE u.created_at >= datetime('now', '-7 days')
                AND EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.student_id = u.id
                    {'AND ' + scope_clause if scope_clause else ''}
                )
            ''', scope_params)
            new_users_week = cursor.fetchone()['new_users_week']

            try:
                current_period_users = len(set([
                    row['student_id'] for row in cursor.execute(
                        f'''SELECT DISTINCT student_id FROM orders o
                            WHERE o.payment_status = 'succeeded'
                            AND datetime(o.created_at) BETWEEN datetime(?) AND datetime(?)'''
                        + (f' AND {scope_clause}' if scope_clause else ''),
                        [start_str, end_str, *scope_params]
                    ).fetchall()
                ]))
            except Exception:
                current_period_users = 0

            try:
                prev_period_users = len(set([
                    row['student_id'] for row in cursor.execute(
                        f'''SELECT DISTINCT student_id FROM orders o
                            WHERE o.payment_status = 'succeeded'
                            AND datetime(o.created_at) BETWEEN datetime(?) AND datetime(?)'''
                        + (f' AND {scope_clause}' if scope_clause else ''),
                        [prev_start_str, prev_end_str, *scope_params]
                    ).fetchall()
                ]))
            except Exception:
                prev_period_users = 0

            users_growth = calc_growth(current_period_users, prev_period_users)

            return {
                'labels': labels,
                'revenue': revenue_data,
                'profit': profit_data,
                'orders': order_counts,
                'chart_data': current_period_data,
                'today': {
                    'revenue': round(today_revenue, 2),
                    'profit': round(today_profit, 2),
                    'orders': today_orders
                },
                'current_period': {
                    'revenue': round(current_period_revenue, 2),
                    'orders': current_period_orders,
                    'profit': round(current_period_profit, 2),
                    'data': current_period_data
                },
                'comparison': {
                    'prev_revenue': prev_period_revenue,
                    'prev_orders': prev_period_orders,
                    'prev_profit': round(prev_period_profit, 2),
                    'revenue_growth': revenue_growth,
                    'orders_growth': orders_growth,
                    'profit_growth': profit_growth
                },
                'profit_stats': {
                    'total_profit': round(total_profit, 2),
                    'today_profit': round(today_profit, 2),
                    'current_period_profit': round(current_period_profit, 2)
                },
                'top_products': top_products,
                'users': {
                    'total': total_users,
                    'new_this_week': new_users_week,
                    'current_period_new': current_period_users,
                    'prev_period_new': prev_period_users,
                    'growth': users_growth
                },
                'period_totals': {
                    'orders': total_orders,
                    'revenue': round(total_revenue, 2),
                    'profit': round(total_profit, 2)
                }
            }

    @staticmethod
    def get_dashboard_stats(
        period: str = 'week',
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        filter_admin_orders: bool = False,
        top_range_start: Optional[str] = None,
        top_range_end: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        仪表盘综合统计：销售、订单、用户增长、热门商品和收入Top区间。
        """
        period = period or 'week'
        if period not in ('day', 'week', 'month'):
            period = 'week'

        # 主统计周期天数
        if period == 'day':
            days = 1
        elif period == 'month':
            days = 30
        else:
            days = 7

        summary = OrderDB.get_profit_summary(
            days=days,
            agent_id=agent_id,
            address_ids=address_ids,
            building_ids=building_ids,
            filter_admin_orders=filter_admin_orders
        )

        # 全量统计（不限制时间）
        with get_db_connection() as conn:
            cursor = conn.cursor()
            filters: List[str] = ["o.payment_status = 'succeeded'"]
            params: List[Any] = []
            scope_clause, scope_params = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, filter_admin_orders=filter_admin_orders)
            if scope_clause:
                filters.append(scope_clause)
                params.extend(scope_params)
            where_clause = 'WHERE ' + ' AND '.join(filters) if filters else ''

            cursor.execute(f'''
                SELECT
                    COUNT(*) AS total_orders,
                    COALESCE(SUM(o.total_amount), 0) AS total_amount,
                    COALESCE(SUM(p.cost), 0) AS total_cost
                FROM orders o
                LEFT JOIN (
                    SELECT op.order_id, SUM(COALESCE(prod.cost, 0) * (op.quantity)) as cost
                    FROM (
                        SELECT o.id as order_id, json_extract(value, '$.product_id') as product_id,
                               json_extract(value, '$.quantity') * 1.0 as quantity
                        FROM orders o, json_each(o.items)
                    ) op
                    LEFT JOIN products prod ON op.product_id = prod.id
                    GROUP BY op.order_id
                ) p ON o.id = p.order_id
                {where_clause}
            ''', params)
            overall_row = cursor.fetchone() or {}
            overall_orders = 0
            overall_revenue = 0.0
            overall_cost = 0.0
            try:
                overall_orders = overall_row["total_orders"] if "total_orders" in overall_row else overall_row[0]
            except Exception:
                overall_orders = overall_orders or 0
            try:
                overall_revenue = float(overall_row["total_amount"] if "total_amount" in overall_row else overall_row[1])
            except Exception:
                overall_revenue = overall_revenue or 0.0
            try:
                overall_cost = float(overall_row["total_cost"] if "total_cost" in overall_row else overall_row[2])
            except Exception:
                overall_cost = overall_cost or 0.0
            overall_orders = overall_orders or 0
            overall_revenue = overall_revenue or 0.0
            overall_cost = overall_cost or 0.0
            overall_profit = round(overall_revenue - overall_cost, 2)

        summary['overall'] = {
            'orders': overall_orders,
            'revenue': round(overall_revenue, 2),
            'profit': overall_profit
        }
        summary.setdefault('profit_stats', {})['total_profit_all'] = overall_profit
        # 如果全量为空，则退回周期汇总，避免前端卡片显示0
        fallback_orders = summary.get('period_totals', {}).get('orders', 0)
        fallback_revenue = summary.get('period_totals', {}).get('revenue', 0.0)
        fallback_profit = summary.get('period_totals', {}).get('profit', 0.0)
        summary['profit_stats']['total_profit'] = overall_profit if (overall_orders or overall_revenue or overall_cost) else fallback_profit
        summary['total_orders'] = overall_orders if (overall_orders or overall_revenue or overall_cost) else fallback_orders
        summary['total_revenue'] = round(overall_revenue, 2) if (overall_orders or overall_revenue or overall_cost) else round(fallback_revenue, 2)
        summary.setdefault('period_totals', {})
        summary['period_totals'].setdefault('orders', 0)
        summary['period_totals'].setdefault('revenue', 0.0)
        summary['period_totals'].setdefault('profit', 0.0)
        summary.setdefault('period_name', {'day': '今日', 'week': '本周', 'month': '本月'}.get(period, '本期'))

        # 完整销售趋势（按天聚合全部记录，供前端分页/缩放）
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                filters_all: List[str] = ["o.payment_status = 'succeeded'"]
                params_all: List[Any] = []
                if scope_clause:
                    filters_all.append(scope_clause)
                    params_all.extend(scope_params)
                where_all = 'WHERE ' + ' AND '.join(filters_all) if filters_all else ''
                cursor.execute(f'''
                    SELECT
                        date(o.created_at) as date,
                        COUNT(*) as order_count,
                        SUM(o.total_amount) as total_amount,
                        SUM(COALESCE(p.cost, 0)) as total_cost
                    FROM orders o
                    LEFT JOIN (
                        SELECT op.order_id, SUM(COALESCE(prod.cost, 0) * (op.quantity)) as cost
                        FROM (
                            SELECT o.id as order_id, json_extract(value, '$.product_id') as product_id,
                                   json_extract(value, '$.quantity') * 1.0 as quantity
                            FROM orders o, json_each(o.items)
                        ) op
                        LEFT JOIN products prod ON op.product_id = prod.id
                        GROUP BY op.order_id
                    ) p ON o.id = p.order_id
                    {where_all}
                    GROUP BY date(o.created_at)
                    ORDER BY date(o.created_at) ASC
                ''', params_all)
                full_chart = []
                for r in cursor.fetchall() or []:
                    try:
                        date_val = r['date']
                        rev = float(r['total_amount'] or 0.0)
                        cost = float(r['total_cost'] or 0.0)
                        full_chart.append({
                            'date': date_val,
                            'period': date_val,
                            'revenue': round(rev, 2),
                            'profit': round(rev - cost, 2),
                            'orders': int(r['order_count'] or 0)
                        })
                    except Exception:
                        continue
                # 确保包含“今天”数据（即便为0）
                today_str = datetime.now().strftime("%Y-%m-%d")
                existing_dates = {entry['date'] for entry in full_chart}
                if today_str not in existing_dates:
                    full_chart.append({
                        'date': today_str,
                        'period': today_str,
                        'revenue': 0.0,
                        'profit': 0.0,
                        'orders': 0
                    })
                full_chart.sort(key=lambda x: x['date'])
                summary['chart_data'] = full_chart
        except Exception:
            pass

        # Top区间用于前端图表的快速取样（如果传入区间，则覆盖默认周期）
        if top_range_start and top_range_end:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                scope_clause, scope_params = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, filter_admin_orders=filter_admin_orders)
                filters = ["payment_status = 'succeeded'"]
                params: List[Any] = []
                if scope_clause:
                    filters.append(scope_clause)
                    params.extend(scope_params)
                filters.append('datetime(created_at) BETWEEN datetime(?) AND datetime(?)')
                params.extend([top_range_start, top_range_end])
                where_clause = 'WHERE ' + ' AND '.join(filters)

                cursor.execute(f'''
                    SELECT date(created_at) as dt, SUM(total_amount) as total_amount
                    FROM orders o
                    {where_clause}
                    GROUP BY dt
                    ORDER BY dt ASC
                ''', params)
                top_range = [{'date': row['dt'], 'amount': float(row['total_amount'] or 0)} for row in cursor.fetchall()]
        else:
            top_range = []

        summary['top_range'] = top_range
        summary['period'] = period
        summary['filter_admin_orders'] = filter_admin_orders
        return summary

    @staticmethod
    def get_customers_with_purchases(
        limit: int = 5,
        offset: int = 0,
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        filter_admin_orders: bool = False
    ) -> Dict[str, Any]:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            scope_clause, scope_params = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, table_alias='o', filter_admin_orders=filter_admin_orders)
            where_parts = ["o.payment_status = 'succeeded'"]
            params: List[Any] = list(scope_params)
            if scope_clause:
                where_parts.append(scope_clause)
            where_sql = ' WHERE ' + ' AND '.join(where_parts)

            cursor.execute(f'''
                SELECT
                    u.id,
                    u.name,
                    COUNT(DISTINCT o.id) as order_count,
                    COALESCE(SUM(o.total_amount), 0) as total_spent,
                    MAX(o.created_at) as last_order_date,
                    MIN(o.created_at) as first_order_date
                FROM users u
                INNER JOIN orders o ON u.id = o.student_id
                {where_sql}
                GROUP BY u.id, u.name
                ORDER BY total_spent DESC
                LIMIT ? OFFSET ?
            ''', [*params, limit, offset])

            customers = []
            for row in cursor.fetchall():
                customer = dict(row)
                customer['avg_order_amount'] = round(customer['total_spent'] / customer['order_count'], 2) if customer['order_count'] > 0 else 0
                customers.append(customer)

            cursor.execute(f'''
                SELECT COUNT(DISTINCT u.id)
                FROM users u
                INNER JOIN orders o ON u.id = o.student_id
                {where_sql}
            ''', params)
            total = cursor.fetchone()[0] or 0

            return {
                'customers': customers,
                'total': total,
                'limit': limit,
                'offset': offset,
                'has_more': (offset + len(customers)) < total
            }


class OrderExportDB:
    DEFAULT_EXPIRE_HOURS = 24

    @staticmethod
    def create_job(
        owner_id: str,
        role: str,
        agent_filter: Optional[str],
        keyword: Optional[str],
        status_filter: Optional[str],
        start_time_ms: Optional[float],
        end_time_ms: Optional[float],
        scope_label: Optional[str],
        filename: Optional[str],
        total_count: int = 0,
        expires_at: Optional[datetime] = None,
        client_tz_offset: Optional[int] = None
    ) -> Dict[str, Any]:
        job_id = f"exp_{uuid.uuid4().hex}"
        download_token = uuid.uuid4().hex
        expire_dt = expires_at or (datetime.now() + timedelta(hours=OrderExportDB.DEFAULT_EXPIRE_HOURS))
        expire_str = expire_dt.strftime("%Y-%m-%d %H:%M:%S")
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO order_exports (
                    id, owner_id, role, agent_filter, keyword, status_filter, start_time_ms, end_time_ms,
                    status, total_count, exported_count, file_path, download_token,
                    expires_at, message, filename, scope_label, client_tz_offset
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, NULL, ?, ?, NULL, ?, ?, ?)
            ''', (
                job_id,
                owner_id,
                role,
                agent_filter,
                keyword,
                status_filter,
                int(start_time_ms) if start_time_ms is not None else None,
                int(end_time_ms) if end_time_ms is not None else None,
                int(total_count or 0),
                download_token,
                expire_str,
                filename,
                scope_label,
                client_tz_offset
            ))
            conn.commit()
        return {
            "id": job_id,
            "download_token": download_token,
            "expires_at": expire_str,
            "total_count": int(total_count or 0),
            "filename": filename,
            "scope_label": scope_label,
            "client_tz_offset": client_tz_offset,
            "keyword": keyword,
            "status_filter": status_filter
        }

    @staticmethod
    def update_job(
        job_id: str,
        *,
        status: Optional[str] = None,
        exported_count: Optional[int] = None,
        total_count: Optional[int] = None,
        file_path: Optional[str] = None,
        message: Optional[str] = None,
        expires_at: Optional[datetime] = None,
        filename: Optional[str] = None
    ) -> None:
        fields: List[str] = []
        params: List[Any] = []
        if status is not None:
            fields.append("status = ?")
            params.append(status)
        if exported_count is not None:
            fields.append("exported_count = ?")
            params.append(int(exported_count))
        if total_count is not None:
            fields.append("total_count = ?")
            params.append(int(total_count))
        if file_path is not None:
            fields.append("file_path = ?")
            params.append(file_path)
        if message is not None:
            fields.append("message = ?")
            params.append(message)
        if expires_at is not None:
            fields.append("expires_at = ?")
            params.append(expires_at.strftime("%Y-%m-%d %H:%M:%S"))
        if filename is not None:
            fields.append("filename = ?")
            params.append(filename)

        if not fields:
            return

        fields.append("updated_at = CURRENT_TIMESTAMP")
        params.append(job_id)
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f'''
                UPDATE order_exports
                SET {', '.join(fields)}
                WHERE id = ?
            ''', params)
            conn.commit()

    @staticmethod
    def get_job(job_id: str) -> Optional[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM order_exports WHERE id = ?', (job_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def list_jobs_for_owner(owner_id: str, limit: int = 12) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM order_exports
                WHERE owner_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            ''', (owner_id, limit))
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def cleanup_expired_files(base_dir: str) -> int:
        removed = 0
        safe_root = os.path.abspath(base_dir)
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, file_path FROM order_exports
                WHERE status = 'completed'
                  AND expires_at IS NOT NULL
                  AND datetime(expires_at) <= datetime('now')
            ''')
            expired_rows = cursor.fetchall() or []
            for row in expired_rows:
                job_id = row['id']
                file_path = row['file_path']
                if file_path:
                    try:
                        abs_path = os.path.abspath(file_path)
                        if abs_path.startswith(safe_root) and os.path.exists(abs_path):
                            os.remove(abs_path)
                            removed += 1
                    except Exception as exc:
                        logger.warning("清理过期导出文件失败(%s): %s", job_id, exc)
                cursor.execute('''
                    UPDATE order_exports
                    SET status = 'expired',
                        updated_at = CURRENT_TIMESTAMP,
                        message = '导出链接已过期，文件已清理',
                        file_path = NULL
                    WHERE id = ?
                ''', (job_id,))
            conn.commit()
        return removed
