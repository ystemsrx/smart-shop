from .agents import router as agents_router
from .ai import router as ai_router
from .auth import router as auth_router
from .cart import router as cart_router
from .catalog import router as catalog_router
from .coupons import router as coupons_router
from .locations import router as locations_router
from .lottery import router as lottery_router
from .orders import router as orders_router
from .profile import router as profile_router
from .products_manage import router as products_manage_router
from .settings import router as settings_router
from .system import router as system_router

__all__ = [
    "agents_router",
    "ai_router",
    "auth_router",
    "cart_router",
    "catalog_router",
    "coupons_router",
    "locations_router",
    "lottery_router",
    "orders_router",
    "profile_router",
    "products_manage_router",
    "settings_router",
    "system_router",
]
