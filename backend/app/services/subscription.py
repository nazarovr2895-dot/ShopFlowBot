"""
Subscription service — seller subscription management via YooKassa.

Platform-level payments (no split/transfers): the full subscription amount
goes to the main YOOKASSA_SHOP_ID account.
"""
import asyncio
import uuid
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Dict, Any, List

from dateutil.relativedelta import relativedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from yookassa import Configuration, Payment as YooPayment

from sqlalchemy import func as sa_func

from backend.app.models.subscription import Subscription
from backend.app.models.seller import Seller
from backend.app.core.settings import get_settings
from backend.app.core.logging import get_logger

logger = get_logger(__name__)

VALID_PERIODS = (1, 3, 6, 12)

# Discount multipliers per period
PERIOD_MULTIPLIERS = {
    1: 1.0,     # 0% discount
    3: 0.9,     # 10% discount
    6: 0.85,    # 15% discount
    12: 0.75,   # 25% discount
}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class SubscriptionServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class SubscriptionNotConfiguredError(SubscriptionServiceError):
    def __init__(self):
        super().__init__("Payment system is not configured", 503)


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class SubscriptionService:
    """Handles seller subscription lifecycle and YooKassa payments."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self._configure_sdk()

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
            raise SubscriptionNotConfiguredError()

    # -- Helpers ----------------------------------------------------------------

    async def _get_owner_id(self, seller_id: int) -> int:
        """Get the network owner_id for a given seller/branch."""
        seller = await self.session.get(Seller, seller_id)
        if not seller:
            raise SubscriptionServiceError("Продавец не найден", 404)
        return seller.owner_id

    async def _count_active_branches(self, owner_id: int) -> int:
        """Count active (non-deleted) branches for an owner."""
        result = await self.session.execute(
            select(sa_func.count(Seller.seller_id)).where(
                Seller.owner_id == owner_id,
                Seller.deleted_at.is_(None),
            )
        )
        return result.scalar() or 1

    # -- Pricing ----------------------------------------------------------------

    def get_prices(self, branches_count: int = 1) -> Dict[int, int]:
        """Return price table: {period_months: total_price_in_rubles}.
        Per-branch pricing: base_price × period × discount × branches_count.
        """
        base = get_settings().SUBSCRIPTION_BASE_PRICE
        return {
            period: round(base * period * multiplier * branches_count)
            for period, multiplier in PERIOD_MULTIPLIERS.items()
        }

    # -- Subscription lifecycle -------------------------------------------------

    async def create_subscription(
        self,
        seller_id: int,
        period_months: int,
    ) -> Dict[str, Any]:
        """
        Create a pending subscription record and a YooKassa payment.
        Uses owner_id for subscription (network-level) and per-branch pricing.

        Returns dict with subscription_id, confirmation_url, status.
        """
        self._ensure_configured()

        if period_months not in VALID_PERIODS:
            raise SubscriptionServiceError(
                f"Invalid period. Must be one of: {VALID_PERIODS}"
            )

        # Subscription is network-level: tied to owner's primary record
        owner_id = await self._get_owner_id(seller_id)
        branches_count = await self._count_active_branches(owner_id)

        prices = self.get_prices(branches_count)
        amount = prices[period_months]
        amount_decimal = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # Create subscription record (seller_id = owner_id for network-level sub)
        sub = Subscription(
            seller_id=owner_id,
            period_months=period_months,
            status="pending",
            amount_paid=amount_decimal,
        )
        self.session.add(sub)
        await self.session.flush()  # get sub.id

        settings = get_settings()
        return_url = settings.YOOKASSA_RETURN_URL or "https://app.flurai.ru/?tab=settings"

        # Build receipt (54-ФЗ)
        desc = f"Подписка Flurai ({period_months} мес., {branches_count} фил.)"
        receipt = {
            "customer": {"email": "subscription@flurai.ru"},
            "items": [
                {
                    "description": desc,
                    "quantity": "1",
                    "amount": {
                        "value": str(amount_decimal),
                        "currency": "RUB",
                    },
                    "vat_code": 1,
                    "payment_mode": "full_payment",
                    "payment_subject": "service",
                },
            ],
        }

        payment_params = {
            "amount": {
                "value": str(amount_decimal),
                "currency": "RUB",
            },
            "confirmation": {
                "type": "redirect",
                "return_url": return_url,
            },
            "capture": True,
            "description": desc,
            "receipt": receipt,
            "metadata": {
                "type": "subscription",
                "subscription_id": str(sub.id),
                "seller_id": str(owner_id),
                "branches_count": str(branches_count),
            },
        }

        idempotence_key = str(uuid.uuid4())

        try:
            payment = await asyncio.to_thread(YooPayment.create, payment_params, idempotence_key)
        except Exception as exc:
            logger.error(
                "Subscription payment creation failed",
                seller_id=owner_id,
                subscription_id=sub.id,
                error=str(exc),
            )
            raise SubscriptionServiceError(f"Payment creation failed: {exc}", 502)

        sub.payment_id = payment.id
        await self.session.flush()

        confirmation_url = None
        if payment.confirmation:
            confirmation_url = payment.confirmation.confirmation_url

        logger.info(
            "Subscription payment created",
            seller_id=owner_id,
            subscription_id=sub.id,
            payment_id=payment.id,
            period_months=period_months,
            branches_count=branches_count,
            amount=str(amount_decimal),
        )

        return {
            "subscription_id": sub.id,
            "payment_id": payment.id,
            "confirmation_url": confirmation_url,
            "status": "pending",
        }

    async def check_subscription(self, seller_id: int) -> bool:
        """Check if seller/branch has an active subscription (via owner's subscription_plan flag)."""
        owner_id = await self._get_owner_id(seller_id)
        result = await self.session.execute(
            select(Seller.subscription_plan).where(Seller.seller_id == owner_id)
        )
        plan = result.scalar_one_or_none()
        return plan == "active"

    async def get_active_subscription(self, seller_id: int) -> Optional[Dict[str, Any]]:
        """Return current active subscription info for display, or None.
        Subscription is network-level (tied to owner_id)."""
        owner_id = await self._get_owner_id(seller_id)
        branches_count = await self._count_active_branches(owner_id)
        now = datetime.utcnow()
        result = await self.session.execute(
            select(Subscription).where(
                Subscription.seller_id == owner_id,
                Subscription.status == "active",
                Subscription.expires_at > now,
            ).order_by(Subscription.expires_at.desc()).limit(1)
        )
        sub = result.scalar_one_or_none()
        if not sub:
            return None

        days_remaining = (sub.expires_at - now).days if sub.expires_at else 0
        return {
            "id": sub.id,
            "period_months": sub.period_months,
            "status": sub.status,
            "started_at": sub.started_at.isoformat() if sub.started_at else None,
            "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
            "amount_paid": float(sub.amount_paid) if sub.amount_paid else 0,
            "days_remaining": max(days_remaining, 0),
            "auto_renew": sub.auto_renew,
            "branches_count": branches_count,
        }

    async def get_subscription_history(self, seller_id: int) -> List[Dict[str, Any]]:
        """Return all subscriptions for network, newest first."""
        owner_id = await self._get_owner_id(seller_id)
        result = await self.session.execute(
            select(Subscription).where(
                Subscription.seller_id == owner_id,
            ).order_by(Subscription.created_at.desc()).limit(50)
        )
        subs = result.scalars().all()
        return [
            {
                "id": s.id,
                "period_months": s.period_months,
                "status": s.status,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "expires_at": s.expires_at.isoformat() if s.expires_at else None,
                "amount_paid": float(s.amount_paid) if s.amount_paid else 0,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "payment_id": s.payment_id,
            }
            for s in subs
        ]

    # -- Webhook handling -------------------------------------------------------

    async def handle_webhook(self, event_data: Dict[str, Any]) -> None:
        """
        Process YooKassa webhook for subscription payment.
        Caller is responsible for session.commit().
        """
        payment_object = event_data.get("object", {})
        payment_id = payment_object.get("id")
        payment_status = payment_object.get("status")
        metadata = payment_object.get("metadata", {})
        subscription_id_str = metadata.get("subscription_id")

        if not payment_id or not subscription_id_str:
            logger.warning("Subscription webhook missing payment_id or subscription_id", data=event_data)
            return

        try:
            subscription_id = int(subscription_id_str)
        except (ValueError, TypeError):
            logger.warning("Subscription webhook has invalid subscription_id", subscription_id=subscription_id_str)
            return

        sub = await self.session.get(Subscription, subscription_id)
        if not sub:
            logger.warning("Subscription webhook: subscription not found", subscription_id=subscription_id)
            return

        if sub.payment_id and sub.payment_id != payment_id:
            logger.warning(
                "Subscription webhook payment_id mismatch",
                subscription_id=subscription_id,
                expected=sub.payment_id,
                received=payment_id,
            )
            return

        sub.payment_id = payment_id

        if payment_status == "succeeded" and sub.status == "pending":
            await self._activate_subscription(sub)
        elif payment_status == "canceled":
            sub.status = "cancelled"
            logger.info("Subscription payment cancelled", subscription_id=subscription_id)

    async def _activate_subscription(self, sub: Subscription) -> None:
        """Activate a subscription after successful payment.
        sub.seller_id is the owner_id (network-level subscription)."""
        now = datetime.utcnow()
        owner_id = sub.seller_id  # subscription is tied to owner's primary record

        # If owner already has an active subscription, extend from its end
        result = await self.session.execute(
            select(Subscription).where(
                Subscription.seller_id == owner_id,
                Subscription.status == "active",
                Subscription.expires_at > now,
                Subscription.id != sub.id,
            ).order_by(Subscription.expires_at.desc()).limit(1)
        )
        existing = result.scalar_one_or_none()

        if existing and existing.expires_at:
            sub.started_at = existing.expires_at
        else:
            sub.started_at = now

        sub.expires_at = sub.started_at + relativedelta(months=sub.period_months)
        sub.status = "active"

        # Update subscription_plan on owner's primary record
        seller = await self.session.get(Seller, owner_id)
        if seller:
            seller.subscription_plan = "active"

        logger.info(
            "Subscription activated",
            subscription_id=sub.id,
            owner_id=owner_id,
            period_months=sub.period_months,
            started_at=sub.started_at.isoformat(),
            expires_at=sub.expires_at.isoformat(),
        )

        # Send notification (resolve to actual Telegram chat_id)
        try:
            from backend.app.services.telegram_notify import notify_seller_subscription_activated, resolve_notification_chat_id
            _chat_id = await resolve_notification_chat_id(self.session, owner_id)
            await notify_seller_subscription_activated(
                seller_id=_chat_id,
                period_months=sub.period_months,
                expires_at=sub.expires_at,
            )
        except Exception as e:
            logger.warning("Subscription activation notification failed", error=str(e))

    # -- Expiry management ------------------------------------------------------

    async def expire_subscriptions(self) -> int:
        """Expire overdue subscriptions. Returns count of expired."""
        now = datetime.utcnow()
        result = await self.session.execute(
            select(Subscription).where(
                Subscription.status == "active",
                Subscription.expires_at <= now,
            )
        )
        expired = 0
        for sub in result.scalars().all():
            sub.status = "expired"

            # Check if owner has any other active subscription
            owner_id = sub.seller_id  # subscription seller_id is owner_id
            other = await self.session.execute(
                select(Subscription.id).where(
                    Subscription.seller_id == owner_id,
                    Subscription.status == "active",
                    Subscription.id != sub.id,
                    Subscription.expires_at > now,
                ).limit(1)
            )
            if not other.scalar_one_or_none():
                seller = await self.session.get(Seller, owner_id)
                if seller:
                    seller.subscription_plan = "none"

                # Send expiry notification
                try:
                    from backend.app.services.telegram_notify import notify_seller_subscription_expired, resolve_notification_chat_id
                    _chat_id = await resolve_notification_chat_id(self.session, owner_id)
                    await notify_seller_subscription_expired(_chat_id)
                except Exception as e:
                    logger.warning("Subscription expiry notification failed", seller_id=owner_id, error=str(e))

            expired += 1

        return expired

    async def check_expiring_subscriptions(self) -> None:
        """Send notifications for subscriptions expiring in 7 or 1 day."""
        now = datetime.utcnow()
        thresholds = [
            (timedelta(days=7), "7 дней"),
            (timedelta(days=1), "1 день"),
        ]
        for delta, label in thresholds:
            target = now + delta
            window_start = target.replace(hour=0, minute=0, second=0, microsecond=0)
            window_end = target.replace(hour=23, minute=59, second=59, microsecond=999999)
            result = await self.session.execute(
                select(Subscription).where(
                    Subscription.status == "active",
                    Subscription.expires_at >= window_start,
                    Subscription.expires_at <= window_end,
                )
            )
            for sub in result.scalars().all():
                try:
                    from backend.app.services.telegram_notify import notify_seller_subscription_expiring, resolve_notification_chat_id
                    _chat_id = await resolve_notification_chat_id(self.session, sub.seller_id)
                    await notify_seller_subscription_expiring(
                        seller_id=_chat_id,
                        days_label=label,
                        expires_at=sub.expires_at,
                    )
                except Exception as e:
                    logger.warning(
                        "Subscription expiry warning failed",
                        seller_id=sub.seller_id,
                        error=str(e),
                    )
