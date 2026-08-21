"""Database-backed AI model configuration.

The model selector is intentionally read from the database for every request so
changes made in the admin portal take effect immediately without a restart.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Iterable, List, Mapping

import httpx

from config import ModelConfig, _split_csv, get_settings
from database import SettingsDB


logger = logging.getLogger(__name__)

AI_MODELS_SETTING_KEY = "ai_models"
MAX_MODEL_COUNT = 50
MAX_MODEL_ID_LENGTH = 200
MAX_MODEL_LABEL_LENGTH = 80
MODEL_TEST_TIMEOUT_SECONDS = 45.0
MODEL_TEST_CONCURRENCY = 5


def _serialize_model(model: ModelConfig) -> dict[str, Any]:
    return {
        "model": model.name,
        "model_name": model.label,
        "supports_thinking": model.supports_thinking,
        "enabled": model.enabled,
    }


def _parse_stored_models(raw_value: str | None) -> List[ModelConfig]:
    if not raw_value:
        return []

    try:
        payload = json.loads(raw_value)
    except (TypeError, json.JSONDecodeError) as exc:
        logger.error("AI model settings contain invalid JSON: %s", exc)
        return []

    items = payload.get("models") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        logger.error("AI model settings must contain a models list")
        return []

    models: List[ModelConfig] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        model_id = str(item.get("model") or "").strip()
        label = str(item.get("model_name") or item.get("name") or "").strip()
        normalized_id = model_id.casefold()
        if not model_id or not label or normalized_id in seen:
            continue
        seen.add(normalized_id)
        models.append(
            ModelConfig(
                name=model_id,
                label=label,
                supports_thinking=bool(item.get("supports_thinking", False)),
                enabled=item.get("enabled", True) is not False,
            )
        )
    return models


def get_ai_model_configs(*, include_disabled: bool = False) -> List[ModelConfig]:
    """Return current models, filtering disabled entries for runtime callers."""
    models = _parse_stored_models(SettingsDB.get(AI_MODELS_SETTING_KEY))
    if include_disabled:
        return models
    return [model for model in models if model.enabled]


def normalize_ai_model_configs(items: Iterable[Mapping[str, Any]]) -> List[ModelConfig]:
    """Validate and normalize an admin-supplied model list."""
    raw_items = list(items)
    if not raw_items:
        raise ValueError("至少需要配置一个 AI 模型")
    if len(raw_items) > MAX_MODEL_COUNT:
        raise ValueError(f"最多可配置 {MAX_MODEL_COUNT} 个 AI 模型")

    models: List[ModelConfig] = []
    seen: set[str] = set()
    for index, item in enumerate(raw_items, start=1):
        model_id = str(item.get("model") or "").strip()
        label = str(item.get("model_name") or "").strip()
        if not label:
            raise ValueError(f"第 {index} 个模型缺少显示名称")
        if not model_id:
            raise ValueError(f"第 {index} 个模型缺少模型标识")
        if len(label) > MAX_MODEL_LABEL_LENGTH:
            raise ValueError(f"第 {index} 个模型的显示名称不能超过 {MAX_MODEL_LABEL_LENGTH} 个字符")
        if len(model_id) > MAX_MODEL_ID_LENGTH:
            raise ValueError(f"第 {index} 个模型的模型标识不能超过 {MAX_MODEL_ID_LENGTH} 个字符")

        normalized_id = model_id.casefold()
        if normalized_id in seen:
            raise ValueError(f"模型标识“{model_id}”重复，请保留一项")
        seen.add(normalized_id)
        models.append(
            ModelConfig(
                name=model_id,
                label=label,
                supports_thinking=bool(item.get("supports_thinking", False)),
                enabled=item.get("enabled", True) is not False,
            )
        )
    return models


def save_ai_model_configs(items: Iterable[Mapping[str, Any]]) -> List[ModelConfig]:
    """Persist the complete ordered model list."""
    models = normalize_ai_model_configs(items)
    payload = json.dumps(
        {"version": 1, "models": [_serialize_model(model) for model in models]},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    if not SettingsDB.set(AI_MODELS_SETTING_KEY, payload):
        raise RuntimeError("AI 模型配置保存失败")
    return models


def _extract_provider_error(response: httpx.Response) -> str:
    """Extract a short, readable upstream error without returning a huge body."""
    message = ""
    try:
        payload = response.json()
        if isinstance(payload, dict):
            error_value = payload.get("error")
            if isinstance(error_value, dict):
                message = str(error_value.get("message") or error_value.get("detail") or "").strip()
            elif error_value:
                message = str(error_value).strip()
            if not message:
                message = str(payload.get("message") or payload.get("detail") or "").strip()
    except (ValueError, TypeError):
        pass
    if not message:
        message = response.text.strip()
    if not message:
        message = "AI 服务未返回错误详情"
    return message[:800]


async def test_ai_model_configs(
    models: Iterable[ModelConfig],
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> List[dict[str, Any]]:
    """Issue a minimal real chat request for every supplied model."""
    model_list = list(models)
    settings = get_settings()
    endpoint = settings.api_url.rstrip("/") + "/chat/completions"
    semaphore = asyncio.Semaphore(MODEL_TEST_CONCURRENCY)
    timeout = httpx.Timeout(MODEL_TEST_TIMEOUT_SECONDS, connect=15.0)

    async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
        async def check_model(model: ModelConfig) -> dict[str, Any]:
            started_at = time.perf_counter()
            request_payload: dict[str, Any] = {
                "model": model.name,
                "messages": [{"role": "user", "content": "Reply with OK only."}],
                "stream": False,
            }
            if model.supports_thinking:
                request_payload["reasoning"] = {"effort": "low"}

            result: dict[str, Any] = {
                "model": model.name,
                "model_name": model.label,
                "available": False,
                "status_code": None,
                "error": None,
            }
            try:
                async with semaphore:
                    response = await client.post(
                        endpoint,
                        headers={
                            "Authorization": f"Bearer {settings.api_key}",
                            "Content-Type": "application/json",
                        },
                        json=request_payload,
                    )
                result["status_code"] = response.status_code
                if response.status_code == 200:
                    result["available"] = True
                else:
                    result["error"] = _extract_provider_error(response)
            except httpx.TimeoutException:
                result["error"] = f"请求超时（{int(MODEL_TEST_TIMEOUT_SECONDS)} 秒）"
            except httpx.RequestError as exc:
                result["error"] = f"网络请求失败：{str(exc)[:700]}"
            except Exception as exc:
                logger.exception("Unexpected AI model test failure for %s", model.name)
                result["error"] = f"检测失败：{str(exc)[:700]}"
            result["latency_ms"] = round((time.perf_counter() - started_at) * 1000)
            return result

        return list(await asyncio.gather(*(check_model(model) for model in model_list)))


def migrate_legacy_ai_model_settings() -> bool:
    """Import legacy MODEL variables once when no database setting exists."""
    if SettingsDB.get(AI_MODELS_SETTING_KEY) is not None:
        return False

    model_ids = _split_csv(os.getenv("MODEL"))
    labels = _split_csv(os.getenv("MODEL_NAME"))
    thinking_ids = {item.casefold() for item in _split_csv(os.getenv("SUPPORTS_THINKING"))}
    if not model_ids:
        logger.warning("No AI models configured yet; add one in 管理后台 → AI 模型")
        return False

    legacy_items = []
    seen: set[str] = set()
    for index, model_id in enumerate(model_ids):
        normalized_id = model_id.casefold()
        if normalized_id in seen:
            logger.warning("Skipping duplicate legacy AI model: %s", model_id)
            continue
        seen.add(normalized_id)
        legacy_items.append(
            {
                "model": model_id,
                "model_name": labels[index] if index < len(labels) and labels[index].strip() else model_id,
                "supports_thinking": normalized_id in thinking_ids,
                "enabled": True,
            }
        )

    if not legacy_items:
        return False
    save_ai_model_configs(legacy_items)
    logger.info("Imported %s legacy AI model(s) into admin settings", len(legacy_items))
    return True


def serialize_ai_model_configs(models: Iterable[ModelConfig]) -> List[dict[str, Any]]:
    return [_serialize_model(model) for model in models]


__all__ = [
    "AI_MODELS_SETTING_KEY",
    "get_ai_model_configs",
    "migrate_legacy_ai_model_settings",
    "normalize_ai_model_configs",
    "save_ai_model_configs",
    "serialize_ai_model_configs",
    "test_ai_model_configs",
]
