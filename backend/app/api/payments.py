"""Payment API endpoints for YuKassa split payment integration."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_session
from backend.app.core.auth import TelegramInitData, get_current_user_hybrid
from backend.app.core.logging import get_logger
from backend.app.models.order import Order
from backend.app.services.payment import (
    PaymentService,
    PaymentServiceError,
    PaymentNotConfiguredError,
    SellerNotOnboardedError,
)

router = APIRouter()
logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreatePaymentRequest(BaseModel):
    order_id: int
    return_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/create")
async def create_payment(
    data: CreatePaymentRequest,
    session: AsyncSession = Depends(get_session),
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
):
    """
    Create a YuKassa payment for an order (after seller accepts).

    The buyer must own the order and its status must be ``accepted``.
    Returns ``confirmation_url`` to redirect the buyer to the YuKassa payment
    page.
    """
    order = await session.get(Order, data.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.buyer_id != current_user.user.id:
        raise HTTPException(status_code=403, detail="Not your order")
    if order.status != "accepted":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot pay for order with status '{order.status}'. Payment is available after the seller accepts the order.",
        )

    service = PaymentService(session)
    try:
        result = await service.create_payment(
            order_id=data.order_id,
            return_url=data.return_url,
        )
        await session.commit()
        return result
    except PaymentNotConfiguredError:
        raise HTTPException(status_code=503, detail="Payment system is not configured")
    except SellerNotOnboardedError as e:
        raise HTTPException(status_code=400, detail=e.message)
    except PaymentServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/webhook")
async def payment_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """
    YuKassa webhook endpoint.

    No authentication — security is handled via IP allowlisting in nginx
    and/or webhook URL verification in the YuKassa merchant dashboard.

    Always returns HTTP 200 to prevent YuKassa from retrying endlessly.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    logger.info("Payment webhook received", event=body.get("event"))

    service = PaymentService(session)
    try:
        await service.handle_webhook(body)
        await session.commit()
    except Exception as exc:
        await session.rollback()
        logger.error("Webhook processing failed", error=str(exc))
        # Still return 200 — errors are logged, not retried

    return {"status": "ok"}


@router.get("/{order_id}/status")
async def get_payment_status(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: TelegramInitData = Depends(get_current_user_hybrid),
):
    """
    Get payment status for an order.  Buyer must own the order.
    Fetches fresh status from YuKassa API.
    """
    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.buyer_id != current_user.user.id:
        raise HTTPException(status_code=403, detail="Not your order")

    service = PaymentService(session)
    try:
        result = await service.get_payment_status(order_id)
        await session.commit()
        return result
    except PaymentServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/guest/create")
async def create_guest_payment(
    data: CreatePaymentRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Create a YuKassa payment for a guest order (no Telegram auth).

    Only works for orders where ``buyer_id`` is NULL (guest orders).
    """
    order = await session.get(Order, data.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.buyer_id is not None:
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only for guest orders",
        )
    if order.status != "accepted":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot pay for order with status '{order.status}'",
        )

    service = PaymentService(session)
    try:
        result = await service.create_payment(
            order_id=data.order_id,
            return_url=data.return_url,
        )
        await session.commit()
        return result
    except PaymentServiceError as e:
        await session.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
