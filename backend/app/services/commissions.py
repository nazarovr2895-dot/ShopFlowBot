from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func

from backend.app.models.settings import GlobalSettings
from backend.app.models.seller import Seller
from backend.app.models.commission_ledger import CommissionLedger

DEFAULT_COMMISSION_PERCENT = 3


async def get_effective_commission_rate(
    session: AsyncSession,
    seller_id: Optional[int] = None,
) -> int:
    """
    Возвращает эффективный процент комиссии.
    Приоритет: индивидуальная комиссия продавца > глобальная настройка > дефолт (3%).
    """
    percent = DEFAULT_COMMISSION_PERCENT

    gs_result = await session.execute(select(GlobalSettings).order_by(GlobalSettings.id))
    settings = gs_result.scalar_one_or_none()
    if settings:
        percent = settings.commission_percent

    if seller_id is not None:
        seller = await session.get(Seller, seller_id)
        if seller and seller.commission_percent is not None:
            percent = seller.commission_percent

    return percent


async def calculate_platform_commission(
    session: AsyncSession,
    order_total: float,
    seller_id: Optional[int] = None,
) -> float:
    """
    Считает комиссию платформы.
    Приоритет: индивидуальная комиссия продавца > глобальная настройка > дефолт (3%).
    """
    percent = await get_effective_commission_rate(session, seller_id)
    return order_total * (percent / 100)


# ---------------------------------------------------------------------------
# Commission ledger functions
# ---------------------------------------------------------------------------


async def record_commission(
    session: AsyncSession,
    seller_id: int,
    order_id: int,
    order_total: Decimal,
) -> CommissionLedger:
    """Record a commission charge for a completed order and update seller balance."""
    rate = await get_effective_commission_rate(session, seller_id)
    amount = (order_total * Decimal(str(rate)) / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    entry = CommissionLedger(
        seller_id=seller_id,
        order_id=order_id,
        order_total=order_total,
        commission_rate=Decimal(str(rate)),
        commission_amount=amount,
    )
    session.add(entry)

    # Update cached balance on seller
    seller = await session.get(Seller, seller_id)
    if seller:
        current = Decimal(str(seller.commission_balance or 0))
        seller.commission_balance = current + amount

    await session.flush()
    return entry


async def get_commission_balance(session: AsyncSession, seller_id: int) -> Decimal:
    """Return total unpaid commission for a seller."""
    result = await session.execute(
        select(sa_func.coalesce(sa_func.sum(CommissionLedger.commission_amount), 0))
        .where(CommissionLedger.seller_id == seller_id)
        .where(CommissionLedger.paid == False)  # noqa: E712
    )
    return Decimal(str(result.scalar()))


async def get_commission_history(
    session: AsyncSession,
    seller_id: int,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """Return commission entries for a seller, newest first."""
    result = await session.execute(
        select(CommissionLedger)
        .where(CommissionLedger.seller_id == seller_id)
        .order_by(CommissionLedger.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    entries = result.scalars().all()
    return [
        {
            "id": e.id,
            "order_id": e.order_id,
            "order_total": float(e.order_total),
            "commission_rate": float(e.commission_rate),
            "commission_amount": float(e.commission_amount),
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "paid": e.paid,
            "paid_at": e.paid_at.isoformat() if e.paid_at else None,
        }
        for e in entries
    ]


async def mark_commissions_paid(
    session: AsyncSession,
    seller_id: int,
    payment_id: str,
) -> int:
    """Mark all unpaid commissions for a seller as paid. Returns count of entries marked."""
    result = await session.execute(
        select(CommissionLedger)
        .where(CommissionLedger.seller_id == seller_id)
        .where(CommissionLedger.paid == False)  # noqa: E712
    )
    entries = result.scalars().all()

    now = datetime.utcnow()
    for entry in entries:
        entry.paid = True
        entry.paid_at = now
        entry.subscription_payment_id = payment_id

    # Reset cached balance on seller
    seller = await session.get(Seller, seller_id)
    if seller:
        seller.commission_balance = Decimal("0")

    await session.flush()
    return len(entries)
