"""Payment API endpoints for YuKassa split payment integration."""
import ipaddress
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

# YooKassa webhook source IPs (https://yookassa.ru/developers/using-api/webhooks)
YOOKASSA_IP_NETWORKS = [
    ipaddress.ip_network("185.71.76.0/27"),
    ipaddress.ip_network("185.71.77.0/27"),
    ipaddress.ip_network("77.75.153.0/25"),
    ipaddress.ip_network("77.75.154.128/25"),
    ipaddress.ip_network("2a02:5180::/32"),
]
YOOKASSA_SINGLE_IPS = {
    ipaddress.ip_address("77.75.156.11"),
    ipaddress.ip_address("77.75.156.35"),
}


def _is_yookassa_ip(ip_str: str) -> bool:
    """Check if the given IP belongs to YooKassa's allowed ranges."""
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    if addr in YOOKASSA_SINGLE_IPS:
        return True
    return any(addr in net for net in YOOKASSA_IP_NETWORKS)


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

    Security layers:
    1. IP allowlisting in nginx (primary)
    2. Application-level IP check (defense in depth)

    Always returns HTTP 200 to prevent YuKassa from retrying endlessly.
    """
    # Application-level IP check (defense in depth on top of nginx)
    client_ip = request.headers.get("X-Real-IP") or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else ""
    if client_ip and not _is_yookassa_ip(client_ip):
        logger.warning("Webhook from non-YooKassa IP", source_ip=client_ip)
        # Still return 200 to not leak information, but don't process
        return {"status": "ok"}

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    logger.info("Payment webhook received", webhook_event=body.get("event"))

    # Route by metadata.type: subscription payments go to SubscriptionService
    metadata = body.get("object", {}).get("metadata", {})
    payment_type = metadata.get("type")

    try:
        if payment_type == "subscription":
            from backend.app.services.subscription import SubscriptionService
            service = SubscriptionService(session)
            await service.handle_webhook(body)
        else:
            service = PaymentService(session)
            await service.handle_webhook(body)
        await session.commit()
    except Exception as exc:
        await session.rollback()
        logger.error("Webhook processing failed", error=str(exc), payment_type=payment_type)
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
