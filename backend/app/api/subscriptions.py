"""
Subscription API endpoints for seller subscription management.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.api.seller_auth import require_seller_token
from backend.app.services.subscription import SubscriptionService, SubscriptionServiceError
from backend.app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


class CreateSubscriptionRequest(BaseModel):
    period_months: int = Field(..., description="Subscription period: 1, 3, 6, or 12 months")


# ---------- Public ----------

@router.get("/prices")
async def get_subscription_prices(session: AsyncSession = Depends(get_session)):
    """Get subscription pricing table with discounts."""
    service = SubscriptionService(session)
    prices = service.get_prices()
    base = list(prices.values())[0] if prices else 0
    return {
        "base_price": base,
        "prices": prices,
        "discounts": {1: 0, 3: 10, 6: 15, 12: 25},
    }


# ---------- Seller-authenticated ----------

@router.post("/create")
async def create_subscription(
    data: CreateSubscriptionRequest,
    session: AsyncSession = Depends(get_session),
    seller_id: int = Depends(require_seller_token),
):
    """Create a subscription payment. Returns confirmation_url for YooKassa."""
    service = SubscriptionService(session)
    try:
        result = await service.create_subscription(seller_id, data.period_months)
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
    """Get current subscription status and payment history."""
    service = SubscriptionService(session)
    current = await service.get_active_subscription(seller_id)
    history = await service.get_subscription_history(seller_id)
    return {
        "current": current,
        "history": history,
    }


@router.post("/cancel")
async def cancel_auto_renew(
    session: AsyncSession = Depends(get_session),
    seller_id: int = Depends(require_seller_token),
):
    """Cancel auto-renew for the current subscription (placeholder — auto_renew not yet supported)."""
    return {"status": "ok", "message": "Auto-renew is not enabled for this account."}
