"""Admin API package — protected by X-Admin-Token."""
from fastapi import APIRouter

# Re-export for backward compatibility (used by main.py and tests)
from backend.app.api.admin._common import (  # noqa: F401
    require_admin_token,
    _handle_seller_error,
    _extract_fio,
    SellerCreateSchema,
    SellerUpdateSchema,
    SellerStatsResponse,
)

from backend.app.api.admin.directories import router as directories_router
from backend.app.api.admin.sellers import router as sellers_router
from backend.app.api.admin.stats import router as stats_router
from backend.app.api.admin.cache import router as cache_router
from backend.app.api.admin.dashboard import router as dashboard_router
from backend.app.api.admin.orders import router as orders_router
from backend.app.api.admin.customers import router as customers_router
from backend.app.api.admin.finance import router as finance_router

router = APIRouter()
router.include_router(directories_router)
router.include_router(sellers_router)
router.include_router(stats_router)
router.include_router(cache_router)
router.include_router(dashboard_router)
router.include_router(orders_router)
router.include_router(customers_router)
router.include_router(finance_router)
