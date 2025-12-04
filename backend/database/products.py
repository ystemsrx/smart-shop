import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from .config import logger
from .connection import get_db_connection


class ProductDB:
    @staticmethod
    def create_product(product_data: Dict) -> str:
        product_id = f"prod_{int(datetime.now().timestamp())}"

        with get_db_connection() as conn:
            cursor = conn.cursor()
            category_name = product_data['category']
            cursor.execute('SELECT id FROM categories WHERE name = ?', (category_name,))
            if not cursor.fetchone():
                category_id = f"cat_{int(datetime.now().timestamp())}"
                cursor.execute('''
                    INSERT INTO categories (id, name, description)
                    VALUES (?, ?, ?)
                ''', (category_id, category_name, f"自动创建的分类：{category_name}"))

            cursor.execute('''
                INSERT INTO products
                (id, name, category, price, stock, discount, img_path, description, cost, owner_id, is_hot, is_not_for_sale, reservation_required, reservation_cutoff, reservation_note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                product_id,
                product_data['name'],
                category_name,
                product_data['price'],
                product_data.get('stock', 0),
                float(product_data.get('discount', 10.0)),
                product_data.get('img_path', ''),
                product_data.get('description', ''),
                float(product_data.get('cost', 0.0)),
                product_data.get('owner_id'),
                1 if product_data.get('is_hot') else 0,
                1 if product_data.get('is_not_for_sale') else 0,
                1 if product_data.get('reservation_required') else 0,
                product_data.get('reservation_cutoff'),
                product_data.get('reservation_note', '')
            ))
            conn.commit()
            return product_id

    @staticmethod
    def _safe_float(value, default: float = 0.0) -> float:
        try:
            if value is None:
                return default
            if isinstance(value, bool):
                return float(int(value))
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _is_hot_product(product: Dict[str, Any]) -> bool:
        value = product.get('is_hot')
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return int(value) == 1
        if isinstance(value, str):
            return value.strip().lower() in ('1', 'true', 'yes', 'on')
        return False

    @staticmethod
    def _calc_effective_price(product: Dict[str, Any]) -> float:
        price = ProductDB._safe_float(product.get('price'), 0.0)
        discount_raw = product.get('discount')
        discount = ProductDB._safe_float(discount_raw, 10.0)
        if discount <= 0:
            return 0.0
        if discount >= 10:
            return max(price, 0.0)
        effective = price * (discount / 10.0)
        return max(round(effective, 2), 0.0)

    @staticmethod
    def _sort_products_for_display(products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not products:
            return []

        hot_items: List[Tuple[int, Dict[str, Any]]] = []
        normal_items: List[Tuple[int, Dict[str, Any]]] = []

        for idx, product in enumerate(products):
            bucket = hot_items if ProductDB._is_hot_product(product) else normal_items
            bucket.append((idx, product))

        hot_items.sort(key=lambda item: (ProductDB._calc_effective_price(item[1]), item[0]))

        ordered: List[Dict[str, Any]] = [item[1] for item in hot_items]
        ordered.extend(product for _, product in normal_items)
        return ordered

    @staticmethod
    def _build_owner_filter(owner_ids: Optional[List[str]], include_unassigned: bool) -> Tuple[str, List[Any]]:
        conditions: List[str] = []
        params: List[Any] = []

        if owner_ids is None:
            return '', params

        normalized = [oid for oid in (owner_ids or []) if oid]
        if normalized:
            placeholders = ','.join('?' * len(normalized))
            conditions.append(f"owner_id IN ({placeholders})")
            params.extend(normalized)

        if include_unassigned:
            conditions.append('(owner_id IS NULL OR owner_id = "")')

        if not conditions:
            return '1=0', []

        where_clause = ' OR '.join(conditions)
        return where_clause, params

    @staticmethod
    def get_all_products(
        owner_ids: Optional[List[str]] = None,
        include_unassigned: bool = True,
        *,
        hot_only: bool = False
    ) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            where_sql, params = ProductDB._build_owner_filter(owner_ids, include_unassigned)
            if where_sql == '1=0' and owner_ids is not None:
                return []

            clauses: List[str] = []
            query_params: List[Any] = []

            if owner_ids is not None and where_sql:
                clauses.append(f'({where_sql})')
                query_params.extend(params)

            if hot_only:
                clauses.append('is_hot = 1')

            sql = 'SELECT * FROM products'
            if clauses:
                sql += ' WHERE ' + ' AND '.join(clauses)
            sql += ' ORDER BY created_at DESC'

            cursor.execute(sql, query_params)
            rows = [dict(row) for row in cursor.fetchall()]
            return ProductDB._sort_products_for_display(rows)

    @staticmethod
    def get_products_by_category(
        category: str,
        owner_ids: Optional[List[str]] = None,
        include_unassigned: bool = True,
        *,
        hot_only: bool = False
    ) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            where_sql, params = ProductDB._build_owner_filter(owner_ids, include_unassigned)
            if where_sql == '1=0' and owner_ids is not None:
                return []

            clauses: List[str] = ['category = ?']
            query_params: List[Any] = [category]

            if owner_ids is not None and where_sql:
                clauses.append(f'({where_sql})')
                query_params.extend(params)

            if hot_only:
                clauses.append('is_hot = 1')

            sql = f"SELECT * FROM products WHERE {' AND '.join(clauses)} ORDER BY created_at DESC"
            cursor.execute(sql, query_params)
            rows = [dict(row) for row in cursor.fetchall()]
            return ProductDB._sort_products_for_display(rows)

    @staticmethod
    def search_products(query: str, active_only: bool = False, owner_ids: Optional[List[str]] = None, include_unassigned: bool = True) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            where_sql, params = ProductDB._build_owner_filter(owner_ids, include_unassigned)

            def build_base_sql(active_filter: bool) -> Tuple[str, List[Any]]:
                base_params = [f'%{query}%', f'%{query}%', f'%{query}%']
                base_conditions = '(name LIKE ? OR category LIKE ? OR description LIKE ?)'
                if where_sql and owner_ids is not None:
                    base_conditions = f'{base_conditions} AND ({where_sql})'
                    base_params.extend(params)
                sql = f'SELECT * FROM products WHERE {base_conditions}'
                if active_filter:
                    sql += ' AND (is_active = 1)'
                sql += ' ORDER BY created_at DESC'
                return sql, base_params

            if active_only:
                if owner_ids is not None and where_sql == '1=0':
                    return []
                sql, sql_params = build_base_sql(True)
                cursor.execute(sql, sql_params)
            else:
                if owner_ids is not None and where_sql == '1=0':
                    return []
                sql, sql_params = build_base_sql(False)
                cursor.execute(sql, sql_params)
            rows = [dict(row) for row in cursor.fetchall()]
            return ProductDB._sort_products_for_display(rows)

    @staticmethod
    def get_product_by_id(product_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def update_product(product_id: str, product_data: Dict) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT category FROM products WHERE id = ?', (product_id,))
            old_product = cursor.fetchone()
            if not old_product:
                return False
            old_category = old_product[0]

            if 'category' in product_data:
                new_category = product_data['category']
                cursor.execute('SELECT id FROM categories WHERE name = ?', (new_category,))
                if not cursor.fetchone():
                    category_id = f"cat_{int(datetime.now().timestamp())}"
                    cursor.execute('''
                        INSERT INTO categories (id, name, description)
                        VALUES (?, ?, ?)
                    ''', (category_id, new_category, f"自动创建的分类：{new_category}"))

            update_fields = []
            values = []

            for field in ['name', 'category', 'price', 'stock', 'discount', 'img_path', 'description', 'is_active', 'cost', 'owner_id', 'is_hot', 'is_not_for_sale', 'reservation_required', 'reservation_cutoff', 'reservation_note']:
                if field in product_data:
                    update_fields.append(f"{field} = ?")
                    values.append(product_data[field])

            if not update_fields:
                return False

            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            values.append(product_id)

            sql = f"UPDATE products SET {', '.join(update_fields)} WHERE id = ?"
            cursor.execute(sql, values)

            success = cursor.rowcount > 0

            if success and 'category' in product_data and product_data['category'] != old_category:
                conn.commit()
                try:
                    CategoryDB.cleanup_orphan_categories()
                except Exception:
                    pass

            conn.commit()
            return success

    @staticmethod
    def update_stock(product_id: str, new_stock: int) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE products
                SET stock = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (new_stock, product_id))

            success = cursor.rowcount > 0
            conn.commit()
            return success

    @staticmethod
    def update_image_path(product_id: str, new_img_path: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE products
                SET img_path = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (new_img_path, product_id))
            ok = cursor.rowcount > 0
            conn.commit()
            return ok

    @staticmethod
    def delete_product(product_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT category FROM products WHERE id = ?', (product_id,))
            product = cursor.fetchone()
            if not product:
                return False

            category_name = product[0]
            cursor.execute('DELETE FROM products WHERE id = ?', (product_id,))
            success = cursor.rowcount > 0

            if success:
                conn.commit()
                try:
                    CategoryDB.cleanup_orphan_categories()
                except Exception:
                    pass

            conn.commit()
            return success

    @staticmethod
    def batch_delete_products(product_ids: List[str]) -> Dict[str, Any]:
        if not product_ids:
            return {"success": False, "deleted_count": 0, "message": "没有提供要删除的商品ID"}

        with get_db_connection() as conn:
            cursor = conn.cursor()
            placeholders = ','.join('?' for _ in product_ids)
            cursor.execute(f'SELECT DISTINCT category FROM products WHERE id IN ({placeholders})', product_ids)
            categories = [row[0] for row in cursor.fetchall()]

            cursor.execute(f'DELETE FROM products WHERE id IN ({placeholders})', product_ids)
            deleted_count = cursor.rowcount

            success = deleted_count > 0

            if success:
                conn.commit()
                try:
                    CategoryDB.cleanup_orphan_categories()
                except Exception:
                    pass

            conn.commit()
            return {
                "success": success,
                "deleted_count": deleted_count,
                "message": f"成功删除 {deleted_count} 个商品" if success else "删除失败"
            }


class VariantDB:
    @staticmethod
    def get_by_product(product_id: str) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM product_variants WHERE product_id = ? ORDER BY created_at ASC', (product_id,))
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_for_products(product_ids: List[str]) -> Dict[str, List[Dict]]:
        if not product_ids:
            return {}
        with get_db_connection() as conn:
            cursor = conn.cursor()
            placeholders = ','.join('?' * len(product_ids))
            cursor.execute(f'SELECT * FROM product_variants WHERE product_id IN ({placeholders})', product_ids)
            rows = [dict(r) for r in cursor.fetchall()]
            mp: Dict[str, List[Dict]] = {}
            for r in rows:
                mp.setdefault(r['product_id'], []).append(r)
            return mp

    @staticmethod
    def get_by_id(variant_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM product_variants WHERE id = ?', (variant_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def create_variant(product_id: str, name: str, stock: int) -> str:
        vid = f"var_{int(datetime.now().timestamp()*1000)}"
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO product_variants (id, product_id, name, stock)
                VALUES (?, ?, ?, ?)
            ''', (vid, product_id, name, int(stock or 0)))
            conn.commit()
            return vid

    @staticmethod
    def update_variant(variant_id: str, name: Optional[str] = None, stock: Optional[int] = None) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            fields = []
            vals: List[Any] = []
            if name is not None:
                fields.append('name = ?')
                vals.append(name)
            if stock is not None:
                fields.append('stock = ?')
                vals.append(int(stock))
            if not fields:
                return False
            fields.append('updated_at = CURRENT_TIMESTAMP')
            vals.append(variant_id)
            sql = f"UPDATE product_variants SET {', '.join(fields)} WHERE id = ?"
            cursor.execute(sql, vals)
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def delete_variant(variant_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM product_variants WHERE id = ?', (variant_id,))
            conn.commit()
            return cursor.rowcount > 0


class CategoryDB:
    @staticmethod
    def get_all_categories() -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM categories ORDER BY name')
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_categories_with_products(owner_ids: Optional[List[str]] = None, include_unassigned: bool = True) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if owner_ids is None:
                cursor.execute('''
                    SELECT DISTINCT c.*
                    FROM categories c
                    INNER JOIN products p ON c.name = p.category
                    ORDER BY c.name
                ''')
            else:
                where_sql, params = ProductDB._build_owner_filter(owner_ids, include_unassigned)
                if where_sql == '1=0':
                    return []
                cursor.execute(f'''
                    SELECT DISTINCT c.*
                    FROM categories c
                    INNER JOIN products p ON c.name = p.category
                    WHERE {where_sql}
                    ORDER BY c.name
                ''', params)
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_categories_with_active_products(owner_ids: Optional[List[str]] = None, include_unassigned: bool = True) -> List[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if owner_ids is None:
                cursor.execute('''
                    SELECT DISTINCT c.*
                    FROM categories c
                    INNER JOIN products p ON c.name = p.category
                    WHERE p.is_active = 1
                    ORDER BY c.name
                ''')
            else:
                where_sql, params = ProductDB._build_owner_filter(owner_ids, include_unassigned)
                if where_sql == '1=0':
                    return []
                cursor.execute(f'''
                    SELECT DISTINCT c.*
                    FROM categories c
                    INNER JOIN products p ON c.name = p.category
                    WHERE ({where_sql}) AND p.is_active = 1
                    ORDER BY c.name
                ''', params)
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def get_category_by_id(category_id: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM categories WHERE id = ?', (category_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def get_category_by_name(name: str) -> Optional[Dict]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM categories WHERE name = ?', (name,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def create_category(name: str, description: str = "") -> str:
        category_id = f"cat_{int(datetime.now().timestamp())}"

        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    INSERT INTO categories (id, name, description)
                    VALUES (?, ?, ?)
                ''', (category_id, name, description))
                conn.commit()
                return category_id
            except sqlite3.IntegrityError:
                return ""

    @staticmethod
    def update_category(category_id: str, name: str = None, description: str = None) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            update_fields = []
            values = []

            if name is not None:
                update_fields.append("name = ?")
                values.append(name)

            if description is not None:
                update_fields.append("description = ?")
                values.append(description)

            if not update_fields:
                return False

            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            values.append(category_id)

            try:
                sql = f"UPDATE categories SET {', '.join(update_fields)} WHERE id = ?"
                cursor.execute(sql, values)
                success = cursor.rowcount > 0
                conn.commit()
                return success
            except sqlite3.IntegrityError:
                return False

    @staticmethod
    def delete_category(category_id: str) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM products WHERE category = (SELECT name FROM categories WHERE id = ?)', (category_id,))
            product_count = cursor.fetchone()[0]

            if product_count > 0:
                return False

            cursor.execute('DELETE FROM categories WHERE id = ?', (category_id,))
            success = cursor.rowcount > 0
            conn.commit()
            return success

    @staticmethod
    def cleanup_orphan_categories() -> int:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('''
                    DELETE FROM categories
                    WHERE name NOT IN (SELECT DISTINCT category FROM products)
                ''')
                deleted = cursor.rowcount if cursor.rowcount is not None else 0
                conn.commit()
                if deleted > 0:
                    logger.info("自动清理空分类完成，删除 %s 个分类", deleted)
                return deleted
            except Exception as exc:
                logger.error("清理空分类失败: %s", exc)
                conn.rollback()
            return 0
