import asyncio
import os
from contextlib import asynccontextmanager
from collections import Counter
from typing import List

from fastapi import FastAPI

from config import get_settings
from database import (
    CategoryDB,
    OrderDB,
    OrderExportDB,
    cleanup_old_chat_logs,
    get_db_connection,
    init_database,
)
from .context import EXPORTS_DIR, logger


settings = get_settings()


def fix_legacy_product_ownership():
    """修复旧系统遗留的owner_id为None的商品，分配给统一的'admin'。"""
    logger.info("开始检查并修复旧商品的归属...")

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM products WHERE owner_id IS NULL OR owner_id = ''")
            count = cursor.fetchone()[0]

            if count == 0:
                logger.info("没有发现需要修复的商品")
                return

            logger.info(f"发现 {count} 个需要修复归属的商品")
            cursor.execute(
                "SELECT COUNT(*) FROM admins WHERE (role = 'super_admin' OR role = 'admin') AND is_active = 1"
            )
            admin_count = cursor.fetchone()[0]

            if admin_count > 0:
                logger.info("将使用统一的'admin'作为默认归属")
                cursor.execute(
                    "UPDATE products SET owner_id = ? WHERE owner_id IS NULL OR owner_id = ''",
                    ("admin",),
                )

                updated_count = cursor.rowcount
                conn.commit()
                logger.info(f"成功修复 {updated_count} 个商品的归属")
            else:
                logger.warning("未找到可用的管理员账户，跳过商品归属修复")

    except Exception as exc:
        logger.error(f"修复商品归属时发生错误: {exc}")
        raise


def migrate_admin_products_to_unified_owner():
    """将现有admin拥有的商品迁移到统一的'admin'owner_id。"""
    logger.info("开始迁移现有admin商品到统一的owner_id...")

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id FROM admins WHERE (role = 'super_admin' OR role = 'admin') AND is_active = 1"
            )
            admin_ids = [row[0] for row in cursor.fetchall()]

            if not admin_ids:
                logger.info("没有找到活跃的管理员，跳过迁移")
                return

            placeholders = ", ".join(["?" for _ in admin_ids])
            cursor.execute(f"SELECT COUNT(*) FROM products WHERE owner_id IN ({placeholders})", admin_ids)
            count = cursor.fetchone()[0]

            if count == 0:
                logger.info("没有发现需要迁移的管理员商品")
                return

            logger.info(f"发现 {count} 个需要迁移到统一owner_id的管理员商品")
            cursor.execute(
                f"UPDATE products SET owner_id = ? WHERE owner_id IN ({placeholders})",
                ["admin"] + admin_ids,
            )

            updated_count = cursor.rowcount
            conn.commit()
            logger.info(f"成功迁移 {updated_count} 个管理员商品到统一的'admin'归属")

    except Exception as exc:
        logger.error(f"迁移管理员商品归属时发生错误: {exc}")
        raise


def fix_legacy_config_ownership():
    """修复旧系统遗留的配置数据owner_id为None的问题，分配给统一的'admin'。"""
    logger.info("开始检查并修复旧配置数据的归属...")

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
                        logger.debug(f"表 {table} 没有 owner_id 列，跳过")
                        continue

                    cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE owner_id IS NULL OR owner_id = ''")
                    count = cursor.fetchone()[0]

                    if count > 0:
                        cursor.execute(f"UPDATE {table} SET owner_id = 'admin' WHERE owner_id IS NULL OR owner_id = ''")
                        fixed_count = cursor.rowcount
                        total_fixed += fixed_count
                        fix_summary.append(f"{description}: {fixed_count}项")
                        logger.info(f"修复 {table} 表中 {fixed_count} 项配置的owner_id")

                except Exception as exc:
                    logger.warning(f"修复表 {table} 时出错: {exc}")
                    continue

            if total_fixed > 0:
                conn.commit()
                logger.info(f"配置数据修复完成，共修复 {total_fixed} 项：{', '.join(fix_summary)}")
            else:
                logger.info("没有发现需要修复的配置数据")

    except Exception as exc:
        logger.error(f"修复配置数据归属时发生错误: {exc}")
        raise


