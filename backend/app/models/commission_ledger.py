from sqlalchemy import BigInteger, String, Integer, DateTime, Boolean, ForeignKey, Index, DECIMAL
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from backend.app.core.base import Base


class CommissionLedger(Base):
    """Tracks per-order platform commission charges for each seller.

    Commission accumulates and is paid together with the monthly subscription.
    """

    __tablename__ = "commission_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("sellers.seller_id"), nullable=False)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False)
    order_total: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    commission_rate: Mapped[float] = mapped_column(DECIMAL(5, 2), nullable=False)
    commission_amount: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    paid: Mapped[bool] = mapped_column(Boolean, default=False)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # YooKassa payment ID of the subscription payment that covered this commission
    subscription_payment_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        Index("ix_commission_ledger_seller_id", "seller_id"),
        Index("ix_commission_ledger_paid", "paid"),
        Index("ix_commission_ledger_seller_paid", "seller_id", "paid"),
    )
