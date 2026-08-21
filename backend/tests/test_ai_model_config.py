import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from ai_model_config import (  # noqa: E402
    AI_MODELS_SETTING_KEY,
    get_ai_model_configs,
    migrate_legacy_ai_model_settings,
    normalize_ai_model_configs,
    save_ai_model_configs,
    test_ai_model_configs as run_ai_model_tests,
)
from config import ModelConfig  # noqa: E402


class AIModelConfigTests(unittest.TestCase):
    def test_normalize_trims_values_and_preserves_order(self):
        models = normalize_ai_model_configs(
            [
                {"model": " vendor/default ", "model_name": " Default ", "supports_thinking": False},
                {"model": "vendor/reasoning", "model_name": "Reasoning", "supports_thinking": True},
            ]
        )

        self.assertEqual([item.name for item in models], ["vendor/default", "vendor/reasoning"])
        self.assertEqual(models[0].label, "Default")
        self.assertTrue(models[1].supports_thinking)
        self.assertTrue(models[0].enabled)

    def test_normalize_rejects_case_insensitive_duplicates(self):
        with self.assertRaisesRegex(ValueError, "重复"):
            normalize_ai_model_configs(
                [
                    {"model": "Vendor/Model", "model_name": "One"},
                    {"model": "vendor/model", "model_name": "Two"},
                ]
            )

    @patch("ai_model_config.SettingsDB.set", return_value=True)
    def test_save_uses_single_versioned_database_value(self, mocked_set):
        saved = save_ai_model_configs(
            [{"model": "vendor/model", "model_name": "Readable name", "supports_thinking": True}]
        )

        self.assertEqual(saved[0].name, "vendor/model")
        key, raw_value = mocked_set.call_args.args
        self.assertEqual(key, AI_MODELS_SETTING_KEY)
        payload = json.loads(raw_value)
        self.assertEqual(payload["version"], 1)
        self.assertEqual(payload["models"][0]["model_name"], "Readable name")
        self.assertTrue(payload["models"][0]["enabled"])

    @patch("ai_model_config.SettingsDB.get")
    def test_get_reads_latest_database_value_each_time(self, mocked_get):
        mocked_get.side_effect = [
            json.dumps({"models": [{"model": "first", "model_name": "First"}]}),
            json.dumps({"models": [{"model": "second", "model_name": "Second"}]}),
        ]

        self.assertEqual(get_ai_model_configs()[0].name, "first")
        self.assertEqual(get_ai_model_configs()[0].name, "second")
        self.assertEqual(mocked_get.call_count, 2)

    @patch("ai_model_config.SettingsDB.get")
    def test_disabled_models_are_kept_for_admin_but_hidden_from_runtime(self, mocked_get):
        mocked_get.return_value = json.dumps(
            {
                "models": [
                    {"model": "disabled", "model_name": "Disabled", "enabled": False},
                    {"model": "enabled", "model_name": "Enabled", "enabled": True},
                ]
            }
        )

        self.assertEqual([item.name for item in get_ai_model_configs()], ["enabled"])
        self.assertEqual(
            [item.name for item in get_ai_model_configs(include_disabled=True)],
            ["disabled", "enabled"],
        )

    @patch("ai_model_config.SettingsDB.set", return_value=True)
    @patch("ai_model_config.SettingsDB.get", return_value=None)
    def test_legacy_environment_is_imported_only_when_database_is_empty(self, _mocked_get, mocked_set):
        legacy_env = {
            "MODEL": "vendor/one,vendor/two",
            "MODEL_NAME": "One,Two",
            "SUPPORTS_THINKING": "vendor/two",
        }
        with patch.dict(os.environ, legacy_env, clear=False):
            imported = migrate_legacy_ai_model_settings()

        self.assertTrue(imported)
        payload = json.loads(mocked_set.call_args.args[1])
        self.assertFalse(payload["models"][0]["supports_thinking"])
        self.assertTrue(payload["models"][1]["supports_thinking"])


class AIModelConnectivityTests(unittest.IsolatedAsyncioTestCase):
    async def test_connectivity_results_include_status_and_provider_error(self):
        async def handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content)
            if payload["model"] == "available":
                return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})
            return httpx.Response(429, json={"error": {"message": "Rate limit reached"}})

        results = await run_ai_model_tests(
            [
                ModelConfig(name="available", label="Available", supports_thinking=False),
                ModelConfig(name="unavailable", label="Unavailable", supports_thinking=False, enabled=False),
            ],
            transport=httpx.MockTransport(handler),
        )

        self.assertTrue(results[0]["available"])
        self.assertEqual(results[0]["status_code"], 200)
        self.assertIsNone(results[0]["error"])
        self.assertFalse(results[1]["available"])
        self.assertEqual(results[1]["status_code"], 429)
        self.assertEqual(results[1]["error"], "Rate limit reached")


if __name__ == "__main__":
    unittest.main()
