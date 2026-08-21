import asyncio
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI

from database import (
    CategoryDB,
    OrderDB,
    OrderExportDB,
    cleanup_old_chat_logs,
    get_db_connection,
    init_database,
    migrate_image_paths,
    migrate_agent_image_paths,
    migrate_payment_qr_paths,
)
from .context import EXPORTS_DIR, ITEMS_DIR, PUBLIC_DIR, logger
from .services.captcha import CaptchaService
from admin_ai_chat import cleanup_temp_uploads
from ai_model_config import get_ai_model_configs, migrate_legacy_ai_model_settings


def fix_legacy_product_ownership():
    """修复旧系统遗留的owner_id为None的商品，分配给统一的'admin'。"""
    logger.info("Checking and repairing legacy product ownership")

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM products WHERE owner_id IS NULL OR owner_id = ''")
            count = cursor.fetchone()[0]

            if count == 0:
                logger.info("No products require ownership repair")
                return

            logger.info("Found %s products with missing ownership", count)
            cursor.execute(
                "SELECT COUNT(*) FROM admins WHERE (role = 'super_admin' OR role = 'admin') AND is_active = 1"
            )
            admin_count = cursor.fetchone()[0]

            if admin_count > 0:
                logger.info("Using unified owner_id 'admin' as default ownership")
                cursor.execute(
                    "UPDATE products SET owner_id = ? WHERE owner_id IS NULL OR owner_id = ''",
                    ("admin",),
                )

                updated_count = cursor.rowcount
                conn.commit()
                logger.info("Repaired ownership for %s products", updated_count)
            else:
                logger.warning("No active admin account found; skipping product ownership repair")

    except Exception as exc:
        logger.error("Failed to repair legacy product ownership: %s", exc)
        raise


def migrate_admin_products_to_unified_owner():
    """将现有admin拥有的商品迁移到统一的'admin'owner_id。"""
    logger.info("Migrating existing admin-owned products to unified owner_id")

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id FROM admins WHERE (role = 'super_admin' OR role = 'admin') AND is_active = 1"
            )
            admin_ids = [row[0] for row in cursor.fetchall()]

            if not admin_ids:
                logger.info("No active admins found; skipping migration")
                return

            placeholders = ", ".join(["?" for _ in admin_ids])
            cursor.execute(f"SELECT COUNT(*) FROM products WHERE owner_id IN ({placeholders})", admin_ids)
            count = cursor.fetchone()[0]

            if count == 0:
                logger.info("No admin-owned products require migration")
                return

            logger.info("Found %s admin-owned products to migrate", count)
            cursor.execute(
                f"UPDATE products SET owner_id = ? WHERE owner_id IN ({placeholders})",
                ["admin"] + admin_ids,
            )

            updated_count = cursor.rowcount
            conn.commit()
            logger.info("Migrated %s admin-owned products to owner_id 'admin'", updated_count)

    except Exception as exc:
        logger.error("Failed to migrate admin product ownership: %s", exc)
        raise


