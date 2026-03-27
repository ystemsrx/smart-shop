from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


_SERVICES_DIR = Path(__file__).resolve().parent
_CUSTOM_CONFIG_PATH = _SERVICES_DIR / "registration_validation.py"
_EXAMPLE_CONFIG_PATH = _SERVICES_DIR / "registration_validation_example.py"
_ACTIVE_CONFIG_PATH = (
    _CUSTOM_CONFIG_PATH if _CUSTOM_CONFIG_PATH.exists() else _EXAMPLE_CONFIG_PATH
)

_spec = spec_from_file_location(
    "app.services.registration_validation_active",
    _ACTIVE_CONFIG_PATH,
)
if _spec is None or _spec.loader is None:
    raise ImportError(f"无法加载注册验证配置文件: {_ACTIVE_CONFIG_PATH}")

_module = module_from_spec(_spec)
_spec.loader.exec_module(_module)

get_registration_username_placeholder = _module.get_registration_username_placeholder
validate_registration_username = _module.validate_registration_username
