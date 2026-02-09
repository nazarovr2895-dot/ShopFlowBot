# backend/app/services/loyalty.py
"""
Loyalty / club card service: seller customers, points accrual, settings.
"""
from decimal import Decimal
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List, Dict, Any

from backend.app.models.loyalty import (
    SellerCustomer,
    SellerLoyaltyTransaction,
    normalize_phone,
)
from backend.app.models.seller import Seller


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
    """Generate next card number for seller (FL-00001, FL-00002, ...)."""
    q = select(func.count()).where(SellerCustomer.seller_id == seller_id)
    r = await session.execute(q)
    n = r.scalar() or 0
    return f"FL-{n + 1:05d}"


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

    async def list_customers(self, seller_id: int) -> List[Dict[str, Any]]:
        q = (
            select(SellerCustomer)
            .where(SellerCustomer.seller_id == seller_id)
            .order_by(SellerCustomer.created_at.desc())
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
            }
            for c in rows
        ]

    async def create_customer(
        self,
        seller_id: int,
        phone: str,
        first_name: str,
        last_name: str,
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
        }

    async def get_customer(self, customer_id: int, seller_id: int) -> Optional[Dict[str, Any]]:
        customer = await self.session.get(SellerCustomer, customer_id)
        if not customer or customer.seller_id != seller_id:
            return None
        transactions = await self._get_transactions(customer_id)
        return {
            "id": customer.id,
            "phone": customer.phone,
            "first_name": customer.first_name,
            "last_name": customer.last_name,
            "card_number": customer.card_number,
            "points_balance": float(customer.points_balance or 0),
            "created_at": customer.created_at.isoformat() if customer.created_at else None,
            "transactions": transactions,
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
        percent = await self.get_points_percent(seller_id)
        points = round(Decimal(str(amount)) * Decimal(str(percent)) / Decimal("100"), 2)
        if points <= 0:
            return {
                "customer_id": customer_id,
                "amount": amount,
                "points_accrued": 0,
                "new_balance": float(customer.points_balance or 0),
            }
        tx = SellerLoyaltyTransaction(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            amount=Decimal(str(amount)),
            points_accrued=points,
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
