import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Mapping, Optional


@dataclass(frozen=True)
class ValidationResult:
    passed: bool
    message: str


DEFAULT_USERNAME_VALIDATION_RULES: Dict[str, Dict[str, Any]] = {
    "min_length": {
        "enabled": True,
        "value": 2,
        "message": "用户名至少需要2个字符",
    },
    "max_length": {
        "enabled": False,
        "value": 20,
        "message": "用户名不能超过20个字符",
    },
    "allowed_pattern": {
        "enabled": False,
        "value": r"^[A-Za-z0-9_]+$",
        "message": "用户名只能包含字母、数字和下划线",
    },
    "required_substrings": {
        "enabled": False,
        "value": [],
        "message": "用户名必须包含指定内容",
    },
    "required_regex_patterns": {
        "enabled": False,
        "value": [r"[A-Za-z]"],
        "message": "用户名必须匹配指定格式",
    },
    "forbidden_values": {
        "enabled": False,
        "value": ["admin", "administrator", "root"],
        "message": "该用户名不允许注册",
    },
    "forbidden_regex_patterns": {
        "enabled": False,
        "value": [],
        "message": "用户名包含不允许的内容",
    },
}

# 用户可直接修改这个配置；缺失或类型不正确的字段会自动回退到默认规则。
USERNAME_VALIDATION_RULES: Dict[str, Dict[str, Any]] = {
    key: value.copy() for key, value in DEFAULT_USERNAME_VALIDATION_RULES.items()
}

DEFAULT_USERNAME_PLACEHOLDER = "登录名"

# 用户名输入框 UI 配置，用户可按需直接修改。
USERNAME_VALIDATION_UI_CONFIG: Dict[str, Any] = {
    "placeholder": DEFAULT_USERNAME_PLACEHOLDER,
}

USERNAME_VALIDATION_SUCCESS_MESSAGE = "验证通过"


class RegistrationUsernameValidator:
    def __init__(self, rules: Optional[Mapping[str, Mapping[str, Any]]] = None):
        self._raw_rules = rules or USERNAME_VALIDATION_RULES

    def validate(self, username: str) -> ValidationResult:
        normalized_username = (username or "").strip()
        if not normalized_username:
            return ValidationResult(False, "用户名不能为空")

        min_length_rule = self._get_rule("min_length")
        min_length = self._safe_int(min_length_rule.get("value"), default=2)
        if min_length_rule["enabled"] and len(normalized_username) < min_length:
            return ValidationResult(False, min_length_rule["message"])

        max_length_rule = self._get_rule("max_length")
        max_length = self._safe_int(max_length_rule.get("value"), default=20)
        if max_length_rule["enabled"] and len(normalized_username) > max_length:
            return ValidationResult(False, max_length_rule["message"])

        allowed_pattern_rule = self._get_rule("allowed_pattern")
        allowed_pattern = str(allowed_pattern_rule.get("value") or "").strip()
        if (
            allowed_pattern_rule["enabled"]
            and allowed_pattern
            and re.fullmatch(allowed_pattern, normalized_username) is None
        ):
            return ValidationResult(False, allowed_pattern_rule["message"])

        required_substrings_rule = self._get_rule("required_substrings")
        required_substrings = self._safe_string_list(required_substrings_rule.get("value"))
        if required_substrings_rule["enabled"]:
            missing_substring = next(
                (
                    required_substring
                    for required_substring in required_substrings
                    if required_substring not in normalized_username
                ),
                None,
            )
            if missing_substring is not None:
                return ValidationResult(False, required_substrings_rule["message"])

        required_regex_rule = self._get_rule("required_regex_patterns")
        required_regex_patterns = self._safe_string_list(required_regex_rule.get("value"))
        if required_regex_rule["enabled"]:
            if any(
                re.search(pattern, normalized_username) is None
                for pattern in required_regex_patterns
                if pattern
            ):
                return ValidationResult(False, required_regex_rule["message"])

        forbidden_values_rule = self._get_rule("forbidden_values")
        forbidden_values = {
            value.casefold() for value in self._safe_string_list(forbidden_values_rule.get("value")) if value
        }
        if forbidden_values_rule["enabled"] and normalized_username.casefold() in forbidden_values:
            return ValidationResult(False, forbidden_values_rule["message"])

        forbidden_regex_rule = self._get_rule("forbidden_regex_patterns")
        forbidden_regex_patterns = self._safe_string_list(forbidden_regex_rule.get("value"))
        if forbidden_regex_rule["enabled"]:
            if any(
                re.search(pattern, normalized_username) is not None
                for pattern in forbidden_regex_patterns
                if pattern
            ):
                return ValidationResult(False, forbidden_regex_rule["message"])

        return ValidationResult(True, USERNAME_VALIDATION_SUCCESS_MESSAGE)

    def _get_rule(self, rule_name: str) -> Dict[str, Any]:
        default_rule = DEFAULT_USERNAME_VALIDATION_RULES[rule_name]
        configured_rule = self._raw_rules.get(rule_name) if isinstance(self._raw_rules, Mapping) else None
        merged_rule: Dict[str, Any] = default_rule.copy()

        if isinstance(configured_rule, Mapping):
            merged_rule.update(configured_rule)

        merged_rule["enabled"] = self._safe_bool(merged_rule.get("enabled", default_rule["enabled"]))
        merged_rule["message"] = str(merged_rule.get("message") or default_rule["message"])
        return merged_rule

    @staticmethod
    def _safe_int(value: Any, default: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _safe_bool(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return bool(value)

    @staticmethod
    def _safe_string_list(value: Any) -> List[str]:
        if isinstance(value, str):
            return [value]
        if not isinstance(value, Iterable):
            return []
        return [str(item) for item in value if item is not None]


def validate_registration_username(username: str) -> ValidationResult:
    return RegistrationUsernameValidator().validate(username)


def get_registration_username_placeholder() -> str:
    placeholder = USERNAME_VALIDATION_UI_CONFIG.get("placeholder", DEFAULT_USERNAME_PLACEHOLDER)
    normalized_placeholder = str(placeholder or "").strip()
    return normalized_placeholder or DEFAULT_USERNAME_PLACEHOLDER
