"""
Payment service — YuKassa payment operations via Partner API (OAuth).

Each seller connects their own YuKassa account via OAuth.
Payments are created using the seller's OAuth token — money goes
directly to the seller's account.  Platform commission is tracked
internally via CommissionLedger and billed with the monthly subscription.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.models.order import Order
from backend.app.models.product import Product
from backend.app.models.seller import Seller
from backend.app.models.user import User
from backend.app.core.settings import get_settings
from backend.app.core.logging import get_logger
from backend.app.core.exceptions import ServiceError
from backend.app.core.item_parsing import parse_items_info

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class PaymentServiceError(ServiceError):
    """Base exception for payment service errors."""
    pass


class PaymentNotConfiguredError(PaymentServiceError):
    """YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY not set."""

    def __init__(self):
        super().__init__("Payment system is not configured", 503)


class SellerNotOnboardedError(PaymentServiceError):
    """Seller has not connected their YooKassa account via OAuth."""

    def __init__(self, seller_id: int):
        super().__init__(
            f"Seller {seller_id} is not onboarded for payments (YooKassa OAuth not connected)",
            400,
        )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class PaymentService:
    """Handles YuKassa payment operations via seller OAuth tokens."""

    def __init__(self, session: AsyncSession):
        self.session = session

    # -- Receipt helpers ----------------------------------------------------

    @staticmethod
    def _parse_items_info(items_info: str) -> List[Dict[str, Any]]:
        """Delegate to shared parser in core.item_parsing."""
        return parse_items_info(items_info)

    async def _build_receipt(
        self,
        order: Order,
        total: Decimal,
    ) -> Dict[str, Any]:
        """
        Build a YuKassa receipt object (54-ФЗ compliance).

        Fetches product prices from DB.  If the sum of item prices doesn't
        match the order total (e.g. delivery fee, discounts), an adjustment
        line is added so the receipt total equals the payment amount exactly.
        """
        # ---- customer contact (phone required) ----
        customer: Dict[str, str] = {}
        if order.buyer_id:
            user = await self.session.get(User, order.buyer_id)
            if user and user.phone:
                customer["phone"] = user.phone
        if not customer.get("phone") and order.guest_phone:
            customer["phone"] = order.guest_phone
        # Fallback — YuKassa requires at least email or phone
        if not customer:
            customer["email"] = "buyer@flurai.ru"

        # ---- items ----
        parsed = self._parse_items_info(order.items_info)

        # Fetch product prices from DB as fallback (for legacy orders without embedded prices)
        product_ids = [p["product_id"] for p in parsed if "price" not in p]
        price_map: Dict[int, Decimal] = {}
        if product_ids:
            stmt = select(Product.id, Product.price).where(Product.id.in_(product_ids))
            rows = await self.session.execute(stmt)
            for pid, price in rows:
                price_map[pid] = Decimal(str(price))

        receipt_items: List[Dict[str, Any]] = []
        items_subtotal = Decimal("0")

        for item in parsed:
            pid = item["product_id"]
            qty = item["quantity"]
            # Prefer order-time price from items_info; fall back to current DB price
            unit_price = item.get("price") or price_map.get(pid)
            if unit_price is None:
                # Product may have been deleted — distribute evenly as fallback
                continue
            unit_price = unit_price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            line_total = (unit_price * qty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            items_subtotal += line_total

            receipt_items.append({
                "description": item["name"][:128],  # YuKassa limit 128 chars
                "quantity": str(qty),
                "amount": {
                    "value": str(unit_price),
                    "currency": "RUB",
                },
                "vat_code": 1,  # Без НДС
                "payment_mode": "full_payment",
                "payment_subject": "commodity",
            })

        # If no items were resolved, add a single line for the whole order
        if not receipt_items:
            receipt_items.append({
                "description": f"Заказ #{order.id}",
                "quantity": "1",
                "amount": {
                    "value": str(total.quantize(Decimal("0.01"))),
                    "currency": "RUB",
                },
                "vat_code": 1,
                "payment_mode": "full_payment",
                "payment_subject": "commodity",
            })
            items_subtotal = total

        # ---- adjustment (delivery / discount / rounding) ----
        diff = (total - items_subtotal).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if diff > Decimal("0"):
            # Positive diff = delivery fee or other surcharge
            receipt_items.append({
                "description": "Доставка",
                "quantity": "1",
                "amount": {
                    "value": str(diff),
                    "currency": "RUB",
                },
                "vat_code": 1,
                "payment_mode": "full_payment",
                "payment_subject": "service",
            })
        elif diff < Decimal("0") and receipt_items:
            # Discount (loyalty points, preorder, etc.)
            # YooKassa rejects negative amounts, so distribute discount across items proportionally
            discount = abs(diff)
            distributed = Decimal("0")
            for i, ri in enumerate(receipt_items):
                item_value = Decimal(ri["amount"]["value"])
                item_qty = int(ri["quantity"])
                item_total = item_value * item_qty
                if i < len(receipt_items) - 1:
                    # Proportional share of discount
                    share = (discount * item_total / items_subtotal).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                    distributed += share
                else:
                    # Last item gets the remainder to avoid rounding drift
                    share = discount - distributed
                # Reduce unit price (share is per-line, divide by qty for unit price)
                per_unit_reduction = (share / item_qty).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
                new_price = item_value - per_unit_reduction
                # Ensure price doesn't go below 0.01
                if new_price < Decimal("0.01"):
                    new_price = Decimal("0.01")
                ri["amount"]["value"] = str(new_price)

        return {
            "customer": customer,
            "items": receipt_items,
        }

    # -- Public methods -----------------------------------------------------

    async def _seller_api_request(
        self,
        seller: Seller,
        method: str,
        endpoint: str,
        json_data: Optional[Dict[str, Any]] = None,
        idempotence_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Make a YooKassa API request using the seller's OAuth token."""
        import httpx

        if not seller.yookassa_oauth_token:
            raise SellerNotOnboardedError(seller.seller_id)

        headers: Dict[str, str] = {
            "Authorization": f"Bearer {seller.yookassa_oauth_token}",
            "Content-Type": "application/json",
        }
        if idempotence_key:
            headers["Idempotence-Key"] = idempotence_key

        url = f"https://api.yookassa.ru/v3{endpoint}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(method, url, json=json_data, headers=headers)

        if resp.status_code >= 400:
            logger.error(
                "YooKassa API error",
                status=resp.status_code,
                body=resp.text,
                endpoint=endpoint,
            )
            raise PaymentServiceError(
                f"YooKassa API error {resp.status_code}: {resp.text}", 502
            )

        return resp.json()

    async def create_payment(
        self,
        order_id: int,
        return_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a YuKassa payment via seller's OAuth token.

        Money goes directly to the seller's YooKassa account.
        Platform commission is tracked internally.

        Returns::

            {
                "payment_id": "...",
                "confirmation_url": "https://yoomoney.ru/...",
                "status": "pending",
            }
        """
        settings = get_settings()

        order = await self.session.get(Order, order_id)
        if not order:
            raise PaymentServiceError(f"Order {order_id} not found", 404)

        # Load seller
        seller = await self.session.get(Seller, order.seller_id)
        if not seller:
            raise PaymentServiceError(f"Seller {order.seller_id} not found", 404)

        if not seller.yookassa_oauth_token:
            raise SellerNotOnboardedError(order.seller_id)

        # If a payment already exists and is still active, check if we can reuse it
        PAYMENT_URL_MAX_AGE_SECONDS = 600  # 10 minutes
        if order.payment_id:
            try:
                existing = await self._seller_api_request(
                    seller, "GET", f"/payments/{order.payment_id}"
                )
                ex_status = existing.get("status")
                if ex_status in ("pending", "waiting_for_capture"):
                    is_fresh = True
                    created_at_str = existing.get("created_at")
                    if created_at_str:
                        try:
                            created = datetime.fromisoformat(
                                str(created_at_str).replace("Z", "+00:00")
                            )
                            age = (datetime.now(timezone.utc) - created).total_seconds()
                            is_fresh = age < PAYMENT_URL_MAX_AGE_SECONDS
                        except (ValueError, TypeError):
                            is_fresh = False

                    confirmation = existing.get("confirmation", {})
                    if is_fresh and confirmation.get("confirmation_url"):
                        return {
                            "payment_id": existing["id"],
                            "confirmation_url": confirmation["confirmation_url"],
                            "status": ex_status,
                        }

                    # Payment is stale — cancel and create new
                    if ex_status == "pending":
                        try:
                            await self._seller_api_request(
                                seller, "POST", f"/payments/{existing['id']}/cancel",
                                idempotence_key=str(uuid.uuid4()),
                            )
                            logger.info(
                                "Cancelled stale payment, creating new",
                                payment_id=existing["id"],
                                order_id=order_id,
                            )
                        except Exception as cancel_exc:
                            logger.warning(
                                "Failed to cancel stale payment",
                                payment_id=existing.get("id"),
                                error=str(cancel_exc),
                            )
            except Exception as exc:
                logger.warning(
                    "Failed to fetch existing payment, creating new",
                    payment_id=order.payment_id,
                    error=str(exc),
                )

        total = Decimal(str(order.total_price))
        amount_value = str(total.quantize(Decimal("0.01")))

        # Build return URL
        effective_return_url = return_url or settings.YOOKASSA_RETURN_URL
        if not effective_return_url:
            effective_return_url = "https://app.flurai.ru/?tab=orders"

        idempotence_key = str(uuid.uuid4())

        # Build receipt (54-ФЗ)
        receipt = await self._build_receipt(order, total)

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
            "receipt": receipt,
            "metadata": {
                "order_id": str(order_id),
                "seller_id": str(order.seller_id),
            },
        }

        try:
            payment_data = await self._seller_api_request(
                seller, "POST", "/payments",
                json_data=payment_params,
                idempotence_key=idempotence_key,
            )
        except Exception as exc:
            logger.error(
                "YuKassa payment creation failed",
                order_id=order_id,
                error=str(exc),
            )
            raise PaymentServiceError(f"Payment creation failed: {exc}", 502)

        # Persist payment info on order
        order.payment_id = payment_data["id"]
        order.payment_status = payment_data.get("status", "pending")
        await self.session.flush()

        confirmation = payment_data.get("confirmation", {})
        confirmation_url = confirmation.get("confirmation_url")

        logger.info(
            "Payment created",
            order_id=order_id,
            payment_id=payment_data["id"],
            amount=amount_value,
            status=payment_data.get("status"),
            seller_shop_id=seller.yookassa_shop_id,
        )

        return {
            "payment_id": payment_data["id"],
            "confirmation_url": confirmation_url,
            "status": payment_data.get("status", "pending"),
        }

    async def handle_webhook(self, event_data: Dict[str, Any]) -> None:
        """
        Process YuKassa webhook notification.

        Updates ``order.payment_status`` and sends Telegram notifications.
        The caller is responsible for ``session.commit()``.
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

        # Lock order row to prevent concurrent webhook processing
        result = await self.session.execute(
            select(Order).where(Order.id == order_id).with_for_update()
        )
        order = result.scalar_one_or_none()
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

        # Race condition protection: if order was rejected/cancelled but payment succeeded
        if payment_status == "succeeded" and order.status in ("rejected", "cancelled"):
            logger.warning(
                "Payment succeeded for rejected/cancelled order, initiating refund",
                order_id=order_id,
                order_status=order.status,
            )
            order.payment_status = payment_status
            try:
                await self.refund_payment(order_id)
                logger.info("Auto-refund initiated", order_id=order_id)
            except Exception as refund_err:
                logger.error(
                    "Auto-refund failed",
                    order_id=order_id,
                    error=str(refund_err),
                )
            return

        old_status = order.payment_status
        order.payment_id = payment_id
        order.payment_status = payment_status

        logger.info(
            "Webhook processed",
            order_id=order_id,
            payment_id=payment_id,
            webhook_event=event_type,
            old_payment_status=old_status,
            new_payment_status=payment_status,
        )

        # Send notifications and record commission on successful payment
        if payment_status == "succeeded" and old_status != "succeeded":
            # Record platform commission in ledger
            try:
                from backend.app.services.commissions import record_commission
                if order.total_price:
                    await record_commission(
                        self.session,
                        seller_id=order.seller_id,
                        order_id=order_id,
                        order_total=Decimal(str(order.total_price)),
                    )
                    logger.info(
                        "Commission recorded",
                        order_id=order_id,
                        seller_id=order.seller_id,
                    )
            except Exception as comm_err:
                logger.error(
                    "Failed to record commission (critical)",
                    order_id=order_id,
                    error=str(comm_err),
                )

            # Send Telegram notifications
            try:
                from backend.app.services.telegram_notify import (
                    notify_buyer_payment_succeeded,
                    notify_seller_payment_received,
                    resolve_notification_chat_id,
                )
                if order.buyer_id:
                    await notify_buyer_payment_succeeded(
                        buyer_id=order.buyer_id,
                        order_id=order_id,
                        seller_id=order.seller_id,
                    )
                _chat_id = await resolve_notification_chat_id(self.session, order.seller_id)
                await notify_seller_payment_received(
                    seller_id=_chat_id,
                    order_id=order_id,
                    total_price=float(order.total_price) if order.total_price else 0,
                )
                logger.info(
                    "Payment success notifications sent",
                    order_id=order_id,
                )
            except Exception as notify_err:
                logger.warning(
                    "Payment notification sending failed (non-critical)",
                    order_id=order_id,
                    error=str(notify_err),
                )

    async def get_payment_status(self, order_id: int) -> Dict[str, Any]:
        """
        Get current payment status for an order.

        Fetches fresh status from YuKassa API via seller's OAuth token
        and updates local cache.
        """
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

        seller = await self.session.get(Seller, order.seller_id)
        if not seller or not seller.yookassa_oauth_token:
            # Fallback to cached status
            return {
                "order_id": order_id,
                "payment_id": order.payment_id,
                "payment_status": order.payment_status,
                "paid": order.payment_status == "succeeded",
            }

        try:
            payment_data = await self._seller_api_request(
                seller, "GET", f"/payments/{order.payment_id}"
            )
            order.payment_status = payment_data.get("status")
            await self.session.flush()

            amount_obj = payment_data.get("amount", {})
            return {
                "order_id": order_id,
                "payment_id": payment_data["id"],
                "payment_status": payment_data.get("status"),
                "paid": payment_data.get("paid", False),
                "amount": amount_obj.get("value"),
            }
        except Exception as exc:
            logger.error(
                "Failed to fetch payment status from YuKassa",
                order_id=order_id,
                payment_id=order.payment_id,
                error=str(exc),
            )
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
        Refund a payment (full or partial) via seller's OAuth token.

        ``amount=None`` means full refund of the order's total_price.
        """
        order = await self.session.get(Order, order_id)
        if not order:
            raise PaymentServiceError(f"Order {order_id} not found", 404)

        if not order.payment_id:
            raise PaymentServiceError("Order has no payment to refund", 400)

        if order.payment_status != "succeeded":
            raise PaymentServiceError(
                f"Cannot refund: payment status is '{order.payment_status}'", 400
            )

        seller = await self.session.get(Seller, order.seller_id)
        if not seller or not seller.yookassa_oauth_token:
            raise PaymentServiceError("Seller not connected to YooKassa, cannot refund", 400)

        refund_amount = amount or Decimal(str(order.total_price))
        refund_value = str(refund_amount.quantize(Decimal("0.01")))

        try:
            refund_data = await self._seller_api_request(
                seller, "POST", "/refunds",
                json_data={
                    "payment_id": order.payment_id,
                    "amount": {
                        "value": refund_value,
                        "currency": "RUB",
                    },
                    "description": f"Refund for order #{order_id}",
                },
                idempotence_key=str(uuid.uuid4()),
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
            refund_id=refund_data.get("id"),
            amount=refund_value,
            status=refund_data.get("status"),
        )

        return {
            "refund_id": refund_data.get("id"),
            "status": refund_data.get("status"),
            "amount": refund_value,
        }
