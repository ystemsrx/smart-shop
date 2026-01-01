import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, date
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
    def get_last_order_time(
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        filter_admin_orders: bool = False,
    ) -> Optional[str]:
        """获取范围内最后一笔订单的创建时间。"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            scope_clause, scope_params = OrderDB._build_scope_filter(
                agent_id, address_ids, building_ids, table_alias='o', filter_admin_orders=filter_admin_orders
            )
            where_sql = f"WHERE {scope_clause}" if scope_clause else ""
            try:
                cursor.execute(
                    f"SELECT MAX(o.created_at) FROM orders o {where_sql}",
                    tuple(scope_params),
                )
                row = cursor.fetchone()
                return row[0] if row and row[0] else None
            except Exception:
                return None

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

        order_id = f"order_{int(datetime.now().timestamp()*1000)}"
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
        """根据ID获取订单"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM orders WHERE id = ?',
                (order_id,)
            )
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
        cycle_start: Optional[str] = None,
        cycle_end: Optional[str] = None,
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

            if cycle_start:
                where_sql.append('datetime(o.created_at) >= datetime(?)')
                params.append(cycle_start)
            if cycle_end:
                where_sql.append('datetime(o.created_at) <= datetime(?)')
                params.append(cycle_end)

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
                SELECT 
                    o.*, 
                    u.name as customer_name,
                    (
                        SELECT COUNT(*)
                        FROM orders o2
                        WHERE o2.student_id = o.student_id
                          AND (
                            datetime(o2.created_at) < datetime(o.created_at)
                            OR (datetime(o2.created_at) = datetime(o.created_at) AND o2.id <= o.id)
                          )
                    ) AS customer_order_index
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
                '''
                    SELECT 
                        o.*, 
                        (
                            SELECT COUNT(*)
                            FROM orders o2
                            WHERE o2.student_id = o.student_id
                              AND (
                                datetime(o2.created_at) < datetime(o.created_at)
                                OR (datetime(o2.created_at) = datetime(o.created_at) AND o2.id <= o.id)
                              )
                        ) AS customer_order_index
                    FROM orders o
                    WHERE o.user_id = ?
                    ORDER BY o.created_at DESC
                ''',
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
            ok = cursor.rowcount > 0
            conn.commit()
            return ok

    @staticmethod
    def batch_delete_orders(order_ids: List[str]) -> Dict[str, Any]:
        """批量删除订单"""
        if not order_ids:
            return {"success": False, "deleted_count": 0, "message": "没有提供要删除的订单ID"}
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                placeholders = ','.join('?' * len(order_ids))
                cursor.execute(f'SELECT id FROM orders WHERE id IN ({placeholders})', order_ids)
                existing_ids = [row[0] for row in cursor.fetchall()]
                if not existing_ids:
                    return {"success": False, "deleted_count": 0, "message": "没有找到要删除的订单"}
                cursor.execute(f'DELETE FROM orders WHERE id IN ({placeholders})', existing_ids)
                deleted_count = cursor.rowcount or 0
                conn.commit()
                return {
                    "success": True,
                    "deleted_count": deleted_count,
                    "deleted_ids": existing_ids,
                    "not_found_ids": list(set(order_ids) - set(existing_ids)),
                    "message": f"成功删除 {deleted_count} 笔订单"
                }
            except Exception as exc:
                conn.rollback()
                return {"success": False, "deleted_count": 0, "message": f"批量删除失败: {str(exc)}"}

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
        """删除超过指定分钟仍未支付(支付状态pending)的订单，返回删除数量"""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                # 先查询将要删除的订单（用于返还被锁定的优惠券）
                cursor.execute('''
                    SELECT id, coupon_id, discount_amount FROM orders
                    WHERE payment_status IN ('pending','failed')
                      AND datetime(created_at) <= datetime('now', ?)
                ''', (f'-{int(expire_minutes)} minutes',))
                rows = cursor.fetchall() or []
                ids = [r[0] for r in rows]
                # 执行删除
                cursor.execute('''
                    DELETE FROM orders
                    WHERE payment_status IN ('pending','failed')
                      AND datetime(created_at) <= datetime('now', ?)
                ''', (f'-{int(expire_minutes)} minutes',))
                deleted = cursor.rowcount or 0
                conn.commit()
                # 返还优惠券
                try:
                    from .promotions import CouponDB

                    for r in rows:
                        try:
                            oid = r[0]
                            cid = r[1]
                            damt = float(r[2] or 0)
                            if cid and damt > 0:
                                CouponDB.unlock_for_order(cid, oid)
                        except Exception:
                            pass
                except Exception as exc:
                    logger.warning("返还过期订单优惠券失败: %s", exc)
                return deleted
            except Exception as exc:
                logger.error("清理过期未付款订单失败: %s", exc)
                conn.rollback()
                return 0

    @staticmethod
    def get_order_stats(
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        exclude_address_ids: Optional[List[str]] = None,
        exclude_building_ids: Optional[List[str]] = None,
        cycle_start: Optional[str] = None,
        cycle_end: Optional[str] = None,
        filter_admin_orders: bool = False,
        reference_end: Optional[str] = None
    ) -> Dict:
        """获取订单统计信息（管理员用）"""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            def build_where(extra_clause: Optional[str] = None, extra_params: Optional[List[Any]] = None, alias: str = 'orders') -> Tuple[str, List[Any]]:
                scope_clause, scope_args = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, table_alias=alias, filter_admin_orders=filter_admin_orders)
                clauses: List[str] = []
                params: List[Any] = []
                if scope_clause:
                    clauses.append(scope_clause)
                    params.extend(scope_args)
                excluded_buildings = [bid for bid in (exclude_building_ids or []) if bid]
                excluded_addresses = [aid for aid in (exclude_address_ids or []) if aid]
                if excluded_buildings:
                    placeholders = ','.join('?' * len(excluded_buildings))
                    clauses.append(f'({alias}.building_id IS NULL OR {alias}.building_id NOT IN ({placeholders}))')
                    params.extend(excluded_buildings)
                if excluded_addresses:
                    placeholders = ','.join('?' * len(excluded_addresses))
                    clauses.append(f'({alias}.address_id IS NULL OR {alias}.address_id NOT IN ({placeholders}))')
                    params.extend(excluded_addresses)
                if excluded_buildings or excluded_addresses:
                    clauses.append(f'({alias}.agent_id IS NULL OR {alias}.agent_id = "")')
                if cycle_start:
                    clauses.append(f'datetime({alias}.created_at) >= datetime(?)')
                    params.append(cycle_start)
                if cycle_end:
                    clauses.append(f'datetime({alias}.created_at) <= datetime(?)')
                    params.append(cycle_end)
                if extra_clause:
                    clauses.append(extra_clause)
                    if extra_params:
                        params.extend(extra_params)
                if not clauses:
                    return '', params
                return ' WHERE ' + ' AND '.join(clauses), params

            # 总订单数
            where_clause, params = build_where()
            cursor.execute(f'SELECT COUNT(*) FROM orders{where_clause}', params)
            total_orders = cursor.fetchone()[0]

            # 各状态订单数
            where_clause, params = build_where(alias='orders')
            cursor.execute(f'''
                SELECT status, COUNT(*) as count
                FROM orders {where_clause}
                GROUP BY status
            ''', params)
            status_counts = {row[0]: row[1] for row in cursor.fetchall()}

            # 今日订单数（支持锚定到指定日期）
            today_date = None
            if reference_end:
                try:
                    today_date = datetime.strptime(reference_end, "%Y-%m-%d %H:%M:%S").strftime("%Y-%m-%d")
                except Exception:
                    try:
                        today_date = datetime.fromisoformat(reference_end.replace("T", " ")).strftime("%Y-%m-%d")
                    except Exception:
                        today_date = None
            if today_date:
                today_clause = "date(created_at, 'localtime') = date(?, 'localtime')"
                where_clause, params = build_where(today_clause, [today_date])
            else:
                today_clause = "date(created_at, 'localtime') = date('now', 'localtime')"
                where_clause, params = build_where(today_clause)
            cursor.execute(f'''SELECT COUNT(*) FROM orders{where_clause}''', params)
            today_orders = cursor.fetchone()[0]

            # 总销售额
            where_clause, params = build_where()
            cursor.execute(f'SELECT COALESCE(SUM(total_amount), 0) FROM orders{where_clause}', params)
            total_revenue = cursor.fetchone()[0]

            # 最早订单时间（用于导出报表时间范围选择）
            where_clause, params = build_where()
            cursor.execute(f'SELECT MIN(created_at) FROM orders{where_clause}', params)
            earliest_row = cursor.fetchone()
            earliest_order_time = earliest_row[0] if earliest_row and earliest_row[0] else None

            return {
                'total_orders': total_orders,
                'status_counts': status_counts,
                'today_orders': today_orders,
                'total_revenue': round(total_revenue, 2),
                'earliest_order_time': earliest_order_time
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
        top_range_end: Optional[str] = None,
        cycle_start: Optional[str] = None,
        cycle_end: Optional[str] = None,
        reference_end: Optional[str] = None
    ) -> Dict[str, Any]:
        """获取仪表盘详细统计信息"""
        with get_db_connection() as conn:
            cursor = conn.cursor()

            def parse_cycle_datetime(value: Optional[str]) -> Optional[datetime]:
                if not value:
                    return None
                try:
                    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    return None

            cycle_start_dt = parse_cycle_datetime(cycle_start)
            cycle_end_dt = parse_cycle_datetime(cycle_end)
            reference_end_dt = parse_cycle_datetime(reference_end) or cycle_end_dt or datetime.now()
            reference_end_str = reference_end_dt.strftime("%Y-%m-%d %H:%M:%S")

            # 基础统计
            basic_stats = OrderDB.get_order_stats(
                agent_id=agent_id,
                address_ids=address_ids,
                building_ids=building_ids,
                filter_admin_orders=filter_admin_orders,
                cycle_start=cycle_start,
                cycle_end=cycle_end,
                reference_end=reference_end,
            )

            def build_where(extra_clause: Optional[str] = None, extra_params: Optional[List[Any]] = None, alias: str = 'orders') -> Tuple[str, List[Any]]:
                scope_clause, scope_args = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, table_alias=alias, filter_admin_orders=filter_admin_orders)
                clauses: List[str] = []
                params: List[Any] = []
                if scope_clause:
                    clauses.append(scope_clause)
                    params.extend(scope_args)
                if cycle_start:
                    clauses.append(f'datetime({alias}.created_at) >= datetime(?)')
                    params.append(cycle_start)
                if cycle_end:
                    clauses.append(f'datetime({alias}.created_at) <= datetime(?)')
                    params.append(cycle_end)
                if extra_clause:
                    clauses.append(extra_clause)
                    if extra_params:
                        params.extend(extra_params)
                if not clauses:
                    return '', params
                return ' WHERE ' + ' AND '.join(clauses), params
            
            cycle_view_enabled = bool(cycle_start or cycle_end)

            # 按时间段统计销售额
            if period == 'day':
                time_filter = f"date(created_at, 'localtime') = date('{reference_end_str}', 'localtime')"
                prev_time_filter = f"date(created_at, 'localtime') = date('{reference_end_str}', '-1 day', 'localtime')"
                group_by = "strftime('%Y-%m-%d %H:00:00', created_at, 'localtime')"
                date_format = "周期内当日" if cycle_view_enabled else "今日各小时"
            elif period == 'week':
                time_filter = (
                    f"date(created_at, 'localtime') >= date('{reference_end_str}', '-6 days', 'localtime') "
                    f"AND date(created_at, 'localtime') <= date('{reference_end_str}', 'localtime')"
                )
                prev_time_filter = (
                    f"date(created_at, 'localtime') >= date('{reference_end_str}', '-13 days', 'localtime') "
                    f"AND date(created_at, 'localtime') < date('{reference_end_str}', '-6 days', 'localtime')"
                )
                group_by = "date(created_at, 'localtime')"
                date_format = "周期内7天" if cycle_view_enabled else "近7天"
            else:  # month
                time_filter = (
                    f"date(created_at, 'localtime') >= date('{reference_end_str}', '-30 days', 'localtime') "
                    f"AND date(created_at, 'localtime') <= date('{reference_end_str}', 'localtime')"
                )
                prev_time_filter = (
                    f"date(created_at, 'localtime') >= date('{reference_end_str}', '-60 days', 'localtime') "
                    f"AND date(created_at, 'localtime') < date('{reference_end_str}', '-30 days', 'localtime')"
                )
                group_by = "date(created_at, 'localtime')"
                date_format = "周期内30天" if cycle_view_enabled else "近30天"

            if period == 'day':
                chart_time_filter = "1=1"
                chart_window_config: Dict[str, Any] = {'window_size': 24, 'step': 24}
            elif period == 'week':
                # 增加到730天（约2年）的历史数据，支持往前翻约104次
                chart_time_filter = "date(created_at, 'localtime') >= date('now', '-730 days', 'localtime')"
                chart_window_config = {'window_size': 7, 'step': 7}
            else:
                # 月视图也增加到730天，支持往前翻约24次
                chart_time_filter = "date(created_at, 'localtime') >= date('now', '-730 days', 'localtime')"
                chart_window_config = {'window_size': 30, 'step': 30}

            # 当前时间段销售额
            where_clause, params = build_where(time_filter)
            cursor.execute(f'''
                SELECT {group_by} as period, 
                       COALESCE(SUM(total_amount), 0) as revenue,
                       COUNT(*) as orders
                FROM orders 
                {where_clause}
                GROUP BY {group_by}
                ORDER BY period
            ''', params)
            current_period_data = [
                {'period': row[0], 'revenue': round(row[1], 2), 'orders': row[2]}
                for row in cursor.fetchall()
            ]

            chart_where, chart_params = build_where(chart_time_filter)
            cursor.execute(f'''
                SELECT {group_by} as period,
                       COALESCE(SUM(total_amount), 0) as revenue,
                       COUNT(*) as orders
                FROM orders
                {chart_where}
                GROUP BY {group_by}
                ORDER BY period
            ''', chart_params)
            chart_data = [
                {'period': row[0], 'revenue': round(row[1], 2), 'orders': row[2]}
                for row in cursor.fetchall()
            ]

            # 计算净利润数据 - 使用新算法：订单总额减去成本总和
            def calculate_profit_for_period(time_filter_clause: str) -> Tuple[float, Dict[str, float]]:
                where_clause_profit, params_profit = build_where(
                    f"({time_filter_clause})", alias='o'
                )
                extra_clause = "o.payment_status = 'succeeded'"
                if where_clause_profit:
                    where_clause_profit = where_clause_profit + ' AND ' + extra_clause
                else:
                    where_clause_profit = ' WHERE ' + extra_clause
                cursor.execute(f'''
                    SELECT o.items, o.created_at, o.total_amount
                    FROM orders o 
                    {where_clause_profit}
                ''', params_profit)
                
                total_profit = 0.0
                profit_by_period: Dict[str, float] = {}
                
                for row in cursor.fetchall():
                    try:
                        items_json = json.loads(row[0])
                        created_at = row[1]
                        order_total_amount = float(row[2]) if row[2] else 0.0
                        
                        total_cost = 0.0  # 商品成本总和
                        fallback_gift_count = 0    # 赠品数量（兼容旧数据）

                        for item in items_json:
                            product_id = item.get('product_id')
                            quantity = int(item.get('quantity', 0))
                            is_lottery = item.get('is_lottery', False)
                            is_auto_gift = item.get('is_auto_gift', False)

                            if is_lottery:
                                # 新逻辑：优先使用记录的抽奖奖品实际价值；兼容旧订单按1元计
                                prize_unit_price = None
                                try:
                                    prize_unit_price = float(item.get('lottery_unit_price'))
                                except Exception:
                                    prize_unit_price = None
                                if prize_unit_price is not None and prize_unit_price > 0:
                                    total_cost += prize_unit_price * quantity
                                else:
                                    fallback_gift_count += quantity
                                continue
                                
                            # 获取商品成本，如果没有设置成本则默认为0
                            # 包括普通商品和满赠商品（is_auto_gift=True）都需要计算实际成本
                            cursor.execute('SELECT cost FROM products WHERE id = ?', (product_id,))
                            cost_row = cursor.fetchone()
                            cost = 0.0
                            if cost_row and cost_row[0] is not None and cost_row[0] != '':
                                try:
                                    cost = float(cost_row[0])
                                except (ValueError, TypeError):
                                    cost = 0.0
                            
                            # 累计商品成本：成本 × 数量
                            # 满赠商品（is_auto_gift）和普通商品都按实际成本计算
                            total_cost += cost * quantity
                        
                        # 新算法：净利润 = 订单总额 - 商品成本总和 - 赠品数量×1（兼容旧数据）
                        final_order_profit = order_total_amount - total_cost - fallback_gift_count
                        total_profit += final_order_profit
                        
                        # 按时间段分组，使用与销售额查询一致的SQLite本地时间转换
                        if period == 'day':
                            # 使用SQLite的localtime转换，确保与销售额查询的period格式一致
                            created_at = row[1]
                            if created_at:
                                # 查询SQLite转换后的本地时间格式，与销售额查询保持一致
                                cursor.execute('''
                                    SELECT strftime('%Y-%m-%d %H:00:00', ?, 'localtime')
                                ''', (created_at,))
                                sqlite_result = cursor.fetchone()
                                period_key = sqlite_result[0] if sqlite_result else ''
                            else:
                                period_key = ''
                        else:
                            # 对于周/月，使用SQLite的日期转换
                            created_at = row[1]
                            if created_at:
                                cursor.execute('''
                                    SELECT date(?, 'localtime')
                                ''', (created_at,))
                                sqlite_result = cursor.fetchone()
                                period_key = sqlite_result[0] if sqlite_result else ''
                            else:
                                period_key = ''
                        
                        if period_key:
                            profit_by_period[period_key] = profit_by_period.get(period_key, 0) + final_order_profit
                            
                    except (json.JSONDecodeError, KeyError, ValueError, TypeError):
                        continue
                
                return total_profit, profit_by_period

            # 计算当前时间段净利润
            current_profit, current_profit_by_period = calculate_profit_for_period(time_filter)
            # 计算图表所需的历史净利润数据
            _, chart_profit_by_period = calculate_profit_for_period(chart_time_filter)
            
            # 为current_period_data添加净利润数据
            for data_point in current_period_data:
                period_value = data_point['period']

                # 处理时间格式转换，确保与calculate_profit_for_period中的格式一致
                if period == 'day':
                    # period_value格式是 "YYYY-MM-DD HH:00:00"，直接使用完整格式匹配
                    period_key = str(period_value)
                else:
                    # 对于日期数据，直接使用period值
                    period_key = str(period_value)

                data_point['profit'] = round(current_profit_by_period.get(period_key, 0), 2)

            for data_point in chart_data:
                period_value = data_point['period']

                if period == 'day':
                    period_key = str(period_value)
                else:
                    period_key = str(period_value)

                data_point['profit'] = round(chart_profit_by_period.get(period_key, 0), 2)

            chart_day_labels: List[str] = []
            if period == 'day':
                existing_points = {entry['period']: entry for entry in chart_data}
                filled_chart: List[Dict[str, Any]] = []

                reference_end_date = reference_end_dt.date()
                cycle_start_date = cycle_start_dt.date() if cycle_start_dt else None
                if existing_points:
                    try:
                        earliest_key = min(existing_points.keys())
                        latest_key = max(existing_points.keys())
                        earliest_date = datetime.strptime(earliest_key, '%Y-%m-%d %H:%M:%S').date()
                        latest_date = datetime.strptime(latest_key, '%Y-%m-%d %H:%M:%S').date()
                    except ValueError:
                        earliest_date = cycle_start_date or reference_end_date
                        latest_date = reference_end_date
                else:
                    earliest_date = cycle_start_date or reference_end_date
                    latest_date = reference_end_date

                if latest_date < reference_end_date:
                    latest_date = reference_end_date
                if cycle_start_date and earliest_date < cycle_start_date:
                    earliest_date = cycle_start_date

                current_date = earliest_date
                while current_date <= latest_date:
                    day_str = current_date.strftime('%Y-%m-%d')
                    chart_day_labels.append(day_str)
                    for hour in range(24):
                        period_key = f"{day_str} {hour:02d}:00:00"
                        entry = existing_points.get(period_key)
                        if entry is not None:
                            filled_chart.append(entry)
                        else:
                            filled_chart.append({
                                'period': period_key,
                                'revenue': 0,
                                'orders': 0,
                                'profit': 0
                            })
                    current_date += timedelta(days=1)

                chart_data = filled_chart
                if chart_day_labels:
                    chart_window_config['days'] = chart_day_labels
                    anchor_str = reference_end_date.strftime('%Y-%m-%d')
                    if anchor_str in chart_day_labels:
                        chart_window_config['today_index'] = chart_day_labels.index(anchor_str)
                    else:
                        chart_window_config['today_index'] = len(chart_day_labels) - 1
            else:
                reference_end_date = reference_end_dt.date()
                cycle_start_date = cycle_start_dt.date() if cycle_start_dt else None
                window_span = chart_window_config.get('window_size', 7)
                existing_points = {entry['period']: entry for entry in chart_data}
                parsed_dates: List[date] = []
                for entry in chart_data:
                    try:
                        parsed_dates.append(datetime.strptime(entry['period'], '%Y-%m-%d').date())
                    except (ValueError, TypeError):
                        continue

                if parsed_dates:
                    earliest = min(parsed_dates)
                    latest = max(parsed_dates)
                    start_date = min(earliest, reference_end_date - timedelta(days=max(window_span - 1, 0)))
                    end_date = max(latest, reference_end_date)
                else:
                    start_date = reference_end_date - timedelta(days=max(window_span - 1, 0))
                    end_date = reference_end_date
                if cycle_start_date and start_date < cycle_start_date:
                    start_date = cycle_start_date
                if cycle_start_date and end_date < cycle_start_date:
                    end_date = cycle_start_date

                filled_chart = []
                current_date = start_date
                while current_date <= end_date:
                    period_key = current_date.strftime('%Y-%m-%d')
                    entry = existing_points.get(period_key)
                    if entry is not None:
                        filled_chart.append(entry)
                    else:
                        filled_chart.append({
                            'period': period_key,
                            'revenue': 0,
                            'orders': 0,
                            'profit': 0
                        })
                    current_date += timedelta(days=1)

                chart_data = filled_chart
            
            # 对比时间段销售额和净利润
            prev_where, prev_params = build_where(prev_time_filter)
            cursor.execute(f'''
                SELECT COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as orders
                FROM orders 
                {prev_where}
            ''', prev_params)
            prev_data = cursor.fetchone()
            prev_revenue = round(prev_data[0], 2) if prev_data else 0
            prev_orders = prev_data[1] if prev_data else 0
            
            # 计算对比时间段净利润
            prev_profit, _ = calculate_profit_for_period(prev_time_filter)
            
            # 当前时间段总计
            current_where, current_params = build_where(time_filter)
            cursor.execute(f'''
                SELECT COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as orders
                FROM orders 
                {current_where}
            ''', current_params)
            current_data = cursor.fetchone()
            current_revenue = round(current_data[0], 2) if current_data else 0
            current_orders = current_data[1] if current_data else 0
            
            # 计算增长率
            revenue_growth = 0.0
            orders_growth = 0.0
            profit_growth = 0.0
            if prev_revenue > 0:
                revenue_growth = round(((current_revenue - prev_revenue) / prev_revenue) * 100, 1)
            if prev_orders > 0:
                orders_growth = round(((current_orders - prev_orders) / prev_orders) * 100, 1)
            if prev_profit > 0:
                profit_growth = round(((current_profit - prev_profit) / prev_profit) * 100, 1)
            
            # 最热门商品统计（从订单JSON中解析）- 根据period参数动态调整时间范围，支持自定义范围
            def parse_datetime_str(value: Optional[str]) -> Optional[datetime]:
                if not value:
                    return None
                for fmt in ['%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d']:
                    try:
                        return datetime.strptime(value, fmt)
                    except ValueError:
                        continue
                try:
                    return datetime.fromisoformat(value)
                except Exception:
                    return None

            custom_top_start = parse_datetime_str(top_range_start)
            custom_top_end = parse_datetime_str(top_range_end)
            custom_top_params: List[Any] = []
            custom_prev_params: List[Any] = []

            if custom_top_start and custom_top_end and custom_top_start > custom_top_end:
                custom_top_start, custom_top_end = custom_top_end, custom_top_start

            # 允许自定义范围过滤热销榜单
            top_time_clause = f'({time_filter})'
            prev_top_time_clause = f'({prev_time_filter})'
            if custom_top_start and custom_top_end:
                start_str = custom_top_start.strftime('%Y-%m-%d %H:%M:%S')
                end_str = custom_top_end.strftime('%Y-%m-%d %H:%M:%S')
                # 直接使用本地时间字符串进行比较，避免重复 localtime 偏移导致跨日
                top_time_clause = "datetime(o.created_at, 'localtime') >= ? AND datetime(o.created_at, 'localtime') <= ?"
                custom_top_params = [start_str, end_str]

                range_delta = custom_top_end - custom_top_start
                prev_end = custom_top_start - timedelta(seconds=1)
                prev_start = prev_end - range_delta
                prev_top_time_clause = "datetime(o.created_at, 'localtime') >= ? AND datetime(o.created_at, 'localtime') <= ?"
                custom_prev_params = [
                    prev_start.strftime('%Y-%m-%d %H:%M:%S'),
                    prev_end.strftime('%Y-%m-%d %H:%M:%S')
                ]

            # 当前期商品销量统计
            where_clause_orders, params_orders = build_where(top_time_clause, custom_top_params, alias='o')
            if where_clause_orders:
                where_clause_orders = where_clause_orders + " AND o.payment_status = 'succeeded'"
            else:
                where_clause_orders = " WHERE o.payment_status = 'succeeded'"
            cursor.execute(f'''
                SELECT o.items, o.created_at
                FROM orders o 
                {where_clause_orders}
            ''', params_orders)
            
            # 统计当前期商品销量
            product_stats: Dict[str, Dict[str, Any]] = {}
            for row in cursor.fetchall():
                try:
                    items_json = json.loads(row[0])
                    for item in items_json:
                        # 排除抽奖和赠品商品
                        if item.get('is_lottery') or item.get('is_auto_gift'):
                            continue
                        
                        product_id = item.get('product_id')
                        product_name = item.get('name', '未知商品')
                        quantity = int(item.get('quantity', 0))
                        price = float(item.get('price', 0))
                        
                        if product_id not in product_stats:
                            product_stats[product_id] = {
                                'name': product_name,
                                'sold': 0,
                                'revenue': 0
                            }
                        
                        product_stats[product_id]['sold'] += quantity
                        product_stats[product_id]['revenue'] += quantity * price
                except (json.JSONDecodeError, KeyError, ValueError):
                    continue
            
            # 上一期商品销量统计
            prev_where_clause_orders, prev_params_orders = build_where(prev_top_time_clause, custom_prev_params, alias='o')
            if prev_where_clause_orders:
                prev_where_clause_orders = prev_where_clause_orders + " AND o.payment_status = 'succeeded'"
            else:
                prev_where_clause_orders = " WHERE o.payment_status = 'succeeded'"
            cursor.execute(f'''
                SELECT o.items, o.created_at
                FROM orders o 
                {prev_where_clause_orders}
            ''', prev_params_orders)
            
            # 统计上一期商品销量
            prev_product_stats: Dict[str, int] = {}
            for row in cursor.fetchall():
                try:
                    items_json = json.loads(row[0])
                    for item in items_json:
                        # 排除抽奖和赠品商品
                        if item.get('is_lottery') or item.get('is_auto_gift'):
                            continue
                        
                        product_id = item.get('product_id')
                        quantity = int(item.get('quantity', 0))
                        
                        if product_id not in prev_product_stats:
                            prev_product_stats[product_id] = 0
                        
                        prev_product_stats[product_id] += quantity
                except (json.JSONDecodeError, KeyError, ValueError):
                    continue
            
            # 按销量排序，取前10，并计算与上一期的对比
            top_products = []
            for product_id, stats in product_stats.items():
                current_sold = stats['sold']
                prev_sold = prev_product_stats.get(product_id, 0)
                change = current_sold - prev_sold
                
                top_products.append({
                    'name': stats['name'],
                    'sold': current_sold,
                    'revenue': round(stats['revenue'], 2),
                    'change': change,
                    'prev_sold': prev_sold
                })
            
            top_products = sorted(top_products, key=lambda x: x['sold'], reverse=True)[:10]
            
            # 用户增长统计
            customers_where, customers_params = build_where(alias='o')
            if customers_where:
                cursor.execute(f'''
                    SELECT COUNT(DISTINCT o.student_id)
                    FROM orders o
                    {customers_where}
                ''', customers_params)
            else:
                cursor.execute('SELECT COUNT(DISTINCT student_id) FROM orders')
            total_users = cursor.fetchone()[0] or 0

            recent_clause = (
                f"date(o.created_at, 'localtime') >= date('{reference_end_str}', '-6 days', 'localtime') "
                f"AND date(o.created_at, 'localtime') <= date('{reference_end_str}', 'localtime')"
            )
            recent_where, recent_params = build_where(recent_clause, alias='o')
            cursor.execute(f'''
                SELECT COUNT(DISTINCT o.student_id)
                FROM orders o
                {recent_where}
            ''', recent_params)
            new_users_week = cursor.fetchone()[0] or 0

            # 计算当前统计周期与对比周期的消费用户变化
            current_users_where, current_users_params = build_where(f'({time_filter})', alias='o')
            cursor.execute(f'''
                SELECT COUNT(DISTINCT o.student_id)
                FROM orders o
                {current_users_where}
            ''', current_users_params)
            current_period_users = cursor.fetchone()[0] or 0

            prev_users_where, prev_users_params = build_where(f'({prev_time_filter})', alias='o')
            cursor.execute(f'''
                SELECT COUNT(DISTINCT o.student_id)
                FROM orders o
                {prev_users_where}
            ''', prev_users_params)
            prev_period_users = cursor.fetchone()[0] or 0

            users_growth = 0.0
            if prev_period_users > 0:
                users_growth = round(((current_period_users - prev_period_users) / prev_period_users) * 100, 1)
            
            # 计算总净利润和今日净利润
            total_profit, _ = calculate_profit_for_period("o.payment_status = 'succeeded'")
            today_clause = (
                f"date(created_at, 'localtime') = date('{reference_end_str}', 'localtime') "
                "AND o.payment_status = 'succeeded'"
            )
            today_profit, _ = calculate_profit_for_period(today_clause)
            
            return {
                **basic_stats,
                'period': period,
                'period_name': date_format,
                'chart_data': chart_data,
                'chart_settings': chart_window_config,
                'current_period': {
                    'revenue': current_revenue,
                    'orders': current_orders,
                    'profit': round(current_profit, 2),
                    'data': current_period_data
                },
                'comparison': {
                    'prev_revenue': prev_revenue,
                    'prev_orders': prev_orders,
                    'prev_profit': round(prev_profit, 2),
                    'revenue_growth': revenue_growth,
                    'orders_growth': orders_growth,
                    'profit_growth': profit_growth
                },
                'profit_stats': {
                    'total_profit': round(total_profit, 2),
                    'today_profit': round(today_profit, 2),
                    'current_period_profit': round(current_profit, 2)
                },
                'top_products': top_products,
                'users': {
                    'total': total_users,
                    'new_this_week': new_users_week,
                    'current_period_new': current_period_users,
                    'prev_period_new': prev_period_users,
                    'growth': users_growth
                }
            }

    @staticmethod
    def get_customers_with_purchases(
        limit: int = 5,
        offset: int = 0,
        agent_id: Optional[str] = None,
        address_ids: Optional[List[str]] = None,
        building_ids: Optional[List[str]] = None,
        cycle_start: Optional[str] = None,
        cycle_end: Optional[str] = None,
        filter_admin_orders: bool = False
    ) -> Dict[str, Any]:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            scope_clause, scope_params = OrderDB._build_scope_filter(agent_id, address_ids, building_ids, table_alias='o', filter_admin_orders=filter_admin_orders)
            where_parts = ["o.payment_status = 'succeeded'"]
            params: List[Any] = list(scope_params)
            if scope_clause:
                where_parts.append(scope_clause)
            if cycle_start:
                where_parts.append("datetime(o.created_at) >= datetime(?)")
                params.append(cycle_start)
            if cycle_end:
                where_parts.append("datetime(o.created_at) <= datetime(?)")
                params.append(cycle_end)
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
                ORDER BY total_spent DESC, AVG(o.total_amount) DESC, datetime(last_order_date) DESC
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
