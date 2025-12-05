from fastapi import FastAPI

from .context import create_app
from .lifecycle import app_lifespan
from .routes import (
    agents_router,
    ai_router,
    auth_router,
    cart_router,
    catalog_router,
    coupons_router,
    locations_router,
    lottery_router,
    orders_router,
    profile_router,
    products_manage_router,
    settings_router,
    system_router,
)


def build_app() -> FastAPI:
    app = create_app(lifespan=app_lifespan)
    app.include_router(auth_router)
    app.include_router(coupons_router)
    app.include_router(locations_router)
    app.include_router(orders_router)
    app.include_router(lottery_router)
    app.include_router(agents_router)
    app.include_router(catalog_router)
    app.include_router(cart_router)
    app.include_router(products_manage_router)
    app.include_router(settings_router)
    app.include_router(ai_router)
    app.include_router(profile_router)
    app.include_router(system_router)
    return app


app = build_app()

__all__ = ["app", "build_app"]