def fix_legacy_config_ownership():
    """修复旧系统遗留的配置数据owner_id为None的问题，分配给统一的'admin'。"""
    logger.info("Checking and repairing legacy config ownership")

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            config_tables = {
                "lottery_prizes": "抽奖奖项",
                "auto_gift_items": "自动赠品",
                "gift_thresholds": "满额门槛",
                "coupons": "优惠券",
                "settings": "系统设置",
            }

            total_fixed = 0
            fix_summary = []

            for table, description in config_tables.items():
                try:
                    cursor.execute(f"PRAGMA table_info({table})")
                    columns = [row[1] for row in cursor.fetchall()]

                    if "owner_id" not in columns:
                        logger.debug("Skipping %s table because owner_id column is missing", table)
                        continue

                    cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE owner_id IS NULL OR owner_id = ''")
                    count = cursor.fetchone()[0]

                    if count > 0:
                        cursor.execute(f"UPDATE {table} SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
                        fixed_count = cursor.rowcount
                        total_fixed += fixed_count
                        fix_summary.append(f"{description}: {fixed_count}项")
                        logger.info("Repaired owner_id for %s rows in %s", fixed_count, table)

                except Exception as exc:
                    logger.warning("Failed while repairing table %s: %s", table, exc)
                    continue

            if total_fixed > 0:
                conn.commit()
                logger.info("Config ownership repair completed: %s rows fixed (%s)", total_fixed, ", ".join(fix_summary))
            else:
                logger.info("No config data requires ownership repair")

    except Exception as exc:
        logger.error("Failed to repair legacy config ownership: %s", exc)
        raise


def log_model_configuration_snapshot() -> None:
    """记录后台保存的最终模型列表，便于排查模型选择器。"""
    all_models = get_ai_model_configs(include_disabled=True)
    configured_models = [model for model in all_models if model.enabled]

    if not all_models:
        logger.warning("No models configured; add one in 管理后台 → AI 模型")
        return
    if not configured_models:
        logger.warning("All configured AI models are disabled; AI chat is currently unavailable")
        return

    logger.info(
        "Current enabled database-backed model selector options (%s/%s): %s",
        len(configured_models),
        len(all_models),
        [
            {"model": cfg.name, "label": cfg.label, "supports_thinking": cfg.supports_thinking}
            for cfg in configured_models
        ],
    )



async def run_startup_tasks() -> List[asyncio.Task]:
    """应用启动时初始化并启动后台任务，返回需要在关闭时清理的任务列表。"""
    logger.info("Starting dorm shop API")

    init_database()

    try:
        migrate_legacy_ai_model_settings()
    except Exception as exc:
        logger.warning("Legacy AI model configuration import failed: %s", exc)

    try:
        CategoryDB.cleanup_orphan_categories()
    except Exception as exc:
        logger.warning("Startup orphan-category cleanup failed: %s", exc)

    try:
        fix_legacy_product_ownership()
    except Exception as exc:
        logger.warning("Legacy product ownership repair failed: %s", exc)

    try:
        migrate_admin_products_to_unified_owner()
    except Exception as exc:
        logger.warning("Admin product ownership migration failed: %s", exc)

    try:
        fix_legacy_config_ownership()
    except Exception as exc:
        logger.warning("Legacy config ownership repair failed: %s", exc)

    try:
        migrate_image_paths(ITEMS_DIR)
    except Exception as exc:
        logger.warning("Product image path migration failed: %s", exc)

    try:
        migrate_agent_image_paths(ITEMS_DIR)
    except Exception as exc:
        logger.warning("Agent image directory migration failed: %s", exc)

    try:
        migrate_payment_qr_paths(PUBLIC_DIR)
    except Exception as exc:
        logger.warning("Payment QR path migration failed: %s", exc)

    try:
        removed = CaptchaService.cleanup_generated_images(force=True)
        if removed:
            logger.info("Startup captcha image cleanup removed %s files", removed)
    except Exception as exc:
        logger.warning("Startup captcha image cleanup failed: %s", exc)

    try:
        removed_tmp = cleanup_temp_uploads(max_age_hours=24)
        if removed_tmp:
            logger.info("Startup temp upload cleanup removed %s files", removed_tmp)
    except Exception as exc:
        logger.warning("Startup temp upload cleanup failed: %s", exc)

    maintenance_tasks: List[asyncio.Task] = []
    maintenance_tasks.append(asyncio.create_task(periodic_cleanup(), name="periodic_cleanup"))
    maintenance_tasks.append(asyncio.create_task(expired_unpaid_cleanup(), name="expired_unpaid_cleanup"))
    maintenance_tasks.append(asyncio.create_task(captcha_cleanup(), name="captcha_cleanup"))

    log_model_configuration_snapshot()
    logger.info("Dorm shop API startup completed")
    return maintenance_tasks


async def periodic_cleanup():
    """定时清理任务。"""
    while True:
        try:
            await asyncio.sleep(24 * 60 * 60)
            cleanup_old_chat_logs()
            try:
                CategoryDB.cleanup_orphan_categories()
            except Exception as exc:
                logger.warning("Periodic orphan-category cleanup failed: %s", exc)
            try:
                removed_exports = OrderExportDB.cleanup_expired_files(EXPORTS_DIR)
                if removed_exports:
                    logger.info("Removed %s expired export files", removed_exports)
            except Exception as exc:
                logger.warning("Export cleanup failed: %s", exc)
            try:
                removed_tmp = cleanup_temp_uploads(max_age_hours=24)
                if removed_tmp:
                    logger.info("Periodic temp upload cleanup removed %s files", removed_tmp)
            except Exception as exc:
                logger.warning("Periodic temp upload cleanup failed: %s", exc)
        except Exception as exc:
            logger.error("Periodic cleanup task failed: %s", exc)


async def expired_unpaid_cleanup():
    """清理超过15分钟未付款订单。"""
    while True:
        try:
            await asyncio.sleep(60)
            deleted = OrderDB.purge_expired_unpaid_orders(15)
            if deleted:
                logger.info("Purged %s expired unpaid orders", deleted)
        except Exception as exc:
            logger.error("Expired unpaid order cleanup task failed: %s", exc)


async def captcha_cleanup():
    """高频清理验证码生成图片，防止临时文件堆积。"""
    while True:
        try:
            await asyncio.sleep(30)
            removed = CaptchaService.cleanup_generated_images()
            if removed:
                logger.info("Removed %s temporary captcha images", removed)
        except Exception as exc:
            logger.error("Captcha image cleanup task failed: %s", exc)


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    background_tasks: List[asyncio.Task] = []
    try:
        background_tasks = await run_startup_tasks()
        yield
    finally:
        for task in background_tasks:
            task.cancel()
        if background_tasks:
            await asyncio.gather(*background_tasks, return_exceptions=True)
