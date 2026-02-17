# backend/app/services/loyalty.py
"""
Loyalty / club card service: seller customers, points accrual, settings, events.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy import select, func, delete as sa_delete, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List, Dict, Any

from backend.app.models.loyalty import (
    SellerCustomer,
    SellerLoyaltyTransaction,
    CustomerEvent,
    normalize_phone,
)
from backend.app.models.seller import Seller


def compute_tier(total_purchases: float, tiers_config: Optional[list]) -> Dict[str, Any]:
    """Compute loyalty tier based on total purchases and seller's tier config.
    Returns: {"name": str, "points_percent": float, "next_tier": str|None, "amount_to_next": float|None}
    """
    if not tiers_config or not isinstance(tiers_config, list) or len(tiers_config) == 0:
        return {"name": None, "points_percent": None, "next_tier": None, "amount_to_next": None}

    # Sort tiers by min_total ascending
    sorted_tiers = sorted(tiers_config, key=lambda t: t.get("min_total", 0))
    current_tier = sorted_tiers[0]
    next_tier = None

    for i, tier in enumerate(sorted_tiers):
        if total_purchases >= tier.get("min_total", 0):
            current_tier = tier
            next_tier = sorted_tiers[i + 1] if i + 1 < len(sorted_tiers) else None
        else:
            break

    return {
        "name": current_tier.get("name", "Стандарт"),
        "points_percent": current_tier.get("points_percent", 0),
        "next_tier": next_tier.get("name") if next_tier else None,
        "amount_to_next": round(next_tier.get("min_total", 0) - total_purchases, 2) if next_tier else None,
    }


def compute_rfm_segment(
    last_order_date: Optional[date],
    orders_count: int,
    total_spent: float,
) -> str:
    """Compute RFM segment label based on order data.
    R (Recency): <=30d=3, <=90d=2, >90d=1, no orders=0
    F (Frequency): >=5=3, >=2=2, 1=1, 0=0
    M (Monetary): >=20000=3, >=5000=2, <5000=1, 0=0
    """
    today = date.today()
    # R score
    if last_order_date is None:
        r = 0
    else:
        days = (today - last_order_date).days
        r = 3 if days <= 30 else (2 if days <= 90 else 1)
    # F score
    if orders_count >= 5:
        f = 3
    elif orders_count >= 2:
        f = 2
    elif orders_count == 1:
        f = 1
    else:
        f = 0
    # M score
    if total_spent >= 20000:
        m = 3
    elif total_spent >= 5000:
        m = 2
    elif total_spent > 0:
        m = 1
    else:
        m = 0

    total = r + f + m
    if f == 0:
        return "Новый"
    if total >= 8:
        return "VIP"
    if total >= 6:
        return "Постоянный"
    if f == 1 and r == 3:
        return "Новый"
    if r <= 1 and f >= 2:
        return "Уходящий"
    if r <= 1 and f == 1 and m >= 2:
        return "Потерянный"
    return "Случайный"


class LoyaltyServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class CustomerNotFoundError(LoyaltyServiceError):
    def __init__(self, customer_id: Optional[int] = None):
        super().__init__("Клиент не найден", 404)


class DuplicatePhoneError(LoyaltyServiceError):
    def __init__(self):
        super().__init__("Клиент с таким номером телефона уже есть", 409)


async def _next_card_number(session: AsyncSession, seller_id: int) -> str:
    """Generate next card number for seller (FL-00001, FL-00002, ...).
    Uses MAX(id) instead of COUNT(*) to avoid duplicates when customers are deleted.
    """
    q = select(func.max(SellerCustomer.id)).where(SellerCustomer.seller_id == seller_id)
    r = await session.execute(q)
    max_id = r.scalar() or 0
    return f"FL-{max_id + 1:05d}"


class LoyaltyService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_points_percent(self, seller_id: int) -> float:
        row = await self.session.get(Seller, seller_id)
        if not row:
            return 0.0
        return float(row.loyalty_points_percent or 0)

    async def set_points_percent(self, seller_id: int, points_percent: float) -> None:
        seller = await self.session.get(Seller, seller_id)
        if not seller:
            raise LoyaltyServiceError("Продавец не найден", 404)
        seller.loyalty_points_percent = Decimal(str(points_percent))

    async def list_customers(self, seller_id: int, tag_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        q = (
            select(SellerCustomer)
            .where(SellerCustomer.seller_id == seller_id)
            .order_by(SellerCustomer.created_at.desc())
        )
        # JSON array contains filter (PostgreSQL: tags::jsonb @> '["VIP"]')
        if tag_filter:
            from sqlalchemy import cast, type_coerce
            from sqlalchemy.dialects.postgresql import JSONB
            q = q.where(
                type_coerce(SellerCustomer.tags, JSONB).contains([tag_filter])
            )
        result = await self.session.execute(q)
        rows = result.scalars().all()
        return [
            {
                "id": c.id,
                "phone": c.phone,
                "first_name": c.first_name,
                "last_name": c.last_name,
                "card_number": c.card_number,
                "points_balance": float(c.points_balance or 0),
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "notes": getattr(c, "notes", None),
                "tags": getattr(c, "tags", None),
                "birthday": c.birthday.isoformat() if getattr(c, "birthday", None) else None,
            }
            for c in rows
        ]

    async def create_customer(
        self,
        seller_id: int,
        phone: str,
        first_name: str,
        last_name: str,
        birthday: Optional[date] = None,
    ) -> Dict[str, Any]:
        normalized = normalize_phone(phone)
        if not normalized:
            raise LoyaltyServiceError("Укажите номер телефона", 400)
        first_name = (first_name or "").strip() or "—"
        last_name = (last_name or "").strip() or "—"

        existing = await self.find_customer_by_phone(seller_id, normalized)
        if existing:
            raise DuplicatePhoneError()

        card_number = await _next_card_number(self.session, seller_id)
        customer = SellerCustomer(
            seller_id=seller_id,
            phone=normalized,
            first_name=first_name,
            last_name=last_name,
            card_number=card_number,
            points_balance=Decimal("0"),
            birthday=birthday,
        )
        self.session.add(customer)
        await self.session.flush()
        await self.session.refresh(customer)
        return {
            "id": customer.id,
            "phone": customer.phone,
            "first_name": customer.first_name,
            "last_name": customer.last_name,
            "card_number": customer.card_number,
            "points_balance": float(customer.points_balance),
            "created_at": customer.created_at.isoformat() if customer.created_at else None,
            "notes": getattr(customer, "notes", None),
            "tags": getattr(customer, "tags", None),
            "birthday": customer.birthday.isoformat() if customer.birthday else None,
        }

    async def get_customer(self, customer_id: int, seller_id: int) -> Optional[Dict[str, Any]]:
        customer = await self.session.get(SellerCustomer, customer_id)
        if not customer or customer.seller_id != seller_id:
            return None
        transactions = await self._get_transactions(customer_id)
        events = await self._get_events(customer_id)
        return {
            "id": customer.id,
            "phone": customer.phone,
            "first_name": customer.first_name,
            "last_name": customer.last_name,
            "card_number": customer.card_number,
            "points_balance": float(customer.points_balance or 0),
            "created_at": customer.created_at.isoformat() if customer.created_at else None,
            "notes": getattr(customer, "notes", None),
            "tags": getattr(customer, "tags", None),
            "birthday": customer.birthday.isoformat() if getattr(customer, "birthday", None) else None,
            "transactions": transactions,
            "events": events,
        }

    async def _get_transactions(self, customer_id: int) -> List[Dict[str, Any]]:
        q = (
            select(SellerLoyaltyTransaction)
            .where(SellerLoyaltyTransaction.customer_id == customer_id)
            .order_by(SellerLoyaltyTransaction.created_at.desc())
        )
        result = await self.session.execute(q)
        rows = result.scalars().all()
        return [
            {
                "id": t.id,
                "amount": float(t.amount),
                "points_accrued": float(t.points_accrued),
                "order_id": t.order_id,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in rows
        ]

    async def find_customer_by_phone(self, seller_id: int, phone: str) -> Optional[SellerCustomer]:
        normalized = normalize_phone(phone)
        if not normalized:
            return None
        q = select(SellerCustomer).where(
            SellerCustomer.seller_id == seller_id,
            SellerCustomer.phone == normalized,
        )
        result = await self.session.execute(q)
        return result.scalar_one_or_none()

    async def get_all_tags(self, seller_id: int) -> List[str]:
        """Get all unique tags used by seller's customers (for autocomplete)."""
        q = (
            select(SellerCustomer.tags)
            .where(
                SellerCustomer.seller_id == seller_id,
                SellerCustomer.tags.isnot(None),
            )
        )
        result = await self.session.execute(q)
        all_tags: set[str] = set()
        for (tags_list,) in result.all():
            if isinstance(tags_list, list):
                for t in tags_list:
                    if isinstance(t, str) and t.strip():
                        all_tags.add(t.strip())
        return sorted(all_tags)

    async def update_customer(
        self, seller_id: int, customer_id: int,
        notes: Optional[str] = None, tags: Optional[List[str]] = None,
        birthday: Optional[str] = "__unset__",
    ) -> Optional[Dict[str, Any]]:
        """Update customer notes, tags (list of strings), and birthday."""
        customer = await self.session.get(SellerCustomer, customer_id)
        if not customer or customer.seller_id != seller_id:
            return None
        if notes is not None:
            customer.notes = notes
        if tags is not None:
            customer.tags = [t.strip() for t in tags if t.strip()]
        if birthday != "__unset__":
            customer.birthday = date.fromisoformat(birthday) if birthday else None
        await self.session.flush()
        await self.session.refresh(customer)
        return {
            "id": customer.id,
            "phone": customer.phone,
            "first_name": customer.first_name,
            "last_name": customer.last_name,
            "card_number": customer.card_number,
            "points_balance": float(customer.points_balance or 0),
            "created_at": customer.created_at.isoformat() if customer.created_at else None,
            "notes": customer.notes,
            "tags": customer.tags,
            "birthday": customer.birthday.isoformat() if getattr(customer, "birthday", None) else None,
        }

    async def _get_customer_total_purchases(self, customer: SellerCustomer) -> float:
        """Sum of amounts from accrual transactions (where points_accrued > 0)."""
        q = select(func.coalesce(func.sum(SellerLoyaltyTransaction.amount), 0)).where(
            SellerLoyaltyTransaction.customer_id == customer.id,
            SellerLoyaltyTransaction.points_accrued > 0,
        )
        r = await self.session.execute(q)
        return float(r.scalar() or 0)

    async def accrue_points(
        self,
        seller_id: int,
        customer_id: int,
        amount: float,
        order_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        customer = await self.session.get(SellerCustomer, customer_id)
        if not customer or customer.seller_id != seller_id:
            raise CustomerNotFoundError(customer_id)
        # Use tier-specific percent if tiers are configured
        seller = await self.session.get(Seller, seller_id)
        tiers_config = getattr(seller, 'loyalty_tiers_config', None) if seller else None
        if tiers_config and isinstance(tiers_config, list) and len(tiers_config) > 0:
            total_purchases = await self._get_customer_total_purchases(customer)
            tier = compute_tier(total_purchases, tiers_config)
            percent = tier["points_percent"] if tier["points_percent"] is not None else await self.get_points_percent(seller_id)
        else:
            percent = await self.get_points_percent(seller_id)
        points = round(Decimal(str(amount)) * Decimal(str(percent)) / Decimal("100"), 2)
        if points <= 0:
            return {
                "customer_id": customer_id,
                "amount": amount,
                "points_accrued": 0,
                "new_balance": float(customer.points_balance or 0),
            }
        # Set expiry if configured
        expire_days = getattr(seller, 'points_expire_days', None) if seller else None
        expires_at = None
        if expire_days and expire_days > 0:
            expires_at = datetime.utcnow() + timedelta(days=expire_days)
        tx = SellerLoyaltyTransaction(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            amount=Decimal(str(amount)),
            points_accrued=points,
            expires_at=expires_at,
        )
        self.session.add(tx)
        customer.points_balance = (customer.points_balance or Decimal("0")) + points
        await self.session.flush()
        return {
            "customer_id": customer_id,
            "amount": amount,
            "points_accrued": float(points),
            "new_balance": float(customer.points_balance),
        }

    async def accrue_points_for_buyer_phone(
        self,
        seller_id: int,
        buyer_phone: Optional[str],
        amount: float,
        order_id: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """Find customer by phone and accrue points. Returns None if no customer or no phone."""
        if not buyer_phone:
            return None
        customer = await self.find_customer_by_phone(seller_id, buyer_phone)
        if not customer:
            return None
        return await self.accrue_points(seller_id, customer.id, amount, order_id)

    async def deduct_points(
        self, seller_id: int, customer_id: int, points: float
    ) -> Dict[str, Any]:
        """Deduct points from customer (manual spend). points must be > 0."""
        customer = await self.session.get(SellerCustomer, customer_id)
        if not customer or customer.seller_id != seller_id:
            raise CustomerNotFoundError(customer_id)
        points_decimal = Decimal(str(points))
        if points_decimal <= 0:
            raise LoyaltyServiceError("Укажите положительное количество баллов", 400)
        balance = customer.points_balance or Decimal("0")
        if balance < points_decimal:
            raise LoyaltyServiceError(
                f"Недостаточно баллов. Баланс: {balance}, запрошено: {points}",
                400,
            )
        tx = SellerLoyaltyTransaction(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=None,
            amount=Decimal("0"),
            points_accrued=-points_decimal,
        )
        self.session.add(tx)
        customer.points_balance = balance - points_decimal
        await self.session.flush()
        return {
            "customer_id": customer_id,
            "points_deducted": float(points_decimal),
            "new_balance": float(customer.points_balance),
        }

    # --- Events CRUD ---
    async def _get_events(self, customer_id: int) -> List[Dict[str, Any]]:
        q = (
            select(CustomerEvent)
            .where(CustomerEvent.customer_id == customer_id)
            .order_by(CustomerEvent.event_date.asc())
        )
        result = await self.session.execute(q)
        rows = result.scalars().all()
        return [
            {
                "id": e.id,
                "title": e.title,
                "event_date": e.event_date.isoformat() if e.event_date else None,
                "remind_days_before": e.remind_days_before,
                "notes": e.notes,
            }
            for e in rows
        ]

    async def add_event(
        self, seller_id: int, customer_id: int,
        title: str, event_date: date,
        remind_days_before: int = 3, notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        customer = await self.session.get(SellerCustomer, customer_id)
        if not customer or customer.seller_id != seller_id:
            raise CustomerNotFoundError(customer_id)
        ev = CustomerEvent(
            customer_id=customer_id,
            seller_id=seller_id,
            title=title,
            event_date=event_date,
            remind_days_before=remind_days_before,
            notes=notes,
        )
        self.session.add(ev)
        await self.session.flush()
        await self.session.refresh(ev)
        return {
            "id": ev.id,
            "title": ev.title,
            "event_date": ev.event_date.isoformat(),
            "remind_days_before": ev.remind_days_before,
            "notes": ev.notes,
        }

    async def update_event(
        self, seller_id: int, event_id: int,
        title: Optional[str] = None, event_date: Optional[date] = None,
        remind_days_before: Optional[int] = None, notes: Optional[str] = "__unset__",
    ) -> Optional[Dict[str, Any]]:
        ev = await self.session.get(CustomerEvent, event_id)
        if not ev or ev.seller_id != seller_id:
            return None
        if title is not None:
            ev.title = title
        if event_date is not None:
            ev.event_date = event_date
        if remind_days_before is not None:
            ev.remind_days_before = remind_days_before
        if notes != "__unset__":
            ev.notes = notes
        await self.session.flush()
        await self.session.refresh(ev)
        return {
            "id": ev.id,
            "title": ev.title,
            "event_date": ev.event_date.isoformat(),
            "remind_days_before": ev.remind_days_before,
            "notes": ev.notes,
        }

    async def delete_event(self, seller_id: int, event_id: int) -> bool:
        ev = await self.session.get(CustomerEvent, event_id)
        if not ev or ev.seller_id != seller_id:
            return False
        await self.session.delete(ev)
        await self.session.flush()
        return True

    async def get_upcoming_events(
        self, seller_id: int, days_ahead: int = 7
    ) -> List[Dict[str, Any]]:
        """Get upcoming events and birthdays within days_ahead days."""
        today = date.today()
        end_date = today + timedelta(days=days_ahead)
        results: List[Dict[str, Any]] = []

        # 1. Customer events
        q = (
            select(CustomerEvent, SellerCustomer.first_name, SellerCustomer.last_name)
            .join(SellerCustomer, CustomerEvent.customer_id == SellerCustomer.id)
            .where(CustomerEvent.seller_id == seller_id)
        )
        ev_result = await self.session.execute(q)
        for ev, first_name, last_name in ev_result.all():
            # Check if event_date falls within the window (same month-day in current year)
            try:
                this_year_date = ev.event_date.replace(year=today.year)
            except ValueError:
                continue  # e.g., Feb 29 in non-leap year
            if this_year_date < today:
                try:
                    this_year_date = ev.event_date.replace(year=today.year + 1)
                except ValueError:
                    continue
            days_until = (this_year_date - today).days
            if days_until <= days_ahead:
                results.append({
                    "type": "event",
                    "customer_id": ev.customer_id,
                    "customer_name": f"{last_name} {first_name}".strip(),
                    "title": ev.title,
                    "event_date": this_year_date.isoformat(),
                    "days_until": days_until,
                })

        # 2. Birthdays
        q_bday = (
            select(SellerCustomer)
            .where(
                SellerCustomer.seller_id == seller_id,
                SellerCustomer.birthday.isnot(None),
            )
        )
        bday_result = await self.session.execute(q_bday)
        for c in bday_result.scalars().all():
            try:
                this_year_bday = c.birthday.replace(year=today.year)
            except ValueError:
                continue
            if this_year_bday < today:
                try:
                    this_year_bday = c.birthday.replace(year=today.year + 1)
                except ValueError:
                    continue
            days_until = (this_year_bday - today).days
            if days_until <= days_ahead:
                results.append({
                    "type": "birthday",
                    "customer_id": c.id,
                    "customer_name": f"{c.last_name} {c.first_name}".strip(),
                    "title": "День рождения",
                    "event_date": this_year_bday.isoformat(),
                    "days_until": days_until,
                })

        results.sort(key=lambda x: x["days_until"])
        return results


async def expire_stale_points(session: AsyncSession) -> int:
    """Mark expired loyalty transactions as is_expired=True and recalculate balances.
    Returns number of expired transactions.
    """
    now = datetime.utcnow()

    # Find transactions to expire
    q = select(SellerLoyaltyTransaction).where(
        SellerLoyaltyTransaction.expires_at.isnot(None),
        SellerLoyaltyTransaction.expires_at < now,
        SellerLoyaltyTransaction.is_expired == False,
        SellerLoyaltyTransaction.points_accrued > 0,
    )
    result = await session.execute(q)
    expired_txs = result.scalars().all()

    if not expired_txs:
        return 0

    # Group expired points by customer_id
    customer_expired: Dict[int, Decimal] = {}
    for tx in expired_txs:
        tx.is_expired = True
        cid = tx.customer_id
        customer_expired[cid] = customer_expired.get(cid, Decimal("0")) + Decimal(str(tx.points_accrued))

    # Recalculate balances for affected customers
    for cid, expired_points in customer_expired.items():
        customer = await session.get(SellerCustomer, cid)
        if customer:
            new_balance = max(Decimal("0"), (customer.points_balance or Decimal("0")) - expired_points)
            customer.points_balance = new_balance

    await session.flush()
    return len(expired_txs)


async def get_expiring_points(session: AsyncSession, seller_id: int, days_ahead: int = 30) -> List[Dict[str, Any]]:
    """Get customers with points expiring within days_ahead days."""
    now = datetime.utcnow()
    deadline = now + timedelta(days=days_ahead)

    q = (
        select(
            SellerLoyaltyTransaction.customer_id,
            func.sum(SellerLoyaltyTransaction.points_accrued).label("expiring_points"),
            func.min(SellerLoyaltyTransaction.expires_at).label("earliest_expiry"),
        )
        .where(
            SellerLoyaltyTransaction.seller_id == seller_id,
            SellerLoyaltyTransaction.expires_at.isnot(None),
            SellerLoyaltyTransaction.expires_at <= deadline,
            SellerLoyaltyTransaction.expires_at > now,
            SellerLoyaltyTransaction.is_expired == False,
            SellerLoyaltyTransaction.points_accrued > 0,
        )
        .group_by(SellerLoyaltyTransaction.customer_id)
    )
    result = await session.execute(q)
    rows = result.all()

    items = []
    for customer_id, expiring_points, earliest_expiry in rows:
        customer = await session.get(SellerCustomer, customer_id)
        if customer:
            items.append({
                "customer_id": customer_id,
                "customer_name": f"{customer.last_name} {customer.first_name}".strip(),
                "expiring_points": float(expiring_points),
                "earliest_expiry": earliest_expiry.isoformat() if earliest_expiry else None,
                "days_until_expiry": (earliest_expiry - now).days if earliest_expiry else None,
            })

    items.sort(key=lambda x: x.get("days_until_expiry") or 999)
    return items


async def get_all_sellers_upcoming_events(session: AsyncSession, days_ahead: int = 7) -> Dict[int, List[Dict[str, Any]]]:
    """Get upcoming events for ALL sellers, grouped by seller_id."""
    today = date.today()

    # Get all events
    q = (
        select(CustomerEvent, SellerCustomer.first_name, SellerCustomer.last_name)
        .join(SellerCustomer, CustomerEvent.customer_id == SellerCustomer.id)
    )
    ev_result = await session.execute(q)
    events_by_seller: Dict[int, List[Dict[str, Any]]] = {}

    for ev, first_name, last_name in ev_result.all():
        try:
            this_year_date = ev.event_date.replace(year=today.year)
        except ValueError:
            continue
        if this_year_date < today:
            try:
                this_year_date = ev.event_date.replace(year=today.year + 1)
            except ValueError:
                continue
        days_until = (this_year_date - today).days
        if days_until <= days_ahead:
            events_by_seller.setdefault(ev.seller_id, []).append({
                "type": "event",
                "customer_name": f"{last_name} {first_name}".strip(),
                "title": ev.title,
                "days_until": days_until,
            })

    # Get all birthdays
    q_bday = select(SellerCustomer).where(SellerCustomer.birthday.isnot(None))
    bday_result = await session.execute(q_bday)
    for c in bday_result.scalars().all():
        try:
            this_year_bday = c.birthday.replace(year=today.year)
        except ValueError:
            continue
        if this_year_bday < today:
            try:
                this_year_bday = c.birthday.replace(year=today.year + 1)
            except ValueError:
                continue
        days_until = (this_year_bday - today).days
        if days_until <= days_ahead:
            events_by_seller.setdefault(c.seller_id, []).append({
                "type": "birthday",
                "customer_name": f"{c.last_name} {c.first_name}".strip(),
                "title": "День рождения",
                "days_until": days_until,
            })

    # Sort each seller's events
    for sid in events_by_seller:
        events_by_seller[sid].sort(key=lambda x: x["days_until"])

    return events_by_seller


async def get_customer_segments(
    session: AsyncSession, seller_id: int
) -> Dict[str, Any]:
    """Compute RFM segments for all seller's customers.
    Returns: {"segments": {"VIP": 5, "Постоянный": 12, ...}, "customers": [{id, name, segment}, ...]}
    """
    from backend.app.models.order import Order

    # Get all customers
    q = select(SellerCustomer).where(SellerCustomer.seller_id == seller_id)
    result = await session.execute(q)
    customers = result.scalars().all()

    if not customers:
        return {"segments": {}, "customers": []}

    # Get completed order stats per phone (buyer_phone → {count, total, last_date})
    COMPLETED = ("done", "completed")
    order_q = (
        select(
            Order.buyer_phone,
            func.count(Order.id).label("cnt"),
            func.sum(Order.total_price).label("total"),
            func.max(Order.created_at).label("last_at"),
        )
        .where(
            Order.seller_id == seller_id,
            Order.status.in_(COMPLETED),
        )
        .group_by(Order.buyer_phone)
    )
    order_result = await session.execute(order_q)
    phone_stats: Dict[str, dict] = {}
    for buyer_phone, cnt, total, last_at in order_result.all():
        if buyer_phone:
            normalized = normalize_phone(buyer_phone)
            phone_stats[normalized] = {
                "count": cnt,
                "total": float(total or 0),
                "last_date": last_at.date() if last_at else None,
            }

    segments_count: Dict[str, int] = {}
    customer_list = []

    for c in customers:
        stats = phone_stats.get(c.phone, {"count": 0, "total": 0, "last_date": None})
        segment = compute_rfm_segment(
            last_order_date=stats["last_date"],
            orders_count=stats["count"],
            total_spent=stats["total"],
        )
        segments_count[segment] = segments_count.get(segment, 0) + 1
        customer_list.append({
            "id": c.id,
            "name": f"{c.last_name} {c.first_name}".strip(),
            "phone": c.phone,
            "segment": segment,
        })

    return {"segments": segments_count, "customers": customer_list}
