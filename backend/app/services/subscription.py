"""
Subscription service — seller subscription management via YooKassa.

Per-branch subscriptions: each seller/branch has its own independent subscription.
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

    # -- Pricing ----------------------------------------------------------------

    def get_prices(self) -> Dict[int, int]:
        """Return price table per single branch: {period_months: price_in_rubles}."""
        base = get_settings().SUBSCRIPTION_BASE_PRICE
        return {
            period: round(base * period * multiplier)
            for period, multiplier in PERIOD_MULTIPLIERS.items()
        }

    # -- Subscription lifecycle -------------------------------------------------

    async def create_subscription(
        self,
        seller_id: int,
        period_months: int,
        target_seller_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Create a pending subscription record and a YooKassa payment.

        Per-branch: subscription is for a specific seller/branch.
        - target_seller_id: if set, create subscription for this branch (network owner paying for a branch)
        - if not set: create subscription for seller_id directly (regular seller or self)

        Returns dict with subscription_id, confirmation_url, status.
        """
        self._ensure_configured()

        if period_months not in VALID_PERIODS:
            raise SubscriptionServiceError(
                f"Invalid period. Must be one of: {VALID_PERIODS}"
            )

        # Determine the actual seller to subscribe
        if target_seller_id is not None:
            # Network owner paying for a specific branch
            caller_owner_id = await self._get_owner_id(seller_id)
            target_seller = await self.session.get(Seller, target_seller_id)
            if not target_seller or target_seller.deleted_at is not None:
                raise SubscriptionServiceError("Филиал не найден", 404)
            if target_seller.owner_id != caller_owner_id:
                raise SubscriptionServiceError("Филиал не принадлежит вашей сети", 403)
            sub_seller_id = target_seller_id
        else:
            sub_seller_id = seller_id

        prices = self.get_prices()
        amount = prices[period_months]
        amount_decimal = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # Create subscription record for the specific branch/seller
        sub = Subscription(
            seller_id=sub_seller_id,
            period_months=period_months,
            status="pending",
            amount_paid=amount_decimal,
        )
        self.session.add(sub)
        await self.session.flush()  # get sub.id

        settings = get_settings()
        return_url = settings.YOOKASSA_RETURN_URL or "https://app.flurai.ru/?tab=settings"

        # Build receipt (54-ФЗ)
        # Get shop name for description
        target = await self.session.get(Seller, sub_seller_id)
        shop_label = target.shop_name if target and target.shop_name else f"#{sub_seller_id}"
        desc = f"Подписка Flurai ({period_months} мес.) — {shop_label}"
        receipt = {
            "customer": {"email": "subscription@flurai.ru"},
            "items": [
                {
                    "description": desc[:128],  # YooKassa limit
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
            "description": desc[:128],
            "receipt": receipt,
            "metadata": {
                "type": "subscription",
                "subscription_id": str(sub.id),
                "seller_id": str(sub_seller_id),
            },
        }

        idempotence_key = str(uuid.uuid4())

        try:
            payment = await asyncio.to_thread(YooPayment.create, payment_params, idempotence_key)
        except Exception as exc:
            logger.error(
                "Subscription payment creation failed",
                seller_id=sub_seller_id,
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
            seller_id=sub_seller_id,
            subscription_id=sub.id,
            payment_id=payment.id,
            period_months=period_months,
            amount=str(amount_decimal),
        )

        return {
            "subscription_id": sub.id,
            "payment_id": payment.id,
            "confirmation_url": confirmation_url,
            "status": "pending",
        }

    async def check_subscription(self, seller_id: int) -> bool:
        """Check if a specific seller/branch has an active subscription."""
        result = await self.session.execute(
            select(Seller.subscription_plan).where(Seller.seller_id == seller_id)
        )
        plan = result.scalar_one_or_none()
        return plan == "active"

    async def get_active_subscription(self, seller_id: int) -> Optional[Dict[str, Any]]:
        """Return current active subscription info for a specific seller/branch, or None."""
        now = datetime.utcnow()
        result = await self.session.execute(
            select(Subscription).where(
                Subscription.seller_id == seller_id,
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
        }

    async def get_subscription_history(self, seller_id: int) -> List[Dict[str, Any]]:
        """Return all subscriptions for a specific seller/branch, newest first."""
        result = await self.session.execute(
            select(Subscription).where(
                Subscription.seller_id == seller_id,
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

    async def get_branches_subscription_status(self, seller_id: int) -> List[Dict[str, Any]]:
        """Return subscription status for all branches of the caller's network.
        Used by network owners to see per-branch subscription info."""
        owner_id = await self._get_owner_id(seller_id)
        now = datetime.utcnow()

        result = await self.session.execute(
            select(Seller).where(
                Seller.owner_id == owner_id,
                Seller.seller_id != owner_id,  # exclude management account
                Seller.deleted_at.is_(None),
            ).order_by(Seller.seller_id)
        )
        branches = result.scalars().all()

        statuses = []
        for branch in branches:
            # Get active subscription for this branch
            sub_result = await self.session.execute(
                select(Subscription).where(
                    Subscription.seller_id == branch.seller_id,
                    Subscription.status == "active",
                    Subscription.expires_at > now,
                ).order_by(Subscription.expires_at.desc()).limit(1)
            )
            active_sub = sub_result.scalar_one_or_none()

            days_remaining = 0
            expires_at = None
            if active_sub and active_sub.expires_at:
                days_remaining = max((active_sub.expires_at - now).days, 0)
                expires_at = active_sub.expires_at.isoformat()

            statuses.append({
                "seller_id": branch.seller_id,
                "shop_name": branch.shop_name,
                "address_name": branch.address_name,
                "subscription_plan": getattr(branch, "subscription_plan", "none") or "none",
                "expires_at": expires_at,
                "days_remaining": days_remaining,
                "is_owner": branch.seller_id == owner_id,
            })

        return statuses

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
        sub.seller_id is the specific seller/branch being subscribed."""
        now = datetime.utcnow()
        target_seller_id = sub.seller_id

        # If this seller already has an active subscription, extend from its end
        result = await self.session.execute(
            select(Subscription).where(
                Subscription.seller_id == target_seller_id,
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

        # Update subscription_plan on the specific seller/branch
        seller = await self.session.get(Seller, target_seller_id)
        if seller:
            seller.subscription_plan = "active"

        logger.info(
            "Subscription activated",
            subscription_id=sub.id,
            seller_id=target_seller_id,
            period_months=sub.period_months,
            started_at=sub.started_at.isoformat(),
            expires_at=sub.expires_at.isoformat(),
        )

        # Send notification (resolve to actual Telegram chat_id)
        try:
            from backend.app.services.telegram_notify import notify_seller_subscription_activated, resolve_notification_chat_id
            _chat_id = await resolve_notification_chat_id(self.session, target_seller_id)
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

            # Check if this seller has any other active subscription
            target_seller_id = sub.seller_id
            other = await self.session.execute(
                select(Subscription.id).where(
                    Subscription.seller_id == target_seller_id,
                    Subscription.status == "active",
                    Subscription.id != sub.id,
                    Subscription.expires_at > now,
                ).limit(1)
            )
            if not other.scalar_one_or_none():
                seller = await self.session.get(Seller, target_seller_id)
                if seller:
                    seller.subscription_plan = "none"

                # Send expiry notification
                try:
                    from backend.app.services.telegram_notify import notify_seller_subscription_expired, resolve_notification_chat_id
                    _chat_id = await resolve_notification_chat_id(self.session, target_seller_id)
                    await notify_seller_subscription_expired(_chat_id)
                except Exception as e:
                    logger.warning("Subscription expiry notification failed", seller_id=target_seller_id, error=str(e))

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
