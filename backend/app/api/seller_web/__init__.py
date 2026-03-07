"""Seller web panel API package — protected by X-Seller-Token."""
from fastapi import APIRouter, Depends

from backend.app.api.seller_auth import require_seller_token

# Re-export constants for backward compatibility (used by tests)
from backend.app.api.seller_web._common import (  # noqa: F401
    UPLOAD_DIR,
    SHOP_BANNERS_UPLOAD_SUBDIR,
    SHOP_LOGOS_UPLOAD_SUBDIR,
    PRODUCTS_UPLOAD_SUBDIR,
    ABOUT_MEDIA_UPLOAD_SUBDIR,
)

from backend.app.api.seller_web.profile import router as profile_router
from backend.app.api.seller_web.orders import router as orders_router
from backend.app.api.seller_web.dashboard import router as dashboard_router
from backend.app.api.seller_web.stats import router as stats_router
from backend.app.api.seller_web.products import router as products_router
from backend.app.api.seller_web.uploads import router as uploads_router
from backend.app.api.seller_web.inventory import router as inventory_router
from backend.app.api.seller_web.customers import router as customers_router
from backend.app.api.seller_web.branches import router as branches_router
from backend.app.api.seller_web.payments import router as payments_router

router = APIRouter(dependencies=[Depends(require_seller_token)])
router.include_router(profile_router)
router.include_router(orders_router)
router.include_router(dashboard_router)
router.include_router(stats_router)
router.include_router(products_router)
router.include_router(uploads_router)
router.include_router(inventory_router)
router.include_router(customers_router)
router.include_router(branches_router)
router.include_router(payments_router)
