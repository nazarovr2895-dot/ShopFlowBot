"""Cart and visited sellers models for Mini App."""
from sqlalchemy import BigInteger, Integer, ForeignKey, DateTime, DECIMAL, String, Index, UniqueConstraint, Boolean, Date
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, date
from typing import Optional
from backend.app.core.base import Base


class CartItem(Base):
    """One item in buyer's cart. Cart can have items from multiple sellers."""
    __tablename__ = 'cart_items'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    buyer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=False)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey('products.id'), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    # Denormalized for display (snapshot at add time)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    price: Mapped[float] = mapped_column(DECIMAL(10, 2), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_preorder: Mapped[bool] = mapped_column(Boolean, default=False)
    preorder_delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    __table_args__ = (
        UniqueConstraint('buyer_id', 'seller_id', 'product_id', name='uq_cart_buyer_seller_product'),
        Index('ix_cart_items_buyer_id', 'buyer_id'),
    )


class BuyerVisitedSeller(Base):
    """Track which sellers a buyer has opened in Mini App (for "recent" list)."""
    __tablename__ = 'buyer_visited_sellers'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    buyer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=False)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=False)
    visited_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('buyer_id', 'seller_id', name='uq_visited_buyer_seller'),
        Index('ix_visited_buyer_visited_at', 'buyer_id', 'visited_at'),
    )


class BuyerFavoriteSeller(Base):
    """Track which sellers a buyer has added to "My Flowers" (favorites)."""
    __tablename__ = 'buyer_favorite_sellers'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    buyer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=False)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'), nullable=False)

    __table_args__ = (
        UniqueConstraint('buyer_id', 'seller_id', name='uq_favorite_buyer_seller'),
        Index('ix_favorite_buyer_seller', 'buyer_id', 'seller_id'),
    )
