from sqlalchemy import BigInteger, String, ForeignKey, DateTime, DECIMAL, Text, Index
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from backend.app.core.base import Base

class Order(Base):
    __tablename__ = 'orders'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    buyer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    agent_id: Mapped[int] = mapped_column(BigInteger, nullable=True)
    items_info: Mapped[str] = mapped_column(Text)
    total_price: Mapped[float] = mapped_column(DECIMAL(10, 2))
    status: Mapped[str] = mapped_column(String(50), default='pending')
    delivery_type: Mapped[str] = mapped_column(String(50), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    __table_args__ = (
        Index('ix_orders_seller_id', 'seller_id'),
        Index('ix_orders_buyer_id', 'buyer_id'),
        Index('ix_orders_status', 'status'),
        Index('ix_orders_created_at', 'created_at'),
    )