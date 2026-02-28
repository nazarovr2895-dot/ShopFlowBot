from sqlalchemy import BigInteger, String, ForeignKey, Integer, DateTime, DECIMAL, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from backend.app.core.base import Base


class Subscription(Base):
    __tablename__ = 'subscriptions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('sellers.seller_id'), nullable=False)
    period_months: Mapped[int] = mapped_column(Integer, nullable=False)  # 1, 3, 6, 12
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    payment_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # YooKassa payment ID
    status: Mapped[str] = mapped_column(String(20), default='pending')  # pending/active/expired/cancelled
    amount_paid: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_subscriptions_seller_id', 'seller_id'),
        Index('ix_subscriptions_status', 'status'),
        Index('ix_subscriptions_expires_at', 'expires_at'),
    )
