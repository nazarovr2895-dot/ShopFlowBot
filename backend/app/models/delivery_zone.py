from sqlalchemy import BigInteger, String, ForeignKey, Integer, DECIMAL, Boolean, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional, List
from backend.app.core.base import Base


class DeliveryZone(Base):
    __tablename__ = 'delivery_zones'

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('sellers.seller_id', ondelete='CASCADE'))
    name: Mapped[str] = mapped_column(String(255))
    # List of district IDs that belong to this zone, e.g. [1, 2, 5]
    district_ids: Mapped[Optional[List[int]]] = mapped_column(JSON(), nullable=True)
    delivery_price: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0.0)
    min_order_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)
    free_delivery_from: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Lower priority number = checked first (for overlapping zones)
    priority: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        Index('ix_delivery_zones_seller_id', 'seller_id'),
        Index('ix_delivery_zones_seller_active', 'seller_id', 'is_active'),
    )
