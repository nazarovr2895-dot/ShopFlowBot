from sqlalchemy import BigInteger, String, ForeignKey, DECIMAL, Text, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.core.base import Base

class Product(Base):
    __tablename__ = 'products'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id'))
    name: Mapped[str] = mapped_column(String(255))
    price: Mapped[float] = mapped_column(DECIMAL(10, 2))
    description: Mapped[str] = mapped_column(Text, nullable=True)
    photo_id: Mapped[str] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        Index('ix_products_seller_id', 'seller_id'),
        Index('ix_products_is_active', 'is_active'),
    )