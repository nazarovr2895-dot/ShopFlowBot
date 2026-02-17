"""CRM models: flowers, receptions, bouquets, write-offs (florist MVP)."""
from datetime import date, datetime
from sqlalchemy import (
    BigInteger,
    String,
    ForeignKey,
    Integer,
    Date,
    DateTime,
    DECIMAL,
    Boolean,
    Text,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from backend.app.core.base import Base


class Flower(Base):
    """Seller's flower catalog (name, optional default shelf life hint)."""
    __tablename__ = 'flowers'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    name: Mapped[str] = mapped_column(String(255))
    default_shelf_life_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    __table_args__ = (Index('ix_flowers_seller_id', 'seller_id'),)


class Reception(Base):
    """Reception batch (name + date). Closed receptions are read-only for new items."""
    __tablename__ = 'receptions'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    name: Mapped[str] = mapped_column(String(255))
    reception_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    invoice_number: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    items: Mapped[list["ReceptionItem"]] = relationship(
        "ReceptionItem", back_populates="reception", lazy="selectin"
    )

    __table_args__ = (Index('ix_receptions_seller_id', 'seller_id'),)


class ReceptionItem(Base):
    """Single line in a reception: flower, qty, arrival date, shelf life, price, remaining/sold."""
    __tablename__ = 'reception_items'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    reception_id: Mapped[int] = mapped_column(ForeignKey('receptions.id'))
    flower_id: Mapped[int] = mapped_column(ForeignKey('flowers.id'))
    quantity_initial: Mapped[int] = mapped_column(Integer)
    arrival_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    shelf_life_days: Mapped[int] = mapped_column(Integer)
    price_per_unit: Mapped[float] = mapped_column(DECIMAL(10, 2))
    remaining_quantity: Mapped[int] = mapped_column(Integer)
    sold_quantity: Mapped[int] = mapped_column(Integer, default=0)
    sold_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)

    reception: Mapped["Reception"] = relationship("Reception", back_populates="items")

    __table_args__ = (Index('ix_reception_items_reception_id', 'reception_id'),)


class Bouquet(Base):
    """Bouquet template: name + packaging cost."""
    __tablename__ = 'bouquets'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    name: Mapped[str] = mapped_column(String(255))
    packaging_cost: Mapped[float] = mapped_column(DECIMAL(10, 2), default=0)

    bouquet_items: Mapped[list["BouquetItem"]] = relationship(
        "BouquetItem", back_populates="bouquet", lazy="selectin"
    )

    __table_args__ = (Index('ix_bouquets_seller_id', 'seller_id'),)


class BouquetItem(Base):
    """Bouquet composition: flower + quantity + markup multiplier."""
    __tablename__ = 'bouquet_items'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    bouquet_id: Mapped[int] = mapped_column(ForeignKey('bouquets.id'))
    flower_id: Mapped[int] = mapped_column(ForeignKey('flowers.id'))
    quantity: Mapped[int] = mapped_column(Integer)
    markup_multiplier: Mapped[float] = mapped_column(DECIMAL(5, 2), default=1)

    bouquet: Mapped["Bouquet"] = relationship("Bouquet", back_populates="bouquet_items")

    __table_args__ = (Index('ix_bouquet_items_bouquet_id', 'bouquet_id'),)


class WriteOff(Base):
    """Write-off record: quick disposal of wilted/broken flowers."""
    __tablename__ = 'write_offs'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    reception_item_id: Mapped[int] = mapped_column(ForeignKey('reception_items.id'))
    quantity: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(50))  # wilted, broken, defect, other
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    loss_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_write_offs_seller_id', 'seller_id'),
        Index('ix_write_offs_created_at', 'created_at'),
    )
