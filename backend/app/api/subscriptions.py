"""
Subscription API endpoints for seller subscription management.
Per-branch pricing: each branch is subscribed independently.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.api.seller_auth import require_seller_token, require_seller_token_with_owner, require_primary_seller
from backend.app.services.subscription import SubscriptionService, SubscriptionServiceError
from backend.app.core.settings import get_settings
from backend.app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


class CreateSubscriptionRequest(BaseModel):
    period_months: int = Field(default=1, description="Subscription period in months (only 1 month supported)")
    target_seller_id: Optional[int] = Field(None, description="Branch seller_id to subscribe (for network owners)")


# ---------- Public (unauthenticated — base pricing) ----------

@router.get("/prices")
async def get_subscription_prices(
    session: AsyncSession = Depends(get_session),
):
    """Get base subscription pricing (public, unauthenticated)."""
    base = get_settings().SUBSCRIPTION_BASE_PRICE
    return {
        "base_price": base,
        "prices": {1: base},
    }


# ---------- Seller-authenticated ----------

@router.get("/prices/me")
async def get_my_subscription_prices(
    session: AsyncSession = Depends(get_session),
    seller_id: int = Depends(require_seller_token),
):
    """Get personalized subscription pricing with dynamic turnover-based calculation."""
    service = SubscriptionService(session)
    pricing = await service.calculate_dynamic_price(seller_id)
    return pricing


@router.post("/create")
async def create_subscription(
    data: CreateSubscriptionRequest,
    session: AsyncSession = Depends(get_session),
    auth: tuple = Depends(require_seller_token_with_owner),
):
    """Create a subscription payment for a specific branch or self.
    Returns confirmation_url for YooKassa redirect."""
    seller_id, _owner_id = auth
    service = SubscriptionService(session)
    try:
        result = await service.create_subscription(
            seller_id,
            data.period_months,
            target_seller_id=data.target_seller_id,
        )
        await session.commit()
        return result
    except SubscriptionServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/status")
async def get_subscription_status(
    session: AsyncSession = Depends(get_session),
    seller_id: int = Depends(require_seller_token),
):
    """Get current subscription status and payment history for the calling seller."""
    service = SubscriptionService(session)
    current = await service.get_active_subscription(seller_id)
    history = await service.get_subscription_history(seller_id)
    return {
        "current": current,
        "history": history,
    }


@router.get("/branches-status")
async def get_branches_subscription_status(
    session: AsyncSession = Depends(get_session),
    auth: tuple = Depends(require_primary_seller),
):
    """Get per-branch subscription status for network owners."""
    seller_id, _owner_id = auth
    service = SubscriptionService(session)
    try:
        statuses = await service.get_branches_subscription_status(seller_id)
        return {"branches": statuses}
    except SubscriptionServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/cancel")
async def cancel_auto_renew(
    session: AsyncSession = Depends(get_session),
    seller_id: int = Depends(require_seller_token),
):
    """Cancel auto-renew for the current subscription (placeholder — auto_renew not yet supported)."""
    return {"status": "ok", "message": "Auto-renew is not enabled for this account."}
