from sqlalchemy import BigInteger, String, ForeignKey, DateTime, DECIMAL, Text, Index, Boolean, Date
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, date
from typing import Optional
from backend.app.core.base import Base

class Order(Base):
    __tablename__ = 'orders'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    buyer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    items_info: Mapped[str] = mapped_column(Text)
    total_price: Mapped[float] = mapped_column(DECIMAL(10, 2))
    original_price: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default='pending')
    delivery_type: Mapped[str] = mapped_column(String(50), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_preorder: Mapped[bool] = mapped_column(Boolean, default=False)
    preorder_delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    __table_args__ = (
        Index('ix_orders_seller_id', 'seller_id'),
        Index('ix_orders_buyer_id', 'buyer_id'),
        Index('ix_orders_status', 'status'),
        Index('ix_orders_created_at', 'created_at'),
    )