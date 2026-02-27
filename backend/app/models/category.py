from sqlalchemy import BigInteger, String, ForeignKey, Boolean, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.core.base import Base


class Category(Base):
    __tablename__ = 'categories'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seller_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.tg_id', ondelete='CASCADE'))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default='0')
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')

    __table_args__ = (
        Index('ix_categories_seller_id', 'seller_id'),
        Index('ix_categories_seller_active', 'seller_id', 'is_active'),
    )
