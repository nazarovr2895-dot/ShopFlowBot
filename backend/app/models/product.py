from sqlalchemy import BigInteger, String, ForeignKey, DECIMAL, Text, Boolean, Index, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional, List
from backend.app.core.base import Base


class Product(Base):
    __tablename__ = 'products'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    name: Mapped[str] = mapped_column(String(255))
    price: Mapped[float] = mapped_column(DECIMAL(10, 2))
    description: Mapped[str] = mapped_column(Text, nullable=True)
    photo_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # legacy: first photo
    photo_ids: Mapped[Optional[List[str]]] = mapped_column(JSON(), nullable=True)  # up to 3 paths
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    bouquet_id: Mapped[Optional[int]] = mapped_column(ForeignKey('bouquets.id'), nullable=True)
    is_preorder: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (
        Index('ix_products_seller_id', 'seller_id'),
        Index('ix_products_is_active', 'is_active'),
    )