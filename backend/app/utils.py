from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from .context import logger


def is_truthy(value: Optional[Any]) -> bool:
    """将不同类型的输入转换为布尔值，识别常见真值表示。"""
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value).strip().lower()
    return text in {"1", "true", "yes", "on"}


def is_non_sellable(product: Dict[str, Any]) -> bool:
    """统一判断商品是否标记为非卖品。"""
    if not isinstance(product, dict):
        return False
    try:
        return is_truthy(product.get("is_not_for_sale"))
    except Exception:
        return False


def convert_sqlite_timestamp_to_unix(created_at_str: str, order_id: str = None) -> int:
    """
    将SQLite的CURRENT_TIMESTAMP字符串转换为Unix时间戳（秒）
    SQLite返回的是UTC时间，需要正确处理时区
    """
    try:
        if " " in created_at_str:
            dt = datetime.strptime(created_at_str, "%Y-%m-%d %H:%M:%S")
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = datetime.fromisoformat(created_at_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)

        timestamp = int(dt.timestamp())

        current_timestamp = int(datetime.now(tz=timezone.utc).timestamp())
        age_minutes = (current_timestamp - timestamp) // 60
        order_info = f"订单 {order_id}" if order_id else "时间"
        logger.debug(f"{order_info} 时间转换: {created_at_str} (UTC) -> {timestamp}, 创建于 {age_minutes} 分钟前")

        return timestamp
    except Exception as exc:
        order_info = f"订单 {order_id}" if order_id else "时间"
        logger.warning(f"{order_info} 转换失败: {exc}, 原始时间: {created_at_str}")
        return int(datetime.now(tz=timezone.utc).timestamp() - 3600)


def format_device_time_ms(ms_value: Optional[float], tz_offset_minutes: Optional[int], fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """根据设备时区偏移格式化毫秒时间戳。"""
    if ms_value is None:
        return ""
    try:
        seconds = float(ms_value) / 1000.0
        dt_utc = datetime.utcfromtimestamp(seconds)
        if tz_offset_minutes is not None:
            dt_local = dt_utc - timedelta(minutes=int(tz_offset_minutes))
        else:
            dt_local = datetime.fromtimestamp(seconds)
        return dt_local.strftime(fmt)
    except Exception:
        return ""


def format_export_range_label(start_ms: Optional[float], end_ms: Optional[float], tz_offset_minutes: Optional[int]) -> str:
    """生成导出范围的友好描述。"""
    if start_ms is None and end_ms is None:
        return "全部时间"
    start_label = format_device_time_ms(start_ms, tz_offset_minutes, "%Y-%m-%d") if start_ms is not None else ""
    end_label = format_device_time_ms(end_ms, tz_offset_minutes, "%Y-%m-%d") if end_ms is not None else ""
    if start_label and end_label:
        return f"{start_label} 至 {end_label}"
    return start_label or end_label or "全部时间"


def build_export_filename(start_ms: Optional[float], end_ms: Optional[float]) -> str:
    """根据时间范围生成导出文件名。"""
    start_part = format_device_time_ms(start_ms, None, "%Y%m%d") if start_ms is not None else "all"
    end_part = format_device_time_ms(end_ms, None, "%Y%m%d") if end_ms is not None else "all"
    timestamp_part = datetime.now().strftime("%Y%m%dT%H%M%S")
    return f"orders_{start_part}-{end_part}_{timestamp_part}.xlsx"


def resolve_image_url(img_path: Optional[str]) -> str:
    """
    将商品图片路径转换为可直接使用的 URL。
    
    新格式: 12字符哈希 -> /items/{hash}.webp
    旧格式: 完整路径 -> /items/{path} (URL编码)
    """
    if not img_path:
        return ""
    path = str(img_path).strip()
    if not path:
        return ""
    # 如果已经是完整URL，直接返回
    if path.startswith(("http://", "https://", "//")):
        return path
    # 如果已经是以 /items/ 开头，直接返回
    if path.startswith("/items/"):
        return path
    # 新格式: 12字符哈希值（纯字母数字）
    if len(path) == 12 and path.isalnum():
        return f"/items/{path}.webp"
    # 旧格式: 完整路径
    from urllib.parse import quote
    # 去掉 items/ 前缀（如果有）
    if path.startswith("items/"):
        path = path[6:]
    encoded_path = quote(path, safe='/:@!$&\'()*+,;=')
    return f"/items/{encoded_path}"


def enrich_product_image_url(product: Dict[str, Any]) -> Dict[str, Any]:
    """
    给商品字典添加 image_url 字段，基于 img_path 转换。
    """
    if isinstance(product, dict):
        img_path = product.get("img_path", "")
        product["image_url"] = resolve_image_url(img_path)
    return product


__all__ = [
    "is_truthy",
    "is_non_sellable",
    "convert_sqlite_timestamp_to_unix",
    "format_device_time_ms",
    "format_export_range_label",
    "build_export_filename",
    "resolve_image_url",
    "enrich_product_image_url",
    "logger",
]
