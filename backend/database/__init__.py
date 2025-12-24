from .config import DB_PATH, logger, settings
from .security import hash_password, verify_password, is_password_hashed
from .migrations import (
    ensure_table_columns,
    auto_migrate_database,
    ensure_user_id_schema,
    ensure_admin_accounts,
    migrate_user_profile_addresses,
    migrate_chat_threads,
    migrate_passwords_to_hash,
    migrate_image_paths,
    ImageLookupDB,
)
from .connection import get_db_connection, safe_execute_with_migration
from .bootstrap import init_database
from .chat import ChatLogDB, cleanup_old_chat_logs
from .users import UserDB, UserProfileDB
from .products import ProductDB, VariantDB, CategoryDB
from .cart import CartDB
from .locations import AddressDB, BuildingDB
from .admins import AdminDB, AgentAssignmentDB, AgentDeletionDB, AgentStatusDB, PaymentQrDB
from .settings_db import SettingsDB
from .orders import OrderDB, OrderExportDB
from .promotions import (
    LotteryConfigDB,
    LotteryDB,
    AutoGiftDB,
    RewardDB,
    CouponDB,
    DeliverySettingsDB,
    GiftThresholdDB,
)

__all__ = [
    "DB_PATH",
    "logger",
    "settings",
    "hash_password",
    "verify_password",
    "is_password_hashed",
    "ensure_table_columns",
    "auto_migrate_database",
    "ensure_user_id_schema",
    "ensure_admin_accounts",
    "migrate_user_profile_addresses",
    "migrate_chat_threads",
    "migrate_passwords_to_hash",
    "migrate_image_paths",
    "ImageLookupDB",
    "get_db_connection",
    "safe_execute_with_migration",
    "init_database",
    "ChatLogDB",
    "cleanup_old_chat_logs",
    "UserDB",
    "UserProfileDB",
    "ProductDB",
    "VariantDB",
    "CategoryDB",
    "SettingsDB",
    "CartDB",
    "AddressDB",
    "BuildingDB",
    "AdminDB",
    "AgentAssignmentDB",
    "AgentDeletionDB",
    "AgentStatusDB",
    "PaymentQrDB",
    "OrderDB",
    "OrderExportDB",
    "LotteryConfigDB",
    "LotteryDB",
    "AutoGiftDB",
    "RewardDB",
    "CouponDB",
    "DeliverySettingsDB",
    "GiftThresholdDB",
]
