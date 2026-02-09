# backend/app/services/__init__.py
"""
Services layer for business logic.
Keeps API endpoints thin and business logic testable and reusable.
"""

from backend.app.services.orders import (
    OrderService,
    OrderServiceError,
    SellerNotFoundError as OrderSellerNotFoundError,
    SellerBlockedError,
    SellerLimitReachedError,
    OrderNotFoundError,
    InvalidOrderStatusError,
    create_new_order,
)
from backend.app.services.sellers import (
    SellerService,
    SellerServiceError,
    SellerNotFoundError,
    SellerExistsError,
    InvalidFieldError,
    check_seller_limit,
    get_seller_data,
)
from backend.app.services.buyers import (
    BuyerService,
    BuyerServiceError,
    UserNotFoundError,
    get_buyer,
    create_buyer,
)
from backend.app.services.referrals import (
    register_referral,
    calculate_rewards,
    accrue_commissions,
)
from backend.app.services.products import (
    create_product_service,
    get_products_by_seller_service,
    get_product_by_id_service,
    update_product_service,
    delete_product_service,
)
from backend.app.services.commissions import calculate_platform_commission
from backend.app.services.cache import CacheService

__all__ = [
    # Order service
    "OrderService",
    "OrderServiceError",
    "OrderSellerNotFoundError",
    "SellerBlockedError",
    "SellerLimitReachedError",
    "OrderNotFoundError",
    "InvalidOrderStatusError",
    "create_new_order",
    # Seller service
    "SellerService",
    "SellerServiceError",
    "SellerNotFoundError",
    "SellerExistsError",
    "InvalidFieldError",
    "check_seller_limit",
    "get_seller_data",
    # Buyer service
    "BuyerService",
    "BuyerServiceError",
    "UserNotFoundError",
    "get_buyer",
    "create_buyer",
    # Referral functions
    "register_referral",
    "calculate_rewards",
    "accrue_commissions",
    # Product functions
    "create_product_service",
    "get_products_by_seller_service",
    "get_product_by_id_service",
    "update_product_service",
    "delete_product_service",
    # Commission functions
    "calculate_platform_commission",
    # Cache service
    "CacheService",
]
