import json
from typing import Any, Dict, Optional, Union

from .config import logger
from .connection import get_db_connection
from .users import UserDB


class CartDB:
    @staticmethod
    def _resolve_user_identifier(user_identifier: Union[str, int]) -> Optional[Dict[str, Any]]:
        if isinstance(user_identifier, int):
            return UserDB.resolve_user_reference(user_identifier)
        return UserDB.resolve_user_reference(user_identifier)

    @staticmethod
    def get_cart(user_identifier: Union[str, int]) -> Optional[Dict]:
        user_ref = CartDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            return None

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM carts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
                (user_ref['user_id'],)
            )
            row = cursor.fetchone()

            if not row:
                cursor.execute(
                    'SELECT * FROM carts WHERE student_id = ? ORDER BY updated_at DESC LIMIT 1',
                    (user_ref['student_id'],)
                )
                row = cursor.fetchone()

                if row:
                    cart_id = row[0] if hasattr(row, '__getitem__') else row['id']
                    try:
                        cursor.execute(
                            'UPDATE carts SET user_id = ? WHERE id = ?',
                            (user_ref['user_id'], cart_id)
                        )
                        conn.commit()
                        logger.info("自动迁移购物车记录: cart_id=%s, user_id=%s", cart_id, user_ref['user_id'])
                    except Exception as exc:
                        logger.warning("迁移购物车记录失败: %s", exc)
                        conn.rollback()

            if row:
                cart_data = dict(row)
                cart_data['items'] = json.loads(cart_data['items'])
                return cart_data
            return None

    @staticmethod
    def update_cart(user_identifier: Union[str, int], items: Dict) -> bool:
        user_ref = CartDB._resolve_user_identifier(user_identifier)
        if not user_ref:
            logger.error("无法解析用户标识符: %s", user_identifier)
            return False

        items_json = json.dumps(items)
        user_id = user_ref['user_id']
        student_id = user_ref['student_id']

        with get_db_connection() as conn:
            cursor = conn.cursor()

            try:
                existing = CartDB.get_cart(user_identifier)

                if existing:
                    cursor.execute('''
                        UPDATE carts
                        SET items = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = ?
                    ''', (items_json, user_id))

                    if cursor.rowcount == 0:
                        cursor.execute('''
                            UPDATE carts
                            SET items = ?, updated_at = CURRENT_TIMESTAMP
                            WHERE student_id = ?
                        ''', (items_json, student_id))

                    logger.info("更新购物车 - user_id: %s, student_id: %s, 影响行数: %s", user_id, student_id, cursor.rowcount)
                else:
                    cursor.execute('''
                        INSERT INTO carts (student_id, user_id, items)
                        VALUES (?, ?, ?)
                    ''', (student_id, user_id, items_json))
                    logger.info("创建新购物车 - user_id: %s, student_id: %s, 影响行数: %s", user_id, student_id, cursor.rowcount)

                conn.commit()

                updated_cart = CartDB.get_cart(user_identifier)
                if updated_cart:
                    logger.info("购物车更新验证成功 - 当前内容: %s", updated_cart['items'])
                    return True
                logger.error("购物车更新验证失败 - user_id: %s", user_id)
                return False

            except Exception as exc:
                logger.error("数据库操作失败 - user_id: %s, 错误: %s", user_id, exc)
                conn.rollback()
                return False

    @staticmethod
    def remove_product_from_all_carts(product_id: str) -> int:
        removed_count = 0
        sep = '@@'
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('SELECT student_id, items FROM carts')
                rows = cursor.fetchall()
                for row in rows:
                    student_id = row[0]
                    try:
                        items = json.loads(row[1]) if isinstance(row[1], (str, bytes)) else (row[1] or {})
                    except Exception:
                        items = {}
                    if not isinstance(items, dict):
                        items = {}

                    changed = False
                    new_items = {}
                    for key, qty in items.items():
                        base_pid = key.split(sep, 1)[0] if isinstance(key, str) else key
                        if base_pid == product_id:
                            changed = True
                            continue
                        new_items[key] = qty

                    if changed:
                        cursor.execute(
                            'UPDATE carts SET items = ?, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?',
                            (json.dumps(new_items), student_id)
                        )
                        removed_count += 1

                conn.commit()
            except Exception as exc:
                logger.error("从所有购物车移除商品失败: %s", exc)
                conn.rollback()
        return removed_count
