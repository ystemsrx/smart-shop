# /backend/scheduler.py
import asyncio
import logging
import os
from datetime import datetime, time
from database import cleanup_old_chat_logs, OrderExportDB

logger = logging.getLogger(__name__)

# 导出文件目录
EXPORTS_DIR = os.path.join(os.path.dirname(__file__), 'exports')

async def daily_cleanup_task():
    """每日清理任务"""
    while True:
        try:
            # 计算到凌晨3点的时间间隔
            now = datetime.now()
            target_time = time(3, 0, 0)  # 凌晨3点
            target_datetime = datetime.combine(now.date(), target_time)
            
            # 如果已经过了今天的3点，计算到明天3点的时间
            if now.time() > target_time:
                from datetime import timedelta
                target_datetime += timedelta(days=1)
            
            # 计算等待时间
            wait_seconds = (target_datetime - now).total_seconds()
            logger.info(f"下次清理任务将在 {target_datetime} 执行，等待 {wait_seconds:.0f} 秒")
            
            # 等待到指定时间
            await asyncio.sleep(wait_seconds)
            
            # 执行清理任务
            logger.info("开始执行清理任务")
            
            # 清理聊天记录
            cleanup_result = cleanup_old_chat_logs()
            logger.info(
                f"聊天记录清理完成，删除了 {cleanup_result.get('deleted_logs', 0)} 条过期记录，"
                f"移除了 {cleanup_result.get('deleted_threads', 0)} 条会话"
            )
            
            # 清理过期导出文件
            try:
                if os.path.exists(EXPORTS_DIR):
                    removed_exports = OrderExportDB.cleanup_expired_files(EXPORTS_DIR)
                    if removed_exports:
                        logger.info(f"清理过期导出文件 {removed_exports} 个")
                    else:
                        logger.info("无过期导出文件需要清理")
            except Exception as e:
                logger.error(f"清理过期导出文件失败: {e}")
            
        except Exception as e:
            logger.error(f"清理任务执行失败: {e}")
            # 出错后等待1小时再重试
            await asyncio.sleep(3600)

if __name__ == "__main__":
    # 独立运行定时任务
    asyncio.run(daily_cleanup_task())
