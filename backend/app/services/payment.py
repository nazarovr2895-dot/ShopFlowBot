"""
Payment service — YuKassa split payment operations for the marketplace.

Uses YuKassa `transfers` API to split payments between platform and seller.
Commission rates are determined by the existing commission system
(get_effective_commission_rate from commissions.py).
"""
import asyncio
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession

from yookassa import Configuration, Payment as YooPayment, Refund as YooRefund

from backend.app.models.order import Order
from backend.app.models.seller import Seller
from backend.app.services.commissions import get_effective_commission_rate
from backend.app.core.settings import get_settings
from backend.app.core.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class PaymentServiceError(Exception):
    """Base exception for payment service errors."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class PaymentNotConfiguredError(PaymentServiceError):
    """YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY not set."""

    def __init__(self):
        super().__init__("Payment system is not configured", 503)


class SellerNotOnboardedError(PaymentServiceError):
    """Seller has no yookassa_account_id."""

    def __init__(self, seller_id: int):
        super().__init__(
            f"Seller {seller_id} is not onboarded for payments (missing yookassa_account_id)",
            400,
        )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class PaymentService:
    """Handles YuKassa split payment operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self._configure_sdk()

    # -- SDK configuration --------------------------------------------------

    def _configure_sdk(self) -> None:
        settings = get_settings()
        if settings.YOOKASSA_SHOP_ID and settings.YOOKASSA_SECRET_KEY:
            Configuration.account_id = settings.YOOKASSA_SHOP_ID
            Configuration.secret_key = settings.YOOKASSA_SECRET_KEY
            self._configured = True
        else:
            self._configured = False

    def _ensure_configured(self) -> None:
        if not self._configured:
            raise PaymentNotConfiguredError()

    # -- Public methods -----------------------------------------------------

    async def create_payment(
        self,
        order_id: int,
        return_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a YuKassa payment with marketplace split for the given order.

        Returns::

            {
                "payment_id": "...",
                "confirmation_url": "https://yoomoney.ru/...",
                "status": "pending",
            }
        """
        self._ensure_configured()
        settings = get_settings()

        order = await self.session.get(Order, order_id)
        if not order:
            raise PaymentServiceError(f"Order {order_id} not found", 404)

        # If a payment already exists and is still active, return it
        if order.payment_id:
            try:
                existing = await asyncio.to_thread(YooPayment.find_one, order.payment_id)
                if existing and existing.status in ("pending", "waiting_for_capture"):
                    confirmation_url = None
                    if existing.confirmation:
                        confirmation_url = existing.confirmation.confirmation_url
                    return {
                        "payment_id": existing.id,
                        "confirmation_url": confirmation_url,
                        "status": existing.status,
                    }
            except Exception as exc:
                logger.warning(
                    "Failed to fetch existing payment, creating new",
                    payment_id=order.payment_id,
                    error=str(exc),
                )

        # Load seller and verify onboarding
        seller = await self.session.get(Seller, order.seller_id)
        if not seller:
            raise PaymentServiceError(f"Seller {order.seller_id} not found", 404)
        if not seller.yookassa_account_id:
            raise SellerNotOnboardedError(order.seller_id)

        # Calculate platform commission using existing commission system
        commission_rate = await get_effective_commission_rate(self.session, order.seller_id)
        total = Decimal(str(order.total_price))
        commission_amount = (total * Decimal(str(commission_rate)) / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        amount_value = str(total.quantize(Decimal("0.01")))

        # Build return URL
        effective_return_url = return_url or settings.YOOKASSA_RETURN_URL
        if not effective_return_url:
            effective_return_url = "https://app.flurai.ru/?tab=orders"

        idempotence_key = str(uuid.uuid4())

        payment_params: Dict[str, Any] = {
            "amount": {
                "value": amount_value,
                "currency": "RUB",
            },
            "confirmation": {
                "type": "redirect",
                "return_url": effective_return_url,
            },
            "capture": True,
            "description": f"Заказ #{order_id}",
            "metadata": {
                "order_id": str(order_id),
                "seller_id": str(order.seller_id),
            },
            "transfers": [
                {
                    "account_id": seller.yookassa_account_id,
                    "amount": {
                        "value": amount_value,
                        "currency": "RUB",
                    },
                    "platform_fee_amount": {
                        "value": str(commission_amount),
                        "currency": "RUB",
                    },
                    "description": f"Order #{order_id}",
                    "metadata": {
                        "order_id": str(order_id),
                    },
                }
            ],
        }

        try:
            payment = await asyncio.to_thread(YooPayment.create, payment_params, idempotence_key)
        except Exception as exc:
            logger.error(
                "YuKassa payment creation failed",
                order_id=order_id,
                error=str(exc),
            )
            raise PaymentServiceError(f"Payment creation failed: {exc}", 502)

        # Persist payment info on order
        order.payment_id = payment.id
        order.payment_status = payment.status
        await self.session.flush()

        confirmation_url = None
        if payment.confirmation:
            confirmation_url = payment.confirmation.confirmation_url

        logger.info(
            "Payment created",
            order_id=order_id,
            payment_id=payment.id,
            amount=amount_value,
            commission=str(commission_amount),
            commission_rate=commission_rate,
            status=payment.status,
        )

        return {
            "payment_id": payment.id,
            "confirmation_url": confirmation_url,
            "status": payment.status,
        }

    async def handle_webhook(self, event_data: Dict[str, Any]) -> None:
        """
        Process YuKassa webhook notification.

        Updates ``order.payment_status``.  The caller is responsible for
        ``session.commit()``.
        """
        event_type = event_data.get("event")
        payment_object = event_data.get("object", {})
        payment_id = payment_object.get("id")
        payment_status = payment_object.get("status")
        metadata = payment_object.get("metadata", {})
        order_id_str = metadata.get("order_id")

        if not payment_id or not order_id_str:
            logger.warning("Webhook missing payment_id or order_id", data=event_data)
            return

        try:
            order_id = int(order_id_str)
        except (ValueError, TypeError):
            logger.warning("Webhook has invalid order_id", order_id=order_id_str)
            return

        order = await self.session.get(Order, order_id)
        if not order:
            logger.warning("Webhook: order not found", order_id=order_id)
            return

        # Verify payment_id consistency
        if order.payment_id and order.payment_id != payment_id:
            logger.warning(
                "Webhook payment_id mismatch",
                order_id=order_id,
                expected=order.payment_id,
                received=payment_id,
            )
            return

        old_status = order.payment_status
        order.payment_id = payment_id
        order.payment_status = payment_status

        logger.info(
            "Webhook processed",
            order_id=order_id,
            payment_id=payment_id,
            event=event_type,
            old_payment_status=old_status,
            new_payment_status=payment_status,
        )

    async def get_payment_status(self, order_id: int) -> Dict[str, Any]:
        """
        Get current payment status for an order.

        Fetches fresh status from YuKassa API and updates local cache.
        """
        self._ensure_configured()

        order = await self.session.get(Order, order_id)
        if not order:
            raise PaymentServiceError(f"Order {order_id} not found", 404)

        if not order.payment_id:
            return {
                "order_id": order_id,
                "payment_id": None,
                "payment_status": None,
                "paid": False,
            }

        try:
            payment = await asyncio.to_thread(YooPayment.find_one, order.payment_id)
            order.payment_status = payment.status
            await self.session.flush()

            return {
                "order_id": order_id,
                "payment_id": payment.id,
                "payment_status": payment.status,
                "paid": payment.paid,
                "amount": str(payment.amount.value) if payment.amount else None,
            }
        except Exception as exc:
            logger.error(
                "Failed to fetch payment status from YuKassa",
                order_id=order_id,
                payment_id=order.payment_id,
                error=str(exc),
            )
            # Return cached status as fallback
            return {
                "order_id": order_id,
                "payment_id": order.payment_id,
                "payment_status": order.payment_status,
                "paid": order.payment_status == "succeeded",
            }

    async def refund_payment(
        self,
        order_id: int,
        amount: Optional[Decimal] = None,
    ) -> Dict[str, Any]:
        """
        Refund a payment (full or partial).

        ``amount=None`` means full refund of the order's total_price.
        """
        self._ensure_configured()

        order = await self.session.get(Order, order_id)
        if not order:
            raise PaymentServiceError(f"Order {order_id} not found", 404)

        if not order.payment_id:
            raise PaymentServiceError("Order has no payment to refund", 400)

        if order.payment_status != "succeeded":
            raise PaymentServiceError(
                f"Cannot refund: payment status is '{order.payment_status}'", 400
            )

        refund_amount = amount or Decimal(str(order.total_price))
        refund_value = str(refund_amount.quantize(Decimal("0.01")))

        try:
            refund = await asyncio.to_thread(
                YooRefund.create,
                {
                    "payment_id": order.payment_id,
                    "amount": {
                        "value": refund_value,
                        "currency": "RUB",
                    },
                    "description": f"Refund for order #{order_id}",
                },
                str(uuid.uuid4()),
            )
        except Exception as exc:
            logger.error(
                "Refund creation failed",
                order_id=order_id,
                error=str(exc),
            )
            raise PaymentServiceError(f"Refund failed: {exc}", 502)

        logger.info(
            "Refund created",
            order_id=order_id,
            refund_id=refund.id,
            amount=refund_value,
            status=refund.status,
        )

        return {
            "refund_id": refund.id,
            "status": refund.status,
            "amount": refund_value,
        }
