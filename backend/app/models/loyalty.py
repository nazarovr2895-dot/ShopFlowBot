"""Loyalty / club card models: seller_customers, seller_loyalty_transactions, customer_events."""
from datetime import datetime, date
from sqlalchemy import (
    BigInteger,
    String,
    ForeignKey,
    Integer,
    Date,
    DateTime,
    DECIMAL,
    Index,
    UniqueConstraint,
    Text,
    JSON,
    Boolean,
)
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional, List
from backend.app.core.base import Base


def normalize_phone(phone: str) -> str:
    """Strip non-digits; optionally ensure country prefix (e.g. 7 for RU)."""
    digits = "".join(c for c in str(phone) if c.isdigit())
    if not digits:
        return ""
    if len(digits) == 10 and digits[0] in "789":
        return "7" + digits
    if len(digits) == 11 and digits[0] == "7":
        return digits
    return digits


class SellerCustomer(Base):
    """Seller's club card customer: phone + name, card number, points balance."""
    __tablename__ = 'seller_customers'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    card_number: Mapped[str] = mapped_column(String(32), nullable=False)
    points_balance: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    linked_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[List[str]]] = mapped_column(JSON(), nullable=True)  # ["VIP", "корпоративный"]
    birthday: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    __table_args__ = (
        UniqueConstraint('seller_id', 'phone', name='uq_seller_customers_seller_phone'),
        Index('ix_seller_customers_seller_id', 'seller_id'),
        Index('ix_seller_customers_phone', 'phone'),
        Index('ix_seller_customers_card', 'seller_id', 'card_number'),
    )


class SellerLoyaltyTransaction(Base):
    """Single loyalty accrual (or future deduction) record."""
    __tablename__ = 'seller_loyalty_transactions'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey('seller_customers.id'), nullable=False)
    order_id: Mapped[Optional[int]] = mapped_column(ForeignKey('orders.id'), nullable=True)
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    points_accrued: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_expired: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (
        Index('ix_seller_loyalty_tx_seller_id', 'seller_id'),
        Index('ix_seller_loyalty_tx_customer_id', 'customer_id'),
        Index('ix_seller_loyalty_tx_created_at', 'created_at'),
        Index('ix_seller_loyalty_tx_expires_at', 'expires_at'),
    )


class CustomerEvent(Base):
    """Significant date for a customer (wife's birthday, anniversary, etc.)."""
    __tablename__ = 'customer_events'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey('seller_customers.id'), nullable=False)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    remind_days_before: Mapped[int] = mapped_column(Integer, default=3)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index('ix_customer_events_customer_id', 'customer_id'),
        Index('ix_customer_events_seller_id', 'seller_id'),
    )