def log_model_configuration_snapshot() -> None:
    """记录环境变量与最终模型列表之间的差异，便于排查选择器缺少模型的问题。"""
    env_models_raw = os.getenv("MODEL", "")
    env_labels_raw = os.getenv("MODEL_NAME", "")
    supports_raw = os.getenv("SUPPORTS_THINKING", "")

    env_models = [item.strip() for item in env_models_raw.split(",") if item.strip()]
    env_labels = [item.strip() for item in env_labels_raw.split(",") if item.strip()]
    supports_flags = {item.strip().lower() for item in supports_raw.split(",") if item.strip()}

    configured_models = settings.model_order
    configured_names = [cfg.name for cfg in configured_models]

    if not configured_models:
        logger.error("模型选择器没有可用模型，请检查 MODEL/MODEL_NAME 环境变量。")
        return

    if env_models:
        duplicate_models = [name for name, count in Counter(env_models).items() if count > 1]
        if duplicate_models:
            logger.warning("MODEL 环境变量中存在重复模型: %s", duplicate_models)

        if len(env_models) != len(env_labels):
            logger.warning(
                "MODEL 与 MODEL_NAME 的数量不一致：MODEL=%d, MODEL_NAME=%d。多余的模型将不会出现在选择器中。",
                len(env_models),
                len(env_labels),
            )

        missing_models = [name for name in env_models if name not in configured_names]
        if missing_models:
            logger.warning(
                "以下模型在环境变量中配置但未被加载：%s。"
                "请确认模型名称与 MODEL_NAME 一一对应，并在修改 .env 后重新启动后端服务。",
                missing_models,
            )

    logger.info(
        "模型选择器当前可用模型：%s",
        [
            {"model": cfg.name, "label": cfg.label, "supports_thinking": cfg.supports_thinking}
            for cfg in configured_models
        ],
    )

    logger.debug(
        "模型配置原始环境变量：MODEL=%r, MODEL_NAME=%r, SUPPORTS_THINKING=%r（解析后=%s）。最终加载模型=%s，supports_thinking=%s。",
        env_models_raw,
        env_labels_raw,
        supports_raw,
        sorted(supports_flags),
        configured_names,
        [cfg.supports_thinking for cfg in configured_models],
    )

    logger.debug("settings 对象 ID: %s, model_order 列表 ID: %s", id(settings), id(settings.model_order))
    logger.debug("get_settings() 缓存状态: %s", get_settings.cache_info())

    fresh_settings = get_settings()
    logger.debug(
        "get_settings() 返回对象 ID: %s, 是否为同一对象: %s",
        id(fresh_settings),
        fresh_settings is settings,
    )
    logger.debug(
        "get_settings().model_order 长度: %d, 列表: %s",
        len(fresh_settings.model_order),
        [cfg.name for cfg in fresh_settings.model_order],
    )

    if env_models:
        stale_models = [name for name in configured_names if name not in env_models]
        if stale_models:
            logger.debug(
                "模型列表包含未在当前 MODEL 环境变量中的条目：%s。"
                "若该情况出乎意料，请清理配置缓存或确认运行环境中没有其他来源的默认模型。",
                stale_models,
            )


async def run_startup_tasks() -> List[asyncio.Task]:
    """应用启动时初始化并启动后台任务，返回需要在关闭时清理的任务列表。"""
    logger.info("正在启动宿舍智能小商城API...")

    init_database()

    try:
        CategoryDB.cleanup_orphan_categories()
    except Exception as exc:
        logger.warning(f"启动时清理空分类失败: {exc}")

    try:
        fix_legacy_product_ownership()
    except Exception as exc:
        logger.warning(f"修复旧商品归属失败: {exc}")

    try:
        migrate_admin_products_to_unified_owner()
    except Exception as exc:
        logger.warning(f"迁移admin商品归属失败: {exc}")

    try:
        fix_legacy_config_ownership()
    except Exception as exc:
        logger.warning(f"修复旧配置数据归属失败: {exc}")

    maintenance_tasks: List[asyncio.Task] = []
    maintenance_tasks.append(asyncio.create_task(periodic_cleanup(), name="periodic_cleanup"))
    maintenance_tasks.append(asyncio.create_task(expired_unpaid_cleanup(), name="expired_unpaid_cleanup"))

    log_model_configuration_snapshot()
    logger.info("宿舍智能小商城API启动完成")
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
                logger.warning(f"定时清理空分类失败: {exc}")
            try:
                removed_exports = OrderExportDB.cleanup_expired_files(EXPORTS_DIR)
                if removed_exports:
                    logger.info(f"清理过期导出文件 {removed_exports} 个")
            except Exception as exc:
                logger.warning(f"清理导出文件失败: {exc}")
        except Exception as exc:
            logger.error(f"定时清理任务失败: {exc}")


async def expired_unpaid_cleanup():
    """清理超过15分钟未付款订单。"""
    while True:
        try:
            await asyncio.sleep(60)
            deleted = OrderDB.purge_expired_unpaid_orders(15)
            if deleted:
                logger.info(f"清理过期未付款订单: 删除 {deleted} 笔")
        except Exception as exc:
            logger.error(f"清理过期未付款订单任务失败: {exc}")


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
