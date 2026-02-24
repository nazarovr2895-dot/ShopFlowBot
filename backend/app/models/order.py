from sqlalchemy import BigInteger, String, ForeignKey, DateTime, DECIMAL, Text, Index, Boolean, Date
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, date
from typing import Optional
from backend.app.core.base import Base

class Order(Base):
    __tablename__ = 'orders'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    buyer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    items_info: Mapped[str] = mapped_column(Text)
    total_price: Mapped[float] = mapped_column(DECIMAL(10, 2))
    original_price: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default='pending')
    delivery_type: Mapped[str] = mapped_column(String(50), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_preorder: Mapped[bool] = mapped_column(Boolean, default=False)
    preorder_delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    points_used: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True, default=0)
    points_discount: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True, default=0)
    # Guest checkout fields (for orders placed without Telegram auth)
    guest_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    guest_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    guest_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Delivery zone tracking
    delivery_zone_id: Mapped[Optional[int]] = mapped_column(ForeignKey('delivery_zones.id'), nullable=True)
    delivery_fee: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)
    # Payment fields (YuKassa split payments)
    payment_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payment_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Delivery time slot
    delivery_slot_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    delivery_slot_start: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)  # "10:00"
    delivery_slot_end: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)  # "12:00"

    __table_args__ = (
        Index('ix_orders_seller_id', 'seller_id'),
        Index('ix_orders_buyer_id', 'buyer_id'),
        Index('ix_orders_status', 'status'),
        Index('ix_orders_created_at', 'created_at'),
        # Composite indexes for common query patterns
        Index('ix_orders_seller_status', 'seller_id', 'status'),  # Seller orders by status
        Index('ix_orders_seller_created', 'seller_id', 'created_at'),  # Seller orders by date
        Index('ix_orders_status_created', 'status', 'created_at'),  # Orders by status and date
        Index('ix_orders_is_preorder', 'is_preorder'),  # Preorder filter
        Index('ix_orders_seller_preorder', 'seller_id', 'is_preorder'),  # Seller preorders
        Index('ix_orders_preorder_date', 'is_preorder', 'preorder_delivery_date'),  # Preorder dates
        Index('ix_orders_payment_id', 'payment_id'),  # Payment lookup
        Index('ix_orders_payment_status', 'payment_status'),  # Payment status filter
        Index('ix_orders_slot_lookup', 'seller_id', 'delivery_slot_date', 'delivery_slot_start', 'status'),
        Index('ix_orders_guest_phone', 'guest_phone'),  # Guest order → user phone matching
    )