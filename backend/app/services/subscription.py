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
from backend.app.core.exceptions import ServiceError

logger = get_logger(__name__)

VALID_PERIODS = (1,)

# Dynamic pricing: base + 1% of sales if turnover > threshold
TURNOVER_THRESHOLD = 100_000  # rubles
TURNOVER_PERCENT = Decimal("0.01")  # 1%


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class SubscriptionServiceError(ServiceError):
    """Base exception for subscription service errors."""
    pass


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

    def get_base_price(self) -> int:
        """Return base monthly subscription price."""
        return get_settings().SUBSCRIPTION_BASE_PRICE

    def get_prices(self) -> Dict[int, int]:
        """Return price table per single branch: {period_months: price_in_rubles}."""
        base = self.get_base_price()
        return {1: base}

    async def calculate_dynamic_price(self, seller_id: int) -> Dict[str, Any]:
        """Calculate subscription price based on 30 days turnover.

        Formula: base (2000₽) + 1% of total sales if turnover > 100,000₽.

        The 30-day window is anchored to the active subscription's expiry date
        (not utcnow()) to prevent double-counting on early renewal.
        """
        from backend.app.models.order import Order
        from backend.app.core.constants import COMPLETED_ORDER_STATUSES

        base = self.get_base_price()
        now = datetime.utcnow()

        # Anchor window to active subscription expiry to prevent double-counting
        active_result = await self.session.execute(
            select(Subscription).where(
                Subscription.seller_id == seller_id,
                Subscription.status == "active",
                Subscription.expires_at > now,
            ).order_by(Subscription.expires_at.desc()).limit(1)
        )
        active_sub = active_result.scalar_one_or_none()

        if active_sub and active_sub.expires_at:
            period_end = active_sub.expires_at
        else:
            period_end = now

        period_start = period_end - timedelta(days=30)

        result = await self.session.execute(
            select(sa_func.coalesce(sa_func.sum(Order.total_price), 0))
            .where(
                Order.seller_id == seller_id,
                Order.status.in_(COMPLETED_ORDER_STATUSES),
                Order.created_at >= period_start,
                Order.created_at < period_end,
            )
        )
        turnover = Decimal(str(result.scalar()))

        additional_amount = Decimal("0")
        if turnover > TURNOVER_THRESHOLD:
            additional_amount = (turnover * TURNOVER_PERCENT).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP
            )

        total = Decimal(str(base)) + additional_amount

        return {
            "base_price": base,
            "turnover_30d": float(turnover),
            "threshold": TURNOVER_THRESHOLD,
            "additional_percent": 1,
            "additional_amount": float(additional_amount),
            "total_price": float(total),
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
        }

    # -- Subscription lifecycle -------------------------------------------------

    async def create_subscription(
        self,
        seller_id: int,
        period_months: int = 1,
        target_seller_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Create a pending subscription record and a YooKassa payment.

        Price is dynamic: base 2000₽ + 1% of last 30 days turnover if > 100k.
        Per-branch: subscription is for a specific seller/branch.

        Returns dict with subscription_id, confirmation_url, status.
        """
        self._ensure_configured()

        if period_months not in VALID_PERIODS:
            raise SubscriptionServiceError(
                f"Invalid period. Must be one of: {VALID_PERIODS}"
            )

        # Determine the actual seller to subscribe
        if target_seller_id is not None:
            caller_owner_id = await self._get_owner_id(seller_id)
            target_seller = await self.session.get(Seller, target_seller_id)
            if not target_seller or target_seller.deleted_at is not None:
                raise SubscriptionServiceError("Филиал не найден", 404)
            if target_seller.owner_id != caller_owner_id:
                raise SubscriptionServiceError("Филиал не принадлежит вашей сети", 403)
            sub_seller_id = target_seller_id
        else:
            sub_seller_id = seller_id

        # Prevent duplicate pending subscriptions (e.g. double-click)
        existing_pending = await self.session.execute(
            select(Subscription).where(
                Subscription.seller_id == sub_seller_id,
                Subscription.status == "pending",
                Subscription.created_at >= datetime.utcnow() - timedelta(hours=1),
            ).limit(1)
        )
        if existing_pending.scalar_one_or_none():
            raise SubscriptionServiceError(
                "У вас уже есть незавершённый платёж. Дождитесь его завершения или попробуйте позже.",
                409,
            )

        # Calculate dynamic price based on turnover
        pricing = await self.calculate_dynamic_price(sub_seller_id)
        total_amount = Decimal(str(pricing["total_price"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # Create subscription record
        sub = Subscription(
            seller_id=sub_seller_id,
            period_months=1,
            status="pending",
            amount_paid=total_amount,
        )
        self.session.add(sub)
        await self.session.flush()

        settings = get_settings()
        return_url = settings.YOOKASSA_RETURN_URL or "https://app.flurai.ru/?tab=settings"

        # Build receipt (54-ФЗ)
        target = await self.session.get(Seller, sub_seller_id)
        shop_label = target.shop_name if target and target.shop_name else f"#{sub_seller_id}"

        receipt_items = [
            {
                "description": f"Подписка Flurai (1 мес.) — {shop_label}"[:128],
                "quantity": "1",
                "amount": {
                    "value": str(total_amount),
                    "currency": "RUB",
                },
                "vat_code": 1,
                "payment_mode": "full_payment",
                "payment_subject": "service",
            },
        ]

        desc = f"Подписка Flurai (1 мес.) — {shop_label}"
        receipt = {
            "customer": {"email": "subscription@flurai.ru"},
            "items": receipt_items,
        }

        payment_params = {
            "amount": {
                "value": str(total_amount),
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
            amount=str(total_amount),
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

        # Update subscription_plan on the specific seller/branch and clear grace period
        seller = await self.session.get(Seller, target_seller_id)
        if seller:
            seller.subscription_plan = "active"
            seller.grace_period_until = None

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
        """Expire overdue subscriptions and set grace period. Returns count of expired."""
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
                    # Set 7-day grace period before blocking
                    seller.grace_period_until = now + timedelta(days=7)

                # Send expiry notification with grace period info
                try:
                    from backend.app.services.telegram_notify import notify_seller_subscription_expired, resolve_notification_chat_id
                    _chat_id = await resolve_notification_chat_id(self.session, target_seller_id)
                    await notify_seller_subscription_expired(_chat_id)
                except Exception as e:
                    logger.warning("Subscription expiry notification failed", seller_id=target_seller_id, error=str(e))

            expired += 1

        return expired

    async def check_grace_period_expired(self) -> int:
        """Block sellers whose grace period has expired without renewal. Returns count blocked."""
        now = datetime.utcnow()
        result = await self.session.execute(
            select(Seller).where(
                Seller.grace_period_until.isnot(None),
                Seller.grace_period_until <= now,
                Seller.subscription_plan != "active",
                Seller.is_blocked == False,  # noqa: E712
                Seller.deleted_at.is_(None),
            )
        )
        blocked = 0
        for seller in result.scalars().all():
            seller.is_blocked = True
            seller.grace_period_until = None
            logger.info(
                "Seller blocked after grace period expired",
                seller_id=seller.seller_id,
            )

            # Notify seller
            try:
                from backend.app.services.telegram_notify import resolve_notification_chat_id
                _chat_id = await resolve_notification_chat_id(self.session, seller.seller_id)
                from backend.app.services.telegram_notify import send_notification
                await send_notification(
                    _chat_id,
                    "🚫 Ваш магазин заблокирован из-за неоплаченной подписки.\n"
                    "Оплатите подписку в настройках, чтобы разблокировать."
                )
            except Exception as e:
                logger.warning("Grace period block notification failed", seller_id=seller.seller_id, error=str(e))

            blocked += 1

        return blocked

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
